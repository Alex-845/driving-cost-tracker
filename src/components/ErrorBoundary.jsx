import { Component } from "react";
import { createBackup } from "../lib/backup";
import { ETC_STORAGE_KEY, IGNORED_ISSUES_KEY, ROUTE_NAME_RULES_KEY, STORAGE_KEY } from "../config/appConfig";
import { loadJson } from "../lib/storage";
import { timestampLocal } from "../lib/dates";
import { pageBackground, pageFont } from "./styles";

const exportRawLocalData = () => {
  const backup = createBackup({
    records: loadJson(STORAGE_KEY, []),
    etcRecords: loadJson(ETC_STORAGE_KEY, []),
    ignoredIssues: loadJson(IGNORED_ISSUES_KEY, []),
    routeNameRules: loadJson(ROUTE_NAME_RULES_KEY, {})
  });
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `driving-tracker-backup-${timestampLocal()}-crash-export.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** 兜底：页面渲染出错时不再白屏，并允许把浏览器里的数据原样导出。 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("页面渲染出错", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const buttonStyle = { padding: "9px 16px", borderRadius: 8, border: "1px solid rgba(148,163,184,.3)", background: "rgba(var(--ink),.06)", color: "var(--text)", fontSize: 13, cursor: "pointer" };
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, color: "var(--text2)", fontFamily: pageFont, background: pageBackground }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: "var(--red-t)" }}>页面出错了</div>
          <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 14 }}>
            数据没有丢。可以先导出浏览器里保存的数据，再刷新页面重试。如果刷新后仍然出错，请把导出的备份和下面的错误信息交给维护人员。
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "var(--muted)", background: "rgba(var(--ink),.04)", padding: 10, borderRadius: 8, maxHeight: 140, overflow: "auto" }}>{String(this.state.error?.message || this.state.error)}</pre>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" style={buttonStyle} onClick={exportRawLocalData}>导出本地数据</button>
            <button type="button" style={buttonStyle} onClick={() => window.location.reload()}>刷新页面</button>
          </div>
        </div>
      </div>
    );
  }
}
