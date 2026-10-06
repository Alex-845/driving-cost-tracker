import { compareDateStrings, isValidDateString, normalizeDateString, todayLocal } from "./dates.js";

/**
 * 四舍五入（半数进位）。先用 12 位有效数字清除二进制浮点噪声，
 * 避免 100.925 → 100.92、1.005 → 1.00 这类 toFixed 误差。
 */
export const roundTo = (value, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  const scaled = Number((Math.abs(value) * factor).toPrecision(12));
  const rounded = Math.round(scaled) / factor;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
};

export const toNumber = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asText = (value) => String(value ?? "");

export const emptyForm = () => ({
  date: todayLocal(),
  from: "",
  to: "",
  highway: "",
  price: "",
  consumption: "",
  distance: "",
  toll: "0",
  income: "0"
});

export const calcRecord = (record) => {
  const distance = toNumber(record.distance);
  const consumption = toNumber(record.consumption);
  const price = toNumber(record.price);
  const toll = toNumber(record.toll);
  const income = toNumber(record.income);
  const fuelLiters = roundTo(distance * consumption / 100, 3);
  const fuelCost = roundTo(fuelLiters * price, 2);
  const totalCost = roundTo(fuelCost + toll, 2);
  const profit = roundTo(income - totalCost, 2);
  const netSpend = roundTo(totalCost - income, 2);
  const costPerKm = distance > 0 ? roundTo(totalCost / distance, 4) : 0;
  const netPerKm = distance > 0 ? roundTo(netSpend / distance, 4) : 0;

  return {
    ...record,
    date: normalizeDateString(record.date),
    from: asText(record.from),
    to: asText(record.to),
    highway: asText(record.highway),
    distance,
    consumption,
    price,
    toll,
    income,
    fuelLiters,
    fuelCost,
    totalCost,
    profit,
    netSpend,
    costPerKm,
    netPerKm
  };
};

export const getNextId = (records) => (
  records.length ? Math.max(...records.map(record => Number(record.id) || 0)) + 1 : 1
);

export const sortDrivingRecords = (records, sortKey, sortDir) => {
  const direction = sortDir === "asc" ? 1 : -1;
  const byId = (a, b) => (Number(a.id) || 0) - (Number(b.id) || 0);
  return [...records].sort((a, b) => {
    if (sortKey === "date") {
      const dateSort = compareDateStrings(a.date, b.date);
      if (dateSort) return dateSort * direction;
      return byId(a, b) * direction;
    }

    const aValue = a[sortKey] ?? "";
    const bValue = b[sortKey] ?? "";
    const valueSort = typeof aValue === "string" || typeof bValue === "string"
      ? String(aValue).localeCompare(String(bValue), "zh-CN")
      : aValue - bValue;
    if (valueSort) return valueSort * direction;
    return byId(a, b) * direction;
  });
};

/** 图表用：按日期升序（同日按 id），不依赖录入顺序。 */
export const sortByDateAsc = (records) => sortDrivingRecords(records, "date", "asc");

export const recordToForm = (record) => ({
  date: record.date,
  from: record.from,
  to: record.to,
  highway: record.highway || "",
  price: String(record.price),
  consumption: String(record.consumption),
  distance: String(record.distance),
  toll: String(record.toll),
  income: String(record.income)
});

export const buildRecordFromForm = (form, id) => ({
  id,
  date: form.date,
  from: form.from.trim(),
  to: form.to.trim(),
  highway: (form.highway || "").trim(),
  price: toNumber(form.price),
  consumption: toNumber(form.consumption),
  distance: toNumber(form.distance),
  toll: toNumber(form.toll),
  income: toNumber(form.income)
});

export const validateRecordInput = (form) => {
  if (!form.date || !form.from.trim() || !form.to.trim()) return "请填写必填字段";
  if (!isValidDateString(form.date)) return "日期格式不正确";
  if (toNumber(form.price) <= 0) return "油价必须大于 0";
  if (toNumber(form.consumption) <= 0) return "百公里油耗必须大于 0";
  if (toNumber(form.distance) <= 0) return "公里数必须大于 0";
  if (toNumber(form.toll) < 0) return "过路费不能为负数";
  if (toNumber(form.income) < 0) return "顺风车收入不能为负数";
  return "";
};

/** 非阻断的数值合理性提示，用于表单里的黄色提醒。 */
export const getInputWarnings = (form) => {
  const warnings = [];
  const price = toNumber(form.price);
  const consumption = toNumber(form.consumption);
  const distance = toNumber(form.distance);
  const toll = toNumber(form.toll);
  if (price > 0 && (price < 4 || price > 15)) warnings.push(`油价 ${price} 元/升不在常见范围（4–15），请确认`);
  if (consumption > 0 && (consumption < 3 || consumption > 25)) warnings.push(`百公里油耗 ${consumption} 升不在常见范围（3–25），请确认`);
  if (distance > 1500) warnings.push(`里程 ${distance} 公里偏长，请确认是否为累计里程`);
  if (toll > 1000) warnings.push(`过路费 ${toll} 元偏高，请确认`);
  return warnings;
};

