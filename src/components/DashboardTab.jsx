import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_OPTIONS } from "../config/appConfig";
import {
  filterRecords, formatCompactNumber, formatMoney, getMonthlyData, getRecordMonths, getRecordYears,
  getRouteData, getRouteOptions, getStats, sortByDateAsc
} from "../lib/drivingMath";
import { boxStyle, mutedButton, selectStyle, tooltipStyle } from "./styles";

const axisTick = { fill: "#94a3b8", fontSize: 11 };
const dateTick = (value) => String(value).slice(2);

export default function DashboardTab({ records }) {
  const [chartType, setChartType] = useState("monthly");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [route, setRoute] = useState("all");

  const years = useMemo(() => getRecordYears(records), [records]);
  const months = useMemo(() => getRecordMonths(records).filter(m => year === "all" || m.startsWith(year)), [records, year]);
  const routes = useMemo(() => getRouteOptions(records), [records]);
  const filtered = useMemo(() => filterRecords(records, { year, month, route }), [records, year, month, route]);
  const chronological = useMemo(() => sortByDateAsc(filtered), [filtered]);
  const stats = useMemo(() => getStats(filtered), [filtered]);
  const monthlyData = useMemo(() => getMonthlyData(filtered), [filtered]);
  const routeData = useMemo(() => getRouteData(filtered), [filtered]);
  const filterActive = year !== "all" || month !== "all" || route !== "all";

  if (!records.length) {
    return (
      <div style={{ ...boxStyle, padding: 40, textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🚗</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>还没有行程记录</div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>到“新增记录”录入第一条行程，或在“行程记录”里导入 Excel / 恢复备份。<br />如果刚点过“清空数据”，可以在页头的“恢复点”里找回。</div>
      </div>
    );
  }

  const cards = stats ? [
    { l: "总里程", v: `${formatCompactNumber(stats.totalDist)} km`, c: "#3b82f6", i: "🛣️" },
    { l: "总费用（油费+过路费）", v: `¥${formatCompactNumber(stats.totalCost)}`, c: "#fb7185", i: "🧾" },
    { l: "总油费", v: `¥${formatCompactNumber(stats.totalFuel)}`, c: "#f97316", i: "⛽" },
    { l: "总过路费", v: `¥${formatCompactNumber(stats.totalToll)}`, c: "#ef4444", i: "🛤️" },
    { l: "顺风车收入", v: `¥${formatCompactNumber(stats.totalIncome)}`, c: "#10b981", i: "💰" },
    { l: "净支出（总费用−收入）", v: formatMoney(stats.netSpend, 0), c: stats.netSpend > 0 ? "#f43f5e" : "#10b981", i: "📉" },
    { l: "每公里总费用", v: `¥${stats.costPerKm.toFixed(3)}`, c: "#a78bfa", i: "📏" },
    { l: "每公里净支出", v: formatMoney(stats.netPerKm, 3), c: "#c084fc", i: "📐" },
    { l: "平均油耗", v: `${stats.avgConsumption.toFixed(1)} L/100km`, c: "#8b5cf6", i: "📊" },
    { l: "出行次数", v: `${stats.count} 次`, c: "#06b6d4", i: "🚗" }
  ] : [];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="年份" value={year} onChange={e => { setYear(e.target.value); setMonth("all"); }} style={selectStyle}>
          <option value="all">全部年份</option>
          {years.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <select aria-label="月份" value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
          <option value="all">全部月份</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="路线" value={route} onChange={e => setRoute(e.target.value)} style={{ ...selectStyle, maxWidth: 180 }}>
          <option value="all">全部起终点</option>
          {routes.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {filterActive && <button type="button" style={mutedButton} onClick={() => { setYear("all"); setMonth("all"); setRoute("all"); }}>清除筛选</button>}
        <span style={{ fontSize: 12, color: "#64748b" }}>{filterActive ? `筛选后 ${filtered.length} / ${records.length} 条` : `共 ${records.length} 条`}</span>
      </div>

      {!stats ? (
        <div style={{ ...boxStyle, padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>当前筛选条件下没有记录。</div>
      ) : (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
          {cards.map(card => (
            <div key={card.l} style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(255,255,255,.06)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 10, right: 12, fontSize: 22, opacity: .3 }}>{card.i}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, paddingRight: 24 }}>{card.l}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: card.c }}>{card.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {CHART_OPTIONS.map(c => (
            <button key={c.k} onClick={() => setChartType(c.k)} style={{ padding: "6px 16px", borderRadius: 8, background: chartType === c.k ? "rgba(59,130,246,.25)" : "rgba(255,255,255,.04)", color: chartType === c.k ? "#60a5fa" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", border: chartType === c.k ? "1px solid rgba(59,130,246,.3)" : "1px solid transparent" }}>{c.l}</button>
          ))}
        </div>

        <div style={boxStyle}>
          {chartType === "monthly" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用、收入与净支出</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => "¥" + Number(v).toFixed(0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="fuelCost" name="油费" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="toll" name="过路费" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="income" name="顺风车收入" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="netSpend" name="净支出" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "consumption" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>百公里油耗趋势（按日期，最近 60 条）</div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chronological.slice(-60)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={dateTick} />
                <YAxis domain={[(min) => Math.floor(min - 0.5), (max) => Math.ceil(max + 0.5)]} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={String} formatter={v => Number(v).toFixed(1) + " L/100km"} />
                <Area type="monotone" dataKey="consumption" stroke="#8b5cf6" strokeWidth={2} fill="url(#cg)" dot={{ r: 2, fill: "#8b5cf6" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "cost" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用构成 & 收入</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => "¥" + Number(v).toFixed(0)} />
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
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis dataKey="route" type="category" width={110} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="次数" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "price" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>油价走势（按日期）</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chronological} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={dateTick} />
                <YAxis domain={["auto", "auto"]} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={String} formatter={v => "¥" + Number(v).toFixed(2) + "/L"} />
                <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={{ r: 1.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>)}
        </div>

        <div style={{ ...boxStyle, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>月度汇总</div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
            <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
              {["月份", "出行", "里程", "油费", "过路费", "总费用", "收入", "净支出", "元/公里", "均油耗"].map(h => <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>{monthlyData.map(m => (
              <tr key={m.month} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{m.label}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.trips}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.distance.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#f97316" }}>{m.fuelCost.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#ef4444" }}>{m.toll.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#fb7185", fontWeight: 700 }}>{m.totalCost.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#10b981" }}>{m.income.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: m.netSpend > 0 ? "#f43f5e" : "#10b981", fontWeight: 700 }}>{m.netSpend.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#a78bfa" }}>{m.costPerKm.toFixed(2)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "#8b5cf6" }}>{m.avgC}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>)}
    </div>
  );
}
