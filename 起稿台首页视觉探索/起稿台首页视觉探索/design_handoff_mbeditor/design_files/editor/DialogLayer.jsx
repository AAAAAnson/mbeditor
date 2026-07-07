// MBEditor · Direction A — Editor dialog / overlay LAYER (P9)
// One coherent overlay language for the whole editor. Severity is graded and
// legible at a glance: info (蓝) < warning-ignorable (琥珀) < block (红);
// plus a neutral PROGRESS state and the orange→green copy ready/success pair.
// Rules honored: 层级清晰 · 与主按钮动作呼应 · 互斥不堆叠 (a progress overlay
// never coexists with a dialog; dialogs replace, never stack).
// Overlays are absolute inside the editor frame so context stays visible.
// Tokens from ds/theme.css. NO emoji — every glyph is inline SVG.

(function injectDialogLayerCss() {
  if (document.getElementById("mbe-dlglayer-css")) return;
  const s = document.createElement("style");
  s.id = "mbe-dlglayer-css";
  s.textContent = `
  /* ---------- editor backdrop (dimmed context behind every veil) ---------- */
  .dl-shell{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);overflow:hidden;}
  .dl-top{height:52px;flex:none;display:flex;align-items:center;gap:12px;padding:0 16px;
    background:var(--surface);border-bottom:1px solid var(--line);}
  .dl-brand{display:flex;align-items:center;gap:9px;}
  .dl-brand .nm{font-family:var(--f-display);font-weight:700;font-size:16px;color:var(--ink-strong);letter-spacing:.2px;}
  .dl-editing{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 13px;border-radius:var(--r-pill);
    background:var(--surface-2);border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--ink-soft);}
  .dl-back{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:var(--r-sm);
    border:none;background:transparent;color:var(--ink-soft);font-family:var(--f-sans);font-size:13.5px;font-weight:600;cursor:pointer;}
  .dl-actionbar{height:54px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;
    background:var(--surface);border-bottom:1px solid var(--line);}
  .dl-tbwrap{flex:1;min-width:0;display:flex;align-items:center;}
  .dl-actions{display:flex;align-items:center;gap:9px;flex:none;}
  .dl-more{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 15px;border-radius:var(--r-md);
    border:1.5px solid var(--line-strong);background:var(--surface);color:var(--ink);font-family:var(--f-sans);
    font-size:14px;font-weight:600;cursor:pointer;}

  /* ---------- veil + sheet ---------- */
  .dl-veil{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:26px;
    background:rgba(58,40,22,.40);backdrop-filter:blur(3px);animation:mb-fade var(--t-base) var(--ease);}
  .dl-veil.busy{background:rgba(58,40,22,.50);}
  .dl-sheet{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-2xl);
    box-shadow:var(--sh-xl);width:100%;overflow:hidden;animation:mb-pop var(--t-enter) var(--ease-spring);}
  /* severity rail: a thin top bar states the tier before you read a word */
  .dl-rail{height:4px;width:100%;}
  .dl-body{padding:24px 26px 8px;}
  .dl-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:13px;}
  .dl-chip{width:46px;height:46px;border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;flex:none;}
  .dl-htext{flex:1;min-width:0;padding-top:1px;}
  .dl-title{font-family:var(--f-display);font-size:20px;font-weight:700;color:var(--ink-strong);line-height:1.32;}
  .dl-tier{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 9px;border-radius:var(--r-pill);
    font-size:11px;font-weight:700;letter-spacing:.4px;margin-bottom:7px;}
  .dl-sub{font-size:13.5px;color:var(--ink-soft);line-height:1.66;margin:0 0 15px;}
  .dl-sub b{color:var(--ink-strong);font-weight:700;}
  .dl-foot{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:13px 26px 22px;}
  .dl-foot.spread{justify-content:space-between;}
  .dl-foot.stack{flex-direction:column;align-items:stretch;}
  .dl-foot.stack > *{width:100%;}
  .dl-footnote{display:flex;align-items:flex-start;gap:8px;margin-top:13px;font-size:12px;color:var(--ink-soft);line-height:1.55;}
  .dl-footnote b{color:var(--ink);font-weight:700;}

  /* ---------- issue / warning rows ---------- */
  .dl-rows{display:flex;flex-direction:column;gap:8px;}
  .dl-row{display:flex;align-items:flex-start;gap:11px;padding:11px 13px;border-radius:var(--r-md);border:1px solid transparent;}
  .dl-row.block{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 22%,transparent);}
  .dl-row.warn{background:var(--warning-soft);border-color:color-mix(in srgb,var(--warning) 28%,transparent);}
  .dl-row .ri{flex:none;margin-top:1px;}
  .dl-row .rt{font-size:13.5px;font-weight:600;line-height:1.5;}
  .dl-row.block .rt{color:var(--danger-ink);}
  .dl-row.warn .rt{color:var(--warning-ink);}
  .dl-row .rc{font-size:11.5px;color:var(--ink-soft);margin-top:3px;font-family:var(--f-mono);}

  /* ---------- callout (info aside) ---------- */
  .dl-callout{display:flex;align-items:flex-start;gap:9px;margin-top:4px;padding:11px 13px;border-radius:var(--r-md);
    background:var(--info-soft);color:var(--info-ink);font-size:12.5px;line-height:1.55;
    border:1px solid color-mix(in srgb,var(--info) 22%,transparent);}
  .dl-callout.amber{background:var(--warning-soft);color:var(--warning-ink);border-color:color-mix(in srgb,var(--warning) 26%,transparent);}
  .dl-callout .ci{flex:none;margin-top:1px;}
  .dl-callout b{font-weight:700;}

  /* ---------- progress stepper ---------- */
  .dl-prog{display:flex;flex-direction:column;gap:0;margin:6px 0 4px;}
  .dl-pstep{display:flex;align-items:center;gap:13px;padding:10px 2px;}
  .dl-pnode{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
    font-family:var(--f-mono);font-size:13px;font-weight:700;position:relative;}
  .dl-pnode.done{background:var(--success);color:var(--cream);}
  .dl-pnode.active{background:var(--orange-500);color:var(--cream);box-shadow:0 0 0 5px var(--orange-50);}
  .dl-pnode.pending{background:var(--bg-sunk);color:var(--ink-faint);border:1.5px solid var(--line-strong);}
  .dl-pconn{position:absolute;left:50%;top:30px;width:2px;height:14px;transform:translateX(-50%);}
  .dl-pconn.done{background:var(--success);}
  .dl-pconn.pending{background:var(--line-strong);}
  .dl-pmeta{flex:1;min-width:0;}
  .dl-plabel{font-size:14px;font-weight:600;color:var(--ink-strong);line-height:1.3;}
  .dl-pstep.is-pending .dl-plabel{color:var(--ink-faint);font-weight:500;}
  .dl-pdesc{font-size:12px;color:var(--ink-soft);margin-top:2px;}
  .dl-pspin{width:15px;height:15px;border-radius:50%;border:2.2px solid rgba(255,255,255,.45);
    border-top-color:#fff;animation:mb-rot .7s linear infinite;}

  /* ---------- success steps (去后台引导) ---------- */
  .dl-steps{display:flex;flex-direction:column;gap:0;margin:4px 0 4px;border:1px solid var(--line);
    border-radius:var(--r-lg);overflow:hidden;background:var(--surface-2);}
  .dl-stepr{display:flex;align-items:center;gap:12px;padding:12px 15px;font-size:13.5px;color:var(--ink);}
  .dl-stepr+.dl-stepr{border-top:1px solid var(--line);}
  .dl-stepn{width:24px;height:24px;border-radius:50%;background:var(--orange-500);color:var(--cream);flex:none;
    display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;font-family:var(--f-mono);}
  .dl-stepr b{font-weight:700;color:var(--ink-strong);}
  .dl-kbd{font-family:var(--f-mono);font-size:12px;font-weight:600;background:var(--bg-sunk);border:1px solid var(--line-strong);
    border-bottom-width:2px;border-radius:5px;padding:1px 7px;color:var(--ink-strong);}

  /* ---------- more-menu (draft = secondary) ---------- */
  .dl-menu{position:absolute;top:calc(100% + 7px);right:0;z-index:30;min-width:248px;background:var(--surface);
    border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-lg);padding:6px;
    animation:mb-pop var(--t-base) var(--ease-spring);}
  .dl-mcap{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-faint);padding:8px 10px 5px;}
  .dl-mitem{display:flex;align-items:center;gap:11px;width:100%;padding:10px 11px;border:none;background:transparent;
    border-radius:var(--r-sm);cursor:pointer;text-align:left;font-family:var(--f-sans);font-size:14px;color:var(--ink);}
  .dl-mitem:disabled{cursor:not-allowed;color:var(--ink-faint);}
  .dl-mitem .mi{flex:none;color:var(--ink-soft);display:flex;}
  .dl-mitem:disabled .mi{color:var(--ink-faint);}
  .dl-mitem .mt{flex:1;}
  .dl-mitem .ms{font-size:11.5px;color:var(--ink-faint);font-weight:500;margin-top:2px;}
  .dl-msep{height:1px;background:var(--line);margin:5px 6px;}

  /* ---------- warning toast (warnings 走轻量 toast 放行,不做拦截式模态) ---------- */
  .dl-toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;
    align-items:center;gap:12px;max-width:520px;width:calc(100% - 48px);background:var(--ink-strong);
    color:var(--cream);border-radius:var(--r-lg);box-shadow:var(--sh-xl);padding:13px 14px 13px 16px;
    animation:mb-rise var(--t-enter) var(--ease) both;}
  .dl-toast .tk{flex:none;width:30px;height:30px;border-radius:50%;background:var(--warning-soft);
    display:flex;align-items:center;justify-content:center;}
  .dl-toast .tm{flex:1;min-width:0;font-size:13.5px;line-height:1.5;}
  .dl-toast .tm b{font-weight:700;color:#fff;}
  .dl-toast .tm .ts{display:block;font-size:11.5px;color:rgba(251,244,232,.62);margin-top:1px;}
  .dl-toast .tbtn{flex:none;height:32px;padding:0 13px;border-radius:var(--r-sm);border:1px solid rgba(251,244,232,.22);
    background:rgba(251,244,232,.08);color:var(--cream);font-family:var(--f-sans);font-size:13px;font-weight:600;
    cursor:pointer;transition:background var(--t-micro) var(--ease);}
  .dl-toast .tbtn:hover{background:rgba(251,244,232,.16);}
  .dl-toast .tbtn:focus-visible{outline:none;box-shadow:var(--ring);}
  .dl-toast .tx{flex:none;width:30px;height:30px;border-radius:var(--r-sm);border:none;background:none;
    color:rgba(251,244,232,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .dl-toast .tx:hover{color:var(--cream);background:rgba(251,244,232,.1);}

  .dl-narrow .dl-foot{flex-direction:column-reverse;align-items:stretch;}
  .dl-narrow .dl-foot.spread > *{width:100%;}
  .dl-narrow .dl-toast{flex-wrap:wrap;}
  .dl-narrow .dl-toast .tm{flex:1 1 70%;}
  `;
  document.head.appendChild(s);
})();

