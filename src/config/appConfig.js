export const STORAGE_KEY = "driving-records-v3";
export const ETC_STORAGE_KEY = "driving-etc-records-v1";
export const IGNORED_ISSUES_KEY = "driving-ignored-v1";
export const ROUTE_NAME_RULES_KEY = "driving-route-name-rules-v1";

export const TABS = ["dashboard", "records", "add", "etc", "compare", "check"];

export const TAB_LABELS = {
  dashboard: "数据看板",
  records: "行程记录",
  add: "新增记录",
  etc: "ETC查询",
  compare: "出行对比",
  check: "数据排查"
};

export const CHART_OPTIONS = [
  { k: "monthly", l: "月度总览" },
  { k: "consumption", l: "油耗趋势" },
  { k: "cost", l: "费用构成" },
  { k: "routes", l: "常走路线" },
  { k: "price", l: "油价走势" }
];

export const FORM_FIELDS = [
  { k: "price", l: "油价 (¥/L) *", p: "7.64" },
  { k: "consumption", l: "百公里油耗 (L) *", p: "6.5" },
  { k: "distance", l: "公里数 (km) *", p: "155.4" },
  { k: "toll", l: "过路费 (¥)", p: "0" },
  { k: "income", l: "顺风车收入 (¥)", p: "0" }
];

export const RECORD_COLUMNS = [
  { k: "date", l: "日期" },
  { k: "from", l: "出发" },
  { k: "to", l: "到达" },
  { k: "highway", l: "路线" },
  { k: "distance", l: "公里" },
  { k: "consumption", l: "油耗" },
  { k: "price", l: "油价" },
  { k: "fuelCost", l: "油费" },
  { k: "toll", l: "过路费" },
  { k: "totalCost", l: "总费用" },
  { k: "income", l: "收入" },
  { k: "profit", l: "盈亏" }
];

export const ISSUE_TYPES = ["空格", "里程偏差"];
