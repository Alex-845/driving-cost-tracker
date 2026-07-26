import { useState } from "react";

export default function AuthScreen({ authReady, onSignIn, onSignUp }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || password.length < 8) {
      setMessage("请输入邮箱，密码至少 8 位。");
      return;
    }

    setBusy(true);
    setMessage("");
    const { data, error } = mode === "signin"
      ? await onSignIn(email.trim(), password)
      : await onSignUp(email.trim(), password);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === "signup" && !data?.session) {
      setMessage("注册成功，请到邮箱点击确认链接后再登录。");
      setMode("signin");
      return;
    }
    setMessage("登录成功，正在读取云端数据。");
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
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>行车油耗追踪</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 22 }}>登录后在电脑和手机间同步记录</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 18 }}>
          {[{ key: "signin", label: "登录" }, { key: "signup", label: "注册" }].map(item => (
            <button key={item.key} type="button" onClick={() => { setMode(item.key); setMessage(""); }}
              style={{
                padding: 9, borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: mode === item.key ? "1px solid rgba(96,165,250,.4)" : "1px solid transparent",
                background: mode === item.key ? "rgba(59,130,246,.18)" : "rgba(255,255,255,.03)",
                color: mode === item.key ? "#60a5fa" : "#94a3b8"
              }}>
              {item.label}
            </button>
          ))}
        </div>

        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>邮箱</label>
        <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 14, padding: "11px 12px",
            borderRadius: 7, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "#e2e8f0", fontSize: 14
          }} />

        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>密码</label>
        <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password} onChange={event => setPassword(event.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 16, padding: "11px 12px",
            borderRadius: 7, border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: "#e2e8f0", fontSize: 14
          }} />

        {message && <div style={{
          padding: "9px 11px", borderRadius: 7, marginBottom: 14, fontSize: 12, lineHeight: 1.6,
          background: "rgba(96,165,250,.09)", border: "1px solid rgba(96,165,250,.18)", color: "#bfdbfe"
        }}>{message}</div>}

        <button type="submit" disabled={busy || !authReady}
          style={{
            width: "100%", padding: 11, borderRadius: 7, border: "none",
            background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff",
            fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? .65 : 1
          }}>
          {busy ? "请稍候..." : mode === "signin" ? "登录" : "创建账户"}
        </button>
      </form>
    </div>
  );
}
