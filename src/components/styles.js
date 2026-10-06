/** 极光玻璃卡片：半透明 + 模糊 + 顶部高光，保持原版深蓝配色 */
export const glassStyle = {
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
  borderRadius: 18,
  boxShadow: "var(--glass-shadow)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)"
};

export const boxStyle = {
  ...glassStyle,
  padding: "20px 10px 10px",
  marginBottom: 20
};

/** 驾驶舱式小格子：细边框 + 轻玻璃底 */
export const tileStyle = {
  background: "var(--tile-bg)",
  border: "1px solid var(--tile-border)",
  borderRadius: 14,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)"
};

export const monoFont = "ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace";
export const eyebrowStyle = { fontFamily: monoFont, fontSize: 11, letterSpacing: ".16em", fontWeight: 600 };

export const tooltipStyle = { background: "var(--tip-bg)", border: "1px solid var(--tip-border)", color: "var(--text)", borderRadius: 10, fontSize: 12, backdropFilter: "blur(8px)" };

export const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(var(--ink),.06)",
  border: "1px solid rgba(var(--ink),.12)",
  color: "var(--text)",
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 14,
  outline: "none"
};

export const selectStyle = {
  background: "rgba(var(--ink),.06)",
  border: "1px solid rgba(var(--ink),.1)",
  color: "var(--text)",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 13
};

export const labelStyle = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600 };

export const ghostButton = {
  background: "rgba(96,165,250,.14)",
  border: "1px solid rgba(96,165,250,.25)",
  color: "var(--blue)",
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};

export const mutedButton = {
  background: "rgba(100,116,139,.12)",
  border: "1px solid rgba(100,116,139,.22)",
  color: "var(--muted)",
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};

export const dangerButton = {
  background: "rgba(239,68,68,.15)",
  border: "1px solid rgba(239,68,68,.35)",
  color: "var(--red-t)",
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer"
};

export const primaryButton = {
  background: "linear-gradient(135deg,#3b82f6,#6366f1)",
  border: "none",
  color: "#fff",
  padding: "9px 18px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer"
};

export const pageBackground = "var(--page-bg)";
export const pageFont = "'Noto Sans SC','PingFang SC',-apple-system,sans-serif";
