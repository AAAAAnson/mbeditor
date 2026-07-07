// MBEditor · Direction A — 流式生成剧场 + 成功庆祝层 + 错误态 (GeneratingTheater)
// 产品唯一情绪峰值(README §6 流程2)。
//  · generating:左侧 5 道工序竖轨(立意→行文→制版→自检→核验,逐道 pending→active→done);
//    右侧逐字手稿(标题点亮 → 正文逐字追加 → 尾随闪烁光标 + 实时字数)。禁用空 loading。
//  · done:校样通过印章 → 成功庆祝层(看效果 / 复制到公众号 / [仅已绑号]发草稿),下一步交还用户。
//  · error:no_provider 引导连接;其它错误码 → 中文提示 +「换个说法 / 重试」。
// props: phase "generating"|"done"|"error" · live(generating 时跑真流式并循环) · errorCode · canPushDraft · narrow
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx(全局挂载)。
const { useState, useRef, useEffect } = React;

(function injectGtCss() {
  if (document.getElementById("mb-gt-css")) return;
  const s = document.createElement("style");
  s.id = "mb-gt-css";
  s.textContent = `
  .gt{position:relative;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}
  .gt .serif{font-family:var(--f-display);}

  /* ---- top bar (compose chrome:返回 + 编辑中) ---- */
  .gt-top{height:56px;flex:none;display:flex;align-items:center;gap:14px;padding:0 20px;
    border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 88%,transparent);
    backdrop-filter:saturate(1.1) blur(8px);z-index:6;}
  .gt-back{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px 0 11px;border-radius:var(--r-md);
    background:none;border:none;color:var(--ink-soft);font-size:14px;font-family:var(--f-sans);cursor:pointer;
    transition:all var(--t-micro) var(--ease);}
  .gt-back:hover{background:var(--surface-2);color:var(--ink);}
  .gt-grow{flex:1;}
  .gt-toplabel{display:inline-flex;align-items:center;gap:9px;font-weight:600;color:var(--ink-strong);font-size:15px;}
  .gt-toplabel .pulse{width:8px;height:8px;border-radius:50%;background:var(--orange-500);
    animation:gt-pulse 1.6s var(--ease) infinite;}

  /* ---- two-column stage ---- */
  .gt-stage{flex:1;display:grid;grid-template-columns:344px 1fr;min-height:0;}

  /* rail */
  .gt-rail{padding:30px 26px;border-right:1px solid var(--line);
    background:linear-gradient(180deg,var(--surface-2),var(--bg) 70%);display:flex;flex-direction:column;
    min-height:0;overflow-y:auto;}
  .gt-railcap{font-size:11.5px;font-weight:700;letter-spacing:1.6px;color:var(--ink-faint);text-transform:uppercase;}
  .gt-status{font-family:var(--f-display);font-size:23px;font-weight:700;color:var(--ink-strong);
    margin:9px 0 5px;line-height:1.3;min-height:30px;transition:color var(--t-base) var(--ease);}
  .gt-statusdesc{font-size:13px;color:var(--ink-soft);margin-bottom:26px;line-height:1.5;min-height:20px;}
  .gt-steps{display:flex;flex-direction:column;}
  .gt-step{display:grid;grid-template-columns:32px 1fr;column-gap:14px;position:relative;padding-bottom:24px;}
  .gt-step:last-child{padding-bottom:0;}
  .gt-step::before{content:"";position:absolute;left:15px;top:34px;bottom:2px;width:2px;
    background:var(--line-strong);border-radius:1px;transition:background var(--t-base) var(--ease);}
  .gt-step:last-child::before{display:none;}
  .gt-step.done::before{background:var(--success);}
  .gt-node{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    flex:none;position:relative;z-index:1;transition:all var(--t-base) var(--ease);}
  .gt-node.pending{background:var(--surface);border:2px solid var(--line-strong);}
  .gt-node.pending .ndot{width:7px;height:7px;border-radius:50%;background:var(--ink-faint);}
  .gt-node.active{background:var(--orange-500);box-shadow:0 0 0 5px var(--orange-100),0 8px 18px -8px rgba(232,85,58,.7);
    animation:gt-nodepulse 1.7s var(--ease) infinite;}
  .gt-node.done{background:var(--success-soft);border:2px solid var(--success);}
  .gt-node.err{background:var(--danger-soft);border:2px solid var(--danger);}
  .gt-steplabel{font-size:15.5px;font-weight:600;padding-top:4px;transition:color var(--t-base) var(--ease);}
  .gt-step.pending .gt-steplabel{color:var(--ink-faint);}
  .gt-step.active .gt-steplabel{color:var(--ink-strong);}
  .gt-step.done .gt-steplabel,.gt-step.err .gt-steplabel{color:var(--ink);}
  .gt-stepdesc{font-size:12.5px;color:var(--ink-soft);margin-top:3px;line-height:1.5;}
  .gt-step.active .gt-stepdesc{color:var(--orange-700);}
  .gt-step.err .gt-stepdesc{color:var(--danger-ink);}

  /* manuscript */
  .gt-paperwrap{overflow-y:auto;padding:34px;display:flex;justify-content:center;align-items:flex-start;min-height:0;}
  .gt-paper{position:relative;width:100%;max-width:582px;background:var(--surface);border:1px solid var(--line);
    border-radius:var(--r-xl);box-shadow:var(--sh-md);padding:34px 40px 42px;}
  .gt-paperhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px;
    padding-bottom:15px;border-bottom:1px dashed var(--line-strong);}
  .gt-papertag{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink-soft);}
  .gt-wc{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--orange-700);
    background:var(--orange-50);padding:5px 11px;border-radius:var(--r-pill);}
  .gt-wc.done{color:var(--success-ink);background:var(--success-soft);}
  .gt-wc.muted{color:var(--ink-soft);background:var(--bg-sunk);}
  .gt-wc .wcdot{width:6px;height:6px;border-radius:50%;background:var(--orange-500);animation:gt-blink 1s steps(2) infinite;}
  .gt-title{font-family:var(--f-display);font-size:27px;font-weight:700;line-height:1.42;color:var(--ink-strong);
    margin:0 0 18px;min-height:38px;text-wrap:pretty;}
  .gt-title.empty{color:var(--ink-faint);font-size:18px;font-weight:400;font-style:italic;}
  .gt-body{font-family:var(--f-display);font-size:16.5px;line-height:2;color:var(--ink);}
  .gt-body p{margin:0 0 15px;}
  .gt-body p:last-child{margin-bottom:0;}
  .gt-bodyhint{color:var(--ink-faint);font-size:15px;font-style:italic;}
  .gt-caret{display:inline-block;width:2px;height:1.02em;background:var(--orange-500);margin-left:1.5px;
    vertical-align:text-bottom;border-radius:1px;animation:gt-blink 1s steps(2) infinite;
    box-shadow:0 0 7px rgba(232,85,58,.6);}

  /* 校样通过 stamp */
  .gt-stamp{position:absolute;top:16px;right:20px;display:inline-flex;align-items:center;gap:6px;color:var(--success);
    border:2.5px solid var(--success);border-radius:var(--r-pill);padding:5px 13px;font-weight:700;font-size:13px;
    letter-spacing:1px;transform:rotate(-7deg);background:color-mix(in srgb,var(--success-soft) 75%,transparent);
    animation:mb-stamp var(--t-celebrate) var(--ease-spring);}

  /* ---- overlay (celebration / error) ---- */
  .gt-veil{position:absolute;inset:0;z-index:20;background:color-mix(in srgb,var(--bg) 55%,transparent);
    backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:28px;
    animation:mb-fade var(--t-base) var(--ease);}
  .gt-pop{position:relative;width:100%;max-width:452px;background:var(--surface);border:1px solid var(--line);
    border-radius:var(--r-2xl);box-shadow:var(--sh-xl);padding:30px 30px 26px;text-align:center;overflow:hidden;
    animation:mb-pop var(--t-enter) var(--ease-spring);}
  .gt-crown{display:flex;justify-content:center;margin-bottom:15px;}
  .gt-pophead{font-family:var(--f-display);font-size:25px;font-weight:700;color:var(--ink-strong);margin:0 0 8px;
    line-height:1.3;}
  .gt-popsub{font-size:14.5px;color:var(--ink-soft);line-height:1.65;margin:0 auto 22px;max-width:340px;}
  .gt-popsub b{color:var(--orange-700);font-weight:700;}
  .gt-actions{display:flex;flex-direction:column;gap:10px;}
  .gt-actrow{display:flex;gap:10px;}
  .gt-actrow > *{flex:1;}
  .gt-note{margin-top:16px;font-size:12px;color:var(--ink-faint);line-height:1.6;display:flex;align-items:center;
    justify-content:center;gap:7px;text-align:left;}
  .gt-note .ni{flex:none;margin-top:1px;}
  .gt-iconwrap{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    flex:none;}

  /* confetti (semantic delight, not cheap) */
  .gt-confetti{position:absolute;top:-14px;width:9px;height:13px;border-radius:2px;opacity:0;
    animation:gt-fall 2.7s var(--ease) forwards;pointer-events:none;}

  /* toast */
  .gt-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--ink-strong);
    color:var(--cream);font-size:13.5px;font-weight:500;padding:11px 18px;border-radius:var(--r-pill);
    box-shadow:var(--sh-lg);animation:mb-rise var(--t-enter) var(--ease);max-width:88%;}

  /* keyframes */
  @keyframes gt-pulse{0%,100%{box-shadow:0 0 0 0 rgba(232,85,58,.45);}50%{box-shadow:0 0 0 6px rgba(232,85,58,0);}}
  @keyframes gt-nodepulse{0%,100%{box-shadow:0 0 0 5px var(--orange-100),0 8px 18px -8px rgba(232,85,58,.7);}
    50%{box-shadow:0 0 0 9px color-mix(in srgb,var(--orange-100) 45%,transparent),0 8px 18px -8px rgba(232,85,58,.7);}}
  @keyframes gt-blink{0%,49%{opacity:1;}50%,100%{opacity:0;}}
  @keyframes gt-fall{0%{opacity:0;transform:translateY(-18px) rotate(0);}12%{opacity:1;}
    100%{opacity:0;transform:translateY(380px) rotate(460deg);}}

  /* ---- narrow (<600px) ---- */
  .gt.narrow .gt-stage{grid-template-columns:1fr;grid-template-rows:auto 1fr;}
  .gt.narrow .gt-rail{border-right:none;border-bottom:1px solid var(--line);padding:18px 16px 16px;overflow:visible;}
  .gt.narrow .gt-status{font-size:19px;margin:6px 0 3px;}
  .gt.narrow .gt-statusdesc{margin-bottom:16px;}
  .gt.narrow .gt-steps{flex-direction:row;justify-content:space-between;}
  .gt.narrow .gt-step{grid-template-columns:1fr;row-gap:7px;justify-items:center;text-align:center;padding-bottom:0;}
  .gt.narrow .gt-step::before{display:none;}
  .gt.narrow .gt-steplabel{font-size:12px;padding-top:0;}
  .gt.narrow .gt-stepdesc{display:none;}
  .gt.narrow .gt-paperwrap{padding:18px;}
  .gt.narrow .gt-paper{padding:24px 22px 30px;}
  .gt.narrow .gt-title{font-size:23px;}
  .gt.narrow .gt-pop{padding:26px 22px 22px;}
  .gt.narrow .gt-actrow{flex-direction:column;}
  `;
  document.head.appendChild(s);
})();

