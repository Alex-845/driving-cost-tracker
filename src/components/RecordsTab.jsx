import { useMemo, useRef, useState } from "react";
import { RECORD_COLUMNS } from "../config/appConfig";
import { parseDrivingWorkbook } from "../lib/excelImport";
import {
  filterRecords, getRecordMonths, getRecordYears, getRouteOptions, getStats, sortDrivingRecords
} from "../lib/drivingMath";
import { boxStyle, inputStyle, mutedButton, selectStyle } from "./styles";

const cellBase = { padding: "8px 5px", textAlign: "right" };

export default function RecordsTab({ records, rawRecords, onEdit, onDelete, onImport }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [route, setRoute] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);

  const years = useMemo(() => getRecordYears(records), [records]);
  const months = useMemo(() => getRecordMonths(records).filter(m => year === "all" || m.startsWith(year)), [records, year]);
  const routes = useMemo(() => getRouteOptions(records), [records]);
  const filtered = useMemo(
    () => sortDrivingRecords(filterRecords(records, { year, month, route, keyword }), sortKey, sortDir),
    [records, year, month, route, keyword, sortKey, sortDir]
  );
  const totals = useMemo(() => getStats(filtered), [filtered]);
  const filterActive = year !== "all" || month !== "all" || route !== "all" || keyword.trim() !== "";

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseDrivingWorkbook(evt.target.result, rawRecords);
        if (parsed.length === 0) {
          setImportError("未能解析出有效数据，请检查表格格式。");
          setImportPreview(null);
        } else {
          setImportPreview(parsed);
        }
      } catch (err) {
        setImportError("文件解析失败：" + err.message);
        setImportPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  const executeImport = () => {
    if (!importPreview) return;
    const toImport = importMode === "merge" ? importPreview.filter(p => !p.isDuplicate) : importPreview;
    if (toImport.length === 0) { onImport([], importMode); return; }
    onImport(toImport, importMode, () => { setShowImport(false); setImportPreview(null); });
  };

  const duplicateCount = importPreview ? importPreview.filter(p => p.isDuplicate).length : 0;
  const thStyle = { padding: "10px 5px", textAlign: "right", color: "#94a3b8", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" };

  return (<div>
    <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
      <select aria-label="年份" value={year} onChange={e => { setYear(e.target.value); setMonth("all"); }} style={selectStyle}>
        <option value="all">全部年份</option>
        {years.map(y => <option key={y} value={y}>{y} 年</option>)}
      </select>
      <select aria-label="月份" value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
        <option value="all">全部月份</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select aria-label="路线" value={route} onChange={e => setRoute(e.target.value)} style={{ ...selectStyle, maxWidth: 170 }}>
        <option value="all">全部起终点</option>
        {routes.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <input aria-label="搜索" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索地点或路线" style={{ ...inputStyle, width: 150, padding: "8px 12px", fontSize: 13 }} />
      {filterActive && <button type="button" style={mutedButton} onClick={() => { setYear("all"); setMonth("all"); setRoute("all"); setKeyword(""); }}>清除筛选</button>}
      <span style={{ fontSize: 12, color: "#64748b" }}>{filterActive ? `筛选后 ${filtered.length} / ${records.length} 条` : `共 ${filtered.length} 条`}</span>
      <div style={{ marginLeft: "auto" }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileSelect} />
        <button onClick={() => { if (showImport) { setShowImport(false); setImportPreview(null); setImportError(""); } else setShowImport(true); }}
          style={{ background: showImport ? "rgba(99,102,241,.25)" : "rgba(59,130,246,.15)", border: "1px solid " + (showImport ? "rgba(99,102,241,.4)" : "rgba(59,130,246,.25)"), color: showImport ? "#a5b4fc" : "#60a5fa", padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {showImport ? "收起导入" : "导入Excel"}
        </button>
      </div>
    </div>

    {totals && (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.14)", fontSize: 12, color: "#cbd5e1" }}>
        <span>{filterActive ? "筛选合计" : "合计"}</span>
        <span>里程 <b>{totals.totalDist.toFixed(0)}</b> km</span>
        <span>油费 <b style={{ color: "#f97316" }}>¥{totals.totalFuel.toFixed(0)}</b></span>
        <span>过路费 <b style={{ color: "#ef4444" }}>¥{totals.totalToll.toFixed(0)}</b></span>
        <span>总费用 <b style={{ color: "#fb7185" }}>¥{totals.totalCost.toFixed(0)}</b></span>
        <span>收入 <b style={{ color: "#10b981" }}>¥{totals.totalIncome.toFixed(0)}</b></span>
        <span>净支出 <b style={{ color: totals.netSpend > 0 ? "#f43f5e" : "#10b981" }}>¥{totals.netSpend.toFixed(0)}</b></span>
        <span>¥{totals.costPerKm.toFixed(2)}/km</span>
      </div>
    )}

    {showImport && (
      <div style={{ ...boxStyle, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>从 Excel 导入数据</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>支持你现有的油耗记录表格式（含序号、日期、行程、油价、油耗、公里数、过路费、顺风车收入等列）。</div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", color: "#fff", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            选择 Excel 文件
          </button>
          {importPreview && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>已解析 {importPreview.length} 条记录</span>
              <span style={{ fontSize: 12, color: "#f97316" }}>{duplicateCount} 条重复</span>
              <span style={{ fontSize: 12, color: "#60a5fa" }}>{importPreview.length - duplicateCount} 条新数据</span>
            </div>
          )}
        </div>

        {importError && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>{importError}</div>}

        {importPreview && importPreview.length > 0 && (<>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>数据预览（前20条）：</div>
          <div style={{ overflowX: "auto", marginBottom: 16, maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)", position: "sticky", top: 0, background: "#1a1a2e" }}>
                {["状态", "日期", "出发", "到达", "路线", "油价", "油耗", "公里", "过路费", "收入"].map(h => <th key={h} style={{ padding: "6px 6px", textAlign: h === "状态" ? "center" : "right", color: "#94a3b8" }}>{h}</th>)}
              </tr></thead>
              <tbody>{importPreview.slice(0, 20).map((p, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.03)", opacity: p.isDuplicate ? .45 : 1 }}>
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>
                    {p.isDuplicate
                      ? <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "rgba(100,116,139,.2)", color: "#94a3b8" }}>{p.duplicateReason || "重复"}</span>
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
              background: importMode === "replace" ? "linear-gradient(135deg,#ef4444,#b91c1c)" : "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff",
              padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer"
            }}>
              {importMode === "merge" ? `导入 ${importPreview.length - duplicateCount} 条新记录` : `替换为 ${importPreview.length} 条记录`}
            </button>
            {importMode === "replace" && <span style={{ fontSize: 11, color: "#ef4444" }}>替换会清空当前所有行程，点击后需再次确认</span>}
          </div>
        </>)}

        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.1)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", marginBottom: 6 }}>支持的表格格式说明</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
            表格需包含以下列：序号、日期、行程（如"楚雄-昆明"）、路线/高速、油价、百公里油耗、公里数、过路费、顺风车收入。
            系统会自动识别列位置，并将"行程"列拆分为出发地和目的地。油费、总费用、净支出等字段会自动计算，无需包含在表格中。
            合并模式下，日期+出发地+目的地+公里数+路线都相同的行视为重复（包括与已有记录重复，以及文件内部重复）。
          </div>
        </div>
      </div>
    )}

    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
      <thead><tr style={{ borderBottom: "2px solid rgba(255,255,255,.1)" }}>
        {RECORD_COLUMNS.map(h => <th key={h.k} onClick={() => handleSort(h.k)} style={thStyle}>{h.l}{sortKey === h.k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</th>)}
        <th style={{ padding: "10px 5px", color: "#94a3b8", fontWeight: 600 }}>操作</th>
      </tr></thead>
      <tbody>{filtered.map((r, i) => (
        <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", background: i % 2 ? "rgba(255,255,255,.015)" : "transparent" }}>
          <td style={{ ...cellBase, whiteSpace: "nowrap", fontSize: 11 }}>{r.date}</td>
          <td style={cellBase}>{r.from}</td>
          <td style={cellBase}>{r.to}</td>
          <td style={{ ...cellBase, color: "#64748b", fontSize: 11 }}>{r.highway || "-"}</td>
          <td style={cellBase}>{r.distance}</td>
          <td style={{ ...cellBase, color: "#8b5cf6" }}>{r.consumption}</td>
          <td style={cellBase}>{r.price}</td>
          <td style={{ ...cellBase, color: "#f97316" }}>{r.fuelCost.toFixed(1)}</td>
          <td style={{ ...cellBase, color: "#ef4444" }}>{r.toll || "-"}</td>
          <td style={{ ...cellBase, color: "#fb7185", fontWeight: 700 }}>{r.totalCost.toFixed(1)}</td>
          <td style={{ ...cellBase, color: "#a78bfa" }}>{r.costPerKm.toFixed(2)}</td>
          <td style={{ ...cellBase, color: "#10b981" }}>{r.income || "-"}</td>
          <td style={{ ...cellBase, fontWeight: 700, color: r.netSpend > 0 ? "#f43f5e" : "#10b981" }}>{r.netSpend.toFixed(1)}</td>
          <td style={{ padding: "8px 5px", textAlign: "center", whiteSpace: "nowrap" }}>
            <button onClick={() => onEdit(r)} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 12, padding: "2px 5px" }}>编辑</button>
            {confirmDelete === r.id ? (<span>
              <button onClick={() => { onDelete(r.id); setConfirmDelete(null); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>确认</button>
              <button onClick={() => setConfirmDelete(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>取消</button>
            </span>) : (<button onClick={() => setConfirmDelete(r.id)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 5px" }}>删除</button>)}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
    {filtered.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>没有符合条件的记录。</div>}
  </div>);
}
