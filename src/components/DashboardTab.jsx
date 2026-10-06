import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_OPTIONS } from "../config/appConfig";
import {
  filterRecords, formatCompactNumber, formatMoney, getMonthlyData, getRecordMonths, getRecordYears,
  getRouteData, getRouteOptions, getStats, sortByDateAsc
} from "../lib/drivingMath";
import { boxStyle, eyebrowStyle, glassStyle, monoFont, mutedButton, selectStyle, tileStyle, tooltipStyle } from "./styles";

const axisTick = { fill: "var(--muted)", fontSize: 11 };
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
      <div style={{ ...boxStyle, padding: 40, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🚗</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>还没有行程记录</div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>到“新增记录”录入第一条行程，或在“行程记录”里导入 Excel / 恢复备份。<br />如果刚点过“清空数据”，可以在页头的“恢复点”里找回。</div>
      </div>
    );
  }

  const cards = stats ? [
    { l: "总里程", v: `${formatCompactNumber(stats.totalDist)}`, u: "km", c: "#3b82f6" },
    { l: "总油费", v: `¥${formatCompactNumber(stats.totalFuel)}`, c: "var(--orange)" },
    { l: "总过路费", v: `¥${formatCompactNumber(stats.totalToll)}`, c: "var(--red)" },
    { l: "顺风车收入", v: `¥${formatCompactNumber(stats.totalIncome)}`, c: "var(--green)" },
    { l: "每公里总费用", v: `¥${stats.costPerKm.toFixed(3)}`, c: "var(--violet-t)" },
    { l: "出行次数", v: `${stats.count}`, u: "次", c: "#06b6d4" }
  ] : [];

  // 油耗仪表：量程 0–15 L/100km，270° 圆弧
  const GAUGE_MAX = 15;
  const ARC = 329.9;
  const gaugeRatio = stats ? Math.min(Math.max(stats.avgConsumption / GAUGE_MAX, 0), 1) : 0;
  const netColor = stats && stats.netSpend > 0 ? "var(--rose)" : "var(--green)";

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
        <span style={{ fontSize: 12, color: "var(--faint)" }}>{filterActive ? `筛选后 ${filtered.length} / ${records.length} 条` : `共 ${records.length} 条`}</span>
      </div>

      {!stats ? (
        <div style={{ ...boxStyle, padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>当前筛选条件下没有记录。</div>
      ) : (<>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
          <div style={{ ...glassStyle, flex: "2 1 340px", minWidth: 0, padding: "24px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16, position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", top: -90, right: -70, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,.30),rgba(99,102,241,0) 70%)" }} />
            <div style={{ ...eyebrowStyle, color: "var(--blue)", position: "relative" }}>净支出 · 总费用 − 收入</div>
            <div style={{ position: "relative", fontFamily: monoFont, fontWeight: 700, fontSize: "clamp(40px,9vw,64px)", lineHeight: 1, letterSpacing: "-.03em", color: netColor }}>
              {formatMoney(stats.netSpend, 0)}
            </div>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, borderTop: "1px solid rgba(var(--ink),.1)", paddingTop: 14 }}>
              <div><div style={{ fontSize: 11, color: "var(--muted)" }}>总费用</div><div style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 700, color: "var(--rose)", marginTop: 3 }}>¥{formatCompactNumber(stats.totalCost)}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--muted)" }}>收入</div><div style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 700, color: "var(--green)", marginTop: 3 }}>¥{formatCompactNumber(stats.totalIncome)}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--muted)" }}>净支出/公里</div><div style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 700, color: "var(--violet-t)", marginTop: 3 }}>{formatMoney(stats.netPerKm, 3)}</div></div>
            </div>
          </div>

          <div style={{ ...glassStyle, flex: "1 1 220px", minWidth: 0, padding: "18px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ ...eyebrowStyle, color: "var(--muted)", alignSelf: "flex-start" }}>平均油耗</div>
            <div style={{ position: "relative", width: 168, height: 168 }}>
              <svg viewBox="0 0 180 180" width="168" height="168" role="img" aria-label={`平均油耗 ${stats.avgConsumption.toFixed(1)} 升每百公里`}>
                <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="var(--violet)" /></linearGradient></defs>
                <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(var(--ink),.08)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${ARC} 439.8`} transform="rotate(135 90 90)" />
                <circle cx="90" cy="90" r="70" fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(ARC * gaugeRatio).toFixed(1)} 439.8`} transform="rotate(135 90 90)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: monoFont, fontWeight: 700, fontSize: 36, lineHeight: 1, color: "var(--violet-t)" }}>{stats.avgConsumption.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>L / 100km</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--faint)" }}>仪表量程 0–{GAUGE_MAX}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 18 }}>
          {cards.map(card => (
            <div key={card.l} style={{ ...tileStyle, padding: "14px 16px", borderTop: `2px solid ${card.c}` }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{card.l}</div>
              <div style={{ fontFamily: monoFont, fontSize: 21, fontWeight: 700, color: card.c }}>{card.v}{card.u && <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 4, fontWeight: 500 }}>{card.u}</span>}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 12, border: "1px solid rgba(var(--ink),.1)", borderRadius: 12, overflow: "hidden", background: "rgba(var(--ink),.03)", alignSelf: "flex-start", width: "fit-content", maxWidth: "100%" }}>
          {CHART_OPTIONS.map((c, i) => (
            <button key={c.k} type="button" onClick={() => setChartType(c.k)} aria-pressed={chartType === c.k} style={{ padding: "9px 18px", border: "none", borderLeft: i ? "1px solid rgba(var(--ink),.08)" : "none", background: chartType === c.k ? "var(--tab-on)" : "transparent", color: chartType === c.k ? "#fff" : "var(--muted)", fontSize: 12, fontWeight: chartType === c.k ? 700 : 500, cursor: "pointer" }}>{c.l}</button>
          ))}
        </div>

        <div style={boxStyle}>
          {chartType === "monthly" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用、收入与净支出</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink),.06)" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => "¥" + Number(v).toFixed(0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="fuelCost" name="油费" fill="var(--orange)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="toll" name="过路费" fill="var(--red)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="income" name="顺风车收入" stroke="var(--green)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="netSpend" name="净支出" stroke="var(--violet-t)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "consumption" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>百公里油耗趋势（按日期，最近 60 条）</div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chronological.slice(-60)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--violet)" stopOpacity={.3} /><stop offset="95%" stopColor="var(--violet)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink),.06)" />
                <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 9 }} tickFormatter={dateTick} />
                <YAxis domain={[(min) => Math.floor(min - 0.5), (max) => Math.ceil(max + 0.5)]} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={String} formatter={v => Number(v).toFixed(1) + " L/100km"} />
                <Area type="monotone" dataKey="consumption" stroke="var(--violet)" strokeWidth={2} fill="url(#cg)" dot={{ r: 2, fill: "var(--violet)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "cost" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>月度费用构成 & 收入</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink),.06)" />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => "¥" + Number(v).toFixed(0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="fuelCost" name="油费" stackId="c" fill="var(--orange)" />
                <Bar dataKey="toll" name="过路费" stackId="c" fill="var(--red)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="income" name="顺风车收入" fill="var(--green)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "routes" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>TOP 10 高频路线</div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={routeData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink),.06)" />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis dataKey="route" type="category" width={110} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="次数" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>)}
          {chartType === "price" && (<div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, paddingLeft: 10 }}>油价走势（按日期）</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chronological} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink),.06)" />
                <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 9 }} tickFormatter={dateTick} />
                <YAxis domain={["auto", "auto"]} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={String} formatter={v => "¥" + Number(v).toFixed(2) + "/L"} />
                <Line type="monotone" dataKey="price" stroke="var(--green)" strokeWidth={2} dot={{ r: 1.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>)}
        </div>

        <div style={{ ...boxStyle, padding: 18 }}>
          <div style={{ ...eyebrowStyle, color: "var(--muted)", marginBottom: 12 }}>月度汇总</div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640, fontFamily: monoFont }}>
            <thead><tr style={{ borderBottom: "1px solid rgba(var(--ink),.1)" }}>
              {["月份", "出行", "里程", "油费", "过路费", "总费用", "收入", "净支出", "元/公里", "均油耗"].map(h => <th key={h} style={{ padding: "8px 6px", textAlign: "right", color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>{monthlyData.map(m => (
              <tr key={m.month} style={{ borderBottom: "1px solid rgba(var(--ink),.04)" }}>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{m.label}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.trips}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{m.distance.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--orange)" }}>{m.fuelCost.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--red)" }}>{m.toll.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--rose)", fontWeight: 700 }}>{m.totalCost.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--green)" }}>{m.income.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: m.netSpend > 0 ? "var(--rose)" : "var(--green)", fontWeight: 700 }}>{m.netSpend.toFixed(0)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--violet-t)" }}>{m.costPerKm.toFixed(2)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--violet)" }}>{m.avgC}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>)}
    </div>
  );
}