// ---- content: the manuscript that streams in ----
const GT_TITLE = "周末带娃逛了趟植物园,他认识了第一片银杏";
const GT_BODY = [
  "原本只想随便走走,没想到他蹲在落叶堆里,看了整整二十分钟。",
  "那天阳光很好,风一吹,银杏叶就簌簌地落下来,铺了满地金黄。他伸手去接,接到一片就举得高高的,回头冲我笑。",
  "回来的路上他一直问:叶子为什么会变黄呀?我说,因为它们忙了一整年,到了秋天,想换身新衣裳歇一歇。",
  "他似懂非懂地点点头,把那片银杏小心地夹进了书里。",
  "后来我才慢慢明白,带娃最好的时刻,从不是去了多远的地方,而是和他一起,认认真真地看一片叶子,落下来。",
].join("\n\n");
const GT_WORDS = GT_BODY.replace(/\s/g, "").length;

const GT_STAGES = [
  { key: "idea",   label: "立意", run: "正在立意…",       desc: "想个开头,定个调子",     doneDesc: "调子:温暖 · 生活随笔" },
  { key: "write",  label: "行文", run: "正在行文…",       desc: "一个字一个字往下写",     doneDesc: "约 " + GT_WORDS + " 字" },
  { key: "layout", label: "制版", run: "正在制版…",       desc: "分段、配色、排版式",     doneDesc: "套用「生活随笔」版式" },
  { key: "check",  label: "自检", run: "正在自检…",       desc: "检查能不能贴进公众号",   doneDesc: "未用不兼容写法" },
  { key: "verify", label: "核验", run: "正在核验…",       desc: "最后过一遍兼容性",       doneDesc: "兼容 · 可直接发" },
];

