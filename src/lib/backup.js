export const BACKUP_VERSION = 1;

const normalizeSnapshot = (value) => ({
  records: Array.isArray(value?.records) ? value.records : [],
  etcRecords: Array.isArray(value?.etcRecords) ? value.etcRecords : [],
  ignoredIssues: Array.isArray(value?.ignoredIssues) ? value.ignoredIssues : [],
  routeNameRules: value?.routeNameRules && typeof value.routeNameRules === "object"
    ? value.routeNameRules
    : {}
});

export const createBackup = (snapshot) => ({
  app: "driving-cost-tracker",
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  data: normalizeSnapshot(snapshot)
});

export const downloadBackup = (snapshot) => {
  const backup = createBackup(snapshot);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `driving-tracker-backup-${date}.json`;
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
      const backup = JSON.parse(reader.result);
      if (backup?.app !== "driving-cost-tracker" || !backup?.data) {
        throw new Error("不是有效的行车油耗追踪备份");
      }
      resolve(normalizeSnapshot(backup.data));
    } catch (error) {
      reject(error);
    }
  };
  reader.readAsText(file);
});
