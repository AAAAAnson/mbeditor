// MBEditor · Direction A — Reusable UI component library.
// Every screen builds on these. Components export to window.
// Hover/focus/active live in one injected stylesheet (mb- prefixed);
// dynamic bits use inline style. Tokens come from ds/theme.css.

(function injectUiCss() {
  if (document.getElementById("mb-ui-css")) return;
  const s = document.createElement("style");
  s.id = "mb-ui-css";
  s.textContent = `
  /* ---------- Button ---------- */
  .mb-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-family:var(--f-sans);
    font-weight:600;border:1.5px solid transparent;cursor:pointer;white-space:nowrap;text-decoration:none;
    transition:background var(--t-micro) var(--ease),border-color var(--t-micro) var(--ease),
      color var(--t-micro) var(--ease),box-shadow var(--t-micro) var(--ease),transform var(--t-micro) var(--ease);}
  .mb-btn:active{transform:translateY(1px) scale(.99);}
  .mb-btn:focus-visible{outline:none;box-shadow:var(--ring);}
  .mb-btn[disabled]{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
  .mb-btn.sz-md{height:46px;padding:0 22px;font-size:15.5px;border-radius:var(--r-md);}
  .mb-btn.sz-lg{height:54px;padding:0 28px;font-size:17px;border-radius:var(--r-lg);}
  .mb-btn.sz-sm{height:38px;padding:0 15px;font-size:14px;border-radius:var(--r-sm);}
  .mb-btn.icon-only.sz-md{width:46px;padding:0;}
  .mb-btn.icon-only.sz-lg{width:54px;padding:0;}
  .mb-btn.icon-only.sz-sm{width:38px;padding:0;}
  .mb-btn.v-primary{background:var(--orange-500);color:var(--cream);box-shadow:0 10px 22px -12px rgba(232,85,58,.8);}
  .mb-btn.v-primary:hover:not([disabled]){background:var(--orange-600);box-shadow:0 12px 26px -12px rgba(232,85,58,.9);}
  .mb-btn.v-secondary{background:var(--surface);color:var(--ink);border-color:var(--line-strong);box-shadow:var(--sh-xs);}
  .mb-btn.v-secondary:hover:not([disabled]){background:var(--surface-2);border-color:var(--ink-faint);}
  .mb-btn.v-ghost{background:transparent;color:var(--ink-soft);}
  .mb-btn.v-ghost:hover:not([disabled]){background:var(--surface-2);color:var(--ink);}
  .mb-btn.v-danger{background:transparent;color:var(--danger);border-color:var(--danger-soft);}
  .mb-btn.v-danger:hover:not([disabled]){background:var(--danger-soft);border-color:var(--danger);}

  /* ---------- Field ---------- */
  .mb-field{display:flex;flex-direction:column;gap:7px;}
  .mb-field-label{font-size:13.5px;font-weight:600;color:var(--ink-strong);}
  .mb-field-label .opt{font-weight:400;color:var(--ink-faint);margin-left:6px;}
  .mb-inputwrap{display:flex;align-items:center;gap:10px;background:var(--surface);border:1.5px solid var(--line-strong);
    border-radius:var(--r-md);padding:0 14px;transition:border-color var(--t-micro) var(--ease),box-shadow var(--t-micro) var(--ease);}
  .mb-inputwrap:focus-within{border-color:var(--orange-400);box-shadow:var(--ring);}
  .mb-inputwrap.err{border-color:var(--danger);}
  .mb-inputwrap.err:focus-within{box-shadow:0 0 0 3px var(--danger-soft);}
  .mb-inputwrap .lead{color:var(--ink-faint);flex:none;display:flex;}
  .mb-input{flex:1;border:none;outline:none;background:transparent;font-family:var(--f-sans);font-size:15.5px;
    color:var(--ink);height:46px;min-width:0;}
  .mb-input::placeholder{color:var(--ink-faint);}
  .mb-textarea{width:100%;border:1.5px solid var(--line-strong);border-radius:var(--r-md);background:var(--surface);
    font-family:var(--f-sans);font-size:15.5px;line-height:1.7;color:var(--ink);padding:13px 15px;resize:vertical;outline:none;
    transition:border-color var(--t-micro) var(--ease),box-shadow var(--t-micro) var(--ease);}
  .mb-textarea:focus{border-color:var(--orange-400);box-shadow:var(--ring);}
  .mb-textarea::placeholder{color:var(--ink-faint);}
  .mb-field-hint{font-size:12.5px;color:var(--ink-soft);}
  .mb-field-hint.err{color:var(--danger-ink);}

  /* ---------- Chip / Tag ---------- */
  .mb-chip{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 17px;border-radius:var(--r-pill);
    font-family:var(--f-sans);font-size:14.5px;font-weight:500;cursor:pointer;background:var(--surface);
    color:var(--ink);border:1.5px solid var(--line-strong);transition:all var(--t-micro) var(--ease);}
  .mb-chip:hover:not(.on){border-color:var(--orange-300);background:var(--orange-50);}
  .mb-chip.on{background:var(--orange-500);color:var(--cream);border-color:var(--orange-500);box-shadow:0 8px 18px -10px rgba(232,85,58,.7);}
  .mb-chip:focus-visible{outline:none;box-shadow:var(--ring);}
  .mb-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 10px;border-radius:var(--r-pill);
    font-size:12px;font-weight:600;}

  /* ---------- Segmented ---------- */
  .mb-seg{display:inline-flex;background:var(--bg-sunk);border-radius:var(--r-md);padding:4px;gap:4px;}
  .mb-seg-opt{appearance:none;border:none;background:transparent;font-family:var(--f-sans);font-size:14px;font-weight:600;
    color:var(--ink-soft);height:38px;padding:0 16px;border-radius:var(--r-sm);cursor:pointer;display:inline-flex;
    align-items:center;gap:7px;transition:all var(--t-base) var(--ease);}
  .mb-seg-opt.on{background:var(--surface);color:var(--ink-strong);box-shadow:var(--sh-sm);}
  .mb-seg-opt:hover:not(.on){color:var(--ink);}
  .mb-seg-opt:focus-visible{outline:none;box-shadow:var(--ring);}

  /* ---------- Card ---------- */
  .mb-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-xl);box-shadow:var(--sh-sm);}

  /* ---------- Dialog ---------- */
  .mb-overlay{position:fixed;inset:0;z-index:80;background:rgba(58,40,22,.34);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;padding:24px;animation:mb-fade var(--t-base) var(--ease);}
  .mb-dialog{background:var(--surface);border-radius:var(--r-2xl);box-shadow:var(--sh-xl);width:100%;max-width:440px;
    overflow:hidden;animation:mb-pop var(--t-enter) var(--ease-spring);}
  .mb-dialog-body{padding:26px 26px 14px;}
  .mb-dialog-foot{display:flex;gap:10px;justify-content:flex-end;padding:14px 26px 22px;}

  /* ---------- Switch ---------- */
  .mb-switch{position:relative;width:48px;height:28px;border-radius:var(--r-pill);background:var(--line-strong);
    cursor:pointer;transition:background var(--t-base) var(--ease);flex:none;border:none;padding:0;}
  .mb-switch.on{background:var(--success);}
  .mb-switch::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;
    background:#fff;box-shadow:var(--sh-sm);transition:transform var(--t-base) var(--ease-spring);}
  .mb-switch.on::after{transform:translateX(20px);}
  .mb-switch:focus-visible{outline:none;box-shadow:var(--ring-soft);}

  /* ---------- Skeleton ---------- */
  .mb-skel{background:linear-gradient(100deg,var(--bg-sunk) 30%,var(--surface-2) 50%,var(--bg-sunk) 70%);
    background-size:200% 100%;border-radius:var(--r-sm);animation:mb-shimmer 1.4s ease-in-out infinite;}

  /* ---------- Spinner ---------- */
  .mb-spin{width:18px;height:18px;border-radius:50%;border:2.4px solid var(--orange-100);
    border-top-color:var(--orange-500);animation:mb-rot .7s linear infinite;flex:none;}

  /* ---------- Stream caret + dots ---------- */
  .mb-caret{display:inline-block;width:2px;height:1.05em;background:var(--orange-500);margin-left:2px;
    vertical-align:text-bottom;animation:mb-blink 1s steps(2) infinite;border-radius:1px;}
  .mb-dots span{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--orange-400);margin:0 2px;
    animation:mb-bounce 1.2s var(--ease) infinite;}
  .mb-dots span:nth-child(2){animation-delay:.16s;}
  .mb-dots span:nth-child(3){animation-delay:.32s;}

  /* ---------- keyframes ---------- */
  @keyframes mb-fade{from{opacity:0;}to{opacity:1;}}
  @keyframes mb-pop{from{opacity:0;transform:translateY(12px) scale(.96);}to{opacity:1;transform:none;}}
  @keyframes mb-shimmer{from{background-position:200% 0;}to{background-position:-200% 0;}}
  @keyframes mb-rot{to{transform:rotate(360deg);}}
  @keyframes mb-blink{0%,49%{opacity:1;}50%,100%{opacity:0;}}
  @keyframes mb-bounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-6px);opacity:1;}}
  @keyframes mb-stamp{0%{opacity:0;transform:scale(.4) rotate(-12deg);}60%{opacity:1;transform:scale(1.12) rotate(2deg);}100%{transform:scale(1) rotate(0);}}
  @keyframes mb-check{from{stroke-dashoffset:32;}to{stroke-dashoffset:0;}}
  @keyframes mb-rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
  .mb-stamp{animation:mb-stamp var(--t-celebrate) var(--ease-spring);}
  .mb-rise{animation:mb-rise var(--t-enter) var(--ease) both;}

  /* ---------- mobile minimum hit-area (窄屏触控 ≥44px,底部 tab ≥52px) ----------
     桌面紧凑的 sz-sm 在 <600px 上升到 ≥44px;分段控件同理。 */
  @media (max-width:600px){
    .mb-btn.sz-sm{height:44px;padding:0 17px;border-radius:var(--r-md);}
    .mb-btn.icon-only.sz-sm{width:44px;}
    .mb-seg{padding:5px;}
    .mb-seg-opt{height:44px;}
  }
  `;
  document.head.appendChild(s);
})();