/** 预览与保存共用 calcRecord，保证两处金额完全一致。 */
export const getFormPreview = (form) => {
  const distance = toNumber(form.distance);
  const consumption = toNumber(form.consumption);
  const price = toNumber(form.price);
  if (distance <= 0 || consumption <= 0 || price <= 0) return null;
  const { fuelCost, totalCost, profit, netSpend, costPerKm, netPerKm } = calcRecord(form);
  return { fuelCost, totalCost, profit, netSpend, costPerKm, netPerKm };
};

export const getStats = (records) => {
  if (!records.length) return null;
  const totalDist = records.reduce((sum, record) => sum + record.distance, 0);
  const totalFuelLiters = records.reduce((sum, record) => sum + record.fuelLiters, 0);
  const totalFuel = records.reduce((sum, record) => sum + record.fuelCost, 0);
  const totalToll = records.reduce((sum, record) => sum + record.toll, 0);
  const totalIncome = records.reduce((sum, record) => sum + record.income, 0);
  const totalCost = records.reduce((sum, record) => sum + record.totalCost, 0);
  const netSpend = totalCost - totalIncome;

  return {
    totalDist,
    totalFuel,
    totalToll,
    totalIncome,
    totalCost,
    netSpend,
    costPerKm: totalDist > 0 ? totalCost / totalDist : 0,
    netPerKm: totalDist > 0 ? netSpend / totalDist : 0,
    avgConsumption: totalDist > 0 ? totalFuelLiters / totalDist * 100 : 0,
    count: records.length
  };
};

export const formatMonthLabel = (month) => {
  const [year, rawMonth] = month.split("-");
  if (!year || !rawMonth) return month || "未知日期";
  return `${year.slice(2)}年${Number(rawMonth)}月`;
};

export const getMonthlyData = (records) => {
  const groups = {};
  records.forEach((record) => {
    const month = normalizeDateString(record.date).slice(0, 7);
    if (!groups[month]) {
      groups[month] = {
        month,
        distance: 0,
        fuelLiters: 0,
        fuelCost: 0,
        toll: 0,
        income: 0,
        totalCost: 0,
        trips: 0
      };
    }

    groups[month].distance += record.distance;
    groups[month].fuelLiters += record.fuelLiters;
    groups[month].fuelCost += record.fuelCost;
    groups[month].toll += record.toll;
    groups[month].income += record.income;
    groups[month].totalCost += record.totalCost;
    groups[month].trips += 1;
  });

  return Object.values(groups)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(month => ({
      ...month,
      avgC: month.distance > 0 ? roundTo(month.fuelLiters / month.distance * 100, 1) : 0,
      profit: roundTo(month.income - month.totalCost, 2),
      netSpend: roundTo(month.totalCost - month.income, 2),
      costPerKm: month.distance > 0 ? roundTo(month.totalCost / month.distance, 3) : 0,
      netPerKm: month.distance > 0 ? roundTo((month.totalCost - month.income) / month.distance, 3) : 0,
      label: formatMonthLabel(month.month)
    }));
};

export const getRouteData = (records) => {
  const groups = {};
  records.forEach((record) => {
    const key = `${record.from}→${record.to}`;
    if (!groups[key]) groups[key] = { route: key, count: 0 };
    groups[key].count += 1;
  });
  return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 10);
};

export const getRecordYears = (records) => (
  [...new Set(records.map(record => normalizeDateString(record.date).slice(0, 4)).filter(Boolean))].sort()
);

export const getRecordMonths = (records) => (
  [...new Set(records.map(record => normalizeDateString(record.date).slice(0, 7)).filter(Boolean))].sort()
);

export const getRouteKey = (record) => `${asText(record.from).trim()}→${asText(record.to).trim()}`;

export const getRouteOptions = (records) => (
  [...new Set(records.map(getRouteKey))].sort((a, b) => a.localeCompare(b, "zh-CN"))
);

/** 看板与记录页共用的筛选：年份、月份、起终点、关键字（出发/到达/路线）。 */
export const filterRecords = (records, { year = "all", month = "all", route = "all", keyword = "" } = {}) => {
  const needle = keyword.trim().toLowerCase();
  return records.filter((record) => {
    const date = normalizeDateString(record.date);
    if (year !== "all" && date.slice(0, 4) !== year) return false;
    if (month !== "all" && date.slice(0, 7) !== month) return false;
    if (route !== "all" && getRouteKey(record) !== route) return false;
    if (needle) {
      const haystack = `${record.from} ${record.to} ${record.highway}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
};

export const formatCompactNumber = (value) => (
  value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toFixed(0)
);

export const formatMoney = (value, digits = 2) => {
  const number = Number.isFinite(value) ? value : 0;
  return `${number < 0 ? "-" : ""}¥${Math.abs(number).toFixed(digits)}`;
};
