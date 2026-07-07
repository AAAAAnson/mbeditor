// MBEditor · Direction A — Editor shared parts (P7)
// WeChat-effect preview card (the restrained "公众号文章卡"), rich-text
// toolbar, raw interactive iframe preview, compatibility badge, health dot.
// Hard rule: NO emoji — every glyph is inline SVG. Tokens from ds/theme.css.
// Exports to window for cross <script type=text/babel> use.

(function injectEdParts() {
  if (document.getElementById("mbe-parts-css")) return;
  const s = document.createElement("style");
  s.id = "mbe-parts-css";
  s.textContent = `
  /* ---------- rich-text toolbar ---------- */
  .mbe-tb{display:flex;align-items:center;gap:3px;}
  .mbe-tbbtn{width:34px;height:34px;border-radius:var(--r-sm);border:none;background:transparent;color:var(--ink-soft);
    display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;
    transition:background var(--t-micro) var(--ease),color var(--t-micro) var(--ease);}
  .mbe-tbbtn:hover{background:var(--surface-2);color:var(--ink-strong);}
  .mbe-tbbtn.on{background:var(--orange-50);color:var(--orange-700);}
  .mbe-tbbtn .gl{font-family:var(--f-display);font-size:17px;font-weight:700;line-height:1;}
  .mbe-tbbtn .gl.it{font-style:italic;font-weight:600;}
  .mbe-tbsep{width:1px;height:20px;background:var(--line);margin:0 5px;flex:none;}

  /* ---------- WeChat-effect article card ---------- */
  /* Deliberately restrained — reads like a real 公众号 article, NOT a fancy
     app surface. White paper, system reading type, hairline frame. */
  .wx-stage{height:100%;overflow-y:auto;background:var(--bg-sunk);
    display:flex;flex-direction:column;align-items:center;padding:30px 24px 64px;}
  .wx-paperwrap{width:100%;max-width:496px;}
  .wx-meta-mode{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;
    font-size:12.5px;color:var(--ink-soft);}
  .wx-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-sm);
    overflow:hidden;}
  .wx-edit-ring{outline:none;}
  .wx-edit-ring.editing{box-shadow:var(--sh-sm),0 0 0 2px var(--orange-200);}
  .wx-inner{padding:26px 24px 30px;}
  .wx-title{font-size:21px;font-weight:600;line-height:1.5;color:#222;margin:0 0 16px;letter-spacing:.2px;
    text-wrap:pretty;-webkit-font-smoothing:antialiased;font-family:var(--f-sans);}
  .wx-byline{display:flex;align-items:center;gap:8px;margin-bottom:22px;font-size:13px;}
  .wx-author{color:#576b95;font-weight:500;}
  .wx-dot{color:var(--ink-faint);}
  .wx-time{color:#9b9b9b;}
  .wx-body{font-size:16px;line-height:1.78;color:#3f3f3f;font-family:var(--f-sans);letter-spacing:.2px;}
  .wx-body p{margin:0 0 18px;}
  .wx-body p:last-child{margin-bottom:0;}
  .wx-divider{text-align:center;margin:24px 0;}
  .wx-figure{margin:22px 0;border-radius:8px;overflow:hidden;background:#f2efea;border:1px solid var(--line);}
  .wx-figcap{font-size:12.5px;color:#9b9b9b;text-align:center;margin:8px 0 0;}

  /* editing affordance: contentEditable focus */
  [contenteditable].wx-body:focus,[contenteditable].wx-title:focus{outline:none;}

  /* ---------- preview hint banner ---------- */
  .mbe-hint{display:flex;align-items:flex-start;gap:9px;margin-bottom:14px;padding:10px 13px;border-radius:var(--r-md);
    font-size:12.5px;line-height:1.55;background:var(--info-soft);color:var(--info-ink);border:1px solid color-mix(in srgb,var(--info) 22%,transparent);}
  .mbe-hint .hi{flex:none;margin-top:1px;}
  .mbe-hint b{font-weight:700;}

  /* ---------- compatibility badge ---------- */
  .mbe-badge{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-pill);
    font-size:12.5px;font-weight:600;cursor:pointer;border:1.5px solid transparent;background:transparent;
    transition:all var(--t-micro) var(--ease);}
  .mbe-badge.ok{color:var(--success-ink);background:var(--success-soft);}
  .mbe-badge.warn{color:var(--warning-ink);background:var(--warning-soft);}
  .mbe-badge.err{color:var(--danger-ink);background:var(--danger-soft);}
  .mbe-badge:hover{filter:brightness(.97);}

  /* ---------- health dot ---------- */
  .mbe-health{width:9px;height:9px;border-radius:50%;background:var(--success);opacity:.55;flex:none;}
  .mbe-health.down{opacity:1;background:var(--danger);cursor:pointer;
    box-shadow:0 0 0 0 var(--danger-soft);animation:mbe-hpulse 1.8s var(--ease) infinite;}
  @keyframes mbe-hpulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--danger) 40%,transparent);}50%{box-shadow:0 0 0 5px transparent;}}

  /* ---------- raw iframe ---------- */
  .mbe-rawframe{width:100%;border:1px solid var(--line);border-radius:var(--r-md);background:#fff;
    box-shadow:var(--sh-sm);display:block;}
  `;
  document.head.appendChild(s);
})();

