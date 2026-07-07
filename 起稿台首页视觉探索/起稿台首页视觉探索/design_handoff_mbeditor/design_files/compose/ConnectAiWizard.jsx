// MBEditor · 连接 AI 写手 / BYOK 向导 (ConnectAiWizard) — 编辑分栏重做
// README §6 流程0。compose 未连 key 时与「设置→AI 引擎」复用同一向导。
// 视觉:左深褐叙事栏(品牌 + 大衬线标题 + 双安心承诺,稳定框架)/ 右奶油操作栏
// (hairline 列表与表单,橙只点睛)。摆脱「居中圆角卡 + 光晕」的模板感。
//  · 步1:右栏 = 服务商列表(DeepSeek 推荐位 / Kimi / 通义千问 / Claude),每行可信度 + 价格锚。
//        双安心固定在左栏:①「要花钱吗」(BYOK·不经服务器·几分钱)②「安全吗」(密钥只存本机/服务端·不外传)。
//        底部「我先去设置里配置」= cancel,deep-link 到 settings?section=aiengine。
//  · 步2:3 步图文引导(注册→建密钥→粘贴,留截图位)+ 自动锁定 base_url/model + 单个 API Key 密码框
//        +「测试并连接」(空 key 禁用)。闸门(§7 G):测通才放行;失败 → 显错、不保存、不放行。
// props: initialStep(1|2) · initialProvider · initialTest("idle"|"testing"|"fail"|"ok") · narrow
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx(全局挂载)。
const { useState, useRef, useEffect } = React;

