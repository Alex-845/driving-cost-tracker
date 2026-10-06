import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import AuthScreen from "./components/AuthScreen";
import PasswordResetScreen from "./components/PasswordResetScreen";
import AutoComplete from "./components/AutoComplete";
import CompareTab from "./components/CompareTab";
import ConfirmDialog from "./components/ConfirmDialog";
import DashboardTab from "./components/DashboardTab";
import RecordsTab from "./components/RecordsTab";
import SafetyPanel from "./components/SafetyPanel";
import { boxStyle as boxS, mutedButton, pageBackground, pageFont } from "./components/styles";
import { ETC_STORAGE_KEY, FORM_FIELDS, IGNORED_ISSUES_KEY, ISSUE_TYPE_COLORS, ISSUE_TYPES, ROUTE_NAME_RULES_KEY, STORAGE_KEY, TAB_LABELS, TABS } from "./config/appConfig";
import { detectDataIssues, getRouteNameGroups, issueKeysForRecordId } from "./lib/dataQuality";
import { buildRecordFromForm, calcRecord, emptyForm, getFormPreview, getInputWarnings, getNextId, recordToForm, validateRecordInput } from "./lib/drivingMath";
import { getEtcStations, getEtcSummary, queryEtcFares } from "./lib/etcLookup";
import { defaultCompareForm } from "./lib/travelCompare";
import { downloadBackup, emptySnapshot, readBackupFile, snapshotCounts } from "./lib/backup";
import { pushSafetySnapshot } from "./lib/safetySnapshot";
import { loadJson, saveJson } from "./lib/storage";
import { SYNC_STATUS, useCloudSync } from "./hooks/useCloudSync";
import { ETC_RECORDS } from "./data/etcRecords";
import { INITIAL_DATA } from "./data/initialRecords";

const asArray = (value) => (Array.isArray(value) ? value : null);