// ── article content (the banyan/植物园 piece, shared with compose) ──
const WX_TITLE = "周末带娃逛了趟植物园,他认识了第一片银杏";
const WX_AUTHOR = "闲读笔记";
const WX_TIME = "今天";
const WX_PARAS = [
  "原本只想随便走走,没想到他蹲在落叶堆里,看了整整二十分钟。",
  "那天阳光很好,风一吹,银杏叶就簌簌地落下来,铺了满地金黄。他伸手去接,接到一片就举得高高的,回头冲我笑。",
  "回来的路上他一直问:叶子为什么会变黄呀?我说,因为它们忙了一整年,到了秋天,想换身新衣裳歇一歇。",
  "他似懂非懂地点点头,把那片银杏小心地夹进了书里。",
  "后来我才慢慢明白,带娃最好的时刻,从不是去了多远的地方,而是和他一起,认认真真地看一片叶子,落下来。",
];
const WX_WORDS = (WX_TITLE + WX_PARAS.join("")).replace(/\s/g, "").length;

// the animated SVG divider — inline styles + SMIL animate so the interactive
// preview & SMIL warning have something real to act on.
function GinkgoDivider() {
  return (
    <div className="wx-divider">
      <svg width="132" height="32" viewBox="0 0 132 32" fill="none" aria-hidden="true">
        <path d="M10 22 Q66 8 122 22" stroke="#E8A33A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <g transform="translate(66 16)">
          <path d="M0 6 C-7 2 -9 -6 0 -9 C9 -6 7 2 0 6 Z" fill="#E8A33A" opacity="0.9">
            <animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="3.6s" repeatCount="indefinite" />
          </path>
          <path d="M0 6 L0 11" stroke="#C77A1F" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

// ── toolbar ──────────────────────────────────────────────────────────────
function TbBtn({ on, title, glyph, children, ...rest }) {
  return (
    <button className={cx("mbe-tbbtn", on && "on")} title={title} {...rest}>
      {glyph ? <span className={cx("gl", glyph.it && "it")}>{glyph.t}</span> : children}
    </button>
  );
}
const ti = { size: 19, sw: 1.85 };
const EdHeading = (p) => <Icon {...ti} {...p}><path d="M6 5v14M14 5v14M6 12h8" /></Icon>;
const EdQuote   = (p) => <Icon {...ti} {...p}><path d="M9 8H6v4h3v-1c0 1.6-.7 2.6-2.2 3.2M18 8h-3v4h3v-1c0 1.6-.7 2.6-2.2 3.2" /></Icon>;
const EdList    = (p) => <Icon {...ti} {...p}><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" /></Icon>;
const EdLink    = (p) => <Icon {...ti} {...p}><path d="M9.5 14.5l5-5" /><path d="M12 7l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5L16.5 11.5" /><path d="M12 17l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5L7.5 12.5" /></Icon>;
const EdImage   = (p) => <Icon {...ti} {...p}><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><circle cx="8.5" cy="10" r="1.6" /><path d="M20 15.5l-4.5-4.5L6 19" /></Icon>;
const EdUndo    = (p) => <Icon {...ti} {...p}><path d="M8.5 7L4 11.5l4.5 4.5" /><path d="M4 11.5h10a5.5 5.5 0 0 1 0 11h-2.5" /></Icon>;
const EdRedo    = (p) => <Icon {...ti} {...p}><path d="M15.5 7L20 11.5l-4.5 4.5" /><path d="M20 11.5H10a5.5 5.5 0 0 0 0 11h2.5" /></Icon>;
const EdColor   = (p) => <Icon {...ti} {...p}><path d="M7 16.5L11 6h2l4 10.5M8.4 13h7.2" /></Icon>;
const EdImageUp = (p) => <Icon {...ti} {...p}><path d="M12 16V7M8.5 10.5L12 7l3.5 3.5" /><path d="M5 16v2.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V16" /></Icon>;

function EditorToolbar({ compact = false }) {
  return (
    <div className="mbe-tb">
      <TbBtn title="撤销"><EdUndo /></TbBtn>
      <TbBtn title="重做"><EdRedo /></TbBtn>
      <span className="mbe-tbsep"></span>
      <TbBtn title="加粗" glyph={{ t: "B" }}></TbBtn>
      <TbBtn title="斜体" glyph={{ t: "I", it: true }}></TbBtn>
      <TbBtn title="标题"><EdHeading /></TbBtn>
      <TbBtn title="文字颜色"><EdColor /></TbBtn>
      <span className="mbe-tbsep"></span>
      <TbBtn title="引用"><EdQuote /></TbBtn>
      <TbBtn title="列表"><EdList /></TbBtn>
      <TbBtn title="链接"><EdLink /></TbBtn>
      {!compact && <span className="mbe-tbsep"></span>}
      <TbBtn title="插入图片"><EdImage /></TbBtn>
      {!compact && <TbBtn title="上传图片到素材库"><EdImageUp /></TbBtn>}
    </div>
  );
}

// ── WeChat-effect editable preview ───────────────────────────────────────
function WxArticle({ editing = true, narrow = false }) {
  return (
    <div className={cx("wx-card", "wx-edit-ring", editing && "editing")}>
      <div className="wx-inner">
        <h1 className="wx-title" contentEditable={editing} suppressContentEditableWarning>{WX_TITLE}</h1>
        <div className="wx-byline">
          <span className="wx-author">{WX_AUTHOR}</span>
          <span className="wx-dot">·</span>
          <span className="wx-time">{WX_TIME}</span>
        </div>
        <div className="wx-body" contentEditable={editing} suppressContentEditableWarning>
          <p>{WX_PARAS[0]}</p>
          <p>{WX_PARAS[1]}</p>
          <GinkgoDivider />
          <p>{WX_PARAS[2]}</p>
          <div className="wx-figure" contentEditable={false} style={{ aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={30} stroke="#c3b9a8"><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><circle cx="8.5" cy="10" r="1.6" /><path d="M20 15.5l-4.5-4.5L6 19" /></Icon>
          </div>
          <p className="wx-figcap" contentEditable={false}>那天的满地金黄</p>
          <p>{WX_PARAS[3]}</p>
          <p>{WX_PARAS[4]}</p>
        </div>
      </div>
    </div>
  );
}

// raw srcDoc for the interactive (sandbox, no scripts) preview — SMIL lives.
const WX_RAW_SRCDOC = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:#3f3f3f;background:#fff;}
.w{padding:24px 22px 30px;}h1{font-size:20px;font-weight:600;color:#222;line-height:1.5;margin:0 0 14px;}
.m{font-size:13px;color:#9b9b9b;margin-bottom:20px;}.m b{color:#576b95;font-weight:500;}
p{font-size:16px;line-height:1.78;margin:0 0 18px;letter-spacing:.2px;}.d{text-align:center;margin:22px 0;}</style></head>
<body><div class="w"><h1>周末带娃逛了趟植物园,他认识了第一片银杏</h1>
<div class="m"><b>闲读笔记</b> · 今天</div>
<p>原本只想随便走走,没想到他蹲在落叶堆里,看了整整二十分钟。</p>
<p>那天阳光很好,风一吹,银杏叶就簌簌地落下来,铺了满地金黄。</p>
<div class="d"><svg width="132" height="32" viewBox="0 0 132 32" fill="none">
<path d="M10 22 Q66 8 122 22" stroke="#E8A33A" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<g transform="translate(66 16)"><path d="M0 6 C-7 2 -9 -6 0 -9 C9 -6 7 2 0 6 Z" fill="#E8A33A" opacity="0.9">
<animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="3.6s" repeatCount="indefinite"/></path>
<path d="M0 6 L0 11" stroke="#C77A1F" stroke-width="1.3" stroke-linecap="round"/></g></svg></div>
<p>后来我才慢慢明白,带娃最好的时刻,从不是去了多远的地方,而是和他一起,认认真真地看一片叶子,落下来。</p>
</div></body></html>`;

function RawPreview({ height = 420 }) {
  return (
    <iframe className="mbe-rawframe" title="交互预览" sandbox="allow-popups"
      style={{ height }} srcDoc={WX_RAW_SRCDOC}></iframe>
  );
}

// ── compatibility badge ──
function CompatBadge({ state = "warn", onClick }) {
  if (state === "ok") return <button className="mbe-badge ok" onClick={onClick}><IconCheck size={15} stroke="var(--success-ink)" />兼容 · 可直接发</button>;
  if (state === "err") return <button className="mbe-badge err" onClick={onClick}><IconClose size={14} stroke="var(--danger-ink)" />2 项需修正</button>;
  return <button className="mbe-badge warn" onClick={onClick}><IconWarn size={14} stroke="var(--warning-ink)" />1 处提醒</button>;
}

function HealthDot({ down = false, onClick }) {
  return <span className={cx("mbe-health", down && "down")} title={down ? "写作服务连接中断 · 点击重连" : "服务正常"} onClick={down ? onClick : undefined}></span>;
}

Object.assign(window, {
  WX_TITLE, WX_AUTHOR, WX_TIME, WX_PARAS, WX_WORDS, WX_RAW_SRCDOC,
  GinkgoDivider, TbBtn, EditorToolbar, WxArticle, RawPreview, CompatBadge, HealthDot,
  EdHeading, EdQuote, EdList, EdLink, EdImage, EdUndo, EdRedo, EdColor, EdImageUp,
});
