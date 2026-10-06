import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { emptySnapshot } from "../lib/backup";
import { fetchRow, fetchUpdatedAt, fromCloudRow, insertRow, updateRowIfUnchanged } from "../lib/cloudRepo";
import { loadJson, saveJson } from "../lib/storage";
import { pushSafetySnapshot } from "../lib/safetySnapshot";

const OWNER_KEY = "driving-data-owner-v1";
const PENDING_KEY = "driving-unsynced-v1";
const SAVE_DELAY_MS = 900;
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
const MAX_AUTO_RETRIES = 8;

const STATUS = {
  waitingLogin: "等待登录",
  local: "本地模式",
  loading: "正在读取云端数据",
  synced: "已同步",
  waiting: "等待同步",
  saving: "正在同步",
  failed: "同步失败",
  conflict: "云端有更新"
};

export { STATUS as SYNC_STATUS };

export const useCloudSync = ({ localReady, snapshot, applySnapshot }) => {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(true);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? STATUS.waitingLogin : STATUS.local);
  const [syncError, setSyncError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saveNonce, setSaveNonce] = useState(0);

  const applySnapshotRef = useRef(applySnapshot);
  const snapshotRef = useRef(snapshot);
  const lastSavedRef = useRef("");
  const knownUpdatedAtRef = useRef(null);
  const sessionUserIdRef = useRef("");
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const conflictRef = useRef(false);
  const cloudReadyRef = useRef(cloudReady);

  useEffect(() => { applySnapshotRef.current = applySnapshot; }, [applySnapshot]);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);
  useEffect(() => { cloudReadyRef.current = cloudReady; }, [cloudReady]);

  const userId = session?.user?.id || "";

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    const applySession = (nextSession) => {
      if (!active) return;
      const nextUserId = nextSession?.user?.id || "";
      if (nextUserId !== sessionUserIdRef.current) {
        sessionUserIdRef.current = nextUserId;
        knownUpdatedAtRef.current = null;
        lastSavedRef.current = "";
        setCloudReady(false);
        setConflict(false);
        setLoadFailed(false);
        setSyncStatus(nextSession ? STATUS.loading : STATUS.waitingLogin);
      }
      setSession(nextSession);
      setAuthReady(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (!nextSession) setPasswordRecovery(false);
      applySession(nextSession);
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error && active) setSyncError(error.message);
        applySession(data?.session || null);
      })
      .catch((error) => {
        if (!active) return;
        setSyncError(error.message);
        applySession(null);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // 读取云端数据；失败时停留在可重试状态（loadFailed），而不是永远转圈
  useEffect(() => {
    if (!supabase || !userId || !localReady) return undefined;
    let cancelled = false;

    const loadCloudData = async () => {
      setSyncStatus(STATUS.loading);
      setSyncError("");

      const { data, error } = await fetchRow(supabase, userId);
      if (cancelled) return;
      if (error) {
        setSyncError(error.message);
        setSyncStatus(STATUS.failed);
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);

      const owner = loadJson(OWNER_KEY, "");
      const pending = loadJson(PENDING_KEY, null);
      const hasPendingForUser = Boolean(pending && pending.userId === userId);

      if (data) {
        const cloudSnapshot = fromCloudRow(data);
        const cloudSerialized = JSON.stringify(cloudSnapshot);
        const localSnapshot = snapshotRef.current;
        const localSerialized = JSON.stringify(localSnapshot);
        knownUpdatedAtRef.current = data.updated_at;

        if (hasPendingForUser && owner === userId && localSerialized !== cloudSerialized) {
          // 本机上次有没来得及同步的改动
          lastSavedRef.current = cloudSerialized;
          if (pending.base === data.updated_at) {
            // 云端自那以后没人动过：本地更新，保留并继续上传
            setNotice("检测到上次未同步完成的改动，已保留并继续同步");
          } else {
            // 云端也被改过：不自动覆盖任何一边，让用户选择
            setConflict(true);
            setSyncStatus(STATUS.conflict);
            setCloudReady(true);
            return;
          }
        } else {
          if (localSerialized !== cloudSerialized) pushSafetySnapshot("登录/载入云端前的本机数据", localSnapshot);
          snapshotRef.current = cloudSnapshot;
          applySnapshotRef.current(cloudSnapshot);
          lastSavedRef.current = cloudSerialized;
          saveJson(PENDING_KEY, null);
        }
        saveJson(OWNER_KEY, userId);
      } else {
        // 云端还没有这个账号的数据行
        const foreignCache = Boolean(owner) && owner !== userId;
        const initial = foreignCache ? emptySnapshot() : snapshotRef.current;
        if (foreignCache) {
          pushSafetySnapshot("切换账号前的本机数据", snapshotRef.current);
          snapshotRef.current = initial;
          applySnapshotRef.current(initial);
        }
        const result = await insertRow(supabase, userId, initial);
        if (cancelled) return;
        if (result.conflict) {
          setReloadKey(key => key + 1);
          return;
        }
        if (result.error) {
          setSyncError(result.error.message);
          setSyncStatus(STATUS.failed);
          setLoadFailed(true);
          return;
        }
        knownUpdatedAtRef.current = result.updatedAt;
        lastSavedRef.current = JSON.stringify(initial);
        saveJson(OWNER_KEY, userId);
        saveJson(PENDING_KEY, null);
      }

      retryCountRef.current = 0;
      setCloudReady(true);
      setSyncStatus(STATUS.synced);
    };

    loadCloudData();
    return () => { cancelled = true; };
  }, [localReady, userId, reloadKey]);

  const scheduleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_AUTO_RETRIES) return; // 不再自动重试，改由用户点击同步状态手动重试
    const delay = RETRY_DELAYS_MS[Math.min(retryCountRef.current, RETRY_DELAYS_MS.length - 1)];
    retryCountRef.current += 1;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => setSaveNonce(n => n + 1), delay);
  }, []);

  const saveNow = useCallback(async () => {
    if (!supabase || !userId || !cloudReadyRef.current || conflictRef.current) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    const target = snapshotRef.current;
    const serialized = JSON.stringify(target);
    if (serialized === lastSavedRef.current) return;

    const uid = userId;
    savingRef.current = true;
    setSyncStatus(STATUS.saving);
    setSyncError("");
    let result;
    try {
      result = await updateRowIfUnchanged(supabase, userId, target, knownUpdatedAtRef.current);
    } catch (error) {
      result = { error, conflict: false, updatedAt: null };
    }
    savingRef.current = false;
    if (sessionUserIdRef.current !== uid) return; // 保存期间已切换账号，丢弃结果

    if (result.conflict) {
      setConflict(true);
      setSyncStatus(STATUS.conflict);
      return;
    }
    if (result.error) {
      setSyncError(result.error.message || String(result.error));
      setSyncStatus(STATUS.failed);
      scheduleRetry();
      return;
    }

    retryCountRef.current = 0;
    knownUpdatedAtRef.current = result.updatedAt;
    lastSavedRef.current = serialized;
    if (JSON.stringify(snapshotRef.current) === serialized) {
      saveJson(PENDING_KEY, null);
      setSyncStatus(STATUS.synced);
    } else {
      // 保存期间又有新改动：未同步标记的基准版本要跟着更新，否则下次启动会误判为冲突
      saveJson(PENDING_KEY, { userId, base: result.updatedAt });
    }
    if (queuedRef.current || JSON.stringify(snapshotRef.current) !== serialized) {
      queuedRef.current = false;
      setSaveNonce(n => n + 1);
    }
  }, [userId, scheduleRetry]);

  const saveNowRef = useRef(saveNow);
  useEffect(() => { saveNowRef.current = saveNow; }, [saveNow]);

  // 有改动时：记录"未同步"标记（含基准版本），防抖后上传
  useEffect(() => {
    if (!supabase || !userId || !cloudReady || !localReady || conflict) return undefined;
    const serialized = JSON.stringify(snapshot);
    const isDirty = serialized !== lastSavedRef.current;
    setDirty(isDirty);
    if (!isDirty) return undefined;

    const pending = loadJson(PENDING_KEY, null);
    if (!pending || pending.userId !== userId) {
      saveJson(PENDING_KEY, { userId, base: knownUpdatedAtRef.current });
    }
    setSyncStatus(STATUS.waiting);
    debounceTimerRef.current = setTimeout(() => saveNowRef.current(), SAVE_DELAY_MS);
    return () => clearTimeout(debounceTimerRef.current);
  }, [cloudReady, localReady, userId, snapshot, conflict, saveNonce]);

  // 页面切到后台时立即上传；回到前台时静默拉取其他设备的更新；有未同步改动时关页给出提示
  useEffect(() => {
    if (!supabase || !userId) return undefined;

    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(debounceTimerRef.current);
        saveNowRef.current();
        return;
      }
      if (!cloudReadyRef.current || conflictRef.current || savingRef.current) return;
      if (JSON.stringify(snapshotRef.current) !== lastSavedRef.current) return;
      const { updatedAt, exists, error } = await fetchUpdatedAt(supabase, userId);
      if (error || !exists || !updatedAt || updatedAt === knownUpdatedAtRef.current) return;
      if (JSON.stringify(snapshotRef.current) !== lastSavedRef.current) return;
      const { data } = await fetchRow(supabase, userId);
      if (!data || JSON.stringify(snapshotRef.current) !== lastSavedRef.current) return;
      const cloudSnapshot = fromCloudRow(data);
      pushSafetySnapshot("载入其他设备数据前的本机数据", snapshotRef.current);
      snapshotRef.current = cloudSnapshot;
      applySnapshotRef.current(cloudSnapshot);
      lastSavedRef.current = JSON.stringify(cloudSnapshot);
      knownUpdatedAtRef.current = data.updated_at;
      setNotice("已载入其他设备的最新数据");
    };

    const onBeforeUnload = (event) => {
      const unsynced = JSON.stringify(snapshotRef.current) !== lastSavedRef.current || savingRef.current;
      if (!unsynced) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onOnline = () => setSaveNonce(n => n + 1);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      clearTimeout(retryTimerRef.current);
    };
  }, [userId]);

  /** 取云端当前内容，供界面在处理冲突前先下载云端备份。 */
  const fetchCloudSnapshot = useCallback(async () => {
    if (!supabase || !userId) return null;
    const { data, error } = await fetchRow(supabase, userId);
    if (error) throw new Error(error.message);
    return data ? { snapshot: fromCloudRow(data), updatedAt: data.updated_at } : null;
  }, [userId]);

  /** 冲突处理：mode="cloud" 采用云端，mode="local" 以本机覆盖云端。调用前界面应已下载备份。 */
  const resolveConflict = useCallback(async (mode) => {
    const cloud = await fetchCloudSnapshot();
    if (!cloud) {
      knownUpdatedAtRef.current = null;
      const result = await insertRow(supabase, userId, snapshotRef.current);
      if (result.error) throw new Error(result.error.message);
      knownUpdatedAtRef.current = result.updatedAt;
      lastSavedRef.current = JSON.stringify(snapshotRef.current);
    } else if (mode === "cloud") {
      pushSafetySnapshot("载入云端前的本机数据", snapshotRef.current);
      snapshotRef.current = cloud.snapshot;
      applySnapshotRef.current(cloud.snapshot);
      lastSavedRef.current = JSON.stringify(cloud.snapshot);
      knownUpdatedAtRef.current = cloud.updatedAt;
      saveJson(PENDING_KEY, null);
    } else {
      pushSafetySnapshot("覆盖云端前的云端数据", cloud.snapshot);
      knownUpdatedAtRef.current = cloud.updatedAt;
      lastSavedRef.current = JSON.stringify(cloud.snapshot);
      saveJson(PENDING_KEY, { userId, base: cloud.updatedAt });
    }
    retryCountRef.current = 0;
    setConflict(false);
    setSyncError("");
    setSyncStatus(STATUS.waiting);
    setSaveNonce(n => n + 1);
  }, [fetchCloudSnapshot, userId]);

  const retryNow = useCallback(() => {
    retryCountRef.current = 0;
    clearTimeout(retryTimerRef.current);
    if (loadFailed) setReloadKey(key => key + 1);
    else setSaveNonce(n => n + 1);
  }, [loadFailed]);

  const clearNotice = useCallback(() => setNotice(""), []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: new Error("云端服务尚未配置") };
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!supabase) return { error: new Error("云端服务尚未配置") };
    return supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    if (!supabase) return { error: new Error("云端服务尚未配置") };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
  }, []);

  const updatePassword = useCallback(async (password) => {
    if (!supabase) return { error: new Error("云端服务尚未配置") };
    const result = await supabase.auth.updateUser({ password });
    if (!result.error) setPasswordRecovery(false);
    return result;
  }, []);

  return {
    configured: isSupabaseConfigured,
    session,
    passwordRecovery,
    authReady,
    cloudReady,
    syncStatus,
    syncError,
    conflict,
    loadFailed,
    dirty,
    notice,
    clearNotice,
    retryNow,
    fetchCloudSnapshot,
    resolveConflict,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut
  };
};
