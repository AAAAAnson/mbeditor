// MBEditor · Direction A — Motion / 动效规范 (P10 unify pass)
// One coherent motion language across 起稿台 / 写作流 / 编辑器 / 设置.
// Easing · duration · displacement scales + 7 canonical patterns, each
// replayable, annotated 强化情绪 / 克制, with prefers-reduced-motion fallback.
// Tokens come from ds/theme.css; idioms come from ds/ui.jsx.

const RM = React.createContext(false);

function injectMsCss() {
  if (document.getElementById("ms-css")) return;
  const s = document.createElement("style");
  s.id = "ms-css";
  s.textContent = `
  .ms-page{max-width:1080px;margin:0 auto;padding:0 24px 120px;}
  .ms-hd{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;
    padding:16px 24px;margin:0 -24px 0;background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}
  .ms-hd .grow{flex:1;}
  .ms-rm{display:inline-flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-soft);}

  .ms-hero{padding:64px 0 40px;border-bottom:1px solid var(--line);margin-bottom:8px;}
  .ms-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:1.5px;
    text-transform:uppercase;color:var(--orange-600);margin-bottom:18px;}
  .ms-lead{max-width:680px;margin:18px 0 0;}

  .ms-sec{padding:54px 0;border-bottom:1px solid var(--line);}
  .ms-sec:last-child{border-bottom:none;}
  .ms-sechd{display:flex;align-items:baseline;gap:16px;margin-bottom:8px;}
  .ms-secn{font-family:var(--f-mono);font-size:14px;font-weight:700;color:var(--orange-500);
    border:1.5px solid var(--orange-200);border-radius:var(--r-pill);padding:3px 12px;flex:none;}
  .ms-secdesc{max-width:720px;margin:10px 0 30px;color:var(--ink-soft);}

  /* token rows */
  .ms-tok{display:grid;grid-template-columns:max-content max-content 1fr max-content;gap:14px 22px;align-items:center;}
  .ms-tok-name{font-family:var(--f-mono);font-size:13.5px;color:var(--ink-strong);font-weight:600;}
  .ms-tok-val{font-family:var(--f-mono);font-size:12.5px;color:var(--ink-soft);}
  .ms-tok-use{font-size:13.5px;color:var(--ink-soft);}

  /* stage — recessed well demos play inside */
  .ms-stage{background:var(--bg-sunk);border:1px solid var(--line);border-radius:var(--r-lg);
    padding:26px;position:relative;overflow:hidden;}
  .ms-stage.tall{min-height:280px;}
  .ms-replay{position:absolute;top:14px;right:14px;z-index:5;display:inline-flex;align-items:center;gap:7px;
    height:34px;padding:0 14px;border-radius:var(--r-pill);border:1.5px solid var(--line-strong);
    background:var(--surface);color:var(--ink);font-family:var(--f-sans);font-size:13px;font-weight:600;cursor:pointer;
    box-shadow:var(--sh-xs);transition:all var(--t-micro) var(--ease);}
  .ms-replay:hover{border-color:var(--orange-300);color:var(--orange-700);}
  .ms-replay:active{transform:translateY(1px);}

  /* pattern card */
  .ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;}
  .ms-pat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-xl);
    box-shadow:var(--sh-sm);overflow:hidden;display:flex;flex-direction:column;}
  .ms-pat-hd{padding:18px 20px 14px;display:flex;flex-direction:column;gap:9px;}
  .ms-pat-title{display:flex;align-items:center;gap:10px;}
  .ms-pat-title h3{margin:0;font-size:17px;font-weight:700;color:var(--ink-strong);}
  .ms-pat-stage{margin:0 16px;}
  .ms-pat-body{padding:14px 20px 20px;display:flex;flex-direction:column;gap:12px;}
  .ms-recipe{font-family:var(--f-mono);font-size:12px;line-height:1.65;color:var(--ink-soft);
    background:var(--bg-sunk);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;white-space:pre-wrap;}
  .ms-note{font-size:13px;line-height:1.6;color:var(--ink);}
  .ms-note b{color:var(--ink-strong);}

  .ms-flag{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 11px;border-radius:var(--r-pill);
    font-size:11.5px;font-weight:700;letter-spacing:.3px;flex:none;}
  .ms-flag.amp{background:var(--orange-50);color:var(--orange-700);border:1px solid var(--orange-200);}
  .ms-flag.calm{background:var(--info-soft);color:var(--info-ink);border:1px solid color-mix(in srgb,var(--info) 30%,transparent);}

  /* duration bars */
  .ms-bar-row{display:flex;align-items:center;gap:14px;margin:0 0 14px;}
  .ms-bar-name{width:128px;flex:none;font-family:var(--f-mono);font-size:12.5px;color:var(--ink-strong);}
  .ms-bar-track{flex:1;height:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-pill);overflow:hidden;}
  .ms-bar-fill{height:100%;border-radius:var(--r-pill);background:linear-gradient(90deg,var(--orange-400),var(--orange-500));width:0;}
  .ms-bar-num{width:62px;flex:none;text-align:right;font-family:var(--f-mono);font-size:12px;color:var(--ink-soft);}

  /* easing */
  .ms-ease-row{display:flex;gap:26px;align-items:center;flex-wrap:wrap;}
  .ms-ease-card{flex:1;min-width:230px;}
  .ms-track{height:46px;border-radius:var(--r-pill);background:var(--surface);border:1px solid var(--line);
    position:relative;margin-top:14px;overflow:hidden;}
  .ms-ball{position:absolute;top:50%;left:6px;width:30px;height:30px;border-radius:50%;margin-top:-15px;
    background:var(--orange-500);box-shadow:0 6px 14px -4px rgba(232,85,58,.7);}

  /* displacement */
  .ms-disp-row{display:flex;gap:24px;align-items:flex-end;justify-content:space-around;flex-wrap:wrap;}
  .ms-disp{display:flex;flex-direction:column;align-items:center;gap:10px;}
  .ms-disp-cell{height:84px;display:flex;align-items:flex-end;}
  .ms-disp-dot{width:34px;height:34px;border-radius:var(--r-sm);background:var(--orange-500);box-shadow:var(--sh-sm);}

  /* emotion map */
  .ms-emap{display:grid;grid-template-columns:repeat(9,1fr);gap:8px;align-items:end;}
  .ms-emap-col{display:flex;flex-direction:column;align-items:center;gap:9px;}
  .ms-emap-bar{width:100%;border-radius:var(--r-sm) var(--r-sm) 4px 4px;min-height:6px;}
  .ms-emap-lab{font-size:11px;text-align:center;color:var(--ink-soft);line-height:1.3;height:30px;}

  /* mini screens / cards used in demos */
  .ms-screen{position:absolute;inset:0;background:var(--surface);border-radius:var(--r-md);border:1px solid var(--line);
    padding:18px;display:flex;flex-direction:column;gap:12px;}
  .ms-skelbar{height:12px;border-radius:6px;background:var(--bg-sunk);}
  .ms-minicard{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:13px;
    box-shadow:var(--sh-xs);display:flex;flex-direction:column;gap:8px;}

  /* streaming demo rail */
  .ms-rail{display:flex;flex-direction:column;gap:10px;}
  .ms-railnode{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-soft);}
  .ms-raildot{width:11px;height:11px;border-radius:50%;border:2px solid var(--line-strong);flex:none;
    transition:all var(--t-base) var(--ease);}
  .ms-railnode.active .ms-raildot{background:var(--orange-500);border-color:var(--orange-500);
    box-shadow:0 0 0 4px var(--orange-100);}
  .ms-railnode.active{color:var(--ink-strong);font-weight:600;}
  .ms-railnode.done .ms-raildot{background:var(--success);border-color:var(--success);}
  .ms-railnode.done{color:var(--ink);}

  /* confetti */
  .ms-confetti{position:absolute;top:-10px;width:8px;height:12px;border-radius:2px;opacity:0;pointer-events:none;
    animation:ms-fall 2.2s var(--ease) forwards;}
  @keyframes ms-fall{0%{opacity:0;transform:translateY(-14px) rotate(0);}12%{opacity:1;}
    100%{opacity:0;transform:translateY(220px) rotate(420deg);}}

  .ms-stamp2{display:inline-flex;align-items:center;gap:7px;color:var(--success-ink);border:2.5px solid var(--success);
    border-radius:var(--r-pill);padding:5px 14px;font-weight:700;font-size:13px;letter-spacing:1px;
    transform:rotate(-6deg);background:color-mix(in srgb,var(--success-soft) 70%,transparent);
    animation:mb-stamp var(--t-celebrate) var(--ease-spring);}

  /* reduced-motion simulator: kill transforms in demo stages */
  .ms-rmsim .ms-stage, .ms-rmsim .ms-stage *,
  .ms-rmsim .ms-pat-stage, .ms-rmsim .ms-pat-stage *{
    animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}

  .ms-callout{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--orange-400);
    border-radius:var(--r-md);padding:16px 18px;display:flex;flex-direction:column;gap:6px;}

  .ms-2col{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
  .ms-keep{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;}
  .ms-keep h4{margin:0;padding:13px 16px;font-size:14px;border-bottom:1px solid var(--line);}
  .ms-keep.go h4{color:var(--success-ink);background:var(--success-soft);}
  .ms-keep.no h4{color:var(--danger-ink);background:var(--danger-soft);}
  .ms-keep ul{margin:0;padding:14px 18px 16px 32px;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--ink);}

  @media (max-width:760px){
    .ms-grid,.ms-2col{grid-template-columns:1fr;}
    .ms-emap{grid-template-columns:repeat(3,1fr);}
    .ms-tok{grid-template-columns:1fr;gap:6px 0;}
  }
  `;
  document.head.appendChild(s);
}
injectMsCss();

