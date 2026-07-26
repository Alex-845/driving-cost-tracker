import * as XLSX from "xlsx";

const parseNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseRoute = (routeStr) => {
  if (!routeStr || typeof routeStr !== "string") return { from: "", to: "" };
  const cleaned = routeStr.replace(/（[^）]*）/g, "").trim();
  const parts = cleaned.split("-").map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return { from: "", to: "" };
  if (parts.length === 1) return { from: parts[0], to: parts[0] };
  if (parts.length === 2) return { from: parts[0], to: parts[1] };
  if (parts[0] === parts[parts.length - 1]) return { from: parts[0], to: parts.slice(1, -1).join("-") };
  return { from: parts[0], to: parts[parts.length - 1] };
};

export const excelDateToStr = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const matched = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matched) return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
    return "";
  }
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return "";
};

const findHeaderRow = (rows) => {
  for (let index = 0; index < Math.min(rows.length, 5); index += 1) {
    const row = rows[index];
    if (row && row.some(cell => String(cell).includes("序号") || String(cell).includes("行程"))) return index;
  }
  return 0;
};

const detectColumns = (headers) => {
  const colMap = { id: 0, date: 1, route: 2, highway: 3, price: 4, consumption: 5, distance: 7, toll: 9, income: 11 };

  headers.forEach((header, index) => {
    const label = String(header).trim();
    if (label === "序号") colMap.id = index;
    else if (label.includes("行程") || (label.includes("路线") && !label.includes("高速"))) colMap.route = index;
    else if (label.includes("油价")) colMap.price = index;
    else if (label.includes("油耗") || label.toLowerCase().includes("100km")) colMap.consumption = index;
    else if (label.includes("公里") && !label.includes("油耗")) colMap.distance = index;
    else if (label.includes("过路费")) colMap.toll = index;
    else if (label.includes("顺风车") || label.includes("收入")) colMap.income = index;
  });

  return colMap;
};

export const parseDrivingWorkbook = (arrayBuffer, records) => {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  const headerIdx = findHeaderRow(rows);
  const colMap = detectColumns(rows[headerIdx] || []);
  const parsed = [];

  for (let index = headerIdx + 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.length < 5) continue;

    const dateStr = excelDateToStr(row[colMap.date] || row[1]);
    if (!dateStr) continue;

    const routeVal = String(row[colMap.route] || "");
    if (!routeVal || routeVal === "NaN") continue;

    const { from, to } = parseRoute(routeVal);
    if (!from || !to) continue;

    const price = parseNumber(row[colMap.price]);
    const consumption = parseNumber(row[colMap.consumption]);
    const distance = parseNumber(row[colMap.distance]);
    if (price <= 0 || consumption <= 0 || distance <= 0) continue;

    parsed.push({
      date: dateStr,
      from,
      to,
      highway: String(row[colMap.highway] || "").replace("NaN", "").trim(),
      price,
      consumption,
      distance,
      toll: parseNumber(row[colMap.toll]),
      income: parseNumber(row[colMap.income])
    });
  }

  const existingKeys = new Set(records.map(record => `${record.date}|${record.from}|${record.to}|${record.distance}`));
  return parsed.map(record => ({
    ...record,
    isDuplicate: existingKeys.has(`${record.date}|${record.from}|${record.to}|${record.distance}`)
  }));
};

