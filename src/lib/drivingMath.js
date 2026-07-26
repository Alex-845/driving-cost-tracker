export const roundTo = (value, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

export const toNumber = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
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
  const costPerKm = distance > 0 ? roundTo(totalCost / distance, 4) : 0;

  return {
    ...record,
    distance,
    consumption,
    price,
    toll,
    income,
    fuelLiters,
    fuelCost,
    totalCost,
    profit,
    costPerKm
  };
};

export const getNextId = (records) => (
  records.length ? Math.max(...records.map(record => Number(record.id) || 0)) + 1 : 1
);

export const sortDrivingRecords = (records, sortKey, sortDir) => {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (sortKey === "date") {
      const monthDaySort = String(a.date || "").slice(-5).localeCompare(String(b.date || "").slice(-5));
      if (monthDaySort) return monthDaySort * direction;
      return ((Number(a.id) || 0) - (Number(b.id) || 0)) * direction;
    }

    const aValue = a[sortKey];
    const bValue = b[sortKey];
    const valueSort = typeof aValue === "string"
      ? aValue.localeCompare(bValue)
      : aValue - bValue;
    if (valueSort) return valueSort * direction;
    return ((Number(a.id) || 0) - (Number(b.id) || 0)) * direction;
  });
};

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
  if (toNumber(form.price) <= 0) return "油价必须大于 0";
  if (toNumber(form.consumption) <= 0) return "百公里油耗必须大于 0";
  if (toNumber(form.distance) <= 0) return "公里数必须大于 0";
  if (toNumber(form.toll) < 0) return "过路费不能为负数";
  if (toNumber(form.income) < 0) return "顺风车收入不能为负数";
  return "";
};

export const getFormPreview = (form) => {
  const distance = toNumber(form.distance);
  const consumption = toNumber(form.consumption);
  const price = toNumber(form.price);
  if (distance <= 0 || consumption <= 0 || price <= 0) return null;

  const fuelCost = roundTo(distance * consumption / 100 * price, 2);
  const totalCost = roundTo(fuelCost + toNumber(form.toll), 2);
  const profit = roundTo(toNumber(form.income) - totalCost, 2);
  const costPerKm = distance > 0 ? roundTo(totalCost / distance, 3) : 0;

  return { fuelCost, totalCost, profit, costPerKm };
};

export const getStats = (records) => {
  if (!records.length) return null;
  const totalDist = records.reduce((sum, record) => sum + record.distance, 0);
  const totalFuelLiters = records.reduce((sum, record) => sum + record.fuelLiters, 0);

  return {
    totalDist,
    totalFuel: records.reduce((sum, record) => sum + record.fuelCost, 0),
    totalToll: records.reduce((sum, record) => sum + record.toll, 0),
    totalIncome: records.reduce((sum, record) => sum + record.income, 0),
    totalCost: records.reduce((sum, record) => sum + record.totalCost, 0),
    avgConsumption: totalDist > 0 ? totalFuelLiters / totalDist * 100 : 0,
    count: records.length
  };
};

export const formatMonthLabel = (month) => {
  const [year, rawMonth] = month.split("-");
  if (!year || !rawMonth) return month;
  return `${year.slice(2)}年${Number(rawMonth)}月`;
};

export const getMonthlyData = (records) => {
  const groups = {};
  records.forEach((record) => {
    const month = record.date.slice(0, 7);
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

export const formatCompactNumber = (value) => (
  value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toFixed(0)
);