// ---------- helpers ----------
function useReplay() {
  const [tick, setTick] = React.useState(0);
  return [tick, () => setTick((t) => t + 1)];
}
function Replay({ onClick, label = "重播" }) {
  return (
    <button className="ms-replay" onClick={onClick}>
      <IconRefresh size={15} sw={2} />{label}
    </button>
  );
}
function Section({ n, title, desc, children }) {
  return (
    <section className="ms-sec">
      <div className="ms-sechd">
        <span className="ms-secn">{n}</span>
        <h2 className="t-title" style={{ margin: 0 }}>{title}</h2>
      </div>
      {desc && <p className="ms-secdesc t-body">{desc}</p>}
      {children}
    </section>
  );
}
function Flag({ kind }) {
  return kind === "amp"
    ? <span className="ms-flag amp"><IconSparkle size={13} sw={2} />强化情绪</span>
    : <span className="ms-flag calm"><IconCheck size={13} sw={2.4} />克制</span>;
}

// ============================================================
// SCALE DEMOS
// ============================================================
function EasingDemo() {
  const [tick, replay] = useReplay();
  const curve = (x1, y1, x2, y2) => {
    const X = (v) => 6 + v * 120, Y = (v) => 126 - v * 120;
    return `M${X(0)},${Y(0)} C${X(x1)},${Y(y1)} ${X(x2)},${Y(y2)} ${X(1)},${Y(1)}`;
  };
  const cards = [
    { name: "--ease", val: "cubic-bezier(.2,.7,.3,1)", role: "默认 · 温和收尾(ease-out),不过冲。导航、状态、表单、克制处全用它。", c: [.2, .7, .3, 1], spring: false },
    { name: "--ease-spring", val: "cubic-bezier(.34,1.4,.5,1)", role: "轻微回弹 · 仅限「值得高兴」的瞬间:对话框/庆祝弹入、开关拨柄、印章。", c: [.34, 1.4, .5, 1], spring: true },
  ];
  return (
    <div className="ms-stage" key={tick}>
      <Replay onClick={replay} />
      <div className="ms-ease-row">
        {cards.map((cd) => (
          <div className="ms-ease-card" key={cd.name}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span className="ms-tok-name">{cd.name}</span>
              {cd.spring ? <Flag kind="amp" /> : <Flag kind="calm" />}
            </div>
            <div className="ms-tok-val" style={{ marginBottom: 8 }}>{cd.val}</div>
            <svg width="100%" height="150" viewBox="-6 -34 138 172" style={{ display: "block", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
              <line x1="6" y1="126" x2="126" y2="126" stroke="var(--line)" />
              <line x1="6" y1="6" x2="6" y2="126" stroke="var(--line)" />
              <line x1="6" y1="6" x2="126" y2="6" stroke="var(--line)" strokeDasharray="3 4" />
              <path d={curve(...cd.c)} fill="none" stroke="var(--orange-500)" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <div className="ms-track">
              <div className="ms-ball" style={{ transform: "translateX(0)", animation: `ms-roll-${cd.spring ? "s" : "e"} 1100ms var(${cd.name}) 120ms both` }}></div>
            </div>
            <p className="ms-tok-use" style={{ marginTop: 10 }}>{cd.role}</p>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes ms-roll-e{from{transform:translateX(0)}to{transform:translateX(calc(100% - 42px))}}
        @keyframes ms-roll-s{from{transform:translateX(0)}to{transform:translateX(calc(100% - 42px))}}
      `}</style>
    </div>
  );
}

function DurationDemo() {
  const [tick, replay] = useReplay();
  const rows = [
    { name: "--t-micro", ms: 120, use: "悬停 / 按压反馈" },
    { name: "--t-base", ms: 200, use: "多数状态切换 · 开关 · 预览刷新淡入" },
    { name: "--t-enter", ms: 320, use: "元素 / 列表项进入 · 对话框弹入" },
    { name: "--t-celebrate", ms: 600, use: "成功印章 / 庆祝 / 勾选描线(唯一情绪峰值)" },
  ];
  return (
    <div className="ms-stage" key={tick}>
      <Replay onClick={replay} label="一起跑" />
      <div style={{ marginTop: 6 }}>
        {rows.map((r) => (
          <div className="ms-bar-row" key={r.name}>
            <span className="ms-bar-name">{r.name}</span>
            <div className="ms-bar-track">
              <div className="ms-bar-fill" style={{ animation: `ms-fill ${r.ms}ms var(--ease) 150ms forwards` }}></div>
            </div>
            <span className="ms-bar-num">{r.ms}ms</span>
          </div>
        ))}
      </div>
      <p className="ms-tok-use" style={{ margin: "4px 0 0" }}>同时起跑 — 长度差就是「快慢手感」差。越接近导航/输入越快,越接近成就感越慢。</p>
      <style>{`@keyframes ms-fill{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}

function DisplacementDemo() {
  const [tick, replay] = useReplay();
  const items = [
    { tok: "--d-press", px: 1, use: "按压下沉" },
    { tok: "--d-nudge", px: 4, use: "悬停抬起" },
    { tok: "--d-rise", px: 10, use: "进入上浮" },
    { tok: "--d-pop", px: 12, use: "对话框弹入" },
    { tok: "--d-slide", px: 16, use: "页面横切" },
  ];
  return (
    <div className="ms-stage" key={tick}>
      <Replay onClick={replay} />
      <div className="ms-disp-row" style={{ marginTop: 8 }}>
        {items.map((it) => (
          <div className="ms-disp" key={it.tok}>
            <div className="ms-disp-cell">
              <div className="ms-disp-dot" style={{ "--amt": it.px + "px", animation: "ms-disp 420ms var(--ease) 120ms both" }}></div>
            </div>
            <span className="ms-tok-val">{it.px}px</span>
            <span className="ms-tok-name" style={{ fontSize: 12 }}>{it.tok}</span>
            <span className="ms-tok-use" style={{ fontSize: 12 }}>{it.use}</span>
          </div>
        ))}
      </div>
      <p className="ms-tok-use" style={{ margin: "16px 0 0" }}>位移刻度刻意短。这是个温和、可信赖的工具,不是会乱跳的玩具——能用 10px 说清的,绝不用 40px。</p>
      <style>{`@keyframes ms-disp{from{transform:translateY(var(--amt));opacity:.25}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}

// ============================================================
// PATTERN DEMOS
// ============================================================
function PageDemo() {
  const [tick, replay] = useReplay();
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall" key={tick} style={{ padding: 18 }}>
        <Replay onClick={replay} />
        <div style={{ position: "relative", height: 240, borderRadius: "var(--r-md)", overflow: "hidden", margin: "0 auto", maxWidth: 320 }}>
          <div className="ms-screen" style={{ animation: "mb-page-out 200ms var(--ease) forwards" }}>
            <div className="ms-skelbar" style={{ width: "55%", height: 18 }}></div>
            <div className="ms-skelbar" style={{ width: "100%" }}></div>
            <div className="ms-skelbar" style={{ width: "82%" }}></div>
            <div style={{ marginTop: "auto", fontSize: 12, color: "var(--ink-faint)" }}>起稿台</div>
          </div>
          <div className="ms-screen" style={{ animation: "mb-page-in var(--t-enter) var(--ease) 90ms both", background: "var(--surface-2)" }}>
            <div className="ms-skelbar" style={{ width: "45%", height: 18, background: "var(--orange-100)" }}></div>
            <div className="ms-skelbar" style={{ width: "100%" }}></div>
            <div className="ms-skelbar" style={{ width: "70%" }}></div>
            <div style={{ marginTop: "auto", fontSize: 12, color: "var(--orange-600)", fontWeight: 600 }}>写作流 · /new</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListDemo() {
  const [tick, replay] = useReplay();
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall" key={tick}>
        <Replay onClick={replay} />
        <div className="u-stagger" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 30 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="ms-minicard" key={i} style={{ "--i": i }}>
              <div className="ms-skelbar" style={{ width: "70%", height: 13 }}></div>
              <div className="ms-skelbar" style={{ width: "100%", height: 9 }}></div>
              <div className="ms-skelbar" style={{ width: "55%", height: 9 }}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PressDemo() {
  const [picked, setPicked] = React.useState("暖心");
  const [on, setOn] = React.useState(true);
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage" style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="primary" leading={<IconSparkle size={17} />}>让 AI 帮我写</Button>
          <Button variant="secondary">套用模板</Button>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {["暖心", "干练", "活泼"].map((t) => (
            <Chip key={t} on={picked === t} onClick={() => setPicked(t)}>{t}</Chip>
          ))}
          <Switch on={on} onChange={setOn} />
        </div>
        <p className="ms-tok-use" style={{ margin: 0 }}>直接点 — 按下 1px 下沉、松开归位;chip 选中橙色填充;开关拨柄 spring 滑动。反馈即时(120ms),让人确信「点到了」。</p>
      </div>
    </div>
  );
}

function StreamDemo() {
  const [tick, replay] = useReplay();
  const rm = React.useContext(RM);
  const STAGES = ["立意", "行文", "制版"];
  const TITLE = "周末带娃逛公园的小确幸";
  const BODY = "阳光正好,推着婴儿车慢慢走。她盯着一片飘下的叶子看了很久——原来快乐可以这么简单。";
  const [stage, setStage] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  React.useEffect(() => {
    let timers = [];
    setStage(0); setTitle(""); setBody("");
    if (rm) { setStage(2); setTitle(TITLE); setBody(BODY); return; }
    timers.push(setTimeout(() => setStage(1), 500));
    let ti = 0;
    const titleIv = setInterval(() => {
      ti++; setTitle(TITLE.slice(0, ti));
      if (ti >= TITLE.length) {
        clearInterval(titleIv);
        let bi = 0;
        const bodyIv = setInterval(() => {
          bi++; setBody(BODY.slice(0, bi));
          if (bi === 6) setStage(2);
          if (bi >= BODY.length) clearInterval(bodyIv);
        }, 34);
        timers.push(bodyIv);
      }
    }, 46);
    timers.push(titleIv);
    return () => timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  }, [tick, rm]);
  const wc = title.length + body.length;
  const done = body.length >= BODY.length;
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall">
        <Replay onClick={replay} />
        <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 20, marginTop: 18 }}>
          <div className="ms-rail">
            {STAGES.map((s, i) => (
              <div key={s} className={cx("ms-railnode", i < stage && "done", i === stage && !done && "active", i === stage && done && "done")}>
                <span className="ms-raildot"></span>{s}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 19, fontWeight: 700, color: "var(--ink-strong)", minHeight: 26, lineHeight: 1.4 }}>
              {title}{!done && title.length < TITLE.length && <span className="mb-caret"></span>}
            </div>
            <p className="t-body" style={{ margin: "10px 0 0", minHeight: 60 }}>
              {body || <span style={{ color: "var(--ink-faint)" }}>AI 正在落笔…</span>}
              {!done && title.length >= TITLE.length && <span className="mb-caret"></span>}
            </p>
            <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600,
              color: done ? "var(--success-ink)" : "var(--orange-700)", background: done ? "var(--success-soft)" : "var(--orange-50)",
              padding: "4px 11px", borderRadius: "var(--r-pill)" }}>
              {done ? <IconCheck size={13} sw={2.4} /> : <span className="mb-caret" style={{ height: 11 }}></span>}
              {done ? "校样通过 · " : "实时 "}{wc} 字
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  left: 6 + i * 5.7 + "%", delay: (i % 5) * 0.09 + "s",
  color: ["var(--orange-400)", "var(--success)", "var(--info)", "var(--warning)"][i % 4],
}));
function CelebrateDemo() {
  const [tick, replay] = useReplay();
  const rm = React.useContext(RM);
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall" key={tick} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Replay onClick={replay} />
        {!rm && CONFETTI.map((c, i) => <span key={i} className="ms-confetti" style={{ left: c.left, background: c.color, animationDelay: c.delay }}></span>)}
        <div className="mb-pop" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "mb-pop var(--t-enter) var(--ease-spring)" }}>
          <CheckBurst size={58} />
          <div className="ms-stamp2">校样通过</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 21, fontWeight: 700, color: "var(--ink-strong)" }}>写好啦,看看效果?</div>
          <div className="u-stagger" style={{ display: "flex", gap: 9 }}>
            <span style={{ "--i": 3 }}><Button variant="primary" size="sm" leading={<IconCopy size={15} />}>复制到公众号</Button></span>
            <span style={{ "--i": 4 }}><Button variant="secondary" size="sm" leading={<IconEye size={15} />}>看看效果</Button></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyDemo() {
  const [tick, replay] = useReplay();
  const rm = React.useContext(RM);
  const [phase, setPhase] = React.useState("idle"); // idle→checking→ready→done
  React.useEffect(() => {
    setPhase("idle");
    const t1 = setTimeout(() => setPhase("checking"), 300);
    const t2 = setTimeout(() => setPhase("ready"), rm ? 350 : 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [tick, rm]);
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Replay onClick={replay} />
        {phase !== "done" && (
          <div className="mb-card" style={{ padding: 22, maxWidth: 300, width: "100%", textAlign: "center", animation: "mb-pop var(--t-enter) var(--ease)" }}>
            <div className="t-heading" style={{ fontSize: 17, marginBottom: 6 }}>就差最后一步</div>
            <p className="t-small" style={{ margin: "0 0 16px" }}>
              {phase === "checking" ? "正在校验兼容性…" : "排版已处理好,点一下写入剪贴板。"}
            </p>
            <Button variant="primary" size="md" disabled={phase !== "ready"} loading={phase === "checking"}
              leading={phase === "ready" ? <IconCopy size={16} /> : null}
              onClick={() => setPhase("done")} style={{ width: "100%" }}>
              {phase === "checking" ? "校验中…" : "点此复制到剪贴板"}
            </Button>
          </div>
        )}
        {phase === "done" && (
          <div className="mb-card" style={{ padding: 24, maxWidth: 300, width: "100%", textAlign: "center", animation: "mb-pop var(--t-enter) var(--ease-spring)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><CheckBurst size={50} /></div>
            <div className="t-heading" style={{ fontSize: 17, marginBottom: 4 }}>已复制到剪贴板</div>
            <p className="t-small" style={{ margin: 0 }}>去公众号后台粘贴即可,排版原样保留。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [kind, setKind] = React.useState("spring");
  const show = (k) => { setKind(k); setClosing(false); setOpen(true); };
  const close = () => { setClosing(true); setTimeout(() => { setOpen(false); setClosing(false); }, 190); };
  return (
    <div className="ms-pat-stage">
      <div className="ms-stage tall" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Button variant="secondary" size="sm" onClick={() => show("spring")}>愉悦弹窗</Button>
        <Button variant="danger" size="sm" onClick={() => show("plain")}>阻断弹窗</Button>
        {open && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(58,40,22,.34)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            animation: `${closing ? "mb-overlay-out" : "mb-fade"} var(--t-base) var(--ease) both` }} onClick={close}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--r-2xl)", boxShadow: "var(--sh-xl)",
              maxWidth: 320, width: "100%", padding: 22,
              animation: closing
                ? "mb-dialog-out 190ms var(--ease) both"
                : `mb-dialog-in var(--t-enter) ${kind === "spring" ? "var(--ease-spring)" : "var(--ease)"} both` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: kind === "spring" ? "var(--success-soft)" : "var(--danger-soft)", color: kind === "spring" ? "var(--success)" : "var(--danger)" }}>
                  {kind === "spring" ? <IconCheck size={20} sw={2.4} /> : <IconWarn size={20} />}
                </span>
                <div className="t-heading" style={{ fontSize: 17 }}>{kind === "spring" ? "公众号已连接" : "有 2 处会被微信剥离"}</div>
              </div>
              <p className="t-small" style={{ margin: "0 0 16px" }}>
                {kind === "spring" ? "测试通过,现在可以发草稿了。" : "这些样式发出去会丢失,建议先修正再复制。"}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={close}>知道了</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Pattern({ n, title, flag, children, recipe, note }) {
  return (
    <div className="ms-pat">
      <div className="ms-pat-hd">
        <div className="ms-pat-title">
          <span className="ms-tok-val" style={{ color: "var(--orange-500)" }}>{n}</span>
          <h3>{title}</h3>
          <span style={{ marginLeft: "auto" }}><Flag kind={flag} /></span>
        </div>
      </div>
      {children}
      <div className="ms-pat-body">
        <div className="ms-recipe">{recipe}</div>
        <p className="ms-note">{note}</p>
      </div>
    </div>
  );
}

// ============================================================
// EMOTION MAP
// ============================================================
function EmotionMap() {
  const stages = [
    { lab: "起稿台", v: 1 }, { lab: "一句话意图", v: 1 }, { lab: "受众/调子", v: 1 },
    { lab: "连接 AI", v: 1 }, { lab: "流式生成", v: 3 }, { lab: "成功庆祝", v: 3 },
    { lab: "编辑预览", v: 1 }, { lab: "复制确认", v: 2 }, { lab: "设置", v: 0 },
  ];
  const H = [10, 46, 84, 128];
  const col = (v) => v >= 2 ? "var(--orange-500)" : v === 1 ? "var(--orange-200)" : "var(--line-strong)";
  return (
    <div className="ms-stage">
      <div className="ms-emap" style={{ minHeight: 150 }}>
        {stages.map((s) => (
          <div className="ms-emap-col" key={s.lab}>
            <div className="ms-emap-bar" style={{ height: H[s.v], background: col(s.v) }}></div>
            <div className="ms-emap-lab">{s.lab}</div>
          </div>
        ))}
      </div>
      <p className="ms-tok-use" style={{ margin: "14px 0 0" }}>
        全程安静专注,只在 <b style={{ color: "var(--orange-600)" }}>流式生成 → 成功庆祝</b> 这一段把音量调满——这是产品唯一的情绪峰值,值得最重的笔墨。复制确认是个小高光。设置、导航、表单一律克制:动效只为「确认操作发生」,不抢戏。
      </p>
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================
function MotionSpec() {
  const [rm, setRm] = React.useState(false);
  return (
    <RM.Provider value={rm}>
      <div className={cx("ms-page", rm && "ms-rmsim")}>
        <header className="ms-hd">
          <BrandMark size={30} />
          <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink-strong)" }}>MBEditor</div>
          <div className="ms-tok-val" style={{ color: "var(--ink-faint)" }}>· 动效规范</div>
          <div className="grow"></div>
          <label className="ms-rm">
            模拟 <span className="ms-tok-name" style={{ fontSize: 12 }}>prefers-reduced-motion</span>
            <Switch on={rm} onChange={setRm} />
          </label>
        </header>

        <div className="ms-hero">
          <div className="ms-eyebrow"><IconSparkle size={15} sw={2} />Motion · P10 统一收尾</div>
          <h1 className="t-display-xl" style={{ margin: 0 }}>会写会排版的小帮手,<br />动起来也得有分寸。</h1>
          <p className="ms-lead t-body-lg">
            一套贯穿起稿台 / 写作流 / 编辑器 / 设置的连贯动效语言。原则只有一句:<b>平时安静,峰值有戏</b>。
            动效用来确认操作、降低焦虑、在成稿那一刻给一次真诚的高兴——绝不为炫技而动。下面每个示例都可重播,右上角开关可一键预览无障碍降级。
          </p>
        </div>

        {/* principles */}
        <Section n="00" title="四条原则" desc="先立规矩,再谈细节。所有具体数值都是这四条的产物。">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              ["情绪集中在峰值", "80% 的界面静默克制,把全部动效预算押在「流式生成 → 成功庆祝」这一段。处处都热闹 = 处处都不珍贵。"],
              ["移动路径要短", "位移刻度封顶 16px。温和、可信赖,不是会乱跳的玩具。能用淡入说清的,就别用大位移。"],
              ["反馈即时、收尾温和", "按压/悬停 120ms 立刻回应;状态切换 200ms 用 ease-out 平稳落地。回弹 spring 只留给值得高兴的瞬间。"],
              ["任何动效都能降级", "所有进入动画都从隐藏 → 可见,reduced-motion 下直接落到终态;循环动画停在一帧。功能不依赖动效。"],
            ].map(([h, b]) => (
              <div className="ms-callout" key={h}>
                <div className="t-heading" style={{ fontSize: 16 }}>{h}</div>
                <p className="t-small" style={{ margin: 0 }}>{b}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* easing */}
        <Section n="01" title="缓动 · Easing" desc="只有两条曲线。默认温和收尾,回弹只在庆祝时刻出现——这条纪律本身就是一致性的来源。">
          <EasingDemo />
        </Section>

        {/* duration */}
        <Section n="02" title="时长 · Duration" desc="四档时长,越靠近操作越快、越靠近成就感越慢。同屏多个动画时长统一,避免参差。">
          <DurationDemo />
        </Section>

        {/* displacement */}
        <Section n="03" title="位移 · Displacement" desc="元素移动多远,也成一套刻度。统一的位移让不同界面的进入动作「像同一个人做的」。">
          <DisplacementDemo />
        </Section>

        {/* emotion map */}
        <Section n="04" title="情绪强度地图" desc="把动效预算画在主漏斗上:哪里该放大、哪里该闭嘴。这张图是「在哪用力」的总纲。">
          <EmotionMap />
        </Section>

        {/* pattern gallery */}
        <Section n="05" title="模式库 · 七类规范动作" desc="主漏斗里反复出现的动作,各给一份可重播的标准实现。每张卡标注该强化情绪还是克制,并附 token 配方。">
          <div className="ms-grid">
            <Pattern n="5.1" title="页面切换" flag="calm"
              recipe={"出场 mb-page-out 200ms ease\n入场 mb-page-in 320ms ease · +90ms 错峰\n位移 --d-slide 16px · 仅淡入+轻移,无缩放"}
              note={<>路由是骨架,不该有戏。<b>交叉淡入 + 16px 轻移</b>足够给方向感;统一返回起稿台,绝不左右乱滑。</>}>
              <PageDemo />
            </Pattern>

            <Pattern n="5.2" title="列表进入 · 错峰" flag="calm"
              recipe={"每项 mb-rise-in 320ms ease both\n错峰 delay = --i × --stagger(55ms)\n位移 --d-rise 10px · 错峰封顶 ~6 项"}
              note={<>「最近的文章」「模板墙」入场。<b>错峰让网格有节奏</b>,但超过 6 项就停止累加延迟,否则末项等太久——克制优先于花哨。</>}>
              <ListDemo />
            </Pattern>

            <Pattern n="5.3" title="按压 / 选择反馈" flag="calm"
              recipe={"按钮 :active translateY(1px) scale(.99) 120ms\nchip 选中:橙填充 + 边框,all 120ms\n开关拨柄:translateX spring 200ms"}
              note={<>高频微交互,要的是<b>「点到了」的确定感</b>,不是表演。120ms 即时回应,松手归位。开关拨柄是唯一允许 spring 的微交互。</>}>
              <PressDemo />
            </Pattern>

            <Pattern n="5.4" title="流式生成剧场" flag="amp"
              recipe={"工序点 pending→active(脉冲)→done\n标题/正文逐字 + mb-caret 闪烁光标\n实时字数 · 禁止空 loading 转圈"}
              note={<>产品的<b>情绪引擎</b>。「亲眼看 AI 一个字一个字写出来」把等待变成奖励——这里值得不计成本地用力,唯一的例外是逐字本身必须够轻够快。</>}>
              <StreamDemo />
            </Pattern>

            <Pattern n="5.5" title="成功庆祝层" flag="amp"
              recipe={"印章 mb-stamp 600ms spring(scale+rotate)\n勾选 mb-check 描线 600ms\nconfetti 语义点缀 + 按钮错峰升起"}
              note={<>产品<b>唯一的情绪峰值</b>。印章回弹 + 勾选描线 + 克制的 confetti 给「我也能做出好看推文」的高光,但下一步交还用户——绝不自动跳转。</>}>
              <CelebrateDemo />
            </Pattern>

            <Pattern n="5.6" title="复制确认 · 二次点击" flag="amp"
              recipe={"校验中 spinner → ready 弹入\n用户再点一次 → 成功面板 spring 弹入\n勾选描线 + 可停留确认"}
              note={<>「再点一次才写剪贴板」是<b>浏览器硬要求</b>(写入须发生在最新一次点击),不是 UX 选择。把它做成一个有仪式感的小高光,而非恼人的多余步骤。</>}>
              <CopyDemo />
            </Pattern>

            <Pattern n="5.7" title="对话框入场 / 退场" flag="calm"
              recipe={"遮罩 mb-fade / mb-overlay-out 200ms\n入场 mb-dialog-in 320ms · 12px+scale.96\n退场 mb-dialog-out 190ms drop 8px"}
              note={<>愉悦类(连接成功)用 spring 弹入;<b>阻断类(校验拦截)用平直 ease,不许回弹</b>——严肃的提示不该显得轻佻。点此试两种语气。</>}>
              <DialogDemo />
            </Pattern>

            <div className="ms-pat" style={{ justifyContent: "center", padding: 24, gap: 12 }}>
              <div className="t-heading" style={{ fontSize: 16 }}>哪里该闭嘴</div>
              <p className="t-small" style={{ margin: 0 }}>
                设置项保存、表单校验、健康灯、预览刷新、tab 切换——这些<b style={{ color: "var(--ink-strong)" }}>不进情绪库</b>。
                只用最小的淡入 / 色彩过渡确认「发生了」,时长 ≤200ms,无位移、无回弹、无 confetti。安静是默认,热闹要申请。
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Tag color="neutral">保存 · 色变</Tag>
                <Tag color="neutral">校验 · 边框</Tag>
                <Tag color="neutral">预览 · 淡入</Tag>
                <Tag color="neutral">健康灯 · 静默</Tag>
              </div>
            </div>
          </div>
        </Section>

        {/* reduced motion */}
        <Section n="06" title="无障碍降级 · prefers-reduced-motion" desc="顶部开关已可实时预览。一条全局规则兜底,任何屏都不会因为关掉动效而丢失信息或落到隐藏态。">
          <div className="ms-callout" style={{ borderLeftColor: "var(--info)", marginBottom: 20 }}>
            <div className="ms-recipe" style={{ background: "transparent", border: "none", padding: 0, color: "var(--ink)" }}>{`@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;   /* 停掉光标闪烁 / spinner / 脉冲 */
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}`}</div>
          </div>
          <div className="ms-2col">
            <div className="ms-keep go">
              <h4>保留(信息 / 状态)</h4>
              <ul>
                <li>淡入与颜色 / 边框过渡——只是瞬间完成,仍传达「状态变了」。</li>
                <li>所有进入动画的<b>终态</b>:因为都从隐藏→可见,降级后直接显示最终内容。</li>
                <li>流式逐字本身(它是内容呈现,不是装饰),光标改为静止。</li>
                <li>勾选 / 印章的<b>结果</b>(成功语义),只是不再描线 / 回弹。</li>
              </ul>
            </div>
            <div className="ms-keep no">
              <h4>移除 / 冻结(纯装饰)</h4>
              <ul>
                <li>位移与缩放:页面横切、列表上浮、对话框弹入 → 直接到位。</li>
                <li>spring 回弹、印章旋转 → 平直落地。</li>
                <li>confetti、脉冲光环、悬停抬起 → 不播放。</li>
                <li>循环动画(光标闪烁 / spinner / 健康灯脉冲)→ 停在一帧。</li>
              </ul>
            </div>
          </div>
          <p className="ms-tok-use" style={{ margin: "20px 0 0" }}>
            自查口诀:把所有动效关掉后,这屏还能<b style={{ color: "var(--ink-strong)" }}>看懂、能操作、不丢内容</b>吗?能,才算合格。动效是锦上添花,从不是信息的载体。
          </p>
        </Section>
      </div>
    </RM.Provider>
  );
}

Object.assign(window, { MotionSpec });
