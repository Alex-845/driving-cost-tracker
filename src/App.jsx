import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart } from "recharts";
import AuthScreen from "./components/AuthScreen";
import { CHART_OPTIONS, ETC_STORAGE_KEY, FORM_FIELDS, IGNORED_ISSUES_KEY, ISSUE_TYPES, RECORD_COLUMNS, ROUTE_NAME_RULES_KEY, STORAGE_KEY, TAB_LABELS, TABS } from "./config/appConfig";
import { detectDataIssues, getRouteNameGroups } from "./lib/dataQuality";
import { parseDrivingWorkbook } from "./lib/excelImport";
import { buildRecordFromForm, calcRecord, emptyForm, formatCompactNumber, getFormPreview, getMonthlyData, getNextId, getRouteData, getStats, recordToForm, sortDrivingRecords, validateRecordInput } from "./lib/drivingMath";
import { getEtcStations, getEtcSummary, queryEtcFares } from "./lib/etcLookup";
import { calcTravelComparison, defaultCompareForm, fillCompareFormFromRoute, getReverseTravelRouteProfile, getTravelRouteProfiles, pickRecommendedFare } from "./lib/travelCompare";
import { downloadBackup, readBackupFile } from "./lib/backup";
import { loadJson, saveJson } from "./lib/storage";
import { useCloudSync } from "./hooks/useCloudSync";
import { ETC_RECORDS } from "./data/etcRecords";
import { INITIAL_DATA } from "./data/initialRecords";