const GT_ERR = {
  llm_timeout:    { status: "生成中断", head: "差一点就写完了,再试一下?", msg: "AI 响应超时了,可能是网络或对方服务器有点忙。你的描述都还在,重试一下通常就好。" },
  llm_rate_limit: { status: "被限速了", head: "请求有点太频繁了", msg: "AI 服务商暂时限速了,歇十几秒再点重试就行。" },
  llm_refusal:    { status: "被婉拒了", head: "AI 这次没接住", msg: "AI 拒绝了这个请求。换个说法,或把意思讲得更具体些,通常就能继续。" },
  safety_block:   { status: "内容被拦", head: "这段被安全策略拦下了", msg: "有内容被安全策略挡了下来。换一种表达方式再试试。" },
  stream_error:   { status: "连接中断", head: "和 AI 的连接断了", msg: "传输中途断开了。重试一下,我会从头帮你重新写。" },
  validate_failed:{ status: "校验未过", head: "排版没通过自检", msg: "生成的内容没通过公众号兼容性检查。重试一下,让它重新排一遍版。" },
};

const GT_CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: 4 + i * 5.3 + "%",
  delay: (i % 6) * 0.11 + (i % 2 ? 0.05 : 0) + "s",
  color: ["#E8553A", "#3f8f72", "#c07f23", "#5b7a99", "#f0906f", "#f3e0b6"][i % 6],
  w: i % 3 === 0 ? 7 : 9,
  h: i % 4 === 0 ? 9 : 13,
}));

