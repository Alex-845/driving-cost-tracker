import { listSafetySnapshots } from "../lib/safetySnapshot";
import { mutedButton, primaryButton } from "./styles";

/** 恢复点列表：危险操作之前自动保存在浏览器本地的数据副本。 */
export default function SafetyPanel({ onRestore, onClose }) {
  const snapshots = listSafetySnapshots();
  return (
    <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
      <div style={{ color: "#94a3b8", marginBottom: 10 }}>
        重置、恢复备份、替换导入、删除和批量修改之前，会在本浏览器自动保存恢复点（最多 5 份，换浏览器或清除站点数据后不会保留，请仍然定期导出备份）。
      </div>
      {snapshots.length === 0 && <div style={{ padding: "14px 0", color: "#64748b" }}>目前没有恢复点。</div>}
      {snapshots.map(entry => (
        <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,.07)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{entry.label}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {new Date(entry.createdAt).toLocaleString("zh-CN")} · {entry.counts.records} 条行程 · {entry.counts.etcRecords} 条 ETC
            </div>
          </div>
          <button type="button" style={primaryButton} onClick={() => onRestore(entry)}>恢复到此点</button>
        </div>
      ))}
      <div style={{ textAlign: "right", marginTop: 12 }}>
        <button type="button" style={mutedButton} onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
