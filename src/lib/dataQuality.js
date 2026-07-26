export const getRouteNameGroups = (records) => {
  const routeMap = new Map();

  records.forEach((record, index) => {
    const from = (record.from || "").trim();
    const to = (record.to || "").trim();
    if (!from || !to) return;

    const route = `${from}→${to}`;
    const highway = (record.highway || "").trim();
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

export const detectDataIssues = (records) => {
  const issues = [];

  records.forEach((record) => {
    if (record.from !== record.from.trim()) {
      issues.push({ key: `sp-from-${record.id}`, id: record.id, date: record.date, type: "空格", field: "出发地", old: `「${record.from}」`, sug: record.from.trim(), fix: { from: record.from.trim() } });
    }
    if (record.to !== record.to.trim()) {
      issues.push({ key: `sp-to-${record.id}`, id: record.id, date: record.date, type: "空格", field: "目的地", old: `「${record.to}」`, sug: record.to.trim(), fix: { to: record.to.trim() } });
    }
    if (record.highway && record.highway !== record.highway.trim()) {
      issues.push({ key: `sp-hw-${record.id}`, id: record.id, date: record.date, type: "空格", field: "路线", old: `「${record.highway}」`, sug: record.highway.trim(), fix: { highway: record.highway.trim() } });
    }
  });

  const routeDistances = {};
  records.forEach((record) => {
    const route = `${record.from.trim()}→${record.to.trim()}`;
    if (!routeDistances[route]) routeDistances[route] = [];
    routeDistances[route].push(record);
  });

  Object.entries(routeDistances).forEach(([route, routeRecords]) => {
    if (routeRecords.length < 3) return;
    const average = routeRecords.reduce((sum, record) => sum + record.distance, 0) / routeRecords.length;
    if (average <= 0) return;

    routeRecords.forEach((record) => {
      const deviation = Math.abs(record.distance - average) / average;
      if (deviation > 0.3) {
        issues.push({
          key: `dist-${record.id}`,
          id: record.id,
          date: record.date,
          type: "里程偏差",
          field: route,
          old: `${record.distance}km`,
          sug: `均值${average.toFixed(1)}km 偏差${(deviation * 100).toFixed(0)}%`
        });
      }
    });
  });

  return issues;
};
