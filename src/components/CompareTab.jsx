import { useEffect, useMemo } from "react";
import {
  calcTravelComparison, defaultCompareForm, describeFareMatch, fillCompareFormFromRoute,
  getReverseTravelRouteProfile, getTravelRouteProfiles, pickRecommendedFare
} from "../lib/travelCompare";
import { queryEtcFares } from "../lib/etcLookup";
import AutoComplete from "./AutoComplete";
import { boxStyle, ghostButton, inputStyle, labelStyle, mutedButton } from "./styles";

const MAX_SEGMENTS = 8;

/** 可增删的分段输入：每个元素是一段金额。 */
function SegmentList({ title, unit, values, onChange, placeholder = "0", hint }) {
  const update = (index, value) => onChange(values.map((item, i) => (i === index ? value : item)));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
        {values.map((value, index) => (
          <div key={index}>
            <label style={labelStyle}>第 {index + 1} 段（{unit}）</label>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="number" min="0" step="0.01" value={value} onChange={e => update(index, e.target.value)}
                placeholder={Array.isArray(placeholder) ? placeholder[index] ?? "0" : placeholder}
                aria-label={`${title}第${index + 1}段`} style={inputStyle} />
              {values.length > 1 && (
                <button type="button" aria-label={`删除${title}第${index + 1}段`} onClick={() => onChange(values.filter((_, i) => i !== index))}
                  style={{ ...mutedButton, padding: "8px 9px" }}>×</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        {values.length < MAX_SEGMENTS && (
          <button type="button" onClick={() => onChange([...values, ""])} style={ghostButton}>+ 增加一段</button>
        )}
        {hint && <span style={{ fontSize: 11, color: "#64748b" }}>{hint}</span>}
      </div>
    </div>
  );
}

function NumberField({ label, unit, value, onChange, placeholder }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} aria-label={label} />
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{unit}</div>
    </div>
  );
}

export default function CompareTab({
  records, etcRecords, placeOpts, etcStations, compareForm, setCompareForm, compareTrip, setCompareTrip, showToast
}) {
  const set = (patch) => setCompareForm(current => ({ ...current, ...patch }));

  const destinations = useMemo(() => {
    const names = new Set();
    records.forEach(record => {
      if (!record.to) return;
      if (compareTrip.from && record.from?.trim() !== compareTrip.from.trim()) return;
      names.add(record.to.trim());
    });
    return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [records, compareTrip.from]);

  const profiles = useMemo(() => getTravelRouteProfiles(records, compareTrip.from, compareTrip.to), [records, compareTrip.from, compareTrip.to]);
  const selected = useMemo(() => profiles.find(p => p.routeValue === compareTrip.route) || null, [profiles, compareTrip.route]);
  const reverse = useMemo(
    () => selected ? getReverseTravelRouteProfile(records, compareTrip.from, compareTrip.to, selected.routeValue) : null,
    [records, compareTrip.from, compareTrip.to, selected]
  );

  useEffect(() => {
    if (!compareTrip.from || !compareTrip.to) return;
    if (profiles.some(profile => profile.routeValue === compareTrip.route)) return;
    setCompareTrip(current => ({ ...current, route: profiles.length === 1 ? profiles[0].routeValue : "" }));
  }, [profiles, compareTrip.from, compareTrip.to, compareTrip.route, setCompareTrip]);

  const hasStations = Boolean(compareForm.entryStation && compareForm.exitStation);
  const outboundFares = useMemo(
    () => hasStations ? queryEtcFares(etcRecords, compareForm.entryStation, compareForm.exitStation, { exactFirst: true }) : [],
    [etcRecords, hasStations, compareForm.entryStation, compareForm.exitStation]
  );
  const returnFares = useMemo(
    () => hasStations ? queryEtcFares(etcRecords, compareForm.exitStation, compareForm.entryStation, { exactFirst: true }) : [],
    [etcRecords, hasStations, compareForm.entryStation, compareForm.exitStation]
  );
  const recommendedOutbound = useMemo(() => pickRecommendedFare(outboundFares), [outboundFares]);
  const recommendedReturn = useMemo(() => pickRecommendedFare(returnFares), [returnFares]);
  const outboundMatch = useMemo(() => describeFareMatch(outboundFares), [outboundFares]);
  const returnMatch = useMemo(() => describeFareMatch(returnFares), [returnFares]);
  const result = useMemo(() => calcTravelComparison(compareForm, recommendedOutbound, recommendedReturn), [compareForm, recommendedOutbound, recommendedReturn]);

  const applyRoute = () => {
    if (!selected) { showToast("请先选择一条路线"); return; }
    setCompareForm(current => fillCompareFormFromRoute(current, selected, reverse));
    showToast(`已填入路线「${selected.routeLabel}」`);
  };

  const winnerColor = result.winner === "driving" ? "#60a5fa" : result.winner === "public" ? "#10b981" : "#cbd5e1";
  const winnerBg = result.winner === "driving" ? "rgba(96,165,250,.1)" : result.winner === "public" ? "rgba(16,185,129,.1)" : "rgba(148,163,184,.1)";
  const fareNotes = (match, label) => {
    const notes = [];
    if (match.ambiguous) notes.push(`${label}匹配到多个不同的收费站组合，无法自动推荐，请选择具体站名`);
    if (match.zeroRecords) notes.push(`${label}已排除 ${match.zeroRecords} 条 0 元（免费时段）记录`);
    return notes;
  };
  const notes = [...fareNotes(outboundMatch, "去程"), ...fareNotes(returnMatch, "返程")];

  return (<div>
    <div style={{ ...boxStyle, padding: 18 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>历史行程路线查询</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>从行程记录中选择起点、终点和具体路线，自动生成这条路线的自驾费用参数。</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        <AutoComplete value={compareTrip.from} onChange={value => setCompareTrip({ from: value, to: compareTrip.to, route: "" })} options={placeOpts} placeholder="选择或输入出发地" label="行程起点" />
        <AutoComplete value={compareTrip.to} onChange={value => setCompareTrip({ from: compareTrip.from, to: value, route: "" })} options={destinations} placeholder="选择或输入目的地" label="行程终点" />
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>具体路线</label>
          <select value={compareTrip.route} onChange={event => setCompareTrip({ ...compareTrip, route: event.target.value })} disabled={!profiles.length} aria-label="具体路线"
            style={{ ...inputStyle, color: compareTrip.route ? "#e2e8f0" : "#64748b", minHeight: 41, minWidth: 0, textOverflow: "ellipsis" }}>
            <option value="">{compareTrip.from && compareTrip.to ? "请选择路线" : "请先选择起点和终点"}</option>
            {profiles.map(profile => (
              <option key={profile.routeValue} value={profile.routeValue}>
                {profile.routeLabel}（{profile.count}次，单程约¥{profile.estimatedTotalCost.toFixed(1)}）
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={() => setCompareTrip({ from: compareTrip.to, to: compareTrip.from, route: "" })} style={ghostButton}>起点终点互换</button>
        <button onClick={() => setCompareTrip({ from: "", to: "", route: "" })} style={mutedButton}>清空行程</button>
      </div>

      {compareTrip.from && compareTrip.to && profiles.length === 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.08)", color: "#94a3b8", fontSize: 12 }}>
          没有找到“{compareTrip.from} → {compareTrip.to}”的历史行程记录。
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#60a5fa" }}>{compareTrip.from} → {compareTrip.to}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>路线「{selected.routeLabel}」，历史 {selected.count} 次，最近记录 {selected.latestDate}</div>
            </div>
            <button onClick={applyRoute} style={{ background: "rgba(59,130,246,.2)", border: "1px solid rgba(96,165,250,.32)", color: "#93c5fd", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>填入自驾对比</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 12 }}>
            {[
              { label: "平均单程里程", value: `${selected.averageDistance.toFixed(1)} km`, color: "#e2e8f0" },
              { label: "平均百公里油耗", value: `${selected.averageConsumption.toFixed(1)} L`, color: "#a78bfa" },
              { label: "最近油价", value: `¥${selected.latestFuelPrice.toFixed(2)}/L`, color: "#fbbf24" },
              { label: "估算单程油费", value: `¥${selected.estimatedFuelCost.toFixed(2)}`, color: "#f97316" },
              { label: "平均过路费", value: `¥${selected.averageToll.toFixed(2)}`, color: "#fb7185" },
              { label: "估算单程总费用", value: `¥${selected.estimatedTotalCost.toFixed(2)}`, color: "#10b981" }
            ].map(item => (
              <div key={item.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>{item.label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: item.color, whiteSpace: "nowrap" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 12, lineHeight: 1.7 }}>
            {selected.tollMin !== selected.tollMax
              ? `该路线历史过路费范围 ¥${selected.tollMin.toFixed(2)} - ¥${selected.tollMax.toFixed(2)}。`
              : `该路线历史过路费均为 ¥${selected.averageToll.toFixed(2)}。`}
            {selected.zeroTollExcluded > 0 && ` 平均过路费已排除 ${selected.zeroTollExcluded} 次 0 元记录（节假日免费或未记录）。`}
            {reverse
              ? ` 已匹配返程路线「${reverse.routeLabel}」的 ${reverse.count} 次记录，填入时将分别采用去程和返程平均值。`
              : " 暂无相同道路组合的返程记录，填入时会按去程平均过路费估算，之后仍可手动修改。"}
            {reverse?.matchQuality === "loose" && " ⚠ 返程路线只是道路组合相同、顺序不同，请核对是否真的是同一条路。"}
          </div>
        </div>
      )}
    </div>

    <div style={{ ...boxStyle, padding: 18 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>公共交通 / 自驾往返费用对比</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <AutoComplete value={compareForm.entryStation} onChange={v => set({ entryStation: v })} options={etcStations} placeholder="如：楚雄东" label="全程高速起点" />
        <AutoComplete value={compareForm.exitStation} onChange={v => set({ exitStation: v })} options={etcStations} placeholder="如：玉溪九龙池" label="全程高速终点" />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={() => set({
          entryStation: compareForm.exitStation, exitStation: compareForm.entryStation,
          outboundTolls: compareForm.returnTolls, returnTolls: compareForm.outboundTolls
        })} style={ghostButton}>入口出口互换</button>
        <button onClick={() => { setCompareForm(defaultCompareForm()); setCompareTrip({ from: "", to: "", route: "" }); }} style={mutedButton}>清空重填</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
      <div style={{ ...boxStyle, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#60a5fa" }}>自驾往返</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
          <NumberField label="单程公里数" unit="km" value={compareForm.distance} onChange={v => set({ distance: v })} placeholder="如：230" />
          <NumberField label="油价" unit="¥/L" value={compareForm.fuelPrice} onChange={v => set({ fuelPrice: v })} placeholder="7.5" />
          <NumberField label="本次百公里油耗" unit="L/100km" value={compareForm.consumption} onChange={v => set({ consumption: v })} placeholder="6" />
          <NumberField label="出行人数" unit="人" value={compareForm.passengers} onChange={v => set({ passengers: v })} placeholder="1" />
          <NumberField label="停车费" unit="¥（全体）" value={compareForm.parking} onChange={v => set({ parking: v })} placeholder="0" />
          <NumberField label="自驾其他费用" unit="¥（全体）" value={compareForm.drivingOther} onChange={v => set({ drivingOther: v })} placeholder="0" />
          <NumberField label="自驾单程耗时（可选）" unit="分钟，不含办事停留" value={compareForm.drivingMinutes} onChange={v => set({ drivingMinutes: v })} placeholder="如：180" />
        </div>

        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.18)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>每百公里油费（自动计算）</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>¥{result.fuelCostPer100Km.toFixed(2)} / 100km</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>油价 × 本次百公里油耗，无需手动填写</div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 10 }}>分段高速过路费</div>
        <SegmentList title="去程" unit="¥" values={compareForm.outboundTolls} onChange={v => set({ outboundTolls: v })}
          placeholder={[recommendedOutbound ? recommendedOutbound.amount.toFixed(2) : "0"]} />
        <SegmentList title="返程" unit="¥" values={compareForm.returnTolls} onChange={v => set({ returnTolls: v })}
          placeholder={[recommendedReturn ? recommendedReturn.amount.toFixed(2) : "0"]}
          hint="中途下高速再上高速，就增加一段分别填写；整个方向都不填时才会按 ETC 参考价计入。" />
        {(result.outboundTollEstimated || result.returnTollEstimated) && (
          <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 8 }}>
            ⚠ {[result.outboundTollEstimated && "去程", result.returnTollEstimated && "返程"].filter(Boolean).join("、")}过路费未填写，当前按 ETC 参考价计入。
          </div>
        )}

        {(recommendedOutbound || recommendedReturn || notes.length > 0) && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.16)" }}>
            <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700, marginBottom: 8 }}>全程直达 ETC 参考</div>
            <div style={{ display: "grid", gap: 8, fontSize: 12, color: "#cbd5e1" }}>
              <div>去程：{recommendedOutbound ? `¥${recommendedOutbound.amount.toFixed(2)}，${recommendedOutbound.count} 次记录` : "未匹配到"}</div>
              <div>返程：{recommendedReturn ? `¥${recommendedReturn.amount.toFixed(2)}，${recommendedReturn.count} 次记录` : "未匹配到"}</div>
            </div>
            {notes.map(note => <div key={note} style={{ fontSize: 11, color: "#fbbf24", marginTop: 8 }}>⚠ {note}</div>)}
            {(recommendedOutbound || recommendedReturn) && (
              <button onClick={() => set({
                outboundTolls: recommendedOutbound ? [String(recommendedOutbound.amount)] : compareForm.outboundTolls,
                returnTolls: recommendedReturn ? [String(recommendedReturn.amount)] : compareForm.returnTolls
              })} style={{ marginTop: 10, background: "rgba(16,185,129,.18)", border: "1px solid rgba(16,185,129,.28)", color: "#10b981", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                用参考费用覆盖为单段
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ ...boxStyle, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#10b981" }}>公共交通往返</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>分段票价（每人）</div>
        <SegmentList title="去程" unit="¥/人" values={compareForm.publicOutboundFares} onChange={v => set({ publicOutboundFares: v })} placeholder="如：35" />
        <SegmentList title="返程" unit="¥/人" values={compareForm.publicReturnFares} onChange={v => set({ publicReturnFares: v })} placeholder="如：53" hint="换乘几次就有几段票价，逐段相加。" />
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.18)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>每人往返分段票价合计（自动计算）</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>¥{result.publicFarePerPerson.toFixed(2)}</div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 10 }}>附加费用（全体）与耗时</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
          <NumberField label="往返接驳/打车" unit="¥（全体）" value={compareForm.publicTransfer} onChange={v => set({ publicTransfer: v })} placeholder="0" />
          <NumberField label="公共交通其他费用" unit="¥（全体）" value={compareForm.publicOther} onChange={v => set({ publicOther: v })} placeholder="0" />
          <NumberField label="公共交通单程总耗时（可选）" unit="分钟，含换乘等待" value={compareForm.publicMinutes} onChange={v => set({ publicMinutes: v })} placeholder="如：240" />
        </div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.16)", fontSize: 12, color: "#93c5fd", lineHeight: 1.7 }}>
          总费用 = 去返程各段票价之和 × 出行人数 + 接驳/打车 + 其他费用。接驳和其他费用按全体合计填写，不会再乘人数。
        </div>
      </div>
    </div>

    <div style={{ ...boxStyle, padding: 18, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {[
          { l: "自驾总费用", v: `¥${result.drivingTotal.toFixed(2)}`, c: "#60a5fa" },
          { l: "自驾人均", v: `¥${result.drivingPerPerson.toFixed(2)}`, c: "#93c5fd" },
          { l: "公共交通总费用", v: `¥${result.publicTotal.toFixed(2)}`, c: "#10b981" },
          { l: "公共交通人均", v: `¥${result.publicPerPerson.toFixed(2)}`, c: "#86efac" }
        ].map(x => (
          <div key={x.l} style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: 14, border: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{x.l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>

      <div data-testid="compare-verdict" style={{ marginTop: 14, padding: 16, borderRadius: 12, background: winnerBg, border: "1px solid rgba(148,163,184,.22)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: winnerColor, marginBottom: 8 }}>
          {result.winner === "driving" ? "按费用看，自驾更划算"
            : result.winner === "public" ? "按费用看，公共交通更划算"
              : result.winner === "tie" ? "两种方式费用相同"
                : "信息还不完整，暂不比较"}
        </div>
        <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
          {result.winner === "incomplete" && `还需要填写：${result.missing.join("、")}。`}
          {result.winner === "tie" && "费用刚好相同，可以按时间、舒适度、停车便利性来决定。"}
          {(result.winner === "driving" || result.winner === "public") &&
            `两种方式相差 ¥${result.diff.toFixed(2)}。自驾费用包含油费 ¥${result.fuelCost.toFixed(2)}、过路费 ¥${result.tollCost.toFixed(2)}；公共交通票价合计 ¥${result.publicTicketCost.toFixed(2)}。`}
        </div>
        {result.comparable && (
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8, marginTop: 8 }}>
            {result.timeComparison
              ? (result.timeComparison.tradeoff
                ? `时间：${result.timeComparison.tradeoff}。`
                : result.timeComparison.faster === "tie"
                  ? "时间：两种方式往返耗时相同。"
                  : `时间：${result.timeComparison.faster === "driving" ? "自驾" : "公共交通"}往返更快 ${Math.round(result.timeComparison.minutesDiff)} 分钟，且费用不更高。`)
              : "时间：两边都填写“单程耗时”后才会比较；没有可靠时间数据时，这里只按费用比较，时间待核验。"}
          </div>
        )}
      </div>
    </div>
  </div>);
}
