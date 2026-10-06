const pad2 = (value) => String(value).padStart(2, "0");

/** 本地时区的 YYYY-MM-DD（不要用 toISOString，它是 UTC，北京时间 0–8 点会取到前一天）。 */
export const todayLocal = (now = new Date()) => (
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
);

/** 本地时区的 YYYYMMDD-HHmm，用于备份文件名。 */
export const timestampLocal = (now = new Date()) => (
  `${todayLocal(now).replaceAll("-", "")}-${pad2(now.getHours())}${pad2(now.getMinutes())}`
);

/** 严格校验 YYYY-MM-DD 且是真实存在的日期。 */
export const isValidDateString = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

/** 把 2026-3-5 / 2026/03/05 规整为 2026-03-05；无法识别则原样返回字符串。 */
export const normalizeDateString = (value) => {
  const text = String(value ?? "").trim();
  const matched = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!matched) return text;
  return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
};

/** 完整年月日比较（旧实现只比较最后 5 位，跨年会错乱）。 */
export const compareDateStrings = (a, b) => (
  normalizeDateString(a).localeCompare(normalizeDateString(b))
);
