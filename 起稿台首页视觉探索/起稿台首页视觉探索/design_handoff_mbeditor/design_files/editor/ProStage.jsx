// MBEditor · Direction A — Pro three-column stage (P7)
// StructurePanel (大纲 + 插入) · CenterStage preview · CodeDrawer (Monaco-ish
// HTML/CSS/JS + SVG visual-edit chip) · LintSidebar · IDE status bar.
// Hard约束: this whole surface is pro-only chrome — simple/narrow never mounts it.
// Tokens from ds/theme.css. NO emoji.

(function injectProCss() {
  if (document.getElementById("mbe-pro-css")) return;
  const s = document.createElement("style");
  s.id = "mbe-pro-css";
  s.textContent = `
  .pro-body{flex:1;display:grid;grid-template-columns:218px minmax(300px,1fr) minmax(404px,460px);min-height:0;}
  .pro-col{min-height:0;display:flex;flex-direction:column;}
  .pro-col.struct{border-right:1px solid var(--line);background:var(--surface);}
  .pro-col.center{background:var(--bg-sunk);min-width:0;}
  .pro-col.code{border-left:1px solid var(--line);background:#262017;}

  .pro-cap{display:flex;align-items:center;justify-content:space-between;height:42px;padding:0 14px;flex:none;
    border-bottom:1px solid var(--line);}
  .pro-cap .t{font-size:11.5px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--ink-faint);}
  .pro-cap .add{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:var(--r-sm);
    border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-soft);font-size:12px;font-weight:600;
    cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .pro-cap .add:hover{border-color:var(--orange-300);color:var(--orange-700);background:var(--orange-50);}

  /* structure outline */
  .pro-tree{padding:8px 8px 16px;overflow-y:auto;flex:1;}
  .pro-node{display:flex;align-items:center;gap:8px;height:34px;padding:0 9px;border-radius:var(--r-sm);cursor:pointer;
    font-size:13px;color:var(--ink);transition:background var(--t-micro) var(--ease);position:relative;}
  .pro-node:hover{background:var(--surface-2);}
  .pro-node.sel{background:var(--orange-50);color:var(--orange-800);font-weight:600;}
  .pro-node.child{margin-left:14px;}
  .pro-node .ni{flex:none;color:var(--ink-faint);display:flex;}
  .pro-node.sel .ni{color:var(--orange-600);}
  .pro-node .nt{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .pro-node .nb{font-size:10.5px;font-weight:700;color:var(--orange-700);background:var(--orange-50);
    border:1px solid var(--orange-200);border-radius:var(--r-pill);padding:1px 7px;flex:none;}

  /* center: toolbar + framed preview */
  .pro-centertb{height:46px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;
    border-bottom:1px solid var(--line);background:var(--surface);}
  .pro-zoom{display:flex;align-items:center;gap:9px;color:var(--ink-soft);font-size:12px;}
  .pro-range{appearance:none;width:96px;height:4px;border-radius:2px;background:var(--line-strong);outline:none;cursor:pointer;}
  .pro-range::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;background:var(--orange-500);
    box-shadow:var(--sh-xs);cursor:pointer;}
  .pro-zval{font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink);min-width:38px;}
  .pro-centerwrap{flex:1;overflow:auto;padding:24px;display:flex;justify-content:center;align-items:flex-start;}
  .pro-phone{width:390px;flex:none;background:#fff;border-radius:28px;border:9px solid #2a241c;
    box-shadow:var(--sh-lg);overflow:hidden;position:relative;}
  .pro-phone .notch{height:26px;background:#fff;display:flex;align-items:center;justify-content:center;}
  .pro-phone .notch::after{content:"";width:54px;height:5px;border-radius:3px;background:#d9d2c6;}

  /* code drawer (Monaco-ish) */
  .pro-codetabs{height:42px;flex:none;display:flex;align-items:stretch;gap:0;padding:0 8px;
    border-bottom:1px solid #38301f;background:#201b13;}
  .pro-codetab{display:inline-flex;align-items:center;gap:7px;padding:0 15px;font-size:12.5px;font-weight:600;
    color:#8c8170;background:transparent;border:none;border-bottom:2px solid transparent;cursor:pointer;
    transition:color var(--t-micro) var(--ease);}
  .pro-codetab:hover{color:#cabfa8;}
  .pro-codetab.on{color:#fbf4e8;border-bottom-color:var(--orange-500);}
  .pro-codetab .lang{font-size:10px;font-weight:700;letter-spacing:.5px;color:#6f6452;}
  .pro-codetab.on .lang{color:var(--orange-400);}
  .pro-svgchip{margin-left:auto;align-self:center;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;
    border-radius:var(--r-pill);border:1px solid #4a3f2a;background:#2e2719;color:#d9b88a;font-size:11.5px;font-weight:600;
    cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .pro-svgchip:hover{border-color:var(--orange-500);color:var(--orange-300);}

  .pro-code{flex:1;overflow:auto;font-family:var(--f-mono);font-size:13px;line-height:1.7;padding:12px 0;min-height:0;}
  .pro-line{display:flex;}
  .pro-line:hover{background:rgba(255,255,255,.03);}
  .pro-ln{flex:none;width:42px;text-align:right;padding-right:14px;color:#5b5240;user-select:none;
    font-variant-numeric:tabular-nums;}
  .pro-lc{flex:1;white-space:pre;padding-right:18px;color:#d8cfbe;}
  .ct{color:#e98c66;}    /* tag */
  .ca{color:#d9b88a;}    /* attr */
  .cs{color:#9ec98a;}    /* string */
  .cp{color:#8c8170;}    /* punctuation */
  .cm{color:#6f6452;font-style:italic;} /* comment */

  /* lint sub-panel (bottom of code col) */
  .pro-lint{flex:none;max-height:182px;overflow-y:auto;border-top:1px solid #38301f;background:#221c14;}
  .pro-lintcap{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;position:sticky;top:0;
    background:#221c14;border-bottom:1px solid #2f281b;}
  .pro-lintcap .t{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#7a7060;}
  .pro-lintrow{display:flex;align-items:flex-start;gap:10px;padding:9px 14px;border-bottom:1px solid #2a2318;}
  .pro-lintrow:last-child{border-bottom:none;}
  .pro-lintrow .li{flex:none;margin-top:1px;}
  .pro-lintrow .lt{font-size:12.5px;color:#cabfa8;line-height:1.5;}
  .pro-lintrow .lt b{color:#fbf4e8;font-weight:600;}
  .pro-lintrow .ls{font-size:11px;color:#7a7060;margin-top:2px;line-height:1.45;}

  /* IDE status bar */
  .pro-status{height:30px;flex:none;display:flex;align-items:center;gap:0;padding:0 14px;font-size:11.5px;
    color:var(--cream);background:var(--ink-strong);font-family:var(--f-mono);}
  .pro-status .seg{display:inline-flex;align-items:center;gap:6px;padding:0 12px;opacity:.86;}
  .pro-status .seg+.seg{border-left:1px solid rgba(251,244,232,.16);}
  .pro-status .grow{flex:1;}
  .pro-status .warnseg{color:#f3cf8a;opacity:1;}
  `;
  document.head.appendChild(s);
})();