/* ── Autocomplete ── */
function AutoComplete({ value, onChange, options, placeholder, label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const list = useMemo(() => {
    const t = (q || value || "").toLowerCase();
    if (!t) return options;
    return options.filter(o => o.toLowerCase().includes(t));
  }, [q, value, options]);
  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{label}</label>
      <input type="text" value={value}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
          color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none"
        }}
      />
      {open && list.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#1e293b", border: "1px solid #334155", borderRadius: 10,
          maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 32px rgba(0,0,0,.5)"
        }}>
          {list.map((o, i) => (
            <div key={i} onClick={() => { onChange(o); setQ(""); setOpen(false); }}
              style={{
                padding: "9px 14px", fontSize: 13, cursor: "pointer",
                background: o === value ? "rgba(59,130,246,.15)" : "transparent",
                color: o === value ? "#60a5fa" : "#e2e8f0",
                borderBottom: i < list.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none"
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = o === value ? "rgba(59,130,246,.15)" : "transparent"; }}
            >{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [etcRecords, setEtcRecords] = useState([]);
  const [localReady, setLocalReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterMonth, setFilterMonth] = useState("all");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [chartType, setChartType] = useState("monthly");
  const [ignoredIssues, setIgnoredIssues] = useState(new Set());
  const [editingIssue, setEditingIssue] = useState(null);
  const [editHwValue, setEditHwValue] = useState("");
  const [routeNameSelections, setRouteNameSelections] = useState({});
  const [routeVariantSelections, setRouteVariantSelections] = useState({});
  const [routeNameRules, setRouteNameRules] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importMode, setImportMode] = useState("merge"); // "merge" | "replace"
  const [importError, setImportError] = useState("");
  const [etcEntry, setEtcEntry] = useState("");
  const [etcExit, setEtcExit] = useState("");
  const [compareForm, setCompareForm] = useState(defaultCompareForm());
  const [compareTrip, setCompareTrip] = useState({ from: "", to: "", route: "" });
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  useEffect(() => {
    const storedRecords = loadJson(STORAGE_KEY, null);
    if (storedRecords) setRecords(storedRecords);
    else {
      setRecords(INITIAL_DATA);
      saveJson(STORAGE_KEY, INITIAL_DATA);
    }
    const storedEtcRecords = loadJson(ETC_STORAGE_KEY, null);
    if (storedEtcRecords) setEtcRecords(storedEtcRecords);
    else {
      setEtcRecords(ETC_RECORDS);
      saveJson(ETC_STORAGE_KEY, ETC_RECORDS);
    }
    setIgnoredIssues(new Set(loadJson(IGNORED_ISSUES_KEY, [])));
    setRouteNameRules(loadJson(ROUTE_NAME_RULES_KEY, {}));
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
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const enriched = useMemo(() => records.map(calcRecord), [records]);

  const placeOpts = useMemo(() => { const s = new Set(); records.forEach(r => { if (r.from) s.add(r.from.trim()); if (r.to) s.add(r.to.trim()); }); return [...s].sort(); }, [records]);
  const hwOpts = useMemo(() => { const s = new Set(); records.forEach(r => { if (r.highway) s.add(r.highway.trim()); }); return [...s].sort(); }, [records]);
  const compareTripDestinations = useMemo(() => {
    const destinations = new Set();
    records.forEach(record => {
      if (!record.to) return;
      if (compareTrip.from && record.from?.trim() !== compareTrip.from.trim()) return;
      destinations.add(record.to.trim());
    });
    return [...destinations].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [records, compareTrip.from]);

  const stats = useMemo(() => getStats(enriched), [enriched]);
  const monthlyData = useMemo(() => getMonthlyData(enriched), [enriched]);
  const routeData = useMemo(() => getRouteData(enriched), [enriched]);
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
  const compareOutboundFares = useMemo(() => compareForm.entryStation && compareForm.exitStation
    ? queryEtcFares(etcRecords, compareForm.entryStation, compareForm.exitStation)
    : [], [etcRecords, compareForm.entryStation, compareForm.exitStation]);
  const compareReturnFares = useMemo(() => compareForm.entryStation && compareForm.exitStation
    ? queryEtcFares(etcRecords, compareForm.exitStation, compareForm.entryStation)
    : [], [etcRecords, compareForm.entryStation, compareForm.exitStation]);
  const recommendedOutbound = useMemo(() => pickRecommendedFare(compareOutboundFares), [compareOutboundFares]);
  const recommendedReturn = useMemo(() => pickRecommendedFare(compareReturnFares), [compareReturnFares]);
  const travelComparison = useMemo(() => calcTravelComparison(compareForm, recommendedOutbound, recommendedReturn), [compareForm, recommendedOutbound, recommendedReturn]);
  const compareRouteProfiles = useMemo(
    () => getTravelRouteProfiles(enriched, compareTrip.from, compareTrip.to),
    [enriched, compareTrip.from, compareTrip.to]
  );
  const selectedCompareRoute = useMemo(
    () => compareRouteProfiles.find(profile => profile.routeValue === compareTrip.route) || null,
    [compareRouteProfiles, compareTrip.route]
  );
  const selectedCompareReturnRoute = useMemo(
    () => selectedCompareRoute
      ? getReverseTravelRouteProfile(enriched, compareTrip.from, compareTrip.to, selectedCompareRoute.routeValue)
      : null,
    [enriched, compareTrip.from, compareTrip.to, selectedCompareRoute]
  );

  useEffect(() => {
    if (!compareTrip.from || !compareTrip.to) return;
    if (compareRouteProfiles.some(profile => profile.routeValue === compareTrip.route)) return;
    setCompareTrip(current => ({
      ...current,
      route: compareRouteProfiles.length === 1 ? compareRouteProfiles[0].routeValue : ""
    }));
  }, [compareRouteProfiles, compareTrip.from, compareTrip.to, compareTrip.route]);

  const visibleIssues = useMemo(() => issues.filter(i => !ignoredIssues.has(i.key)), [issues, ignoredIssues]);
  const ignoredCount = useMemo(() => issues.filter(i => ignoredIssues.has(i.key)).length, [issues, ignoredIssues]);
  const issueCount = visibleIssues.length + routeNameGroups.length;

  const filtered = useMemo(() => {
    let d = enriched;
    if (filterMonth !== "all") d = d.filter(r => r.date.slice(0, 7) === filterMonth);
    return sortDrivingRecords(d, sortKey, sortDir);
  }, [enriched, filterMonth, sortKey, sortDir]);

  const months = useMemo(() => [...new Set(records.map(r => r.date.slice(0, 7)))].sort(), [records]);
  const handleSort = (k) => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("desc"); } };

  const handleSubmit = () => {
    const error = validateRecordInput(form);
    if (error) { showToast(error); return; }

    const nextRecord = buildRecordFromForm(form, editId ?? getNextId(records));
    if (editId !== null) { save(records.map(r => r.id === editId ? nextRecord : r)); setEditId(null); showToast("已更新"); }
    else { save([...records, nextRecord]); showToast("已添加"); }
    setForm(emptyForm()); setTab("records");
  };

  const startEdit = (r) => { setForm(recordToForm(r)); setEditId(r.id); setTab("add"); };
  const doDelete = (id) => { save(records.filter(r => r.id !== id)); setConfirmDelete(null); showToast("已删除"); };
  const applySelectedCompareRoute = () => {
    if (!selectedCompareRoute) {
      showToast("请先选择一条路线");
      return;
    }
    setCompareForm(current => fillCompareFormFromRoute(
      current,
      selectedCompareRoute,
      selectedCompareReturnRoute
    ));
    showToast(`已填入路线「${selectedCompareRoute.routeLabel}」`);
  };

  const applyFix = (issue) => { if (!issue.fix) return; save(records.map(r => r.id === issue.id ? { ...r, ...issue.fix } : r)); showToast("已修复"); };
  const applyAllFixes = (type) => {
    const items = visibleIssues.filter(i => i.type === type && i.fix);
    if (!items.length) return;
    let d = [...records];
    items.forEach(issue => { d = d.map(r => r.id === issue.id ? { ...r, ...issue.fix } : r); });
    save(d); showToast(`已修复 ${items.length} 项`);
  };

  const applyRouteNameGroup = (group) => {
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

  const saveIgnored = useCallback((newSet) => {
    setIgnoredIssues(newSet);
    saveJson(IGNORED_ISSUES_KEY, [...newSet]);
  }, []);

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

  const handleReset = () => {
    applySnapshot({
      records: INITIAL_DATA,
      etcRecords: ETC_RECORDS,
      ignoredIssues: [],
      routeNameRules: {}
    });
    setRouteNameSelections({});
    setRouteVariantSelections({});
    showToast("已重置");
  };

  const handleBackupExport = () => {
    downloadBackup(dataSnapshot);
    showToast("完整备份已下载");
  };

  const handleBackupImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const nextSnapshot = await readBackupFile(file);
      applySnapshot(nextSnapshot);
      showToast(`已恢复 ${nextSnapshot.records.length} 条行程和 ${nextSnapshot.etcRecords.length} 条 ETC 记录`);
    } catch (error) {
      showToast(error.message || "备份恢复失败");
    } finally {
      event.target.value = "";
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseDrivingWorkbook(evt.target.result, records);
        if (parsed.length === 0) {
          setImportError("未能解析出有效数据，请检查表格格式。");
          setImportPreview(null);
        } else {
          setImportPreview(parsed);
          setImportError("");
        }
      } catch (err) {
        setImportError("文件解析失败：" + err.message);
        setImportPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const executeImport = () => {
    if (!importPreview) return;
    const toImport = importMode === "merge"
      ? importPreview.filter(p => !p.isDuplicate)
      : importPreview;

    if (toImport.length === 0) { showToast("没有新数据需要导入"); return; }

    let baseId = getNextId(records);
    const newEntries = toImport.map((p, i) => ({
      id: baseId + i,
      date: p.date, from: p.from, to: p.to, highway: p.highway,
      price: p.price, consumption: p.consumption, distance: p.distance,
      toll: p.toll, income: p.income
    }));

    if (importMode === "replace") {
      save(newEntries);
      showToast(`已替换，共 ${newEntries.length} 条记录`);
    } else {
      save([...records, ...newEntries]);
      showToast(`已导入 ${newEntries.length} 条新记录`);
    }
    setShowImport(false);
    setImportPreview(null);
  };

  const fmt = formatCompactNumber;

  const boxS = { background: "rgba(255,255,255,.03)", borderRadius: 16, padding: "20px 10px 10px", border: "1px solid rgba(255,255,255,.06)", marginBottom: 20 };
  const ttS = { background: "#1e293b", border: "1px solid #334155", borderRadius: 10, fontSize: 12 };

  if (cloud.configured && (!cloud.authReady || (cloud.session && !cloud.cloudReady))) {
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
        color: "#cbd5e1", fontFamily: "'Noto Sans SC','PingFang SC',-apple-system,sans-serif",
        background: "linear-gradient(135deg,#0c1220 0%,#1a1a2e 50%,#16213e 100%)"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>行车油耗追踪</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>{cloud.syncStatus}</div>
        </div>
      </div>
    );
  }

  if (cloud.configured && !cloud.session) {
    return <AuthScreen authReady={cloud.authReady} onSignIn={cloud.signIn} onSignUp={cloud.signUp} />;
  }

  return (
    <div style={{ fontFamily: "'Noto Sans SC','PingFang SC',-apple-system,sans-serif", background: "linear-gradient(135deg,#0c1220 0%,#1a1a2e 50%,#16213e 100%)", minHeight: "100vh", color: "#e2e8f0" }}>
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#10b981", color: "#fff", padding: "10px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(16,185,129,.4)", animation: "fadeIn .2s" }}>{toast}</div>}

      <div style={{ background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.06)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⛽</div>
          <div><div style={{ fontSize: 17, fontWeight: 700 }}>行车油耗追踪</div><div style={{ fontSize: 11, color: "#64748b" }}>Driving Cost Tracker</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
          <span title={cloud.syncError || cloud.syncStatus} style={{
            padding: "5px 9px", borderRadius: 7, fontSize: 11,
            color: cloud.syncStatus === "同步失败" ? "#fca5a5" : cloud.syncStatus === "已同步" ? "#86efac" : "#94a3b8",
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)"
          }}>{cloud.syncStatus}</span>
          <button onClick={handleBackupExport} style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.22)", color: "#93c5fd", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>导出备份</button>
          <input ref={backupInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleBackupImport} />
          <button onClick={() => backupInputRef.current?.click()} style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", color: "#86efac", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>恢复备份</button>
          {cloud.session && <button onClick={cloud.signOut} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>退出</button>}
          <button onClick={handleReset} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>重置</button>
        </div>
      </div>

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

        {/* ═══ DASHBOARD ═══ */}
        {tab === "dashboard" && stats && (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
            {[{ l: "总里程", v: fmt(stats.totalDist) + " km", c: "#3b82f6", i: "🛣️" }, { l: "总油费", v: "¥" + fmt(stats.totalFuel), c: "#f97316", i: "⛽" }, { l: "总过路费", v: "¥" + fmt(stats.totalToll), c: "#ef4444", i: "🛤️" }, { l: "顺风车收入", v: "¥" + fmt(stats.totalIncome), c: "#10b981", i: "💰" }, { l: "平均油耗", v: stats.avgConsumption.toFixed(1) + " L/100km", c: "#8b5cf6", i: "📊" }, { l: "出行次数", v: stats.count + " 次", c: "#06b6d4", i: "🚗" }]
              .map((x, i) => (<div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(255,255,255,.06)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 10, right: 12, fontSize: 22, opacity: .3 }}>{x.i}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{x.l}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: x.c }}>{x.v}</div>
              </div>))}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {CHART_OPTIONS.map(c => (
              <button key={c.k} onClick={() => setChartType(c.k)} style={{ padding: "6px 16px", borderRadius: 8, background: chartType === c.k ? "rgba(59,130,246,.25)" : "rgba(255,255,255,.04)", color: chartType === c.k ? "#60a5fa" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", border: chartType === c.k ? "1px solid rgba(59,130,246,.3)" : "1px solid transparent" }}>{c.l}</button>
            ))}
          </div>

          <div style={boxS}>
            {chartType === "monthly" && (<div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用与收入</div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={ttS} formatter={v => "¥" + v.toFixed(0)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="fuelCost" name="油费" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="toll" name="过路费" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="income" name="顺风车收入" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>)}
            {chartType === "consumption" && (<div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>百公里油耗趋势</div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={enriched.slice(-60)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                  <YAxis domain={[4, 11]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={ttS} formatter={v => v.toFixed(1) + " L/100km"} />
                  <Area type="monotone" dataKey="consumption" stroke="#8b5cf6" strokeWidth={2} fill="url(#cg)" dot={{ r: 2, fill: "#8b5cf6" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>)}
            {chartType === "cost" && (<div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用构成 & 收入</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={ttS} formatter={v => "¥" + v.toFixed(0)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="fuelCost" name="油费" stackId="c" fill="#f97316" />
                  <Bar dataKey="toll" name="过路费" stackId="c" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="income" name="顺风车收入" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>)}
            {chartType === "routes" && (<div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>TOP 10 高频路线</div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={routeData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis dataKey="route" type="category" width={110} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip contentStyle={ttS} />
                  <Bar dataKey="count" name="次数" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>)}
            {chartType === "price" && (<div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>油价走势</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={enriched} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={ttS} formatter={v => "¥" + v.toFixed(2) + "/L"} />
                  <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={{ r: 1.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>)}
          </div>

          <div style={{ ...boxS, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>月度汇总</div>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                {["月份", "出行", "里程", "油费", "过路费", "收入", "盈亏", "均油耗"].map(h => <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
              </tr></thead>
              <tbody>{monthlyData.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{m.label}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.trips}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.distance.toFixed(0)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "#f97316" }}>{m.fuelCost.toFixed(0)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "#ef4444" }}>{m.toll.toFixed(0)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "#10b981" }}>{m.income.toFixed(0)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: m.profit >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{m.profit >= 0 ? "+" : ""}{m.profit.toFixed(0)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "#8b5cf6" }}>{m.avgC}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        </div>)}

        {/* ═══ RECORDS ═══ */}
        {tab === "records" && (<div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#e2e8f0", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
              <option value="all">全部月份</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "#64748b" }}>共 {filtered.length} 条</span>
            <div style={{ marginLeft: "auto" }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileSelect} />
              <button onClick={() => { if (showImport) { setShowImport(false); setImportPreview(null); setImportError(""); } else setShowImport(true); }}
                style={{ background: showImport ? "rgba(99,102,241,.25)" : "rgba(59,130,246,.15)", border: "1px solid " + (showImport ? "rgba(99,102,241,.4)" : "rgba(59,130,246,.25)"), color: showImport ? "#a5b4fc" : "#60a5fa", padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {showImport ? "收起导入" : "导入Excel"}
              </button>
            </div>
          </div>

          {/* Import Panel */}
          {showImport && (
            <div style={{ ...boxS, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>从 Excel 导入数据</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>支持你现有的油耗记录表格式（含序号、日期、行程、油价、油耗、公里数、过路费、顺风车收入等列）。</div>

              {/* Step 1: File select */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", color: "#fff", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  选择 Excel 文件
                </button>
                {importPreview && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>已解析 {importPreview.length} 条记录</span>
                    <span style={{ fontSize: 12, color: "#f97316" }}>{importPreview.filter(p => p.isDuplicate).length} 条重复</span>
                    <span style={{ fontSize: 12, color: "#60a5fa" }}>{importPreview.filter(p => !p.isDuplicate).length} 条新数据</span>
                  </div>
                )}
              </div>

              {importError && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>{importError}</div>}

              {/* Step 2: Preview */}
              {importPreview && importPreview.length > 0 && (<>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>数据预览（前20条）：</div>
                <div style={{ overflowX: "auto", marginBottom: 16, maxHeight: 320, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
                    <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)", position: "sticky", top: 0, background: "#1a1a2e" }}>
                      <th style={{ padding: "6px 6px", textAlign: "center", color: "#94a3b8" }}>状态</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>日期</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>出发</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>到达</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>路线</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>油价</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>油耗</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>公里</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>过路费</th>
                      <th style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>收入</th>
                    </tr></thead>
                    <tbody>{importPreview.slice(0, 20).map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.03)", opacity: p.isDuplicate ? .45 : 1 }}>
                        <td style={{ padding: "5px 6px", textAlign: "center" }}>
                          {p.isDuplicate
                            ? <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "rgba(100,116,139,.2)", color: "#94a3b8" }}>重复</span>
                            : <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "rgba(16,185,129,.15)", color: "#10b981" }}>新增</span>}
                        </td>
                        <td style={{ padding: "5px 6px", textAlign: "right" }}>{p.date}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right" }}>{p.from}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right" }}>{p.to}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", color: "#64748b" }}>{p.highway || "-"}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right" }}>{p.price}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", color: "#8b5cf6" }}>{p.consumption}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right" }}>{p.distance}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", color: "#ef4444" }}>{p.toll || "-"}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", color: "#10b981" }}>{p.income || "-"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {importPreview.length > 20 && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>... 还有 {importPreview.length - 20} 条未展示</div>}

                {/* Step 3: Import mode & execute */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.04)", borderRadius: 8, padding: 3 }}>
                    {[{ k: "merge", l: "合并（跳过重复）" }, { k: "replace", l: "替换（清空旧数据）" }].map(m => (
                      <button key={m.k} onClick={() => setImportMode(m.k)} style={{
                        padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: importMode === m.k ? "rgba(59,130,246,.25)" : "transparent",
                        color: importMode === m.k ? "#60a5fa" : "#94a3b8"
                      }}>{m.l}</button>
                    ))}
                  </div>
                  <button onClick={executeImport} style={{
                    background: "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff",
                    padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer"
                  }}>
                    {importMode === "merge"
                      ? `导入 ${importPreview.filter(p => !p.isDuplicate).length} 条新记录`
                      : `替换为 ${importPreview.length} 条记录`}
                  </button>
                  {importMode === "replace" && <span style={{ fontSize: 11, color: "#ef4444" }}>注意：替换模式会清空当前所有数据</span>}
                </div>
              </>)}

              {/* Format guide */}
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.1)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", marginBottom: 6 }}>支持的表格格式说明</div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
                  表格需包含以下列：序号、日期、行程（如"楚雄-昆明"）、路线/高速、油价、百公里油耗、公里数、过路费、顺风车收入。
                  系统会自动识别列位置，并将"行程"列拆分为出发地和目的地。油费、总费用、盈亏等字段会自动计算，无需包含在表格中。
                  合并模式下，通过日期+出发地+目的地+公里数判定重复，已有的记录不会重复导入。
                </div>
              </div>
            </div>
          )}
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 830 }}>
            <thead><tr style={{ borderBottom: "2px solid rgba(255,255,255,.1)" }}>
              {RECORD_COLUMNS
                .map(h => <th key={h.k} onClick={() => handleSort(h.k)} style={{ padding: "10px 5px", textAlign: "right", color: "#94a3b8", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>{h.l}{sortKey === h.k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</th>)}
              <th style={{ padding: "10px 5px", color: "#94a3b8", fontWeight: 600 }}>操作</th>
            </tr></thead>
            <tbody>{filtered.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", background: i % 2 ? "rgba(255,255,255,.015)" : "transparent" }}>
                <td style={{ padding: "8px 5px", textAlign: "right", whiteSpace: "nowrap", fontSize: 11 }}>{r.date.slice(5)}</td>
                <td style={{ padding: "8px 5px", textAlign: "right" }}>{r.from}</td>
                <td style={{ padding: "8px 5px", textAlign: "right" }}>{r.to}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#64748b", fontSize: 11 }}>{r.highway || "-"}</td>
                <td style={{ padding: "8px 5px", textAlign: "right" }}>{r.distance}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#8b5cf6" }}>{r.consumption}</td>
                <td style={{ padding: "8px 5px", textAlign: "right" }}>{r.price}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#f97316" }}>{r.fuelCost.toFixed(1)}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#ef4444" }}>{r.toll || "-"}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#fb7185", fontWeight: 700 }}>{r.totalCost.toFixed(1)}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", color: "#10b981" }}>{r.income || "-"}</td>
                <td style={{ padding: "8px 5px", textAlign: "right", fontWeight: 700, color: r.profit >= 0 ? "#10b981" : "#ef4444" }}>{r.profit >= 0 ? "+" : ""}{r.profit.toFixed(1)}</td>
                <td style={{ padding: "8px 5px", textAlign: "center", whiteSpace: "nowrap" }}>
                  <button onClick={() => startEdit(r)} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 12, padding: "2px 5px" }}>编辑</button>
                  {confirmDelete === r.id ? (<span>
                    <button onClick={() => doDelete(r.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>确认</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>取消</button>
                  </span>) : (<button onClick={() => setConfirmDelete(r.id)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 5px" }}>删除</button>)}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>)}

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

          {/* History hint */}
          {form.from && form.to && (() => {
            const prev = enriched.filter(r => r.from === form.from.trim() && r.to === form.to.trim());
            if (!prev.length) return null;
            const last = prev[prev.length - 1];
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
                <div>盈亏：<span style={{ color: preview.profit >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>¥{preview.profit.toFixed(2)}</span></div>
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
              { l: "PDF记录", v: etcRecords.length + " 条", c: "#60a5fa" },
              { l: "去重后通行", v: etcRecords.length + " 条", c: "#10b981" },
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
              <span style={{ alignSelf: "center", fontSize: 12, color: "#64748b" }}>当前匹配 {etcFares.length} 个去重收费项</span>
            </div>
          </div>

          <div style={{ ...boxS, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>查询结果</div>
            {etcFares.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "#64748b", fontSize: 13 }}>没有匹配的 ETC 记录</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
                  <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                    {["入口站", "出口站", "ETC金额", "出现次数", "最近入口时间", "最近出口时间", "来源序号"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{etcFares.map((fare, i) => (
                    <tr key={`${fare.entryStation}-${fare.exitStation}-${fare.amount}`} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", background: i % 2 ? "rgba(255,255,255,.015)" : "transparent" }}>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>{fare.entryLabel}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>{fare.exitLabel}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right", color: "#10b981", fontSize: 15, fontWeight: 800 }}>¥{fare.amount.toFixed(2)}</td>
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

        {/* ═══ TRAVEL COMPARE ═══ */}
        {tab === "compare" && (<div>
          <div style={{ ...boxS, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>历史行程路线查询</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>从行程记录中选择起点、终点和具体路线，自动生成这条路线的自驾费用参数。</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
              <AutoComplete
                value={compareTrip.from}
                onChange={value => setCompareTrip({ from: value, to: compareTrip.to, route: "" })}
                options={placeOpts}
                placeholder="选择或输入出发地"
                label="行程起点"
              />
              <AutoComplete
                value={compareTrip.to}
                onChange={value => setCompareTrip({ from: compareTrip.from, to: value, route: "" })}
                options={compareTripDestinations}
                placeholder="选择或输入目的地"
                label="行程终点"
              />
              <div style={{ minWidth: 0 }}>
                <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>具体路线</label>
                <select
                  value={compareTrip.route}
                  onChange={event => setCompareTrip({ ...compareTrip, route: event.target.value })}
                  disabled={!compareRouteProfiles.length}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
                    color: compareTrip.route ? "#e2e8f0" : "#64748b", padding: "10px 12px",
                    borderRadius: 10, fontSize: 14, outline: "none", minHeight: 41,
                    minWidth: 0, textOverflow: "ellipsis"
                  }}
                >
                  <option value="">{compareTrip.from && compareTrip.to ? "请选择路线" : "请先选择起点和终点"}</option>
                  {compareRouteProfiles.map(profile => (
                    <option key={profile.routeValue} value={profile.routeValue}>
                      {profile.routeLabel}（{profile.count}次，单程约¥{profile.estimatedTotalCost.toFixed(1)}）
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => setCompareTrip({ from: compareTrip.to, to: compareTrip.from, route: "" })}
                style={{ background: "rgba(96,165,250,.14)", border: "1px solid rgba(96,165,250,.25)", color: "#60a5fa", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                起点终点互换
              </button>
              <button onClick={() => setCompareTrip({ from: "", to: "", route: "" })}
                style={{ background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.22)", color: "#94a3b8", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                清空行程
              </button>
            </div>

            {compareTrip.from && compareTrip.to && compareRouteProfiles.length === 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.08)", color: "#94a3b8", fontSize: 12 }}>
                没有找到“{compareTrip.from} → {compareTrip.to}”的历史行程记录。
              </div>
            )}

            {selectedCompareRoute && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#60a5fa" }}>{compareTrip.from} → {compareTrip.to}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>路线「{selectedCompareRoute.routeLabel}」，历史 {selectedCompareRoute.count} 次，最近记录 {selectedCompareRoute.latestDate}</div>
                  </div>
                  <button onClick={applySelectedCompareRoute}
                    style={{ background: "rgba(59,130,246,.2)", border: "1px solid rgba(96,165,250,.32)", color: "#93c5fd", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    填入自驾对比
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 12 }}>
                  {[
                    { label: "平均单程里程", value: `${selectedCompareRoute.averageDistance.toFixed(1)} km`, color: "#e2e8f0" },
                    { label: "平均百公里油耗", value: `${selectedCompareRoute.averageConsumption.toFixed(1)} L`, color: "#a78bfa" },
                    { label: "最近油价", value: `¥${selectedCompareRoute.latestFuelPrice.toFixed(2)}/L`, color: "#fbbf24" },
                    { label: "估算单程油费", value: `¥${selectedCompareRoute.estimatedFuelCost.toFixed(2)}`, color: "#f97316" },
                    { label: "平均过路费", value: `¥${selectedCompareRoute.averageToll.toFixed(2)}`, color: "#fb7185" },
                    { label: "估算单程总费用", value: `¥${selectedCompareRoute.estimatedTotalCost.toFixed(2)}`, color: "#10b981" }
                  ].map(item => (
                    <div key={item.label} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>{item.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: item.color, whiteSpace: "nowrap" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 12, lineHeight: 1.7 }}>
                  {selectedCompareRoute.tollMin !== selectedCompareRoute.tollMax
                    ? `该路线历史过路费范围 ¥${selectedCompareRoute.tollMin.toFixed(2)} - ¥${selectedCompareRoute.tollMax.toFixed(2)}。`
                    : `该路线历史过路费均为 ¥${selectedCompareRoute.averageToll.toFixed(2)}。`}
                  {selectedCompareReturnRoute
                    ? ` 已匹配返程路线「${selectedCompareReturnRoute.routeLabel}」的 ${selectedCompareReturnRoute.count} 次记录，填入时将分别采用去程和返程平均值。`
                    : " 暂无相同道路组合的返程记录，填入时会按去程平均过路费估算，之后仍可手动修改。"}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...boxS, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>公共交通 / 自驾往返费用对比</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <AutoComplete value={compareForm.entryStation} onChange={v => setCompareForm({ ...compareForm, entryStation: v })} options={etcStations} placeholder="如：楚雄东" label="全程高速起点" />
              <AutoComplete value={compareForm.exitStation} onChange={v => setCompareForm({ ...compareForm, exitStation: v })} options={etcStations} placeholder="如：玉溪九龙池" label="全程高速终点" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => setCompareForm({
                ...compareForm,
                entryStation: compareForm.exitStation,
                exitStation: compareForm.entryStation,
                outboundTollSegment1: compareForm.returnTollSegment1,
                outboundTollSegment2: compareForm.returnTollSegment2,
                returnTollSegment1: compareForm.outboundTollSegment1,
                returnTollSegment2: compareForm.outboundTollSegment2
              })}
                style={{ background: "rgba(96,165,250,.14)", border: "1px solid rgba(96,165,250,.25)", color: "#60a5fa", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                入口出口互换
              </button>
              <button onClick={() => { setCompareForm(defaultCompareForm()); setCompareTrip({ from: "", to: "", route: "" }); }}
                style={{ background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.22)", color: "#94a3b8", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                清空重填
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
            <div style={{ ...boxS, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#60a5fa" }}>自驾往返</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
                {[
                  { k: "distance", l: "单程公里数", p: "如：230", suffix: "km" },
                  { k: "fuelPrice", l: "油价", p: "7.5", suffix: "¥/L" },
                  { k: "consumption", l: "本次百公里油耗", p: "6", suffix: "L/100km" },
                  { k: "passengers", l: "出行人数", p: "1", suffix: "人" },
                  { k: "parking", l: "停车费", p: "0", suffix: "¥" },
                  { k: "drivingOther", l: "自驾其他费用", p: "0", suffix: "¥" }
                ].map(f => (
                  <div key={f.k}>
                    <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{f.l}</label>
                    <input type="number" min="0" step="0.01" value={compareForm[f.k]} onChange={e => setCompareForm({ ...compareForm, [f.k]: e.target.value })} placeholder={f.p}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} />
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{f.suffix}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.18)" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>每百公里油费（自动计算）</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>¥{travelComparison.fuelCostPer100Km.toFixed(2)} / 100km</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>油价 × 本次百公里油耗，无需手动填写</div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 10 }}>分段高速过路费</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
                {[
                  { k: "outboundTollSegment1", l: "去程第1段", p: recommendedOutbound ? recommendedOutbound.amount.toFixed(2) : "0" },
                  { k: "outboundTollSegment2", l: "去程第2段", p: "0" },
                  { k: "returnTollSegment1", l: "返程第1段", p: recommendedReturn ? recommendedReturn.amount.toFixed(2) : "0" },
                  { k: "returnTollSegment2", l: "返程第2段", p: "0" }
                ].map(f => (
                  <div key={f.k}>
                    <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{f.l}</label>
                    <input type="number" min="0" step="0.01" value={compareForm[f.k]} onChange={e => setCompareForm({ ...compareForm, [f.k]: e.target.value })} placeholder={f.p}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} />
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>¥</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>直达时只填第1段；中途下高速再上高速时，两段费用分别填写。</div>

              {(recommendedOutbound || recommendedReturn) && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.16)" }}>
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700, marginBottom: 8 }}>全程直达 ETC 参考</div>
                  <div style={{ display: "grid", gap: 8, fontSize: 12, color: "#cbd5e1" }}>
                    <div>去程：{recommendedOutbound ? `¥${recommendedOutbound.amount.toFixed(2)}，${recommendedOutbound.count} 次记录` : "未匹配到"}</div>
                    <div>返程：{recommendedReturn ? `¥${recommendedReturn.amount.toFixed(2)}，${recommendedReturn.count} 次记录` : "未匹配到"}</div>
                  </div>
                  <button onClick={() => setCompareForm({
                    ...compareForm,
                    outboundTollSegment1: recommendedOutbound ? String(recommendedOutbound.amount) : compareForm.outboundTollSegment1,
                    returnTollSegment1: recommendedReturn ? String(recommendedReturn.amount) : compareForm.returnTollSegment1
                  })}
                    style={{ marginTop: 10, background: "rgba(16,185,129,.18)", border: "1px solid rgba(16,185,129,.28)", color: "#10b981", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    填入第1段参考费用
                  </button>
                </div>
              )}
            </div>

            <div style={{ ...boxS, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#10b981" }}>公共交通往返</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>分段票价（每人）</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
                {[
                  { k: "publicOutboundFare1", l: "去程第1段票价", p: "如：35" },
                  { k: "publicOutboundFare2", l: "去程第2段票价", p: "如：53" },
                  { k: "publicReturnFare1", l: "返程第1段票价", p: "如：53" },
                  { k: "publicReturnFare2", l: "返程第2段票价", p: "如：35" }
                ].map(f => (
                  <div key={f.k}>
                    <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{f.l}</label>
                    <input type="number" min="0" step="0.01" value={compareForm[f.k]} onChange={e => setCompareForm({ ...compareForm, [f.k]: e.target.value })} placeholder={f.p}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} />
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>¥ / 人</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.18)" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>每人往返分段票价合计（自动计算）</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>¥{travelComparison.publicFarePerPerson.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>四段票价逐项相加，不将换乘票价合并估算</div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 10 }}>附加费用（全体）</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
                {[
                  { k: "publicTransfer", l: "往返接驳/打车", p: "0" },
                  { k: "publicOther", l: "公共交通其他费用", p: "0" }
                ].map(f => (
                  <div key={f.k}>
                    <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{f.l}</label>
                    <input type="number" min="0" step="0.01" value={compareForm[f.k]} onChange={e => setCompareForm({ ...compareForm, [f.k]: e.target.value })} placeholder={f.p}
                      style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#e2e8f0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" }} />
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>¥</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.16)", fontSize: 12, color: "#93c5fd", lineHeight: 1.7 }}>
                总费用按“去返程各段票价之和 × 出行人数 + 接驳/打车 + 其他费用”计算。直达时第2段留空即可。
              </div>
            </div>
          </div>

          <div style={{ ...boxS, padding: 18, marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              {[
                { l: "自驾总费用", v: `¥${travelComparison.drivingTotal.toFixed(2)}`, c: "#60a5fa" },
                { l: "自驾人均", v: `¥${travelComparison.drivingPerPerson.toFixed(2)}`, c: "#93c5fd" },
                { l: "公共交通总费用", v: `¥${travelComparison.publicTotal.toFixed(2)}`, c: "#10b981" },
                { l: "公共交通人均", v: `¥${travelComparison.publicPerPerson.toFixed(2)}`, c: "#86efac" }
              ].map((x, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: 14, border: "1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{x.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 14, padding: 16, borderRadius: 12,
              background: travelComparison.winner === "driving" ? "rgba(96,165,250,.1)" : travelComparison.winner === "public" ? "rgba(16,185,129,.1)" : "rgba(148,163,184,.1)",
              border: "1px solid " + (travelComparison.winner === "driving" ? "rgba(96,165,250,.22)" : travelComparison.winner === "public" ? "rgba(16,185,129,.22)" : "rgba(148,163,184,.22)")
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: travelComparison.winner === "driving" ? "#60a5fa" : travelComparison.winner === "public" ? "#10b981" : "#cbd5e1", marginBottom: 8 }}>
                {travelComparison.winner === "driving" ? "建议自驾更划算" : travelComparison.winner === "public" ? "建议公共交通更划算" : "两种方式费用相同"}
              </div>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
                {travelComparison.winner === "tie"
                  ? "费用刚好相同，可以按时间、舒适度、停车便利性来决定。"
                  : `两种方式相差 ¥${travelComparison.diff.toFixed(2)}。自驾费用包含油费 ¥${travelComparison.fuelCost.toFixed(2)}、过路费 ¥${travelComparison.tollCost.toFixed(2)}；公共交通票价合计 ¥${travelComparison.publicTicketCost.toFixed(2)}。`}
              </div>
            </div>
          </div>
        </div>)}

        {/* ═══ DATA CHECK ═══ */}
        {tab === "check" && (<div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>数据一致性排查</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>按起点→终点归组，检查路线命名、空格和里程偏差。路线名称只在你确认后才会批量统一。</div>

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
                    <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: type === "空格" ? "rgba(239,68,68,.15)" : "rgba(139,92,246,.15)", color: type === "空格" ? "#ef4444" : "#8b5cf6" }}>{type}</span>
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
                      <td style={{ padding: "6px 8px" }}>{x.date?.slice(5) || "-"}</td>
                      <td style={{ padding: "6px 8px" }}>{x.field}</td>
                      <td style={{ padding: "6px 8px", color: "#ef4444" }}>{x.old}</td>
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