const cx = (...a) => a.filter(Boolean).join(" ");

// ---------- Button ----------
function Button({ variant = "secondary", size = "md", iconOnly = false, leading, trailing, loading = false, children, className, ...rest }) {
  return (
    <button className={cx("mb-btn", "v-" + variant, "sz-" + size, iconOnly && "icon-only", className)} {...rest}>
      {loading ? <span className="mb-spin" style={{ borderColor: variant === "primary" ? "rgba(255,255,255,.4)" : "var(--orange-100)", borderTopColor: variant === "primary" ? "#fff" : "var(--orange-500)" }}></span> : leading}
      {!iconOnly && children}
      {!loading && trailing}
    </button>
  );
}

// ---------- Input ----------
function Input({ lead, trailing, error, ...rest }) {
  return (
    <div className={cx("mb-inputwrap", error && "err")}>
      {lead && <span className="lead">{lead}</span>}
      <input className="mb-input" {...rest} />
      {trailing && <span className="trail" style={{ flex: "none", display: "flex" }}>{trailing}</span>}
    </div>
  );
}

function Field({ label, optional, hint, error, children }) {
  return (
    <div className="mb-field">
      {label && <label className="mb-field-label">{label}{optional && <span className="opt">选填</span>}</label>}
      {children}
      {(hint || error) && <span className={cx("mb-field-hint", error && "err")}>{error || hint}</span>}
    </div>
  );
}