export default function App() {
  const [records, setRecords] = useState([]);
  const [etcRecords, setEtcRecords] = useState([]);
  const [localReady, setLocalReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState("");
  const [ignoredIssues, setIgnoredIssues] = useState(new Set());
  const [editingIssue, setEditingIssue] = useState(null);
  const [editHwValue, setEditHwValue] = useState("");
  const [routeNameSelections, setRouteNameSelections] = useState({});
  const [routeVariantSelections, setRouteVariantSelections] = useState({});
  const [routeNameRules, setRouteNameRules] = useState({});
  const [etcEntry, setEtcEntry] = useState("");
  const [etcExit, setEtcExit] = useState("");
  const [etcHideFree, setEtcHideFree] = useState(false);
  const [compareForm, setCompareForm] = useState(defaultCompareForm());
  const [compareTrip, setCompareTrip] = useState({ from: "", to: "", route: "" });
  const [dialog, setDialog] = useState(null);
  const backupInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const storedRecords = asArray(loadJson(STORAGE_KEY, null));
    if (storedRecords) setRecords(storedRecords);
    else {
      setRecords(INITIAL_DATA);
      saveJson(STORAGE_KEY, INITIAL_DATA);
    }
    const storedEtcRecords = asArray(loadJson(ETC_STORAGE_KEY, null));
    if (storedEtcRecords) setEtcRecords(storedEtcRecords);
    else {
      setEtcRecords(ETC_RECORDS);
      saveJson(ETC_STORAGE_KEY, ETC_RECORDS);
    }
    setIgnoredIssues(new Set(asArray(loadJson(IGNORED_ISSUES_KEY, [])) || []));
    const storedRules = loadJson(ROUTE_NAME_RULES_KEY, {});
    setRouteNameRules(storedRules && typeof storedRules === "object" && !Array.isArray(storedRules) ? storedRules : {});
    setLocalReady(true);
  }, []);

  const save = useCallback((d) => { setRecords(d); saveJson(STORAGE_KEY, d); }, []);
  const saveRouteNameRules = useCallback((rules) => { setRouteNameRules(rules); saveJson(ROUTE_NAME_RULES_KEY, rules); }, []);
  const applySnapshot = useCallback((next) => {
    const nextRecords = Array.isArray(next.records) ? next.records : [];
    const nextEtcRecords = Array.isArray(next.etcRecords) ? next.etcRecords : [];
    const nextIgnoredIssues = Array.isArray(next.ignoredIssues) ? next.ignoredIssues : [];
    const nextRouteNameRules = next.routeNameRules && typeof next.routeNameRules === "object"
      ? next.routeNameRules
      : {};

    setRecords(nextRecords);
    setEtcRecords(nextEtcRecords);
    setIgnoredIssues(new Set(nextIgnoredIssues));
    setRouteNameRules(nextRouteNameRules);
    saveJson(STORAGE_KEY, nextRecords);
    saveJson(ETC_STORAGE_KEY, nextEtcRecords);
    saveJson(IGNORED_ISSUES_KEY, nextIgnoredIssues);
    saveJson(ROUTE_NAME_RULES_KEY, nextRouteNameRules);
  }, []);
  const dataSnapshot = useMemo(() => ({
    records,
    etcRecords,
    ignoredIssues: [...ignoredIssues],
    routeNameRules
  }), [records, etcRecords, ignoredIssues, routeNameRules]);
  const cloud = useCloudSync({
    localReady,
    snapshot: dataSnapshot,
    applySnapshot
  });
  const dataSnapshotRef = useRef(dataSnapshot);
  dataSnapshotRef.current = dataSnapshot;

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  useEffect(() => {
    if (!cloud.notice) return;
    showToast(cloud.notice);
    cloud.clearNotice();
  }, [cloud.notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeDialog = useCallback(() => setDialog(null), []);
  const enriched = useMemo(() => records.map(calcRecord), [records]);

  /** 危险操作前先存一个浏览器内恢复点；needDownload 时还会下载一份备份文件。 */
  const protect = useCallback((label, { download = false, slug = "before-change" } = {}) => {
    const latest = dataSnapshotRef.current;
    const saved = pushSafetySnapshot(label, latest);
    const hasData = (latest.records?.length || 0) + (latest.etcRecords?.length || 0) > 0;
    // 恢复点没存成功（浏览器存储已满）时，强制下载备份文件作为兜底
    if (download || (!saved && hasData)) downloadBackup(latest, slug);
  }, []);

  const placeOpts = useMemo(() => { const s = new Set(); enriched.forEach(r => { if (r.from.trim()) s.add(r.from.trim()); if (r.to.trim()) s.add(r.to.trim()); }); return [...s].sort((a, b) => a.localeCompare(b, "zh-CN")); }, [enriched]);
  const hwOpts = useMemo(() => { const s = new Set(); enriched.forEach(r => { if (r.highway.trim()) s.add(r.highway.trim()); }); return [...s].sort((a, b) => a.localeCompare(b, "zh-CN")); }, [enriched]);

  const issues = useMemo(() => detectDataIssues(records), [records]);
  const allRouteNameGroups = useMemo(() => getRouteNameGroups(records), [records]);
  const routeNameGroups = useMemo(() => allRouteNameGroups.filter(group => {
    const allowedNames = routeNameRules[group.route];
    return !Array.isArray(allowedNames) || group.names.some(item => !allowedNames.includes(item.name));
  }), [allRouteNameGroups, routeNameRules]);
  const acceptedRouteRules = useMemo(() => Object.entries(routeNameRules).filter(([, names]) => Array.isArray(names) && names.length > 1), [routeNameRules]);
  const etcStations = useMemo(() => getEtcStations(etcRecords), [etcRecords]);
  const etcSummary = useMemo(() => getEtcSummary(etcRecords), [etcRecords]);
  const etcFares = useMemo(() => queryEtcFares(etcRecords, etcEntry, etcExit), [etcRecords, etcEntry, etcExit]);
  const visibleEtcFares = useMemo(() => (etcHideFree ? etcFares.filter(fare => !fare.isFree) : etcFares), [etcFares, etcHideFree]);

  const visibleIssues = useMemo(() => issues.filter(i => !ignoredIssues.has(i.key)), [issues, ignoredIssues]);
  const ignoredCount = useMemo(() => issues.filter(i => ignoredIssues.has(i.key)).length, [issues, ignoredIssues]);
  const issueCount = visibleIssues.length + routeNameGroups.length;

  const duplicateOfForm = useMemo(() => {
    if (!form.from.trim() || !form.to.trim() || !form.date) return null;
    return enriched.find(r => (
      r.id !== editId && r.date === form.date && r.from.trim() === form.from.trim() && r.to.trim() === form.to.trim()
      && Number(r.distance) === Number(form.distance) && r.highway.trim() === (form.highway || "").trim()
    )) || null;
  }, [enriched, form, editId]);
  const formWarnings = useMemo(() => getInputWarnings(form), [form]);

  const handleSubmit = () => {
    const error = validateRecordInput(form);
    if (error) { showToast(error); return; }

    const nextRecord = buildRecordFromForm(form, editId ?? getNextId(records));
    if (editId !== null) { save(records.map(r => r.id === editId ? nextRecord : r)); setEditId(null); showToast("已更新"); }
    else { save([...records, nextRecord]); showToast("已添加"); }
    setForm(emptyForm()); setTab("records");
  };

  const startEdit = (r) => { setForm(recordToForm(r)); setEditId(r.id); setTab("add"); };

  const saveIgnored = useCallback((newSet) => {
    setIgnoredIssues(newSet);
    saveJson(IGNORED_ISSUES_KEY, [...newSet]);
  }, []);

  const doDelete = (id) => {
    protect("删除记录前");
    save(dataSnapshotRef.current.records.filter(r => r.id !== id));
    // 同时清掉该 id 的"已忽略"标记，避免 id 被复用后继承旧状态
    const staleKeys = new Set(issueKeysForRecordId(id));
    if ([...ignoredIssues].some(key => staleKeys.has(key))) saveIgnored(new Set([...ignoredIssues].filter(key => !staleKeys.has(key))));
    showToast("已删除");
  };

  const requestDeleteRecord = (id) => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    setDialog({
      title: "删除这条记录？",
      danger: true,
      confirmLabel: "删除",
      body: <div>#{record.id} · {String(record.date)} · {String(record.from)} → {String(record.to)} · {record.distance} km<br />删除前会自动保存恢复点，可在页头“恢复点”找回。</div>,
      onConfirm: () => doDelete(id)
    });
  };

  const applyFix = (issue) => { if (!issue.fix) return; save(records.map(r => r.id === issue.id ? { ...r, ...issue.fix } : r)); showToast("已修复"); };
  const applyAllFixes = (type) => {
    const items = visibleIssues.filter(i => i.type === type && i.fix);
    if (!items.length) return;
    protect(`批量修复“${type}”前`);
    let d = [...records];
    items.forEach(issue => { d = d.map(r => r.id === issue.id ? { ...r, ...issue.fix } : r); });
    save(d); showToast(`已修复 ${items.length} 项`);
  };

  const applyRouteNameGroup = (group) => {
    protect("统一路线名称前");
    const selectedName = (routeNameSelections[group.key] ?? group.suggestedName).trim();
    const recordIds = new Set(group.recordIds);
    save(records.map(record => recordIds.has(record.id) ? { ...record, highway: selectedName } : record));
    setRouteNameSelections(current => {
      const next = { ...current };
      delete next[group.key];
      return next;
    });
    const nextRules = { ...routeNameRules };
    delete nextRules[group.route];
    saveRouteNameRules(nextRules);
    showToast(`已统一 ${group.route} 的 ${group.totalCount} 条记录`);
  };

  const applyRouteVariantName = (group, item) => {
    const selectionKey = `${group.key}::${item.label}`;
    const rawTarget = routeVariantSelections[selectionKey];
    if (!rawTarget?.trim()) { showToast("请先输入或选择目标路线名称"); return; }
    const targetName = rawTarget.trim() === "(无)" ? "" : rawTarget.trim();
    if (targetName === item.name) { showToast("目标名称与当前名称相同"); return; }

    protect("修正路线名称前");
    const recordIds = new Set(item.ids);
    save(records.map(record => recordIds.has(record.id) ? { ...record, highway: targetName } : record));
    setRouteVariantSelections(current => {
      const next = { ...current };
      delete next[selectionKey];
      return next;
    });
    showToast(`已将「${item.label}」的 ${item.count} 条记录改为「${targetName || "(无)"}」`);
  };

  const acceptRouteNameGroup = (group) => {
    saveRouteNameRules({ ...routeNameRules, [group.route]: group.names.map(item => item.name) });
    showToast(`已确认 ${group.route} 存在多条有效路线`);
  };

  const reopenRouteNameRule = (route) => {
    const nextRules = { ...routeNameRules };
    delete nextRules[route];
    saveRouteNameRules(nextRules);
    showToast(`已恢复检查 ${route}`);
  };

  const ignoreIssue = (issue) => { const s = new Set(ignoredIssues); s.add(issue.key); saveIgnored(s); showToast("已忽略"); };
  const ignoreAllOfType = (type) => {
    const s = new Set(ignoredIssues);
    visibleIssues.filter(i => i.type === type).forEach(i => s.add(i.key));
    saveIgnored(s); showToast("已全部忽略");
  };
  const unignoreIssue = (key) => { const s = new Set(ignoredIssues); s.delete(key); saveIgnored(s); showToast("已取消忽略"); };
  const clearAllIgnored = () => { saveIgnored(new Set()); showToast("已清空忽略列表"); };

  const startEditIssue = (issue) => {
    setEditingIssue(issue.key);
    const rec = records.find(r => r.id === issue.id);
    setEditHwValue(rec ? (rec.highway || "") : "");
  };
  const saveEditIssue = (issue) => {
    save(records.map(r => r.id === issue.id ? { ...r, highway: editHwValue.trim() } : r));
    setEditingIssue(null); setEditHwValue(""); showToast("已修改路线");
  };

  const countsText = (counts) => `${counts.records} 条行程、${counts.etcRecords} 条 ETC`;

  const handleReset = () => {
    const counts = snapshotCounts(dataSnapshot);
    setDialog({
      title: "清空全部数据",
      danger: true,
      confirmLabel: "清空全部数据",
      requireText: "清空",
      body: (
        <div>
          将清空当前账号的 <b>{countsText(counts)}</b>，以及忽略项和路线规则。登录状态下，清空结果会在几秒内同步到云端和你的其他设备。<br />
          确认后会先下载一份备份文件并保存浏览器内恢复点。<b>这不是修复登录问题的办法。</b>
        </div>
      ),
      onConfirm: () => {
        protect("清空数据前", { download: true, slug: "before-clear" });
        applySnapshot({ records: INITIAL_DATA, etcRecords: ETC_RECORDS, ignoredIssues: [], routeNameRules: {} });
        setRouteNameSelections({});
        setRouteVariantSelections({});
        showToast("已清空，可在“恢复点”找回");
      }
    });
  };

  const handleBackupExport = () => {
    downloadBackup(dataSnapshot);
    showToast("完整备份已下载");
  };

  const handleBackupImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      const current = snapshotCounts(dataSnapshot);
      const incoming = snapshotCounts(parsed.snapshot);
      setDialog({
        title: "恢复备份？这会替换当前全部数据",
        danger: true,
        confirmLabel: "替换并恢复",
        body: (
          <div>
            <div>文件：{file.name}{parsed.exportedAt ? `（导出于 ${new Date(parsed.exportedAt).toLocaleString("zh-CN")}）` : ""}</div>
            <div style={{ margin: "8px 0" }}>当前：<b>{countsText(current)}</b><br />备份：<b>{countsText(incoming)}</b></div>
            {(incoming.records < current.records || incoming.etcRecords < current.etcRecords) && (
              <div style={{ color: "#fbbf24" }}>⚠ 备份里的记录比当前更少，导出备份之后新增的数据会被替换掉。</div>
            )}
            {parsed.warnings.map(w => <div key={w} style={{ color: "#fbbf24" }}>⚠ {w}</div>)}
            <div style={{ marginTop: 8 }}>确认后会先下载当前数据的备份并保存浏览器内恢复点。</div>
          </div>
        ),
        onConfirm: () => {
          protect("恢复备份前", { download: true, slug: "before-restore" });
          applySnapshot(parsed.snapshot);
          showToast(`已恢复 ${incoming.records} 条行程和 ${incoming.etcRecords} 条 ETC 记录`);
        }
      });
    } catch (error) {
      setDialog({
        title: "备份文件无法恢复",
        confirmLabel: "知道了",
        body: <div style={{ color: "#fca5a5" }}>{error.message || "备份恢复失败"}<br /><span style={{ color: "#94a3b8" }}>当前数据没有任何改动。</span></div>,
        onConfirm: () => {}
      });
    }
  };

  const openSafetyPanel = () => {
    setDialog({
      title: "恢复点",
      hideActions: true,
      body: (
        <SafetyPanel
          onClose={closeDialog}
          onRestore={(entry) => setDialog({
            title: "恢复到这个恢复点？",
            danger: true,
            confirmLabel: "恢复",
            body: (
              <div>
                “{entry.label}”（{new Date(entry.createdAt).toLocaleString("zh-CN")}）：{countsText(entry.counts)}。<br />
                当前数据会被替换，替换前会再保存一个恢复点。
              </div>
            ),
            onConfirm: () => {
              protect("恢复到恢复点前");
              applySnapshot(entry.snapshot);
              showToast("已恢复");
            }
          })}
        />
      ),
      onConfirm: () => {}
    });
  };

  const commitImport = (toImport, mode) => {
    const latestRecords = dataSnapshotRef.current.records;
    const baseId = getNextId(latestRecords);
    const newEntries = toImport.map((p, i) => ({
      id: baseId + i,
      date: p.date, from: p.from, to: p.to, highway: p.highway,
      price: p.price, consumption: p.consumption, distance: p.distance,
      toll: p.toll, income: p.income
    }));
    if (mode === "replace") {
      protect("替换导入前", { download: true, slug: "before-import-replace" });
      save(newEntries);
      showToast(`已替换，共 ${newEntries.length} 条记录`);
    } else {
      protect("导入前");
      save([...latestRecords, ...newEntries]);
      showToast(`已导入 ${newEntries.length} 条新记录`);
    }
  };

  const handleImport = (toImport, mode, done) => {
    if (toImport.length === 0) { showToast("没有新数据需要导入"); return; }
    if (mode === "replace") {
      setDialog({
        title: "替换全部行程？",
        danger: true,
        confirmLabel: "替换",
        body: <div>当前 <b>{records.length}</b> 条行程将被 Excel 中的 <b>{toImport.length}</b> 条替换（ETC 数据不受影响）。确认后会先下载备份并保存恢复点。</div>,
        onConfirm: () => { commitImport(toImport, mode); done?.(); }
      });
      return;
    }
    commitImport(toImport, mode);
    done?.();
  };

  const resolveConflictWith = (mode) => {
    const toCloud = mode === "local";
    setDialog({
      title: toCloud ? "用本机数据覆盖云端？" : "载入云端数据，放弃本机未同步的改动？",
      danger: true,
      confirmLabel: toCloud ? "覆盖云端" : "载入云端",
      body: (
        <div>
          {toCloud
            ? "云端当前的内容会被本机数据替换，其他设备上的新改动会丢失。确认后会先下载一份云端数据的备份。"
            : "本机在同步之前修改的内容会被云端版本替换。确认后会先下载一份本机数据的备份并保存恢复点。"}
        </div>
      ),
      onConfirm: async () => {
        try {
          if (toCloud) {
            const remote = await cloud.fetchCloudSnapshot();
            if (remote) downloadBackup(remote.snapshot, "cloud-before-overwrite");
          } else {
            protect("载入云端前", { download: true, slug: "local-before-load-cloud" });
          }
          await cloud.resolveConflict(mode);
          showToast(toCloud ? "已用本机数据覆盖云端" : "已载入云端数据");
        } catch (error) {
          showToast(error.message || "处理冲突失败");
        }
      }
    });
  };

  const centered = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, color: "#cbd5e1", fontFamily: pageFont, background: pageBackground };

  if (cloud.configured && !cloud.authReady) {
    return (
      <div style={centered}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>行车油耗追踪</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>{cloud.syncStatus}</div>
        </div>
      </div>
    );
  }

  if (cloud.configured && cloud.passwordRecovery) {
    return <PasswordResetScreen email={cloud.session?.user?.email} onUpdatePassword={cloud.updatePassword} />;
  }

  if (cloud.configured && cloud.session && !cloud.cloudReady) {
    return (
      <div style={centered}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>行车油耗追踪</div>
          <div style={{ fontSize: 13, color: cloud.loadFailed ? "#fca5a5" : "#94a3b8" }}>{cloud.syncStatus}</div>
          {cloud.loadFailed && (
            <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8, color: "#94a3b8" }}>
              无法读取云端数据（{cloud.syncError || "网络或后台不可用"}）。这不代表数据丢失，也不一定是密码问题：后台可能被暂停或网络暂时不通。
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                <button type="button" style={mutedButton} onClick={cloud.retryNow}>重试</button>
                <button type="button" style={mutedButton} onClick={() => downloadBackup(dataSnapshot, "local-unsynced")}>导出本机备份</button>
                <button type="button" style={mutedButton} onClick={cloud.signOut}>退出登录</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (cloud.configured && !cloud.session) {
    return <AuthScreen authReady={cloud.authReady} onSignIn={cloud.signIn} onSignUp={cloud.signUp} onPasswordReset={cloud.requestPasswordReset} />;
  }

  const statusColor = cloud.syncStatus === SYNC_STATUS.failed || cloud.syncStatus === SYNC_STATUS.conflict
    ? "#fca5a5"
    : cloud.syncStatus === SYNC_STATUS.synced ? "#86efac" : "#94a3b8";
  const canRetry = cloud.syncStatus === SYNC_STATUS.failed;
  const headerButton = { background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" };

  return (
    <div style={{ fontFamily: pageFont, background: pageBackground, minHeight: "100vh", color: "#e2e8f0" }}>
      {toast && <div role="status" style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#10b981", color: "#fff", padding: "10px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(16,185,129,.4)", animation: "fadeIn .2s", maxWidth: "90vw" }}>{toast}</div>}

      <div style={{ background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.06)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 50, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⛽</div>
          <div><div style={{ fontSize: 17, fontWeight: 700 }}>行车油耗追踪</div><div style={{ fontSize: 11, color: "#64748b" }}>Driving Cost Tracker</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
          <span title={cloud.syncError || cloud.syncStatus} data-testid="sync-status" onClick={canRetry ? cloud.retryNow : undefined} style={{
            padding: "5px 9px", borderRadius: 7, fontSize: 11, color: statusColor, cursor: canRetry ? "pointer" : "default",
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)"
          }}>{cloud.syncStatus}{canRetry ? "（点击重试）" : ""}</span>
          <button onClick={handleBackupExport} style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.22)", color: "#93c5fd", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>导出备份</button>
          <input ref={backupInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleBackupImport} />
          <button onClick={() => backupInputRef.current?.click()} style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", color: "#86efac", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>恢复备份</button>
          <button onClick={openSafetyPanel} style={headerButton}>恢复点</button>
          {cloud.session && <button onClick={cloud.signOut} style={headerButton}>退出</button>}
          <button onClick={handleReset} style={{ ...headerButton, color: "#fca5a5", border: "1px solid rgba(239,68,68,.25)" }}>清空数据</button>
        </div>
      </div>

      {cloud.conflict && (
        <div role="alert" style={{ padding: "12px 20px", background: "rgba(239,68,68,.12)", borderBottom: "1px solid rgba(239,68,68,.3)", fontSize: 13, color: "#fecaca", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>另一台设备更新过云端数据，为避免互相覆盖，自动同步已暂停。请选择以哪一份为准（选择前会先下载备份）：</span>
          <button type="button" style={mutedButton} onClick={() => resolveConflictWith("cloud")}>载入云端版本</button>
          <button type="button" style={mutedButton} onClick={() => resolveConflictWith("local")}>用本机覆盖云端</button>
          <button type="button" style={mutedButton} onClick={handleBackupExport}>先导出本机备份</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(105px,1fr))", gap: 4, padding: "10px 20px", background: "rgba(0,0,0,.15)" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t !== "add") { setEditId(null); setForm(emptyForm()); } }}
            style={{ minWidth: 0, padding: "10px 0", borderRadius: 10, border: "none", background: tab === t ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "rgba(255,255,255,.04)", color: tab === t ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: "pointer", position: "relative", whiteSpace: "nowrap" }}>
            {TAB_LABELS[t]}
            {t === "check" && issueCount > 0 && <span style={{ position: "absolute", top: 3, right: 6, background: "#ef4444", color: "#fff", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{issueCount}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 920, margin: "0 auto" }}>

        {tab === "dashboard" && <DashboardTab records={enriched} />}

        {tab === "records" && (
          <RecordsTab records={enriched} rawRecords={records} onEdit={startEdit} onDelete={doDelete} onImport={handleImport} />
        )}

        {/* ═══ ADD/EDIT ═══ */}
        {tab === "add" && (<div style={{ ...boxS, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editId ? "编辑记录" : "新增行程记录"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>日期 *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} /></div>
            <AutoComplete value={form.from} onChange={v => setForm({ ...form, from: v })} options={placeOpts} placeholder="如：楚雄" label="出发地 *" />
            <AutoComplete value={form.to} onChange={v => setForm({ ...form, to: v })} options={placeOpts} placeholder="如：昆明" label="目的地 *" />
            <AutoComplete value={form.highway} onChange={v => setForm({ ...form, highway: v })} options={hwOpts} placeholder="如：杭瑞" label="路线/高速" />
            {FORM_FIELDS.map(f => (
              <div key={f.k}><label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{f.l}</label><input type="number" step="0.01" value={form[f.k]} onChange={e => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.p} style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} /></div>
            ))}
          </div>

          {duplicateOfForm && (
            <div role="alert" style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.25)", fontSize: 12, color: "#fdba74" }}>
              ⚠ 已有日期、起终点、里程、路线都相同的记录 #{duplicateOfForm.id}。如果这不是同一天的往返，请不要重复保存。
            </div>
          )}
          {formWarnings.map(w => (
            <div key={w} style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.2)", fontSize: 12, color: "#fde047" }}>⚠ {w}</div>
          ))}

          {/* History hint */}
          {form.from && form.to && (() => {
            const prev = enriched.filter(r => r.from === form.from.trim() && r.to === form.to.trim());
            if (!prev.length) return null;
            const last = [...prev].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)[prev.length - 1];
            const avgD = +(prev.reduce((s, r) => s + r.distance, 0) / prev.length).toFixed(1);
            return (<div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.15)" }}>
              <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600, marginBottom: 6 }}>历史参考（{form.from.trim()}→{form.to.trim()} 共 {prev.length} 次）</div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#c4b5fd", flexWrap: "wrap", alignItems: "center" }}>
                <span>均里程: {avgD}km</span>
                <span>上次路线: {last.highway || "无"}</span>
                <span>上次油耗: {last.consumption}L</span>
                {!form.highway && last.highway && <button onClick={() => setForm({ ...form, highway: last.highway })} style={{ background: "rgba(139,92,246,.2)", border: "1px solid rgba(139,92,246,.3)", color: "#a78bfa", borderRadius: 6, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>用上次路线</button>}
                {!form.distance && <button onClick={() => setForm({ ...form, distance: String(avgD) })} style={{ background: "rgba(139,92,246,.2)", border: "1px solid rgba(139,92,246,.3)", color: "#a78bfa", borderRadius: 6, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>用均里程</button>}
              </div>
            </div>);
          })()}

          {(() => {
            const preview = getFormPreview(form);
            if (!preview) return null;
            return (<div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.15)" }}>
              <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600, marginBottom: 8 }}>自动计算预览</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 13 }}>
                <div>油费：<span style={{ color: "#f97316", fontWeight: 700 }}>¥{preview.fuelCost.toFixed(2)}</span></div>
                <div>总费用：<span style={{ color: "#ef4444", fontWeight: 700 }}>¥{preview.totalCost.toFixed(2)}</span></div>
                <div>净支出：<span style={{ color: preview.netSpend > 0 ? "#f43f5e" : "#10b981", fontWeight: 700 }}>¥{preview.netSpend.toFixed(2)}</span></div>
                <div>每公里：<span style={{ color: "#8b5cf6", fontWeight: 700 }}>¥{preview.costPerKm.toFixed(3)}</span></div>
              </div>
            </div>);
          })()}

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button onClick={handleSubmit} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{editId ? "保存修改" : "添加记录"}</button>
            {editId && <button onClick={() => { setEditId(null); setForm(emptyForm()); }} style={{ padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#94a3b8", fontSize: 14, cursor: "pointer" }}>取消</button>}
          </div>
        </div>)}

        {/* ═══ ETC LOOKUP ═══ */}
        {tab === "etc" && (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { l: "通行记录", v: etcSummary.recordCount + " 条", c: "#60a5fa" },
              { l: "其中 0 元记录", v: etcSummary.zeroCount + " 条", c: "#fbbf24" },
              { l: "入口/出口组合", v: etcSummary.routeCount + " 组", c: "#f97316" },
              { l: "去重收费项", v: etcSummary.fareCount + " 项", c: "#a78bfa" }
            ].map((x, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "14px 14px", border: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{x.l}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: x.c }}>{x.v}</div>
              </div>
            ))}
          </div>

          <div style={{ ...boxS, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>ETC 金额查询</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <AutoComplete value={etcEntry} onChange={setEtcEntry} options={etcStations} placeholder="输入或选择入口站" label="入口站" />
              <AutoComplete value={etcExit} onChange={setEtcExit} options={etcStations} placeholder="输入或选择出口站" label="出口站" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => { const oldEntry = etcEntry; setEtcEntry(etcExit); setEtcExit(oldEntry); }}
                style={{ background: "rgba(96,165,250,.14)", border: "1px solid rgba(96,165,250,.25)", color: "#60a5fa", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                入口出口互换
              </button>
              <button onClick={() => { setEtcEntry(""); setEtcExit(""); }}
                style={{ background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.22)", color: "#94a3b8", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                清空
              </button>
              <label style={{ alignSelf: "center", fontSize: 12, color: "#94a3b8", display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={etcHideFree} onChange={e => setEtcHideFree(e.target.checked)} />隐藏 0 元记录
              </label>
              <span style={{ alignSelf: "center", fontSize: 12, color: "#64748b" }}>当前匹配 {visibleEtcFares.length} 个去重收费项</span>
            </div>
          </div>

          <div style={{ ...boxS, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>查询结果</div>
            {visibleEtcFares.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 13 }}>没有匹配的 ETC 记录</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
                  <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                    {["入口站", "出口站", "ETC金额", "出现次数", "最近入口时间", "最近出口时间", "来源序号"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{visibleEtcFares.map((fare, i) => (
                    <tr key={`${fare.entryStation}-${fare.exitStation}-${fare.amount}`} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", background: i % 2 ? "rgba(255,255,255,.015)" : "transparent" }}>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>{fare.entryLabel}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>{fare.exitLabel}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#10b981", fontSize: 15, fontWeight: 800 }}>¥{fare.amount.toFixed(2)}{fare.isFree && <span style={{ marginLeft: 6, fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>免费/0元</span>}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: fare.count > 1 ? "#f97316" : "#94a3b8", fontWeight: fare.count > 1 ? 700 : 500 }}>{fare.count}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>{fare.latestRecord.entryTime}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>{fare.latestRecord.exitTime}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#64748b" }}>#{fare.records.map(r => r.sourceNo).join(", #")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>)}

        {tab === "compare" && (
          <CompareTab
            records={enriched}
            etcRecords={etcRecords}
            placeOpts={placeOpts}
            etcStations={etcStations}
            compareForm={compareForm}
            setCompareForm={setCompareForm}
            compareTrip={compareTrip}
            setCompareTrip={setCompareTrip}
            showToast={showToast}
          />
        )}

        {/* ═══ DATA CHECK ═══ */}
        {tab === "check" && (<div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>数据一致性排查</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>按起点→终点归组，检查路线命名、空格、里程偏差、疑似重复、同日重叠行程和数值异常。路线名称只在你确认后才会批量统一；删除记录前会自动保存恢复点。</div>

          {routeNameGroups.length > 0 && (
            <div style={{ ...boxS, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f97316" }}>路线命名统一</div>
                <div style={{ fontSize: 12, color: "#fdba74" }}>待处理 {routeNameGroups.length} 组</div>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7, marginBottom: 4 }}>同一起终点可以保留多条真实路线；不完整或错误名称可以只修正对应记录。</div>

              {routeNameGroups.map((group, groupIndex) => {
                const selectedName = routeNameSelections[group.key] ?? group.suggestedName;
                const suggestedLabel = group.names.find(item => item.name === group.suggestedName)?.label || "(无)";
                return (
                  <div key={group.key} style={{ padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.07)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{group.route}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{group.totalCount} 条记录</div>
                      </div>
                      <button type="button" onClick={() => acceptRouteNameGroup(group)}
                        style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.25)", color: "#60a5fa", padding: "7px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        确认当前多条路线都有效
                      </button>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                      {group.names.map(item => {
                        const active = selectedName === item.name;
                        return (
                          <button key={item.label} type="button" aria-pressed={active} onClick={() => setRouteNameSelections(current => ({ ...current, [group.key]: item.name }))}
                            style={{ padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12, background: active ? "rgba(249,115,22,.2)" : "rgba(255,255,255,.04)", border: active ? "1px solid rgba(249,115,22,.4)" : "1px solid rgba(255,255,255,.09)", color: active ? "#fdba74" : "#cbd5e1" }}>
                            {item.label} · {item.count}次
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: 11, color: group.hasTopTie ? "#fbbf24" : "#64748b", marginTop: 9 }}>
                      {group.hasTopTie ? "最高次数并列，请手动确认统一名称。" : `最常用建议：${suggestedLabel}`}
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginTop: 14 }}>整组统一为一个名称</div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) auto", gap: 8, marginTop: 8 }}>
                      <div>
                        <label htmlFor={`route-name-${groupIndex}`} style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>统一命名为</label>
                        <input id={`route-name-${groupIndex}`} type="text" value={selectedName} onChange={e => setRouteNameSelections(current => ({ ...current, [group.key]: e.target.value }))} placeholder="输入路线名，留空表示无高速"
                          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "9px 11px", borderRadius: 8, fontSize: 13, outline: "none" }} />
                      </div>
                      <button type="button" onClick={() => applyRouteNameGroup(group)}
                        style={{ alignSelf: "end", background: "rgba(16,185,129,.16)", border: "1px solid rgba(16,185,129,.3)", color: "#10b981", padding: "9px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        统一这一组
                      </button>
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginTop: 16 }}>只修正某一个旧名称</div>
                    <datalist id={`route-options-${groupIndex}`}>
                      {group.names.map(item => <option key={item.label} value={item.label} />)}
                    </datalist>
                    <div style={{ marginTop: 6 }}>
                      {group.names.map((item, itemIndex) => {
                        const selectionKey = `${group.key}::${item.label}`;
                        return (
                          <div key={item.label} style={{ display: "flex", alignItems: "end", gap: 8, padding: "8px 0", borderTop: itemIndex ? "1px solid rgba(255,255,255,.05)" : "none", flexWrap: "wrap" }}>
                            <div style={{ minWidth: 130, flex: "0 1 160px" }}>
                              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>当前名称</div>
                              <div style={{ fontSize: 12, color: "#e2e8f0" }}>{item.label} · {item.count}次</div>
                            </div>
                            <div style={{ minWidth: 160, flex: "1 1 190px" }}>
                              <label htmlFor={`route-variant-${groupIndex}-${itemIndex}`} style={{ display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>仅将这些记录改为</label>
                              <input id={`route-variant-${groupIndex}-${itemIndex}`} list={`route-options-${groupIndex}`} type="text" value={routeVariantSelections[selectionKey] || ""}
                                onChange={e => setRouteVariantSelections(current => ({ ...current, [selectionKey]: e.target.value }))} placeholder="输入或选择目标名称"
                                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "8px 10px", borderRadius: 8, fontSize: 12, outline: "none" }} />
                            </div>
                            <button type="button" onClick={() => applyRouteVariantName(group, item)}
                              style={{ background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.25)", color: "#fb923c", padding: "8px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                              仅修改这{item.count}条
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 5 }}>输入“(无)”可清空路线名称。修正错误名称后，确认剩余多条路线均有效即可。</div>
                  </div>
                );
              })}
            </div>
          )}

          {acceptedRouteRules.length > 0 && (
            <div style={{ ...boxS, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa", marginBottom: 9 }}>已确认的多路线规则（{acceptedRouteRules.length}）</div>
              {acceptedRouteRules.map(([route, names], index) => (
                <div key={route} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 0", borderTop: index ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{route}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{names.map(name => name || "(无)").join("、")}</div>
                  </div>
                  <button type="button" onClick={() => reopenRouteNameRule(route)}
                    style={{ background: "rgba(100,116,139,.1)", border: "1px solid rgba(100,116,139,.22)", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>
                    重新检查
                  </button>
                </div>
              ))}
            </div>
          )}

          {routeNameGroups.length === 0 && visibleIssues.length === 0 ? (
            <div style={{ ...boxS, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#10b981" }}>无待处理问题</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>{ignoredCount > 0 ? `已忽略 ${ignoredCount} 项` : "未发现问题"}</div>
            </div>
          ) : visibleIssues.length > 0 && (<div>
            {ISSUE_TYPES.map(type => {
              const items = visibleIssues.filter(i => i.type === type);
              if (!items.length) return null;
              const fixable = items.some(i => i.fix);
              return (<div key={type} style={{ ...boxS, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: (ISSUE_TYPE_COLORS[type] || ISSUE_TYPE_COLORS.空格).bg, color: (ISSUE_TYPE_COLORS[type] || ISSUE_TYPE_COLORS.空格).fg }}>{type}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{items.length} 个</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {fixable && <button onClick={() => applyAllFixes(type)} style={{ background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.25)", color: "#10b981", padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>全部修复</button>}
                    <button onClick={() => ignoreAllOfType(type)} style={{ background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.2)", color: "#94a3b8", padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>全部忽略</button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>ID</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>日期</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>路线</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>当前</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>建议</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", color: "#94a3b8" }}>操作</th>
                  </tr></thead>
                  <tbody>{items.map((x, i) => (
                    <tr key={x.key} style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>#{x.id}</td>
                      <td style={{ padding: "6px 8px" }}>{x.date || "-"}</td>
                      <td style={{ padding: "6px 8px" }}>{x.field}</td>
                      <td style={{ padding: "6px 8px", color: "#ef4444", maxWidth: 220 }}>{x.old}</td>
                      <td style={{ padding: "6px 8px", color: "#10b981" }}>{x.sug}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {editingIssue === x.key ? (
                          <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <input type="text" value={editHwValue} onChange={e => setEditHwValue(e.target.value)} placeholder="输入路线名"
                              style={{ width: 90, padding: "3px 8px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 11, outline: "none" }} />
                            <button onClick={() => saveEditIssue(x)} style={{ background: "none", border: "1px solid rgba(16,185,129,.3)", color: "#10b981", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>保存</button>
                            <button onClick={() => setEditingIssue(null)} style={{ background: "none", border: "none", color: "#94a3b8", padding: "3px 4px", fontSize: 11, cursor: "pointer" }}>取消</button>
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", gap: 4 }}>
                            {x.fix && <button onClick={() => applyFix(x)} style={{ background: "none", border: "1px solid rgba(96,165,250,.3)", color: "#60a5fa", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>修复</button>}
                            {x.type === "里程偏差" && <button onClick={() => startEditIssue(x)} style={{ background: "none", border: "1px solid rgba(249,115,22,.3)", color: "#f97316", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>修改</button>}
                            {(x.type === "疑似重复" || x.type === "重叠行程") && <button onClick={() => requestDeleteRecord(x.id)} style={{ background: "none", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>删除记录</button>}
                            <button onClick={() => ignoreIssue(x)} style={{ background: "none", border: "1px solid rgba(100,116,139,.3)", color: "#94a3b8", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>忽略</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </div>);
            })}
          </div>)}

          {/* Ignored issues section */}
          {ignoredCount > 0 && (
            <div style={{ ...boxS, padding: 16, marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>已忽略</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{ignoredCount} 项</span>
                </div>
                <button onClick={clearAllIgnored} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#ef4444", padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>清空忽略列表</button>
              </div>
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#64748b" }}>ID</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#64748b" }}>类型</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#64748b" }}>路线</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#64748b" }}>详情</th>
                  <th style={{ padding: "5px 8px", textAlign: "center", color: "#64748b" }}>操作</th>
                </tr></thead>
                <tbody>{issues.filter(i => ignoredIssues.has(i.key)).map(x => (
                  <tr key={x.key} style={{ borderBottom: "1px solid rgba(255,255,255,.02)", opacity: .7 }}>
                    <td style={{ padding: "5px 8px", color: "#64748b" }}>#{x.id}</td>
                    <td style={{ padding: "5px 8px", color: "#64748b" }}>{x.type}</td>
                    <td style={{ padding: "5px 8px", color: "#64748b" }}>{x.field}</td>
                    <td style={{ padding: "5px 8px", color: "#64748b" }}>{x.old}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>
                      <button onClick={() => unignoreIssue(x.key)} style={{ background: "none", border: "1px solid rgba(96,165,250,.2)", color: "#60a5fa", padding: "2px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>恢复</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}

          <div style={{ ...boxS, padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>地名词典（{placeOpts.length}）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {placeOpts.map(p => <span key={p} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.15)", color: "#93c5fd" }}>{p}</span>)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>路线词典（{hwOpts.length}）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hwOpts.map(h => <span key={h} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, background: "rgba(249,115,22,.1)", border: "1px solid rgba(249,115,22,.15)", color: "#fdba74" }}>{h}</span>)}
            </div>
          </div>
        </div>)}
      </div>

      <ConfirmDialog dialog={dialog} onClose={closeDialog} />

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        input:focus { border-color:rgba(99,102,241,.5) !important; box-shadow:0 0 0 3px rgba(99,102,241,.15); }
        select:focus { outline:none; border-color:rgba(99,102,241,.5); }
        table { font-variant-numeric:tabular-nums; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:3px; }
        button:hover { opacity:.85; }
      `}</style>
    </div>
  );
}