// ── tiny HTML highlighter → React spans (React escapes text children) ──
function tokenizeHtml(line) {
  const out = [];
  const re = /(<\/?)([a-zA-Z][\w-]*)|([a-zA-Z-]+)(=)("[^"]*")|("[^"]*")|(\/?>)|(<)/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(["x", line.slice(last, m.index)]);
    if (m[1]) { out.push(["cp", m[1]]); out.push(["ct", m[2]]); }
    else if (m[3]) { out.push(["ca", m[3]]); out.push(["cp", m[4]]); out.push(["cs", m[5]]); }
    else if (m[6]) out.push(["cs", m[6]]);
    else if (m[7]) out.push(["cp", m[7]]);
    else if (m[8]) out.push(["cp", m[8]]);
    last = re.lastIndex;
  }
  if (last < line.length) out.push(["x", line.slice(last)]);
  return out;
}

const PRO_CODE = [
  `<!-- 公众号正文 · 仅行内 style 的 HTML/SVG 才进得去 -->`,
  `<section style="font-size:16px;line-height:1.78;color:#3f3f3f">`,
  `  <h1 style="font-size:21px;font-weight:600;color:#222">`,
  `    周末带娃逛了趟植物园`,
  `  </h1>`,
  `  <p style="margin:0 0 18px">`,
  `    原本只想随便走走,没想到他蹲在落叶堆里…`,
  `  </p>`,
  `  <section style="text-align:center;margin:24px 0">`,
  `    <svg width="132" height="32" viewBox="0 0 132 32">`,
  `      <path d="M10 22 Q66 8 122 22" stroke="#E8A33A"`,
  `            stroke-width="1.6" fill="none"/>`,
  `      <path d="M0 6 C-7 2 -9 -6 0 -9 ..." fill="#E8A33A">`,
  `        <animateTransform attributeName="transform"`,
  `          type="rotate" values="-8;8;-8" dur="3.6s"/>`,
  `      </path>`,
  `    </svg>`,
  `  </section>`,
  `  <p style="margin:0">…认认真真地看一片叶子,落下来。</p>`,
  `</section>`,
];