(function injectCwCss() {
  if (document.getElementById("mb-cw-css")) return;
  const s = document.createElement("style");
  s.id = "mb-cw-css";
  s.textContent = `
  .cw{position:relative;height:100%;display:flex;background:var(--surface);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}
  .cw .serif{font-family:var(--f-display);}

  /* ============ LEFT · 深褐叙事栏 ============ */
  .cw-aside{position:relative;flex:0 0 416px;display:flex;flex-direction:column;
    background:var(--ink-strong);color:var(--cream);padding:30px 38px 34px;overflow:hidden;}
  .cw-mark{position:absolute;right:-58px;bottom:-46px;opacity:.05;pointer-events:none;}
  .cw-atop{display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:1;}
  .cw-brand{display:inline-flex;align-items:center;gap:10px;}
  .cw-brandname{font-family:var(--f-display);font-weight:700;font-size:18px;letter-spacing:.3px;color:var(--cream);}
  .cw-aback{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px 0 8px;border-radius:var(--r-pill);
    background:rgba(251,244,232,.07);border:1px solid rgba(251,244,232,.14);color:rgba(251,244,232,.74);
    font-size:12.5px;font-family:var(--f-sans);cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .cw-aback:hover{background:rgba(251,244,232,.13);color:var(--cream);}

  .cw-amid{z-index:1;margin-top:42px;}
  .cw-stepline{display:flex;align-items:center;gap:11px;margin-bottom:20px;}
  .cw-stepnum{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
    color:rgba(251,244,232,.5);transition:color var(--t-base) var(--ease);}
  .cw-stepnum.on{color:var(--orange-300);}
  .cw-stepsep{flex:1;max-width:42px;height:1px;background:rgba(251,244,232,.2);}
  .cw-h1{font-family:var(--f-display);font-weight:700;font-size:35px;line-height:1.18;letter-spacing:.3px;
    color:var(--cream);margin:0;text-wrap:balance;}
  .cw-h1 em{font-style:normal;color:var(--orange-300);}
  .cw-sub{font-size:14px;line-height:1.7;color:rgba(251,244,232,.72);margin:16px 0 0;max-width:300px;}

  /* 双安心 — 编辑式条目,非彩盒 */
  .cw-edu{z-index:1;margin-top:auto;padding-top:30px;display:flex;flex-direction:column;gap:0;}
  .cw-eduitem{display:flex;gap:13px;padding:17px 0;border-top:1px solid rgba(251,244,232,.13);}
  .cw-eduico{width:26px;height:26px;flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;
    border-radius:50%;border:1px solid rgba(251,244,232,.28);}
  .cw-eduhead{font-size:13.5px;font-weight:700;color:var(--cream);margin-bottom:5px;letter-spacing:.2px;}
  .cw-edutext{font-size:12.5px;line-height:1.62;color:rgba(251,244,232,.66);}
  .cw-edutext b{color:var(--cream);font-weight:600;}
  .cw-lockline{z-index:1;display:flex;align-items:center;gap:8px;margin-top:18px;font-size:11.5px;
    color:rgba(251,244,232,.5);letter-spacing:.2px;}

  /* ============ RIGHT · 奶油操作栏 ============ */
  .cw-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow-y:auto;background:var(--surface);}
  .cw-inner{padding:38px 44px 34px;display:flex;flex-direction:column;min-height:100%;}
  .cw-eyebrow{display:flex;align-items:center;gap:11px;font-size:11px;font-weight:700;letter-spacing:1.8px;
    text-transform:uppercase;color:var(--ink-faint);margin-bottom:22px;}
  .cw-eyebrow::after{content:"";flex:1;height:1px;background:var(--line);}

  /* provider list (hairline rows, not a card grid) */
  .cw-plist{display:flex;flex-direction:column;}
  .cw-prow{position:relative;display:flex;align-items:center;gap:16px;padding:17px 12px 17px 16px;cursor:pointer;
    border:0;border-bottom:1px solid var(--line);background:none;font-family:var(--f-sans);text-align:left;
    transition:background var(--t-micro) var(--ease);}
  .cw-prow:last-child{border-bottom:0;}
  .cw-prow:hover{background:var(--surface-2);}
  .cw-prow:focus-visible{outline:none;box-shadow:var(--ring);border-radius:var(--r-sm);}
  .cw-prow.rec::before{content:"";position:absolute;left:0;top:13px;bottom:13px;width:3px;border-radius:2px;
    background:var(--orange-500);}
  .cw-ptile{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;
    font-family:var(--f-display);font-weight:700;font-size:18px;line-height:1;background:var(--bg-sunk);
    color:var(--ink-strong);box-shadow:inset 0 0 0 1px var(--line);}
  .cw-ptile.rec{background:var(--ink-strong);color:var(--cream);box-shadow:none;}
  .cw-pmid{flex:1;min-width:0;}
  .cw-pname{display:flex;align-items:center;gap:9px;font-size:15.5px;font-weight:700;color:var(--ink-strong);}
  .cw-rec{font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--orange-600);
    border:1px solid color-mix(in srgb,var(--orange-300) 70%,transparent);border-radius:var(--r-pill);
    padding:1px 8px;line-height:1.5;}
  .cw-ptrust{font-size:12.5px;color:var(--ink-soft);margin-top:3px;}
  .cw-pprice{font-family:var(--f-mono);font-size:12px;color:var(--ink-soft);white-space:nowrap;flex:none;}
  .cw-parrow{flex:none;color:var(--ink-faint);transition:transform var(--t-micro) var(--ease),color var(--t-micro) var(--ease);}
  .cw-prow:hover .cw-parrow{transform:translateX(3px);color:var(--orange-600);}

  .cw-cancel{margin-top:26px;padding-top:20px;border-top:1px solid var(--line);}
  .cw-cancelbtn{background:none;border:none;font-family:var(--f-sans);font-size:13.5px;color:var(--ink-soft);
    cursor:pointer;padding:6px 2px;display:inline-flex;align-items:center;gap:8px;transition:color var(--t-micro) var(--ease);}
  .cw-cancelbtn:hover{color:var(--ink-strong);}
  .cw-cancelbtn u{text-underline-offset:3px;text-decoration-color:var(--line-strong);}

  /* ============ STEP 2 ============ */
  .cw-chosen{display:flex;align-items:center;gap:13px;border:1px solid var(--line);border-radius:var(--r-md);
    padding:12px 14px;margin-bottom:30px;background:var(--surface-2);}
  .cw-chosenmeta{flex:1;min-width:0;}
  .cw-chosenname{font-size:14.5px;font-weight:700;color:var(--ink-strong);}
  .cw-chosentrust{font-family:var(--f-mono);font-size:11.5px;color:var(--ink-soft);margin-top:2px;}

  .cw-guide{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-bottom:32px;}
  .cw-gstep{display:flex;flex-direction:column;}
  .cw-shot{border:1px solid var(--line-strong);border-radius:var(--r-sm);overflow:hidden;background:var(--surface);
    box-shadow:var(--sh-xs);margin-bottom:14px;}
  .cw-shotbar{height:20px;display:flex;align-items:center;gap:5px;padding:0 8px;background:var(--bg-sunk);
    border-bottom:1px solid var(--line);}
  .cw-shotbar i{width:5.5px;height:5.5px;border-radius:50%;background:var(--line-strong);display:block;flex:none;}
  .cw-shoturl{margin-left:6px;flex:1;height:8px;border-radius:4px;background:var(--line);}
  .cw-shotbody{padding:13px;display:flex;flex-direction:column;gap:8px;min-height:92px;justify-content:center;}
  .cw-wire{height:8px;border-radius:4px;background:var(--line);}
  .cw-wire.short{width:50%;}
  .cw-wire.tiny{width:32%;height:7px;}
  .cw-wireinput{height:22px;border-radius:6px;border:1px solid var(--line-strong);background:var(--bg);}
  .cw-wirebtn{height:25px;border-radius:6px;background:var(--orange-200);width:58%;}
  .cw-wirebtn.ghost{background:none;border:1.5px dashed var(--orange-300);display:flex;align-items:center;
    justify-content:center;gap:5px;font-family:var(--f-mono);font-size:10px;color:var(--orange-700);font-weight:600;}
  .cw-wirekey{height:28px;border-radius:6px;border:1px dashed var(--line-strong);background:var(--bg-sunk);
    display:flex;align-items:center;gap:6px;padding:0 9px;font-family:var(--f-mono);font-size:10.5px;color:var(--ink-faint);}
  .cw-wirekey .kc{margin-left:auto;flex:none;color:var(--orange-500);}
  .cw-gnum{display:flex;align-items:baseline;gap:10px;margin-bottom:6px;}
  .cw-gn{font-family:var(--f-display);font-weight:700;font-size:22px;line-height:1;color:var(--orange-500);flex:none;}
  .cw-gt{font-size:14px;font-weight:700;color:var(--ink-strong);}
  .cw-gdesc{font-size:12.5px;color:var(--ink-soft);line-height:1.55;padding-left:32px;}
  .cw-glink{color:var(--orange-700);text-decoration:none;font-weight:600;cursor:pointer;
    border-bottom:1px solid color-mix(in srgb,var(--orange-300) 55%,transparent);}
  .cw-glink:hover{border-bottom-color:var(--orange-500);}

  /* locked fields — underline style, not boxed */
  .cw-locked{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px;}
  .cw-lockrow{padding-bottom:9px;border-bottom:1px solid var(--line-strong);}
  .cw-locklabel{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:1px;
    text-transform:uppercase;color:var(--ink-faint);margin-bottom:7px;}
  .cw-locklabel .lk{margin-left:auto;}
  .cw-lockval{font-family:var(--f-mono);font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;}
  .cw-autohint{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--success-ink);
    font-weight:600;margin-bottom:18px;}

  .cw-errbar{display:flex;align-items:flex-start;gap:12px;background:var(--danger-soft);
    border-left:3px solid var(--danger);border-radius:var(--r-sm);
    padding:14px 16px;margin-bottom:18px;animation:mb-rise var(--t-enter) var(--ease);}
  .cw-errico{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;}
  .cw-errtitle{font-size:14px;font-weight:700;color:var(--danger-ink);}
  .cw-errmsg{font-size:12.5px;color:var(--danger-ink);line-height:1.6;margin-top:4px;opacity:.92;}
  .cw-errcode{font-family:var(--f-mono);font-size:11px;background:color-mix(in srgb,var(--danger) 12%,transparent);
    padding:1px 6px;border-radius:5px;}
  .cw-oktag{display:flex;align-items:center;gap:9px;background:var(--success-soft);color:var(--success-ink);
    border-left:3px solid var(--success);border-radius:var(--r-sm);
    padding:13px 16px;font-size:13.5px;font-weight:600;margin-bottom:18px;animation:mb-rise var(--t-enter) var(--ease);}

  .cw-foot{display:flex;align-items:center;gap:14px;margin-top:auto;padding-top:8px;}
  .cw-gateline{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--ink-faint);margin-top:16px;
    line-height:1.5;}

  /* toast */
  .cw-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--ink-strong);
    color:var(--cream);font-size:13.5px;font-weight:500;padding:11px 18px;border-radius:var(--r-pill);
    box-shadow:var(--sh-lg);animation:mb-rise var(--t-enter) var(--ease);max-width:84%;text-align:center;}

  /* ---- narrow (<600px) — stack:左栏收成顶 band ---- */
  .cw.narrow{flex-direction:column;}
  .cw.narrow .cw-aside{flex:none;padding:18px 20px 22px;}
  .cw.narrow .cw-mark{display:none;}
  .cw.narrow .cw-amid{margin-top:22px;}
  .cw.narrow .cw-h1{font-size:27px;}
  .cw.narrow .cw-sub{max-width:none;}
  .cw.narrow .cw-edu{margin-top:20px;}
  .cw.narrow .cw-lockline{margin-top:14px;}
  .cw.narrow .cw-inner{padding:24px 20px 26px;}
  .cw.narrow .cw-guide{grid-template-columns:1fr;gap:18px;}
  .cw.narrow .cw-shot .cw-shotbody{min-height:70px;}
  .cw.narrow .cw-locked{grid-template-columns:1fr;gap:18px;}
  .cw.narrow .cw-pprice{font-size:11px;}
  .cw.narrow .cw-foot{flex-direction:column-reverse;align-items:stretch;}
  .cw.narrow .cw-foot .cw-grow{display:none;}
  `;
  document.head.appendChild(s);
})();

