import { useEffect, useMemo, useRef, useState } from "react";
import { inputStyle, labelStyle } from "./styles";

export default function AutoComplete({ value, onChange, options, placeholder, label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const list = useMemo(() => {
    const term = (q || value || "").toLowerCase();
    if (!term) return options;
    return options.filter(option => option.toLowerCase().includes(term));
  }, [q, value, options]);
  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <input type="text" value={value}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && list.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--pop-bg)", border: "1px solid var(--pop-border)", borderRadius: 10,
          maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 32px rgba(0,0,0,.5)"
        }}>
          {list.map((option, i) => (
            <div key={option} onClick={() => { onChange(option); setQ(""); setOpen(false); }}
              style={{
                padding: "9px 14px", fontSize: 13, cursor: "pointer",
                background: option === value ? "rgba(59,130,246,.15)" : "transparent",
                color: option === value ? "var(--blue)" : "var(--text)",
                borderBottom: i < list.length - 1 ? "1px solid rgba(var(--ink),.04)" : "none"
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = option === value ? "rgba(59,130,246,.15)" : "transparent"; }}
            >{option}</div>
          ))}
        </div>
      )}
    </div>
  );
}
