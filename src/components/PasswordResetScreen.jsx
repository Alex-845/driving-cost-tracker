import { useState } from "react";

export default function PasswordResetScreen({ email, onUpdatePassword }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("新密码至少需要 8 位。");
      return;
    }
    if (password !== confirmation) {
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setBusy(true);
    setMessage("");
    const { error } = await onUpdatePassword(password);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("密码已更新，正在进入行车油耗追踪。");
  };

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
      boxSizing: "border-box", color: "#e2e8f0",
      fontFamily: "'Noto Sans SC','PingFang SC',-apple-system,sans-serif",
      background: "linear-gradient(135deg,#0c1220 0%,#1a1a2e 50%,#16213e 100%)"
    }}>
      <form onSubmit={submit} style={{
        width: "min(100%, 390px)", padding: 24, borderRadius: 8,
        background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)"
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>设置新密码</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 22 }}>{email || "当前账户"}</div>

        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>新密码</label>
        <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 14, padding: "11px 12px",
            borderRadius: 7, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "#e2e8f0", fontSize: 14
          }} />

        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>再次输入新密码</label>
        <input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 16, padding: "11px 12px",
            borderRadius: 7, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "#e2e8f0", fontSize: 14
          }} />

        {message && <div style={{
          padding: "9px 11px", borderRadius: 7, marginBottom: 14, fontSize: 12, lineHeight: 1.6,
          background: "rgba(96,165,250,.09)", border: "1px solid rgba(96,165,250,.18)", color: "#bfdbfe"
        }}>{message}</div>}

        <button type="submit" disabled={busy}
          style={{
            width: "100%", padding: 11, borderRadius: 7, border: "none",
            background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff",
            fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? .65 : 1
          }}>
          {busy ? "正在更新..." : "保存新密码"}
        </button>
      </form>
    </div>
  );
}