// ---- extra inline icons (no emoji rule; built on global Icon) ----
const IconKey   = (p) => <Icon {...p}><circle cx="8" cy="15" r="4.2"></circle><path d="M11 12l8.5-8.5"></path><path d="M16 7l2.5 2.5"></path><path d="M18.5 4.5L21 7"></path></Icon>;
const IconCoin  = (p) => <Icon {...p}><ellipse cx="12" cy="7" rx="7.5" ry="3.4"></ellipse><path d="M4.5 7v10c0 1.9 3.4 3.4 7.5 3.4s7.5-1.5 7.5-3.4V7"></path><path d="M4.5 12c0 1.9 3.4 3.4 7.5 3.4s7.5-1.5 7.5-3.4"></path></Icon>;
const IconExt   = (p) => <Icon {...p}><path d="M14 4h6v6"></path><path d="M20 4l-8.5 8.5"></path><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"></path></Icon>;
const IconServer= (p) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="6" rx="1.6"></rect><rect x="3.5" y="13.5" width="17" height="6" rx="1.6"></rect><path d="M7 7.5v.1M7 16.5v.1"></path></Icon>;

// ---- providers ----
const CW_PROVIDERS = [
  { id: "deepseek", name: "DeepSeek", mono: "D", rec: true,
    trust: "国产 · 响应快 · 最划算", price: "约 2 分 / 篇",
    base: "https://api.deepseek.com", model: "deepseek-chat", reg: "deepseek.com" },
  { id: "kimi", name: "Kimi", mono: "K", rec: false,
    trust: "Moonshot · 长文友好", price: "约 1 毛 / 篇",
    base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", reg: "platform.moonshot.cn" },
  { id: "qwen", name: "通义千问", mono: "通", rec: false,
    trust: "阿里 · 中文老练", price: "约 3 分 / 篇",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", reg: "dashscope.aliyun.com" },
  { id: "claude", name: "Claude", mono: "C", rec: false,
    trust: "Anthropic · 文笔细腻", price: "约 2 毛 / 篇",
    base: "https://api.anthropic.com", model: "claude-3-5-sonnet", reg: "console.anthropic.com" },
];

function CwTile({ p }) { return <span className={cx("cw-ptile", p.rec && "rec")}>{p.mono}</span>; }

function Shot({ kind }) {
  return (
    <div className="cw-shot">
      <div className="cw-shotbar"><i></i><i></i><i></i><span className="cw-shoturl"></span></div>
      <div className="cw-shotbody">
        {kind === "register" && (<><div className="cw-wireinput"></div><div className="cw-wireinput"></div><div className="cw-wirebtn"></div></>)}
        {kind === "create" && (<><div className="cw-wire tiny"></div><div className="cw-wire short"></div><div className="cw-wirebtn ghost"><IconKey size={11} stroke="var(--orange-700)" />新建密钥</div></>)}
        {kind === "copy" && (<><div className="cw-wire tiny"></div><div className="cw-wirekey"><IconKey size={11} stroke="var(--ink-faint)" />sk-••••••3f7a<span className="kc"><IconCopy size={13} /></span></div></>)}
      </div>
    </div>
  );
}

function ConnectAiWizard({ initialStep = 1, initialProvider = "deepseek", initialTest = "idle", narrow = false }) {
  const [step, setStep] = useState(initialStep);
  const [pid, setPid] = useState(initialProvider);
  const [apiKey, setApiKey] = useState(initialTest === "idle" ? "" : "sk-1a2b3c4d5e6f7g8h9i0j3f7a");
  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState(initialTest); // idle | testing | fail | ok
  const [toast, setToast] = useState(null);
  const toastT = useRef(null);
  const testT = useRef(null);

  const provider = CW_PROVIDERS.find((x) => x.id === pid) || CW_PROVIDERS[0];

  function showToast(m) { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2400); }
  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(testT.current); }, []);

  function choose(id) { setPid(id); setStep(2); setTest("idle"); setApiKey(""); }
  function runTest() {
    if (!apiKey.trim()) return;
    setTest("testing");
    clearTimeout(testT.current);
    // demo:过短的 key 不通过闸门;否则放行。(§7 G:测通才放行)
    testT.current = setTimeout(() => setTest(apiKey.trim().length < 12 ? "fail" : "ok"), 1500);
  }
  const keyEmpty = !apiKey.trim();

  return (
    <div className={cx("cw", narrow && "narrow")}>
      {/* ============ 左 · 叙事栏 ============ */}
      <aside className="cw-aside">
        <span className="cw-mark"><BrandMarkCream size={230} /></span>
        <div className="cw-atop">
          <span className="cw-brand"><BrandMark size={28} /><span className="cw-brandname">MBEditor</span></span>
          <button className="cw-aback" onClick={() => showToast(step === 2 ? "← 上一步 · 换个服务商" : "← 返回起稿台")}>
            <IconArrowL size={15} />{step === 2 ? "上一步" : "返回"}
          </button>
        </div>

        <div className="cw-amid">
          <div className="cw-stepline">
            <span className={cx("cw-stepnum", step === 1 && "on")}>01 选服务商</span>
            <span className="cw-stepsep"></span>
            <span className={cx("cw-stepnum", step === 2 && "on")}>02 连接测试</span>
          </div>
          {step === 1
            ? <h1 className="cw-h1">连上你自己的<br /><em>AI 写手</em></h1>
            : <h1 className="cw-h1">连接 <em>{provider.name}</em></h1>}
          <p className="cw-sub">
            {step === 1
              ? "选一个就好,连一次以后都不用再连。下面这两件事,先讲清楚——"
              : "照右边三步拿到密钥,粘进来测一下;测通了才会保存。"}
          </p>
        </div>

        <div className="cw-edu">
          <div className="cw-eduitem">
            <span className="cw-eduico"><IconCoin size={14} stroke="var(--orange-300)" /></span>
            <div>
              <div className="cw-eduhead">要花钱吗?几分钱</div>
              <div className="cw-edutext">用<b>你自己的 AI 账号</b>写(BYOK),<b>不经我们服务器</b>。按量付费,一篇通常就几分钱。</div>
            </div>
          </div>
          <div className="cw-eduitem">
            <span className="cw-eduico"><IconLock size={13} stroke="var(--orange-300)" /></span>
            <div>
              <div className="cw-eduhead">密钥安全吗?不外传</div>
              <div className="cw-edutext">密钥<b>只存你的本机 / 服务端</b>,绝不上传任何第三方,也不进浏览器存储。</div>
            </div>
          </div>
        </div>
        <div className="cw-lockline"><IconLock size={12} stroke="rgba(251,244,232,.5)" />写后不回显 · 测通才放行</div>
      </aside>

      {/* ============ 右 · 操作栏 ============ */}
      <div className="cw-main">
        <div className="cw-inner">
          {step === 1 ? (
            <>
              <div className="cw-eyebrow">选一个 AI 服务商</div>
              <div className="cw-plist">
                {CW_PROVIDERS.map((p) => (
                  <button key={p.id} className={cx("cw-prow", p.rec && "rec")} onClick={() => choose(p.id)}>
                    <CwTile p={p} />
                    <div className="cw-pmid">
                      <div className="cw-pname">{p.name}{p.rec && <span className="cw-rec">推荐</span>}</div>
                      <div className="cw-ptrust">{p.trust}</div>
                    </div>
                    <span className="cw-pprice">{p.price}</span>
                    <span className="cw-parrow"><IconArrow size={18} /></span>
                  </button>
                ))}
              </div>
              <div className="cw-cancel">
                <button className="cw-cancelbtn" onClick={() => showToast("→ 设置 · AI 引擎(稍后再连)")}>
                  <IconGear size={15} />还没准备好?<u>我先去设置里配置</u>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="cw-eyebrow">三步拿到密钥</div>

              <div className="cw-chosen">
                <CwTile p={provider} />
                <div className="cw-chosenmeta">
                  <div className="cw-chosenname">{provider.name}</div>
                  <div className="cw-chosentrust">{provider.base}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep(1); setTest("idle"); }}>换一个</Button>
              </div>

              <div className="cw-guide">
                <div className="cw-gstep">
                  <Shot kind="register" />
                  <div className="cw-gnum"><span className="cw-gn">1</span><span className="cw-gt">注册账号</span></div>
                  <div className="cw-gdesc">打开 <a className="cw-glink" onClick={(e) => { e.preventDefault(); showToast("↗ 新标签打开 " + provider.reg); }}>{provider.reg}<IconExt size={11} style={{ display: "inline", marginLeft: 3, verticalAlign: "-1px" }} /></a>,注册并实名。</div>
                </div>
                <div className="cw-gstep">
                  <Shot kind="create" />
                  <div className="cw-gnum"><span className="cw-gn">2</span><span className="cw-gt">新建密钥</span></div>
                  <div className="cw-gdesc">进「API Keys / 密钥管理」,点新建,起个名字。</div>
                </div>
                <div className="cw-gstep">
                  <Shot kind="copy" />
                  <div className="cw-gnum"><span className="cw-gn">3</span><span className="cw-gt">复制粘贴</span></div>
                  <div className="cw-gdesc">把 <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>sk-</span> 开头的密钥复制,粘到下面。</div>
                </div>
              </div>

              <div className="cw-autohint"><IconCheck size={15} stroke="var(--success)" />接口地址与模型已按 {provider.name} 自动填好,不用改。</div>
              <div className="cw-locked">
                <div className="cw-lockrow">
                  <div className="cw-locklabel"><IconServer size={12} stroke="var(--ink-faint)" />base_url<span className="lk"><IconLock size={11} stroke="var(--ink-faint)" /></span></div>
                  <div className="cw-lockval" title={provider.base}>{provider.base}</div>
                </div>
                <div className="cw-lockrow">
                  <div className="cw-locklabel"><IconSparkle size={11} stroke="var(--ink-faint)" />model<span className="lk"><IconLock size={11} stroke="var(--ink-faint)" /></span></div>
                  <div className="cw-lockval">{provider.model}</div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <Field label="API Key" hint={test === "fail" ? null : "粘贴上一步复制的密钥;只存本机 / 服务端,我们看不到。"} error={test === "fail" ? "这个密钥没通过测试,检查后重试。" : null}>
                  <Input
                    type={reveal ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); if (test !== "idle" && test !== "testing") setTest("idle"); }}
                    placeholder="sk-..." autoFocus error={test === "fail"} lead={<IconKey size={17} />}
                    trailing={
                      <button type="button" aria-label={reveal ? "隐藏密钥" : "显示密钥"} aria-pressed={reveal}
                        onClick={() => setReveal((v) => !v)}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-faint)",
                          display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                          borderRadius: "var(--r-sm)", padding: 0 }}>
                        {reveal ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                      </button>
                    }
                  />
                </Field>
              </div>

              {test === "fail" && (
                <div className="cw-errbar">
                  <span className="cw-errico"><IconClose size={17} stroke="var(--danger-ink)" /></span>
                  <div>
                    <div className="cw-errtitle">没连上,先没保存</div>
                    <div className="cw-errmsg">{provider.name} 返回 <span className="cw-errcode">401 unauthorized</span>:密钥可能填错、含空格,或还没充值激活。改好再点一次「测试并连接」——测通了才会保存。</div>
                  </div>
                </div>
              )}
              {test === "ok" && (
                <div className="cw-oktag"><IconCheck size={16} stroke="var(--success)" />连接正常,已保存。这就回去继续帮你写。</div>
              )}

              <div className="cw-foot">
                <Button variant="ghost" size="md" onClick={() => { setStep(1); setTest("idle"); }}>换个服务商</Button>
                <span className="cw-grow"></span>
                {test === "ok" ? (
                  <Button variant="primary" size="lg" leading={<IconArrow size={18} />}
                    onClick={() => showToast("→ 已连上 · 继续生成")}>继续生成</Button>
                ) : (
                  <Button variant="primary" size="lg" disabled={keyEmpty || test === "testing"}
                    loading={test === "testing"}
                    leading={test === "testing" ? null : <IconSparkle size={18} />}
                    onClick={runTest}>
                    {test === "testing" ? "正在测试连接…" : "测试并连接"}
                  </Button>
                )}
              </div>
              <div className="cw-gateline"><IconLock size={12} stroke="var(--ink-faint)" />测通才放行 · 密钥只存本机 / 服务端、写后不回显,绝不上传第三方。</div>
            </>
          )}
        </div>
      </div>

      {toast && <div className="cw-toast">{toast}</div>}
    </div>
  );
}

Object.assign(window, { ConnectAiWizard, CW_PROVIDERS });
