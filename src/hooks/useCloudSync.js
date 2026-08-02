import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const TABLE_NAME = "driving_user_data";

const fromCloudRow = (row) => ({
  records: Array.isArray(row.records) ? row.records : [],
  etcRecords: Array.isArray(row.etc_records) ? row.etc_records : [],
  ignoredIssues: Array.isArray(row.ignored_issues) ? row.ignored_issues : [],
  routeNameRules: row.route_name_rules && typeof row.route_name_rules === "object"
    ? row.route_name_rules
    : {}
});

const toCloudRow = (userId, snapshot) => ({
  user_id: userId,
  records: snapshot.records,
  etc_records: snapshot.etcRecords,
  ignored_issues: snapshot.ignoredIssues,
  route_name_rules: snapshot.routeNameRules,
  updated_at: new Date().toISOString()
});

export const useCloudSync = ({ localReady, snapshot, applySnapshot }) => {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? "等待登录" : "本地模式");
  const [syncError, setSyncError] = useState("");
  const applySnapshotRef = useRef(applySnapshot);
  const snapshotRef = useRef(snapshot);
  const lastSavedRef = useRef("");
  const sessionUserIdRef = useRef("");

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    const applySession = (nextSession) => {
      if (!active) return;
      const nextUserId = nextSession?.user?.id || "";
      if (nextUserId !== sessionUserIdRef.current) {
        sessionUserIdRef.current = nextUserId;
        setCloudReady(false);
        setSyncStatus(nextSession ? "正在读取云端数据" : "等待登录");
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

  useEffect(() => {
    if (!supabase || !session?.user || !localReady) return;
    let cancelled = false;

    const loadCloudData = async () => {
      setSyncStatus("正在读取云端数据");
      setSyncError("");

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("records,etc_records,ignored_issues,route_name_rules,updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setSyncError(error.message);
        setSyncStatus("同步失败");
        return;
      }

      if (data) {
        const cloudSnapshot = fromCloudRow(data);
        applySnapshotRef.current(cloudSnapshot);
        lastSavedRef.current = JSON.stringify(cloudSnapshot);
      } else {
        const currentSnapshot = snapshotRef.current;
        const { error: createError } = await supabase
          .from(TABLE_NAME)
          .upsert(toCloudRow(session.user.id, currentSnapshot), { onConflict: "user_id" });

        if (cancelled) return;
        if (createError) {
          setSyncError(createError.message);
          setSyncStatus("同步失败");
          return;
        }
        lastSavedRef.current = JSON.stringify(currentSnapshot);
      }

      setCloudReady(true);
      setSyncStatus("已同步");
    };

    loadCloudData();
    return () => { cancelled = true; };
  }, [localReady, session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session?.user || !cloudReady || !localReady) return undefined;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSavedRef.current) return undefined;

    setSyncStatus("等待同步");
    const timer = setTimeout(async () => {
      setSyncStatus("正在同步");
      setSyncError("");
      const { error } = await supabase
        .from(TABLE_NAME)
        .upsert(toCloudRow(session.user.id, snapshot), { onConflict: "user_id" });

      if (error) {
        setSyncError(error.message);
        setSyncStatus("同步失败");
        return;
      }
      lastSavedRef.current = serialized;
      setSyncStatus("已同步");
    }, 900);

    return () => clearTimeout(timer);
  }, [cloudReady, localReady, session?.user?.id, snapshot]);

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
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut
  };
};
