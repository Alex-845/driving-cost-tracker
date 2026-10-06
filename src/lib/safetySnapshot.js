import { loadJson, saveJson } from "./storage.js";
import { normalizeSnapshot, snapshotCounts } from "./backup.js";

export const SAFETY_SNAPSHOT_KEY = "driving-safety-snapshots-v1";
const MAX_SNAPSHOTS = 5;

export const listSafetySnapshots = () => {
  const stored = loadJson(SAFETY_SNAPSHOT_KEY, []);
  return Array.isArray(stored) ? stored : [];
};

/**
 * 在危险操作（重置、恢复、替换导入、批量修改、删除）之前，把当前数据存一份"恢复点"到浏览器本地，
 * 最多保留 5 份；与最近一份相同或数据为空时无需保存（返回 true）；存储失败返回 false。存储空间不足时丢弃最旧的重试。
 */
export const pushSafetySnapshot = (label, snapshot, now = new Date()) => {
  const normalized = normalizeSnapshot(snapshot);
  const counts = snapshotCounts(normalized);
  if (!counts.records && !counts.etcRecords) return true; // 空数据无需保存

  const existing = listSafetySnapshots();
  const serialized = JSON.stringify(normalized);
  if (existing[0] && JSON.stringify(existing[0].snapshot) === serialized) return true; // 已有相同恢复点

  const entry = {
    id: `${now.getTime()}`,
    label,
    createdAt: now.toISOString(),
    counts,
    snapshot: normalized
  };

  let next = [entry, ...existing].slice(0, MAX_SNAPSHOTS);
  while (next.length && !saveJson(SAFETY_SNAPSHOT_KEY, next)) {
    next = next.slice(0, -1);
  }
  return next.length > 0;
};

export const removeSafetySnapshot = (id) => {
  saveJson(SAFETY_SNAPSHOT_KEY, listSafetySnapshots().filter(entry => entry.id !== id));
};