function Textarea(props) { return <textarea className="mb-textarea" {...props}></textarea>; }

// ---------- Chip ----------
function Chip({ on, leading, children, ...rest }) {
  return <button className={cx("mb-chip", on && "on")} {...rest}>{leading}{children}</button>;
}

function Tag({ color = "neutral", leading, children }) {
  const map = {
    neutral: ["var(--bg-sunk)", "var(--ink-soft)"],
    orange:  ["var(--orange-50)", "var(--orange-700)"],
    success: ["var(--success-soft)", "var(--success-ink)"],
    warning: ["var(--warning-soft)", "var(--warning-ink)"],
    info:    ["var(--info-soft)", "var(--info-ink)"],
    danger:  ["var(--danger-soft)", "var(--danger-ink)"],
  };
  const [bg, fg] = map[color] || map.neutral;
  return <span className="mb-tag" style={{ background: bg, color: fg }}>{leading}{children}</span>;
}

// ---------- Segmented ----------
function Segmented({ options, value, onChange }) {
  return (
    <div className="mb-seg" role="tablist">
      {options.map((o) => {
        const val = o.value ?? o;
        const label = o.label ?? o;
        return (
          <button key={val} role="tab" aria-selected={value === val}
            className={cx("mb-seg-opt", value === val && "on")} onClick={() => onChange && onChange(val)}>
            {o.icon}{label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Card ----------
function Card({ className, style, children, ...rest }) {
  return <div className={cx("mb-card", className)} style={style} {...rest}>{children}</div>;
}

// ---------- Switch ----------
function Switch({ on, onChange }) {
  return <button className={cx("mb-switch", on && "on")} role="switch" aria-checked={!!on} onClick={() => onChange && onChange(!on)}></button>;
}

// ---------- Dialog ----------
function Dialog({ open, onClose, icon, title, children, footer, maxWidth = 440 }) {
  if (!open) return null;
  return (
    <div className="mb-overlay" onClick={onClose}>
      <div className="mb-dialog" style={{ maxWidth }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-dialog-body">
          {(icon || title) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              {icon}
              {title && <div className="t-heading" style={{ fontSize: 19 }}>{title}</div>}
            </div>
          )}
          {children}
        </div>
        {footer && <div className="mb-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Skeleton ----------
function Skeleton({ w = "100%", h = 14, r, style }) {
  return <div className="mb-skel" style={{ width: w, height: h, borderRadius: r, ...style }}></div>;
}

// ---------- Loading dots + animated check ----------
function LoadingDots() { return <span className="mb-dots"><span></span><span></span><span></span></span>; }

function CheckBurst({ size = 56 }) {
  return (
    <span className="mb-stamp" style={{ width: size, height: size, borderRadius: "50%", background: "var(--success-soft)",
      display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7" style={{ strokeDasharray: 32, animation: "mb-check var(--t-celebrate) var(--ease) forwards" }}></path>
      </svg>
    </span>
  );
}

Object.assign(window, {
  cx, Button, Input, Field, Textarea, Chip, Tag, Segmented, Card, Switch, Dialog,
  Skeleton, LoadingDots, CheckBurst,
});
