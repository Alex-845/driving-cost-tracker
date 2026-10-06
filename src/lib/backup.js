import { isValidDateString, normalizeDateString, timestampLocal } from "./dates.js";

export const BACKUP_VERSION = 1;
export const BACKUP_APP_ID = "driving-cost-tracker";

const MAX_REPORTED = 8;

export const emptySnapshot = () => ({
  records: [],
  etcRecords: [],
  ignoredIssues: [],
  routeNameRules: {}
});

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeSnapshot = (value) => ({
  records: Array.isArray(value?.records) ? value.records : [],
  etcRecords: Array.isArray(value?.etcRecords) ? value.etcRecords : [],
  ignoredIssues: Array.isArray(value?.ignoredIssues) ? value.ignoredIssues : [],
  routeNameRules: isPlainObject(value?.routeNameRules) ? value.routeNameRules : {}
});

export const snapshotCounts = (snapshot) => ({
  records: snapshot?.records?.length || 0,
  etcRecords: snapshot?.etcRecords?.length || 0
});

const asFiniteNumber = (value) => {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const pushLimited = (list, message) => {
  if (list.length < MAX_REPORTED) list.push(message);
  else if (list.length === MAX_REPORTED) list.push("……还有更多问题未列出");
};

/**
 * 校验并整理一份快照（备份文件的 data 部分）。
 * errors 非空时不应恢复；warnings 是已自动处理或需要留意的事项。
 */
export const validateSnapshot = (data) => {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(data)) {
    return { ok: false, errors: ["备份缺少 data 内容"], warnings, snapshot: null };
  }
  if (!Array.isArray(data.records)) errors.push("备份缺少行程数组 records");
  if (!Array.isArray(data.etcRecords)) errors.push("备份缺少 ETC 数组 etcRecords（恢复会清空现有 ETC 数据，已拒绝）");
  if (errors.length) return { ok: false, errors, warnings, snapshot: null };

  const records = [];
  const usedIds = new Set();
  const needsId = [];
  data.records.forEach((raw, index) => {
    const row = `第 ${index + 1} 条行程`;
    if (!isPlainObject(raw)) {
      pushLimited(errors, `${row}不是有效对象`);
      return;
    }
    const date = normalizeDateString(raw.date);
    if (!isValidDateString(date)) pushLimited(errors, `${row}日期无效：${String(raw.date ?? "(空)")}`);
    const from = typeof raw.from === "string" ? raw.from : "";
    const to = typeof raw.to === "string" ? raw.to : "";
    if (!from.trim() || !to.trim()) pushLimited(errors, `${row}缺少出发地或目的地`);

    const numbers = {};
    ["price", "consumption", "distance"].forEach((field) => {
      const value = asFiniteNumber(raw[field]);
      if (!(value > 0)) pushLimited(errors, `${row}的 ${field} 必须是大于 0 的数字`);
      numbers[field] = value;
    });
    ["toll", "income"].forEach((field) => {
      if (raw[field] === undefined || raw[field] === null || raw[field] === "") {
        numbers[field] = 0;
        return;
      }
      const value = asFiniteNumber(raw[field]);
      if (!(value >= 0)) pushLimited(errors, `${row}的 ${field} 必须是不小于 0 的数字`);
      numbers[field] = value;
    });

    const record = {
      ...raw,
      date,
      from,
      to,
      highway: typeof raw.highway === "string" ? raw.highway : "",
      ...numbers
    };
    const id = asFiniteNumber(raw.id);
    if (Number.isFinite(id) && !usedIds.has(id)) {
      usedIds.add(id);
      record.id = id;
    } else {
      needsId.push(record);
    }
    records.push(record);
  });

  if (needsId.length) {
    let nextId = (usedIds.size ? Math.max(...usedIds) : 0) + 1;
    needsId.forEach((record) => {
      record.id = nextId;
      nextId += 1;
    });
    warnings.push(`${needsId.length} 条行程缺少或重复 id，已自动重新编号`);
  }

  const etcRecords = [];
  const businessIds = new Set();
  let duplicateBusinessIds = 0;
  data.etcRecords.forEach((raw, index) => {
    const row = `第 ${index + 1} 条 ETC`;
    if (!isPlainObject(raw)) {
      pushLimited(errors, `${row}不是有效对象`);
      return;
    }
    const amount = asFiniteNumber(raw.amount);
    if (!(amount >= 0)) pushLimited(errors, `${row}金额无效`);
    if (typeof raw.entryStation !== "string" || !raw.entryStation || typeof raw.exitStation !== "string" || !raw.exitStation) {
      pushLimited(errors, `${row}缺少入口站或出口站`);
    }
    if (typeof raw.exitTime !== "string" || typeof raw.entryTime !== "string") {
      pushLimited(errors, `${row}缺少入口或出口时间`);
    }
    if (raw.businessId) {
      if (businessIds.has(raw.businessId)) duplicateBusinessIds += 1;
      businessIds.add(raw.businessId);
    }
    etcRecords.push({ ...raw, amount });
  });
  if (duplicateBusinessIds) warnings.push(`ETC 数据中有 ${duplicateBusinessIds} 条业务编号重复，恢复后请核对是否重复通行`);

  const ignoredIssues = Array.isArray(data.ignoredIssues) ? data.ignoredIssues.filter(item => typeof item === "string") : [];
  if (!Array.isArray(data.ignoredIssues)) warnings.push("备份没有 ignoredIssues，已忽略项将清空");
  const routeNameRules = isPlainObject(data.routeNameRules) ? data.routeNameRules : {};
  if (!isPlainObject(data.routeNameRules)) warnings.push("备份没有 routeNameRules，路线规则将清空");

  if (errors.length) return { ok: false, errors, warnings, snapshot: null };
  return { ok: true, errors, warnings, snapshot: { records, etcRecords, ignoredIssues, routeNameRules } };
};