function GtSpinner() {
  return <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2.4px solid rgba(251,244,232,.4)",
    borderTopColor: "var(--cream)", animation: "mb-rot .7s linear infinite", display: "block" }}></span>;
}

function GtNode({ state }) {
  return (
    <div className={cx("gt-node", state)}>
      {state === "active" && <GtSpinner />}
      {state === "done" && <IconCheck size={17} stroke="var(--success)" />}
      {state === "err" && <IconClose size={15} stroke="var(--danger)" />}
      {state === "pending" && <span className="ndot"></span>}
    </div>
  );
}

function GeneratingTheater({ phase = "generating", live = false, errorCode = "llm_timeout", canPushDraft = true, narrow = false }) {
  const complete = phase === "done";
  const error = phase === "error";
  const noProvider = error && errorCode === "no_provider";
  const partial = error && !noProvider;

  const initStages = () => {
    const base = GT_STAGES.map((s) => ({ ...s, state: "pending" }));
    if (complete) return base.map((s) => ({ ...s, state: "done" }));
    if (partial) { base[0].state = "done"; base[1].state = "err"; }
    return base;
  };

  const [title, setTitle] = useState(complete ? GT_TITLE : partial ? GT_TITLE : "");
  const [body, setBody]   = useState(complete ? GT_BODY : partial ? GT_BODY.split("\n\n").slice(0, 2).join("\n\n") : "");
  const [stages, setStages] = useState(initStages);
  const [statusIdx, setStatusIdx] = useState(complete ? 5 : 0);
  const [streaming, setStreaming] = useState(phase === "generating");
  const [streamTarget, setStreamTarget] = useState(null);  // "title" | "body" | null
  const [toast, setToast] = useState(null);

  const cancel = useRef(false);
  const timers = useRef([]);
  const toastT = useRef(null);

  const sleep = (ms) => new Promise((res) => { const id = setTimeout(res, ms); timers.current.push(id); });
  const setStage = (i, st) => setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, state: st } : s)));

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    if (phase !== "generating" || !live) return;
    cancel.current = false;
    run();
    return () => { cancel.current = true; timers.current.forEach(clearTimeout); timers.current = []; clearTimeout(toastT.current); };
    // eslint-disable-next-line
  }, []);

  async function streamInto(setter, text, per) {
    for (let i = 1; i <= text.length; i++) {
      if (cancel.current) return;
      setter(text.slice(0, i));
      await sleep(per);
    }
  }

  async function run() {
    while (!cancel.current) {
      setTitle(""); setBody(""); setStreamTarget(null); setStreaming(true);
      setStages(GT_STAGES.map((s) => ({ ...s, state: "pending" })));
      setStatusIdx(0);
      await sleep(550); if (cancel.current) return;

      setStage(0, "active"); setStatusIdx(0);
      await sleep(1500); if (cancel.current) return;
      setStage(0, "done");

      setStage(1, "active"); setStatusIdx(1);
      await sleep(420);
      setStreamTarget("title");
      await streamInto(setTitle, GT_TITLE, 56); if (cancel.current) return;
      setStreamTarget("body");
      await sleep(320);
      await streamInto(setBody, GT_BODY, 23); if (cancel.current) return;
      setStreamTarget(null);
      setStage(1, "done");

      setStage(2, "active"); setStatusIdx(2);
      await sleep(1300); if (cancel.current) return;
      setStage(2, "done");

      setStage(3, "active"); setStatusIdx(3);
      await sleep(1150); if (cancel.current) return;
      setStage(3, "done");

      setStage(4, "active"); setStatusIdx(4);
      await sleep(1150); if (cancel.current) return;
      setStage(4, "done");

      setStreaming(false); setStatusIdx(5);
      await sleep(3400); if (cancel.current) return;
    }
  }

  // ---- status header ----
  let statusLine, statusDesc;
  if (noProvider)      { statusLine = "还没连上 AI";   statusDesc = "连一次,以后都不用再连"; }
  else if (partial)    { statusLine = GT_ERR[errorCode].status; statusDesc = "你的描述还在,可以直接重试"; }
  else if (complete)   { statusLine = "校样通过,写好啦"; statusDesc = "排版好看 · 可直接贴进公众号"; }
  else if (statusIdx >= 5) { statusLine = "校样通过"; statusDesc = "全部完成,正在收尾…"; }
  else { statusLine = GT_STAGES[statusIdx].run; statusDesc = GT_STAGES[statusIdx].desc; }

  const wc = body.replace(/\s/g, "").length;
  const bodyParas = body ? body.split("\n\n") : [];

  // ---- word-count chip ----
  let wcChip = null;
  if (streaming && streamTarget) wcChip = <span className="gt-wc"><span className="wcdot"></span>已写 {wc} 字</span>;
  else if (complete)            wcChip = <span className="gt-wc done"><IconCheck size={13} stroke="var(--success-ink)" />{GT_WORDS} 字 · 已写完</span>;
  else if (partial)             wcChip = <span className="gt-wc muted">写到 {wc} 字时中断</span>;
  else if (!streaming && phase === "generating") wcChip = <span className="gt-wc done"><IconCheck size={13} stroke="var(--success-ink)" />{wc} 字</span>;

  const topLabel = complete ? "草稿已生成" : error ? "生成未完成" : "AI 起稿中";

  return (
    <div className={cx("gt", narrow && "narrow")}>
      {/* ---- top (compose chrome) ---- */}
      <div className="gt-top">
        <button className="gt-back" onClick={() => showToast("← 返回起稿台")}><IconArrowL size={18} />返回起稿台</button>
        <span className="gt-grow"></span>
        <span className="gt-toplabel">
          {phase === "generating" && <span className="pulse"></span>}
          {topLabel}
        </span>
        <span className="gt-grow"></span>
        <BrandMark size={26} />
      </div>

      {/* ---- stage:rail + manuscript ---- */}
      <div className="gt-stage">
        {/* left rail */}
        <div className="gt-rail">
          <span className="gt-railcap">AI 正在为你写</span>
          <div className="gt-status serif">{statusLine}</div>
          <div className="gt-statusdesc">{statusDesc}</div>
          <div className="gt-steps">
            {stages.map((s) => (
              <div key={s.key} className={cx("gt-step", s.state)}>
                <GtNode state={s.state} />
                <div>
                  <div className="gt-steplabel">{s.label}</div>
                  <div className="gt-stepdesc">{s.state === "done" ? s.doneDesc : s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right manuscript */}
        <div className="gt-paperwrap">
          <div className="gt-paper">
            {complete && (
              <span className="gt-stamp"><IconCheck size={14} stroke="var(--success)" />校样通过</span>
            )}
            <div className="gt-paperhead">
              <span className="gt-papertag"><IconPen size={14} />公众号草稿</span>
              {wcChip}
            </div>

            {title
              ? <h1 className="gt-title serif">{title}{streamTarget === "title" && <i className="gt-caret"></i>}</h1>
              : <h1 className="gt-title serif empty">标题会先出现在这里…</h1>}

            <div className="gt-body serif">
              {bodyParas.length
                ? bodyParas.map((p, i) => (
                    <p key={i}>{p}{i === bodyParas.length - 1 && streamTarget === "body" && <i className="gt-caret"></i>}</p>
                  ))
                : streamTarget !== "title" && <div className="gt-bodyhint">正文会一段一段地浮现出来…</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ---- celebration overlay ---- */}
      {complete && (
        <div className="gt-veil">
          <div className="gt-pop">
            {GT_CONFETTI.map((c, i) => (
              <span key={i} className="gt-confetti"
                style={{ left: c.left, width: c.w, height: c.h, background: c.color, animationDelay: c.delay }}></span>
            ))}
            <div className="gt-crown"><CheckBurst size={64} /></div>
            <h2 className="gt-pophead">写好啦,一篇 {GT_WORDS} 字的推文</h2>
            <p className="gt-popsub">看着还不错吧?<b>预览就是粘贴效果</b>。接下来想做点什么——</p>
            <div className="gt-actions">
              <Button variant="primary" size="lg" leading={<IconCopy size={18} />}
                onClick={() => showToast("→ 复制到公众号 · 先过校验闸,再点一下写入剪贴板")}>复制到公众号</Button>
              <div className="gt-actrow">
                <Button variant="secondary" size="md" leading={<IconEye size={17} />}
                  onClick={() => showToast("→ 打开编辑器 · 公众号效果预览")}>先看看效果</Button>
                {canPushDraft && (
                  <Button variant="secondary" size="md" leading={<IconSend size={17} />}
                    onClick={() => showToast("→ 发到「闲读笔记」草稿箱")}>发到草稿箱</Button>
                )}
              </div>
            </div>
            <div className="gt-note">
              <span className="ni"><IconInfo size={14} stroke="var(--ink-faint)" /></span>
              {canPushDraft
                ? "复制后,粘到公众号后台就能发;草稿箱适合排期。两条路你都能走。"
                : "想一键发草稿?先到设置里绑定公众号。现在「复制到公众号」就能直接发。"}
            </div>
          </div>
        </div>
      )}

      {/* ---- error overlay ---- */}
      {error && (
        <div className="gt-veil">
          <div className="gt-pop">
            {noProvider ? (
              <>
                <div className="gt-crown">
                  <span className="gt-iconwrap" style={{ background: "var(--orange-50)" }}>
                    <IconSparkle size={30} stroke="var(--orange-500)" />
                  </span>
                </div>
                <h2 className="gt-pophead">还差一步,连上你的 AI 写手</h2>
                <p className="gt-popsub">
                  写作用的是<b>你自己的 AI 账号</b>(比如 DeepSeek),内容不经我们服务器,一篇大约<b>几分钱</b>。
                  连一次,以后就不用再连了。
                </p>
                <div className="gt-actions">
                  <Button variant="primary" size="lg" leading={<IconSparkle size={18} />}
                    onClick={() => showToast("→ 打开连接向导 · 测通才放行(约 1 分钟)")}>连接 AI 写手 · 约 1 分钟</Button>
                  <Button variant="ghost" size="md"
                    onClick={() => showToast("→ 设置 · AI 引擎")}>我先去设置里配置</Button>
                </div>
                <div className="gt-note">
                  <span className="ni"><IconLock size={14} stroke="var(--success-ink)" /></span>
                  密钥只存你的本机 / 服务端,绝不上传任何第三方。
                </div>
              </>
            ) : (
              <>
                <div className="gt-crown">
                  <span className="gt-iconwrap" style={{ background: "var(--warning-soft)" }}>
                    <IconWarn size={28} stroke="var(--warning-ink)" />
                  </span>
                </div>
                <h2 className="gt-pophead">{GT_ERR[errorCode].head}</h2>
                <p className="gt-popsub">{GT_ERR[errorCode].msg}</p>
                <div className="gt-actrow gt-actions">
                  <Button variant="secondary" size="lg" leading={<IconArrowL size={17} />}
                    onClick={() => showToast("← 返回上一步 · 改改你的描述")}>换个说法</Button>
                  <Button variant="primary" size="lg" leading={<IconRefresh size={18} />}
                    onClick={() => showToast("正在重试 · 从头重新生成…")}>重试</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="gt-toast">{toast}</div>}
    </div>
  );
}

Object.assign(window, { GeneratingTheater, GT_TITLE, GT_BODY, GT_WORDS });