// ── severity palette: one source for chip / rail / tier-tag per tier ──
const DL_TONE = {
  info:    { rail: "var(--info)",    chip: "var(--info-soft)",    ink: "var(--info-ink)",    label: "信息" },
  warn:    { rail: "var(--warning)", chip: "var(--warning-soft)", ink: "var(--warning-ink)", label: "提醒 · 可继续" },
  block:   { rail: "var(--danger)",  chip: "var(--danger-soft)",  ink: "var(--danger-ink)",  label: "必修 · 否则走样" },
  action:  { rail: "var(--orange-500)", chip: "var(--orange-50)", ink: "var(--orange-700)", label: "待你确认" },
  success: { rail: "var(--success)", chip: "var(--success-soft)", ink: "var(--success-ink)", label: "已完成" },
  busy:    { rail: "var(--orange-500)", chip: "var(--orange-50)", ink: "var(--orange-700)", label: "进行中" },
};

// ── unified sheet shell ──────────────────────────────────────────────────
function DlSheet({ tone = "info", icon, tier, title, sub, children, footer, footnote, maxWidth = 452, narrow, busy }) {
  const t = DL_TONE[tone];
  return (
    <div className={cx("dl-veil", busy && "busy", narrow && "dl-narrow")}>
      <div className="dl-sheet" style={{ maxWidth: narrow ? 340 : maxWidth }} role="dialog" aria-modal="true">
        <div className="dl-rail" style={{ background: t.rail }}></div>
        <div className="dl-body">
          <div className="dl-head">
            <span className="dl-chip" style={{ background: t.chip }}>{icon}</span>
            <div className="dl-htext">
              {tier && <span className="dl-tier" style={{ background: t.chip, color: t.ink }}>{tier}</span>}
              <div className="dl-title">{title}</div>
            </div>
          </div>
          {sub && <p className="dl-sub">{sub}</p>}
          {children}
          {footnote && <div className="dl-footnote">{footnote}</div>}
        </div>
        {footer}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 1 · SmilWarningDialog — INFO tier. Graphic kept; animation may fall back.
//     Both copy & draft pass through it. Lowest severity.
// ════════════════════════════════════════════════════════════════════════
function SmilWarningDialog({ narrow, action = "copy" }) {
  return (
    <DlSheet narrow={narrow} tone="info"
      tier={<><DlTierDot c="var(--info)" />信息 · 可继续</>}
      icon={<IconInfo size={24} stroke="var(--info-ink)" />}
      title={<>这篇含一处 SVG 动画(SMIL)</>}
      sub={<>图形本身会<b>完整保留</b>。动画在部分手机客户端能播放,不支持的地方显示静态首帧——内容不会丢,放心继续。</>}
      footnote={<><IconInfo size={14} stroke="var(--ink-faint)" style={{ flex: "none", marginTop: 1 }} /><span>想看动起来,可在编辑器切到<b>「交互预览」</b>。</span></>}
      footer={
        <div className="dl-foot">
          <Button variant="ghost" size="md">取消</Button>
          <Button variant="primary" size="md" trailing={<IconArrow size={17} />}>
            {action === "draft" ? "知道了,继续发布" : "知道了,继续复制"}
          </Button>
        </div>
      } />
  );
}

// ════════════════════════════════════════════════════════════════════════
// 2 · ValidationWarnToast — WARNING tier. 简报 §7-F:warnings 走轻量 toast
//     放行,绝不做成拦截式模态。动作照常继续(复制 / 发布),只是顺手提示
//     有 N 处可人工确认的项,「查看」可回去核对。非阻断、可关闭、不堆叠对话。
// ════════════════════════════════════════════════════════════════════════
function ValidationWarnToast({ action = "copy", count = 2 }) {
  const verb = action === "draft" ? "发布" : "复制";
  return (
    <div className="dl-toast" role="status" aria-live="polite">
      <span className="tk"><IconWarn size={16} stroke="var(--warning-ink)" /></span>
      <span className="tm">
        <b>有 {count} 处提醒,已照常{verb}</b>
        <span className="ts">这些不会被公众号丢弃,只是建议你回头核对一下。</span>
      </span>
      <button className="tbtn">查看</button>
      <button className="tx" aria-label="关闭"><IconClose size={15} /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 3 · ValidationBlockDialog — BLOCK tier. Hard gate, default not forceable.
//     These get silently stripped → 排版走样. Primary = 去修正; the escape
//     hatch (仍要复制) is a de-emphasized ghost so it never looks like the CTA.
// ════════════════════════════════════════════════════════════════════════
function ValidationBlockDialog({ narrow, action = "copy", count = 2 }) {
  const verb = action === "draft" ? "发布" : "复制";
  return (
    <DlSheet narrow={narrow} tone="block" maxWidth={478}
      tier={<><DlTierDot c="var(--danger)" />必修 · 否则走样</>}
      icon={<IconClose size={23} stroke="var(--danger)" />}
      title={<>有 {count} 处写法,公众号会直接丢弃</>}
      sub={<>下面这些粘进公众号会被静默剥离,导致{action === "draft" ? "草稿" : "复制后的文章"}<b>排版走样</b>。先修正再发,才能保证「预览=发布」。</>}
      footnote={<><IconInfo size={14} stroke="var(--ink-faint)" style={{ flex: "none", marginTop: 1 }} /><span>布局请改用 <b>&lt;section&gt; + inline-block</b>。改好后校验会自动放行。</span></>}
      footer={
        <div className="dl-foot spread">
          <Button variant="ghost" size="md" style={{ color: "var(--ink-faint)" }}>仍要{verb}</Button>
          <Button variant="primary" size="md" leading={<IconPen size={17} />}>去修正({count})</Button>
        </div>
      }>
      <div className="dl-rows" style={{ marginBottom: 2 }}>
        <div className="dl-row block">
          <span className="ri"><IconClose size={15} stroke="var(--danger)" /></span>
          <div><div className="rt">使用了 flex 布局(整段会被丢弃)</div><div className="rc">section · 第 9 行 · display:flex</div></div>
        </div>
        <div className="dl-row block">
          <span className="ri"><IconClose size={15} stroke="var(--danger)" /></span>
          <div><div className="rt">使用了 position:absolute(会被隐藏)</div><div className="rc">div · 第 14 行 · position:absolute</div></div>
        </div>
      </div>
    </DlSheet>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 4 · PublishProgress — BUSY state. No veil dismiss, no escape footer (互斥
//     不堆叠: this replaces any dialog while работа runs). Stepper, not a
//     blank spinner. `action` chooses the pipeline; `at` freezes a stage.
// ════════════════════════════════════════════════════════════════════════
const DL_COPY_STEPS = [
  { label: "兼容性校验", desc: "检查能否原样进公众号" },
  { label: "图片传到素材库", desc: "本地图片上传到 mmbiz" },
  { label: "生成公众号排版", desc: "内联样式 · 净化处理" },
  { label: "就绪,等你点一下复制", desc: "浏览器要求最新一次点击" },
];
const DL_DRAFT_STEPS = [
  { label: "兼容性校验", desc: "检查能否原样进公众号" },
  { label: "生成公众号排版", desc: "内联样式 · 净化处理" },
  { label: "推送到草稿箱", desc: "发到「闲读笔记」" },
];

function PublishProgress({ narrow, action = "copy", at = 1 }) {
  const steps = action === "draft" ? DL_DRAFT_STEPS : DL_COPY_STEPS;
  return (
    <DlSheet narrow={narrow} busy tone="busy" maxWidth={420}
      tier={<><span className="dl-pspin" style={{ borderColor: "var(--orange-200)", borderTopColor: "var(--orange-500)" }}></span>正在处理</>}
      icon={<IconCopy size={22} stroke="var(--orange-600)" />}
      title={action === "draft" ? "正在发到草稿箱…" : "正在为复制做准备…"}
      sub={<>处理完成后,{action === "draft" ? "会提示你去后台查看" : "再点一下就写入剪贴板"}。请别关闭这个页面。</>}>
      <div className="dl-prog">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "active" : "pending";
          return (
            <div key={i} className={cx("dl-pstep", state === "pending" && "is-pending")}>
              <span className={cx("dl-pnode", state)}>
                {state === "done" ? <IconCheck size={16} stroke="var(--cream)" />
                  : state === "active" ? <span className="dl-pspin"></span>
                  : i + 1}
                {i < steps.length - 1 && <span className={cx("dl-pconn", i < at ? "done" : "pending")}></span>}
              </span>
              <div className="dl-pmeta">
                <div className="dl-plabel">{s.label}</div>
                {state !== "pending" && <div className="dl-pdesc">{state === "done" ? "已完成" : s.desc}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </DlSheet>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 5 · CopyReadyDialog — ACTION tier. Content processed; browser needs a
//     fresh click to write the clipboard. Primary echoes 复制.
// ════════════════════════════════════════════════════════════════════════
function CopyReadyDialog({ narrow, big = false }) {
  return (
    <DlSheet narrow={narrow} tone="action"
      tier={<><DlTierDot c="var(--orange-500)" />就差一步</>}
      icon={<IconCopy size={23} stroke="var(--orange-600)" />}
      title={<>内容已就绪,再点一下写入剪贴板</>}
      sub={<>图片已传到<b>公众号素材库</b>,排版也处理好了。浏览器要求复制必须发生在你最新一次点击里——所以请再点一下下面的按钮。</>}
      footer={
        <div className="dl-foot">
          <Button variant="ghost" size="md">取消</Button>
          <Button variant="primary" size="md" leading={<IconCopy size={18} />}>点此复制到剪贴板</Button>
        </div>
      }>
      {big && (
        <div className="dl-callout">
          <span className="ci"><IconInfo size={15} stroke="var(--info-ink)" /></span>
          <span>这篇正文较大(约 460KB),将<b>分 2 段</b>复制,粘贴时按提示逐段粘入即可。</span>
        </div>
      )}
    </DlSheet>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 6 · CopySuccessPanel — SUCCESS tier. 可停留确认面板 (does NOT auto-dismiss).
//     Hands the next step back to the user. Draft offer only if canSendToDraft.
// ════════════════════════════════════════════════════════════════════════
function CopySuccessPanel({ narrow, canSendToDraft = true }) {
  const mac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  return (
    <DlSheet narrow={narrow} tone="success"
      tier={<><DlTierDot c="var(--success)" />已完成</>}
      icon={<IconCheck size={25} stroke="var(--success)" />}
      title={<>已复制到剪贴板</>}
      sub={<span style={{ color: "var(--ink-soft)" }}>共 {WX_WORDS} 字 · 排版已保留。接下来去公众号后台,三步就能发出去——</span>}
      footer={
        <div className={cx("dl-foot", canSendToDraft && "stack")}>
          <Button variant="primary" size="md" leading={<IconCheck size={18} />}>完成</Button>
          {canSendToDraft && <Button variant="secondary" size="md" leading={<IconSend size={17} />}>改用「发到草稿箱」</Button>}
        </div>
      }>
      <div className="dl-steps">
        <div className="dl-stepr"><span className="dl-stepn">1</span><span>打开<b>公众号后台</b>,新建一条图文消息</span></div>
        <div className="dl-stepr"><span className="dl-stepn">2</span><span>正文里粘贴 <span className="dl-kbd">{mac ? "⌘V" : "Ctrl V"}</span>,排版会原样进来</span></div>
        <div className="dl-stepr"><span className="dl-stepn">3</span><span>检查无误,<b>发表</b>或存草稿</span></div>
      </div>
    </DlSheet>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 7 · DraftSuccessPanel — SUCCESS tier for the DRAFT path. 草稿推送成功后的
//     可停留确认面板:说人话引导去后台→草稿箱,绝不暴露 media_id 等黑话。
// ════════════════════════════════════════════════════════════════════════
function DraftSuccessPanel({ narrow, account = "闲读笔记" }) {
  return (
    <DlSheet narrow={narrow} tone="success"
      tier={<><DlTierDot c="var(--success)" />已完成</>}
      icon={<IconSend size={23} stroke="var(--success)" />}
      title={<>已发到「{account}」草稿箱</>}
      sub={<span style={{ color: "var(--ink-soft)" }}>共 {WX_WORDS} 字 · 排版已保留。去公众号后台就能看到这条草稿——</span>}
      footer={
        <div className="dl-foot">
          <Button variant="primary" size="md" leading={<IconCheck size={18} />}>完成</Button>
        </div>
      }>
      <div className="dl-steps">
        <div className="dl-stepr"><span className="dl-stepn">1</span><span>打开<b>公众号后台</b>(mp.weixin.qq.com)</span></div>
        <div className="dl-stepr"><span className="dl-stepn">2</span><span>左侧进<b>「草稿箱」</b>,就能看到这篇</span></div>
        <div className="dl-stepr"><span className="dl-stepn">3</span><span>检查无误,<b>发表</b>或继续编辑</span></div>
      </div>
    </DlSheet>
  );
}

// little tier dot used inside the tier-tag
function DlTierDot({ c }) { return <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flex: "none" }}></span>; }

// ── more-menu (draft tucked as secondary/advanced path) ──
// 复制源代码 / 可视化等属 pro 能力,只在 pro 出现;简单模式不露。导出 HTML 文件
// 是已删除的死路,两种模式都不再出现。
function DlMoreMenu({ canPushDraft = false, pro = false }) {
  return (
    <div className="dl-menu" onClick={(e) => e.stopPropagation()}>
      <div className="dl-mcap">更多方式</div>
      <button className="dl-mitem" disabled={!canPushDraft}>
        <span className="mi"><IconSend size={18} /></span>
        <span className="mt">发到草稿箱{canPushDraft ? <span className="ms">发到「闲读笔记」草稿箱</span> : <span className="ms">需先在设置中绑定公众号</span>}</span>
        {!canPushDraft && <IconLock size={15} stroke="var(--ink-faint)" />}
      </button>
      <div className="dl-msep"></div>
      <button className="dl-mitem"><span className="mi"><IconCopy size={18} /></span><span className="mt">分段复制<span className="ms">大文逐段粘贴,防截断</span></span></button>
      {pro && <button className="dl-mitem"><span className="mi"><IconCode size={18} /></span><span className="mt">复制源代码<span className="ms">含行内 style 的 HTML/SVG</span></span></button>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// EdBackdrop — static, dimmed editor context behind every overlay. Reuses
// the real toolbar + WeChat-effect article card so the veil dims true context.
// ════════════════════════════════════════════════════════════════════════
function EdBackdrop({ narrow, menu = false, canPushDraft = true }) {
  return (
    <div className="dl-shell">
      <div className="dl-top">
        {narrow
          ? <button className="dl-back"><IconArrowL size={17} />返回起稿台</button>
          : <div className="dl-brand"><BrandMark size={28} radius={20} /><span className="nm">MBEditor</span></div>}
        <div style={{ flex: 1 }}></div>
        <div className="dl-editing"><IconPen size={14} stroke="var(--ink-soft)" />编辑中</div>
        {!narrow && <><div style={{ flex: 1 }}></div><HealthDot /></>}
      </div>
      <div className="dl-actionbar">
        <div className="dl-tbwrap"><EditorToolbar compact={narrow} /></div>
        <div className="dl-actions">
          <div style={{ position: "relative" }}>
            <button className="dl-more"><IconChevDown size={16} />{!narrow && "更多方式"}</button>
            {menu && <DlMoreMenu canPushDraft={canPushDraft} />}
          </div>
          <Button variant="primary" size="md" leading={<IconCopy size={18} />}>{narrow ? "复制" : "复制到公众号"}</Button>
        </div>
      </div>
      <div className="wx-stage">
        <div className="wx-paperwrap">
          <div className="wx-meta-mode"><IconEye size={14} stroke="var(--ink-soft)" />公众号效果 · 所见即所得</div>
          <WxArticle editing={false} narrow={narrow} />
        </div>
      </div>
    </div>
  );
}

// One screen = backdrop + (at most) one overlay. Overlays never stack.
function DlScreen({ overlay, narrow, backdropProps }) {
  return (
    <div className="frame" style={{ position: "relative", height: "100%" }}>
      <EdBackdrop narrow={narrow} {...backdropProps} />
      {overlay}
    </div>
  );
}

Object.assign(window, {
  DlSheet, DlScreen, EdBackdrop, DlMoreMenu, DlTierDot,
  SmilWarningDialog, ValidationWarnToast, ValidationBlockDialog,
  PublishProgress, CopyReadyDialog, CopySuccessPanel, DraftSuccessPanel,
});