export const createBackup = (snapshot) => {
  const data = normalizeSnapshot(snapshot);
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    meta: snapshotCounts(data),
    data
  };
};

/** 解析备份文本。失败时抛出带可读原因的 Error；成功返回 { snapshot, warnings, exportedAt, version }。 */
export const parseBackupText = (text) => {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }
  if (!isPlainObject(backup) || backup.app !== BACKUP_APP_ID) {
    throw new Error("不是有效的行车油耗追踪备份");
  }
  const version = Number(backup.version ?? 1);
  if (!Number.isFinite(version) || version > BACKUP_VERSION) {
    throw new Error(`备份版本 ${backup.version} 比当前应用支持的版本 ${BACKUP_VERSION} 更新，请先升级应用`);
  }

  const result = validateSnapshot(backup.data);
  if (!result.ok) {
    throw new Error(`备份校验未通过：${result.errors.join("；")}`);
  }
  const warnings = [...result.warnings];
  if (isPlainObject(backup.meta)) {
    const actual = snapshotCounts(result.snapshot);
    if (Number.isFinite(backup.meta.records) && backup.meta.records !== actual.records) {
      throw new Error(`备份校验未通过：文件声明 ${backup.meta.records} 条行程，实际 ${actual.records} 条，文件可能被截断或手工改过`);
    }
    if (Number.isFinite(backup.meta.etcRecords) && backup.meta.etcRecords !== actual.etcRecords) {
      throw new Error(`备份校验未通过：文件声明 ${backup.meta.etcRecords} 条 ETC，实际 ${actual.etcRecords} 条，文件可能被截断或手工改过`);
    }
  }
  return { snapshot: result.snapshot, warnings, exportedAt: backup.exportedAt || "", version };
};

export const downloadBackup = (snapshot, label = "") => {
  const backup = createBackup(snapshot);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = label ? `-${label}` : "";

  link.href = url;
  link.download = `driving-tracker-backup-${timestampLocal()}${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const readBackupFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("无法读取备份文件"));
  reader.onload = () => {
    try {
      resolve(parseBackupText(reader.result));
    } catch (error) {
      reject(error);
    }
  };
  reader.readAsText(file);
});