function CodeLine({ n, src }) {
  const toks = src.trimStart().startsWith("<!--")
    ? [["cm", src]]
    : tokenizeHtml(src);
  return (
    <div className="pro-line">
      <span className="pro-ln">{n}</span>
      <span className="pro-lc">{toks.map(([c, t], i) => <span key={i} className={c === "x" ? undefined : c}>{t}</span>)}</span>
    </div>
  );
}

// ── structure outline ──
function NodeIcon({ kind }) {
  if (kind === "title") return <Icon size={16}><path d="M5 7h14M9 7v11" /></Icon>;
  if (kind === "para") return <Icon size={16}><path d="M5 8h14M5 12h14M5 16h9" /></Icon>;
  if (kind === "svg") return <Icon size={16}><path d="M5 5l6 7-6 7M19 5l-6 7 6 7" /></Icon>;
  if (kind === "img") return <Icon size={16}><rect x="4" y="6" width="16" height="12" rx="2" /><circle cx="8.5" cy="11" r="1.4" /><path d="M19 15l-4-4-9 7" /></Icon>;
  return <Icon size={16}><circle cx="12" cy="12" r="7" /></Icon>;
}

function StructurePanel() {
  const nodes = [
    { id: "t", kind: "title", label: "标题 · 周末带娃逛了趟植物园", badge: "H1" },
    { id: "p1", kind: "para", label: "段落 · 原本只想随便走走…", child: true },
    { id: "p2", kind: "para", label: "段落 · 那天阳光很好…", child: true },
    { id: "svg", kind: "svg", label: "互动图形 · 银杏分隔", child: true, sel: true, badge: "SVG" },
    { id: "p3", kind: "para", label: "段落 · 回来的路上…", child: true },
    { id: "img", kind: "img", label: "图片 · 那天的满地金黄", child: true },
    { id: "p4", kind: "para", label: "段落 · 他似懂非懂…", child: true },
    { id: "p5", kind: "para", label: "段落 · 后来我才慢慢明白…", child: true },
  ];
  return (
    <div className="pro-col struct">
      <div className="pro-cap">
        <span className="t">结构</span>
        <button className="add"><Icon size={13} sw={2}><path d="M12 5v14M5 12h14" /></Icon>插入</button>
      </div>
      <div className="pro-tree">
        {nodes.map((n) => (
          <div key={n.id} className={cx("pro-node", n.child && "child", n.sel && "sel")}>
            <span className="ni"><NodeIcon kind={n.kind} /></span>
            <span className="nt">{n.label}</span>
            {n.badge && <span className="nb">{n.badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── code drawer (right column) ──
function CodeDrawer() {
  const [tab, setTab] = React.useState("html");
  const tabs = [{ k: "html", lang: "HTML" }, { k: "css", lang: "CSS" }, { k: "js", lang: "JS" }];
  return (
    <div className="pro-col code">
      <div className="pro-codetabs">
        {tabs.map((t) => (
          <button key={t.k} className={cx("pro-codetab", tab === t.k && "on")} onClick={() => setTab(t.k)}>
            <span className="lang">{t.lang}</span>{t.k === "html" ? "正文" : t.k === "css" ? "样式" : "脚本"}
          </button>
        ))}
        <button className="pro-svgchip"><Icon size={13}><path d="M5 5l6 7-6 7M19 5l-6 7 6 7" /></Icon>可视化编辑 SVG</button>
      </div>
      <div className="pro-code">
        {tab === "html" ? PRO_CODE.map((src, i) => <CodeLine key={i} n={i + 1} src={src} />)
          : <div style={{ padding: "20px 18px", color: "#7a7060", fontSize: 13 }}>
              {tab === "css" ? "/* 主题样式随源码保存,但不进公众号正文 —— 净化时只接受行内 style */" : "// JS 仅随源码保存,不进发布产物,任何预览都不执行"}
            </div>}
      </div>
      <div className="pro-lint">
        <div className="pro-lintcap"><Icon size={13} stroke="#7a7060"><path d="M5 12.5l4.5 4.5L19 7" /></Icon><span className="t">实时校验</span></div>
        <div className="pro-lintrow">
          <span className="li"><IconCheck size={15} stroke="#7bbf9c" /></span>
          <div><div className="lt">未用 <b>flex / grid / position</b> 等会被剥离的写法</div></div>
        </div>
        <div className="pro-lintrow">
          <span className="li"><IconCheck size={15} stroke="#7bbf9c" /></span>
          <div><div className="lt">全部样式已 <b>内联</b>,可安全粘贴</div></div>
        </div>
        <div className="pro-lintrow">
          <span className="li"><IconWarn size={15} stroke="#e6b85f" /></span>
          <div><div className="lt">含 <b>1 处 SVG-SMIL 动画</b></div><div className="ls">复制 / 草稿前会再提醒一次 · 静态首帧仍会显示</div></div>
        </div>
      </div>
    </div>
  );
}

// ── pro center: framed preview with phone + zoom ──
function ProCenter() {
  return (
    <div className="pro-col center">
      <div className="pro-centertb">
        <Segmented value="phone" onChange={() => {}} options={[
          { value: "fit", label: "贴合", icon: <IconEye size={15} /> },
          { value: "phone", label: "手机", icon: <Icon size={15}><rect x="7" y="3" width="10" height="18" rx="2.4" /><path d="M10.5 18.5h3" /></Icon> },
        ]} />
        <span style={{ flex: 1 }}></span>
        <div className="pro-zoom">
          <Icon size={14} stroke="var(--ink-faint)"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4M8.5 11h5" /></Icon>
          <input className="pro-range" type="range" min="40" max="200" defaultValue="100" />
          <span className="pro-zval">100%</span>
        </div>
      </div>
      <div className="pro-centerwrap">
        <div className="pro-phone">
          <div className="notch"></div>
          <div style={{ maxHeight: 640, overflow: "hidden" }}>
            <WxArticle editing={false} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProStage() {
  return (
    <>
      <div className="pro-body">
        <StructurePanel />
        <ProCenter />
        <CodeDrawer />
      </div>
      <div className="pro-status">
        <span className="seg"><Icon size={12} stroke="var(--cream)"><path d="M5 5l6 7-6 7M19 5l-6 7 6 7" /></Icon>HTML · 正文</span>
        <span className="seg">行 12,列 8</span>
        <span className="seg">UTF-8</span>
        <span className="seg">LF</span>
        <span className="grow"></span>
        <span className="seg warnseg"><IconWarn size={12} stroke="#f3cf8a" />1 警告</span>
        <span className="seg">{WX_WORDS} 字</span>
        <span className="seg">三栏</span>
      </div>
    </>
  );
}

Object.assign(window, { ProStage, StructurePanel, CodeDrawer, ProCenter, CodeLine, tokenizeHtml });
