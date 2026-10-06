import { useEffect, useState } from "react";
import { dangerButton, mutedButton, primaryButton } from "./styles";

/**
 * 通用确认弹窗。requireText 非空时，用户必须输入该文字才能点确认（用于不可轻易撤销的操作）。
 */
export default function ConfirmDialog({ dialog, onClose }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setTyped(""); setBusy(false); }, [dialog]);
  if (!dialog) return null;

  const { title, body, confirmLabel = "确认", danger = false, requireText = "", onConfirm, hideActions = false } = dialog;
  const canConfirm = !busy && (!requireText || typed.trim() === requireText);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,6,23,.72)", display: "grid", placeItems: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#111827", border: `1px solid ${danger ? "rgba(239,68,68,.4)" : "rgba(148,163,184,.25)"}`, borderRadius: 16, padding: 22, color: "#e2e8f0", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12, color: danger ? "#fca5a5" : "#e2e8f0" }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: "#cbd5e1" }}>{body}</div>
        {requireText && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>请输入“{requireText}”以确认：</div>
            <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus aria-label="确认文字"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.18)", color: "#e2e8f0", padding: "9px 12px", borderRadius: 8, fontSize: 14, outline: "none" }} />
          </div>
        )}
        {!hideActions && <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} style={mutedButton}>取消</button>
          {dialog.secondary && (
            <button type="button" onClick={async () => { setBusy(true); try { await dialog.secondary.onClick(); } finally { setBusy(false); onClose(); } }} style={mutedButton}>{dialog.secondary.label}</button>
          )}
          <button type="button" disabled={!canConfirm} onClick={handleConfirm}
            style={{ ...(danger ? dangerButton : primaryButton), opacity: canConfirm ? 1 : 0.4, cursor: canConfirm ? "pointer" : "not-allowed" }}>{confirmLabel}</button>
        </div>}
      </div>
    </div>
  );
}
