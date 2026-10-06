import { isValidDateString, normalizeDateString } from "./dates.js";

const text = (value) => String(value ?? "");
const trimmed = (value) => text(value).trim();

export const getRouteNameGroups = (records) => {
  const routeMap = new Map();

  records.forEach((record, index) => {
    const from = trimmed(record.from);
    const to = trimmed(record.to);
    if (!from || !to) return;

    const route = `${from}→${to}`;
    const highway = trimmed(record.highway);
    if (!routeMap.has(route)) routeMap.set(route, new Map());
    const highwayMap = routeMap.get(route);
    if (!highwayMap.has(highway)) highwayMap.set(highway, { name: highway, ids: [], firstIndex: index });
    highwayMap.get(highway).ids.push(record.id);
  });

  return [...routeMap.entries()]
    .filter(([, highwayMap]) => highwayMap.size > 1)
    .map(([route, highwayMap]) => {
      const names = [...highwayMap.values()]
        .map(item => ({ name: item.name, label: item.name || "(无)", count: item.ids.length, ids: item.ids, firstIndex: item.firstIndex }))
        .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex);
      const recordIds = names.flatMap(item => item.ids);
      return {
        key: `route-name-${route}`,
        route,
        totalCount: recordIds.length,
        recordIds,
        names,
        suggestedName: names[0].name,
        hasTopTie: names.length > 1 && names[0].count === names[1].count
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount || a.route.localeCompare(b.route, "zh-CN"));
};

/** 删除记录时同步清掉它名下的"已忽略"标记，避免 id 被复用后继承旧状态。 */
export const issueKeysForRecordId = (id) => [
  `sp-from-${id}`, `sp-to-${id}`, `sp-hw-${id}`, `dist-${id}`, `dup-${id}`, `overlap-${id}`,
  `val-date-${id}`, `val-price-${id}`, `val-consumption-${id}`, `val-distance-${id}`, `val-toll-${id}`
];

const detectSpaceIssues = (records, issues) => {
  records.forEach((record) => {
    const from = text(record.from);
    const to = text(record.to);
    const highway = text(record.highway);
    if (from !== from.trim()) {
      issues.push({ key: `sp-from-${record.id}`, id: record.id, date: record.date, type: "空格", field: "出发地", old: `「${from}」`, sug: from.trim(), fix: { from: from.trim() } });
    }
    if (to !== to.trim()) {
      issues.push({ key: `sp-to-${record.id}`, id: record.id, date: record.date, type: "空格", field: "目的地", old: `「${to}」`, sug: to.trim(), fix: { to: to.trim() } });
    }
    if (highway && highway !== highway.trim()) {
      issues.push({ key: `sp-hw-${record.id}`, id: record.id, date: record.date, type: "空格", field: "路线", old: `「${highway}」`, sug: highway.trim(), fix: { highway: highway.trim() } });
    }
  });
};

const detectDistanceIssues = (records, issues) => {
  const routeDistances = {};
  records.forEach((record) => {
    const route = `${trimmed(record.from)}→${trimmed(record.to)}`;
    if (!routeDistances[route]) routeDistances[route] = [];
    routeDistances[route].push(record);
  });

  Object.entries(routeDistances).forEach(([route, routeRecords]) => {
    if (routeRecords.length < 3) return;
    const distanceOf = (record) => Number(record.distance) || 0;
    const average = routeRecords.reduce((sum, record) => sum + distanceOf(record), 0) / routeRecords.length;
    if (average <= 0) return;

    routeRecords.forEach((record) => {
      const deviation = Math.abs(distanceOf(record) - average) / average;
      if (deviation > 0.3) {
        issues.push({
          key: `dist-${record.id}`,
          id: record.id,
          date: record.date,
          type: "里程偏差",
          field: route,
          old: `${distanceOf(record)}km`,
          sug: `均值${average.toFixed(1)}km 偏差${(deviation * 100).toFixed(0)}%`
        });
      }
    });
  });
};

const detectDuplicates = (records, issues) => {
  const seen = new Map();
  records.forEach((record) => {
    const fingerprint = [
      normalizeDateString(record.date), trimmed(record.from), trimmed(record.to),
      Number(record.distance) || 0, trimmed(record.highway)
    ].join("|");
    if (!seen.has(fingerprint)) {
      seen.set(fingerprint, record);
      return;
    }
    const first = seen.get(fingerprint);
    issues.push({
      key: `dup-${record.id}`,
      id: record.id,
      date: record.date,
      type: "疑似重复",
      field: `${trimmed(record.from)}→${trimmed(record.to)}`,
      old: `与 #${first.id} 日期、起终点、路线、里程完全相同`,
      sug: "确认不是同日往返后，删除其中一条"
    });
  });
};

/** 同一天已有 A→B 与 B→C，又有 A→C 全程：三条同时统计会重复计算里程与费用。 */
const detectOverlaps = (records, issues) => {
  const byDate = new Map();
  records.forEach((record) => {
    const date = normalizeDateString(record.date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(record);
  });

  byDate.forEach((dayRecords) => {
    if (dayRecords.length < 3) return;
    dayRecords.forEach((whole) => {
      const from = trimmed(whole.from);
      const to = trimmed(whole.to);
      if (!from || !to || from === to) return;
      const firstLegs = dayRecords.filter(record => record !== whole && trimmed(record.from) === from && trimmed(record.to) !== to);
      for (const first of firstLegs) {
        const middle = trimmed(first.to);
        const second = dayRecords.find(record => (
          record !== whole && record !== first && trimmed(record.from) === middle && trimmed(record.to) === to
        ));
        if (second) {
          issues.push({
            key: `overlap-${whole.id}`,
            id: whole.id,
            date: whole.date,
            type: "重叠行程",
            field: `${from}→${to}`,
            old: `${Number(whole.distance) || 0}km 全程记录`,
            sug: `同日已有 #${first.id} ${from}→${middle} 与 #${second.id} ${middle}→${to}，可能重复统计`
          });
          break;
        }
      }
    });
  });
};

const VALUE_CHECKS = [
  { id: "price", label: "油价", test: (v) => v > 0 && v <= 30, hint: "应在 0–30 元/升" },
  { id: "consumption", label: "油耗", test: (v) => v >= 2 && v <= 30, hint: "应在 2–30 升/百公里" },
  { id: "distance", label: "里程", test: (v) => v > 0 && v <= 3000, hint: "应在 0–3000 公里" },
  { id: "toll", label: "过路费", test: (v) => v >= 0 && v <= 2000, hint: "应在 0–2000 元" }
];

const detectValueIssues = (records, issues) => {
  records.forEach((record) => {
    if (!isValidDateString(normalizeDateString(record.date))) {
      issues.push({ key: `val-date-${record.id}`, id: record.id, date: record.date, type: "数值异常", field: "日期", old: `「${text(record.date)}」`, sug: "日期应为真实存在的 YYYY-MM-DD" });
    }
    VALUE_CHECKS.forEach((check) => {
      const value = Number(record[check.id]);
      if (!Number.isFinite(value) || !check.test(value)) {
        issues.push({ key: `val-${check.id}-${record.id}`, id: record.id, date: record.date, type: "数值异常", field: check.label, old: text(record[check.id]), sug: check.hint });
      }
    });
  });
};

export const detectDataIssues = (records) => {
  const issues = [];
  detectSpaceIssues(records, issues);
  detectDistanceIssues(records, issues);
  detectDuplicates(records, issues);
  detectOverlaps(records, issues);
  detectValueIssues(records, issues);
  return issues;
};
