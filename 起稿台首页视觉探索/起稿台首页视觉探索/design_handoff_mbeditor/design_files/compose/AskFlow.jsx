// MBEditor · Direction A — Compose 第 2 态:几道选择题 (AskFlow)
// README §7.3 流程1 · asking。命脉漏斗第二步,去焦虑核心:用选择题代替空白页。
//  · 三道题,每题一行说明 + 生活化例子 + 悬浮术语解释:
//    ① 受众(单选 chip)② 调子(单选 chip)③ 学笔法(两卡二选一,选「学」展开贴原文)
//  · 闸门:受众 + 调子都选中,主按钮「开始写」(v-primary sz-lg)才解禁;学笔法可跳过。
//  · 决策预算 ≤ 2:只有受众 + 调子强制(均为 chip,不打字);学笔法可选。
// props: audience · tone · learn("none"|"learn") · paste · narrow
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx(全局挂载)。
const { useState: useAfState, useRef: useAfRef } = React;

(function injectAfCss() {
  if (document.getElementById("mb-af-css")) return;
  const s = document.createElement("style");
  s.id = "mb-af-css";
  s.textContent = `
  .af{position:relative;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}
  .af .serif{font-family:var(--f-display);}

  /* ---- top bar ---- */
  .af-top{height:56px;flex:none;display:flex;align-items:center;gap:14px;padding:0 20px;
    border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 88%,transparent);
    backdrop-filter:saturate(1.1) blur(8px);z-index:6;}
  .af-back{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px 0 11px;border-radius:var(--r-md);
    background:none;border:none;color:var(--ink-soft);font-size:14px;font-family:var(--f-sans);cursor:pointer;
    transition:all var(--t-micro) var(--ease);}
  .af-back:hover{background:var(--surface-2);color:var(--ink);}
  .af-back:focus-visible{outline:none;box-shadow:var(--ring);}
  .af-grow{flex:1;}

  /* ---- scroll stage ---- */
  .af-scroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;
    padding:36px 28px 28px;}
  .af-wrap{width:100%;max-width:680px;display:flex;flex-direction:column;}

  /* intent recap */
  .af-recap{display:flex;align-items:flex-start;gap:12px;background:var(--surface-2);border:1px solid var(--line);
    border-radius:var(--r-lg);padding:14px 16px;margin-bottom:30px;}
  .af-recapico{flex:none;width:30px;height:30px;border-radius:50%;background:var(--orange-50);color:var(--orange-500);
    display:flex;align-items:center;justify-content:center;margin-top:1px;}
  .af-recapmeta{flex:1;min-width:0;}
  .af-recaplabel{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);
    margin-bottom:3px;}
  .af-recaptext{font-family:var(--f-display);font-size:15.5px;line-height:1.6;color:var(--ink);}
  .af-recapedit{flex:none;align-self:center;background:none;border:none;font-family:var(--f-sans);font-size:13px;
    font-weight:600;color:var(--orange-700);cursor:pointer;display:inline-flex;align-items:center;gap:5px;
    padding:6px 8px;border-radius:var(--r-sm);transition:background var(--t-micro) var(--ease);}
  .af-recapedit:hover{background:var(--orange-50);}

  .af-lede{font-family:var(--f-display);font-size:22px;font-weight:700;color:var(--ink-strong);margin:0 0 24px;
    line-height:1.4;}

  /* question block */
  .af-q{margin-bottom:30px;}
  .af-qhead{display:flex;align-items:baseline;gap:11px;margin-bottom:5px;}
  .af-qn{font-family:var(--f-display);font-weight:700;font-size:17px;color:var(--orange-500);flex:none;line-height:1.2;}
  .af-qtitle{font-size:16.5px;font-weight:700;color:var(--ink-strong);display:inline-flex;align-items:center;gap:8px;}
  .af-req{font-size:11px;font-weight:700;color:var(--orange-600);background:var(--orange-50);border:1px solid var(--orange-100);
    border-radius:var(--r-pill);padding:1px 8px;letter-spacing:.04em;}
  .af-opt{font-size:11px;font-weight:600;color:var(--ink-faint);background:var(--bg-sunk);border:1px solid var(--line);
    border-radius:var(--r-pill);padding:1px 8px;}
  .af-term{flex:none;width:18px;height:18px;border-radius:50%;border:1px solid var(--line-strong);color:var(--ink-faint);
    display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:help;
    font-family:var(--f-display);}
  .af-qdesc{font-size:13.5px;color:var(--ink-soft);line-height:1.6;margin:0 0 14px;padding-left:28px;}
  .af-qdesc b{color:var(--ink);font-weight:600;}
  .af-chiprow{display:flex;flex-wrap:wrap;gap:11px;padding-left:28px;}
  .af-chip{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:44px;padding:7px 17px;
    border-radius:var(--r-lg);background:var(--surface);color:var(--ink);border:1.5px solid var(--line-strong);
    font-family:var(--f-sans);cursor:pointer;transition:all var(--t-micro) var(--ease);text-align:left;}
  .af-chip:hover:not(.on){border-color:var(--orange-300);background:var(--orange-50);}
  .af-chip:focus-visible{outline:none;box-shadow:var(--ring);}
  .af-chip .cn{font-size:14.5px;font-weight:600;line-height:1.4;}
  .af-chip .cx{font-size:11.5px;color:var(--ink-faint);line-height:1.3;}
  .af-chip.on{background:var(--orange-500);color:var(--cream);border-color:var(--orange-500);
    box-shadow:0 8px 18px -10px rgba(232,85,58,.7);}
  .af-chip.on .cx{color:color-mix(in srgb,var(--cream) 80%,transparent);}

  /* learn-style: two cards */
  .af-cards{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding-left:28px;}
  .af-lcard{display:flex;flex-direction:column;gap:8px;padding:16px 17px;border-radius:var(--r-lg);
    background:var(--surface);border:1.5px solid var(--line-strong);cursor:pointer;text-align:left;
    font-family:var(--f-sans);transition:all var(--t-micro) var(--ease);}
  .af-lcard:hover:not(.on){border-color:var(--orange-300);background:var(--orange-50);}
  .af-lcard:focus-visible{outline:none;box-shadow:var(--ring);}
  .af-lcardtop{display:flex;align-items:center;gap:10px;}
  .af-lcardico{flex:none;width:32px;height:32px;border-radius:var(--r-md);background:var(--bg-sunk);color:var(--ink-soft);
    display:flex;align-items:center;justify-content:center;transition:all var(--t-micro) var(--ease);}
  .af-lcardname{font-size:14.5px;font-weight:700;color:var(--ink-strong);}
  .af-lcarddesc{font-size:12.5px;color:var(--ink-soft);line-height:1.55;}
  .af-lcard.on{border-color:var(--orange-500);background:var(--orange-50);box-shadow:0 8px 20px -12px rgba(232,85,58,.5);}
  .af-lcard.on .af-lcardico{background:var(--orange-500);color:var(--cream);}
  .af-lcard.on .af-lcardname{color:var(--orange-800);}
  .af-lcardradio{margin-left:auto;flex:none;width:20px;height:20px;border-radius:50%;border:2px solid var(--line-strong);
    display:flex;align-items:center;justify-content:center;transition:all var(--t-micro) var(--ease);}
  .af-lcard.on .af-lcardradio{border-color:var(--orange-500);background:var(--orange-500);}

  /* paste textarea (expanded when learn) */
  .af-paste{margin:14px 0 0 28px;animation:mb-rise var(--t-enter) var(--ease) both;}
  .af-pastelabel{font-size:12.5px;color:var(--ink-soft);margin-bottom:7px;display:flex;align-items:center;gap:7px;}
  .af-pastelabel .pi{color:var(--orange-500);}

  /* sticky gate footer */
  .af-foot{flex:none;display:flex;align-items:center;gap:16px;padding:14px 28px;border-top:1px solid var(--line);
    background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(8px);z-index:5;}
  .af-footmeta{display:flex;flex-direction:column;gap:2px;min-width:0;}
  .af-gatehint{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-soft);}
  .af-gatehint.ready{color:var(--success-ink);font-weight:600;}
  .af-pips{display:flex;align-items:center;gap:6px;}
  .af-pip{width:8px;height:8px;border-radius:50%;background:var(--line-strong);transition:background var(--t-base) var(--ease);}
  .af-pip.on{background:var(--success);}

  /* toast */
  .af-toast{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);z-index:50;background:var(--ink-strong);
    color:var(--cream);font-size:13.5px;font-weight:500;padding:11px 18px;border-radius:var(--r-pill);
    box-shadow:var(--sh-lg);animation:mb-rise var(--t-enter) var(--ease);max-width:88%;}

  /* ---- narrow (<600px) ---- */
  .af.narrow .af-scroll{padding:24px 16px 22px;}
  .af.narrow .af-lede{font-size:19px;}
  .af.narrow .af-qdesc,.af.narrow .af-chiprow,.af.narrow .af-cards,.af.narrow .af-paste{padding-left:0;}
  .af.narrow .af-cards{grid-template-columns:1fr;}
  .af.narrow .af-foot{flex-wrap:wrap;gap:12px;padding:12px 16px;}
  .af.narrow .af-foot .af-cta{flex:1 1 100%;}
  .af.narrow .af-foot .af-cta .mb-btn{width:100%;}
  `;
  document.head.appendChild(s);
})();

const AF_AUDIENCES = [
  { key: "life",   name: "生活同好", ex: "爱记录日常的人" },
  { key: "work",   name: "职场同好", ex: "同行 / 上班族" },
  { key: "mom",    name: "宝妈同好", ex: "也在带娃的爸妈" },
  { key: "reader", name: "读书同好", ex: "爱看书的朋友" },
  { key: "local",  name: "本地街坊", ex: "附近的老顾客" },
];
const AF_TONES = [
  { key: "warm",  name: "温暖治愈", ex: "像朋友聊天" },
  { key: "clear", name: "干货清晰", ex: "条理分明、好读" },
  { key: "play",  name: "俏皮轻松", ex: "活泼有梗" },
  { key: "lit",   name: "文艺细腻", ex: "讲究字句" },
];

function AskFlow({ audience = null, tone = null, learn = "none", paste = "", narrow = false }) {
  const [aud, setAud] = useAfState(audience);
  const [ton, setTon] = useAfState(tone);
  const [lrn, setLrn] = useAfState(learn);     // "none" | "learn"
  const [pasteText, setPasteText] = useAfState(paste);
  const [toast, setToast] = useAfState(null);
  const toastT = useAfRef(null);

  function showToast(m) { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2200); }

  const ready = !!aud && !!ton;          // gate: 受众 + 调子 都选
  const needLabel = !aud && !ton ? "还需选「受众」和「调子」"
    : !aud ? "还差「受众」没选"
    : !ton ? "还差「调子」没选"
    : "都选好啦,可以开始写";

  return (
    <div className={cx("af", narrow && "narrow")}>
      {/* top */}
      <div className="af-top">
        <button className="af-back" onClick={() => showToast("← 返回上一步 · 改改你的一句话")}><IconArrowL size={18} />返回起稿台</button>
        <span className="af-grow"></span>
        <BrandMark size={26} />
      </div>

      <div className="af-scroll">
        <div className="af-wrap">
          {/* intent recap */}
          <div className="af-recap">
            <span className="af-recapico"><IconPen size={15} /></span>
            <div className="af-recapmeta">
              <div className="af-recaplabel">你想写的</div>
              <div className="af-recaptext">今天带娃去公园,他第一次自己荡秋千,荡得老高还回头冲我笑…</div>
            </div>
            <button className="af-recapedit" onClick={() => showToast("← 回去改这句话")}><IconArrowL size={14} />改一下</button>
          </div>

          <p className="af-lede">动笔前,先回答两个小问题,我好照着你的心意写——</p>

          {/* Q1 · 受众 (required) */}
          <div className="af-q">
            <div className="af-qhead">
              <span className="af-qn">01</span>
              <span className="af-qtitle">写给谁看?
                <span className="af-term" title="受众 = 读这篇推文的人。定下来,用词和举的例子都会更贴近他们。">?</span>
                <span className="af-req">必选</span>
              </span>
            </div>
            <p className="af-qdesc">我会照这群人爱听的话来写。比如选<b>宝妈同好</b>,就多讲带娃的真实小细节。</p>
            <div className="af-chiprow" role="radiogroup" aria-label="受众">
              {AF_AUDIENCES.map((a) => (
                <button key={a.key} role="radio" aria-checked={aud === a.key}
                  className={cx("af-chip", aud === a.key && "on")} onClick={() => setAud(a.key)}>
                  <span className="cn">{a.name}</span><span className="cx">{a.ex}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Q2 · 调子 (required) */}
          <div className="af-q">
            <div className="af-qhead">
              <span className="af-qn">02</span>
              <span className="af-qtitle">想要什么味道?
                <span className="af-term" title="调子 = 文章的语气和节奏。决定用词的冷暖、句子的松紧。">?</span>
                <span className="af-req">必选</span>
              </span>
            </div>
            <p className="af-qdesc">同一件事,口吻不同感觉就不同。<b>温暖治愈</b>像朋友聊天,<b>干货清晰</b>条理分明。</p>
            <div className="af-chiprow" role="radiogroup" aria-label="调子">
              {AF_TONES.map((t) => (
                <button key={t.key} role="radio" aria-checked={ton === t.key}
                  className={cx("af-chip", ton === t.key && "on")} onClick={() => setTon(t.key)}>
                  <span className="cn">{t.name}</span><span className="cx">{t.ex}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Q3 · 学笔法 (optional) */}
          <div className="af-q">
            <div className="af-qhead">
              <span className="af-qn">03</span>
              <span className="af-qtitle">要不要学一篇的笔法?
                <span className="af-term" title="笔法 = 某篇文字的写作风格。贴一段你喜欢的,AI 会模仿那种感觉来写。">?</span>
                <span className="af-opt">可跳过</span>
              </span>
            </div>
            <p className="af-qdesc">有特别喜欢的文字风格吗?贴一段过来,我尽量写出那个味道。没有也没关系。</p>
            <div className="af-cards" role="radiogroup" aria-label="学笔法">
              <button role="radio" aria-checked={lrn === "none"}
                className={cx("af-lcard", lrn === "none" && "on")} onClick={() => setLrn("none")}>
                <div className="af-lcardtop">
                  <span className="af-lcardico"><IconSparkle size={17} /></span>
                  <span className="af-lcardname">不用了,你来写</span>
                  <span className="af-lcardradio">{lrn === "none" && <IconCheck size={13} stroke="var(--cream)" />}</span>
                </div>
                <span className="af-lcarddesc">按上面的受众和调子,放手让我自由发挥。</span>
              </button>
              <button role="radio" aria-checked={lrn === "learn"}
                className={cx("af-lcard", lrn === "learn" && "on")} onClick={() => setLrn("learn")}>
                <div className="af-lcardtop">
                  <span className="af-lcardico"><IconBook size={17} /></span>
                  <span className="af-lcardname">学这篇的笔法</span>
                  <span className="af-lcardradio">{lrn === "learn" && <IconCheck size={13} stroke="var(--cream)" />}</span>
                </div>
                <span className="af-lcarddesc">贴一段范文,我模仿它的语气和节奏来写。</span>
              </button>
            </div>
            {lrn === "learn" && (
              <div className="af-paste">
                <div className="af-pastelabel"><span className="pi"><IconPen size={14} /></span>把你喜欢的那段文字贴在这里</div>
                <Textarea rows={narrow ? 4 : 5} value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="粘贴一段你欣赏的文字(一两段就够)。我会学它怎么开头、怎么收尾、用什么样的句子。"></Textarea>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* sticky gate footer */}
      <div className="af-foot">
        <div className="af-footmeta">
          <span className={cx("af-gatehint", ready && "ready")}>
            {ready ? <IconCheck size={16} stroke="var(--success)" /> : <IconInfo size={15} stroke="var(--ink-faint)" />}
            {needLabel}
          </span>
        </div>
        <span className="af-grow"></span>
        <span className="af-pips" aria-hidden="true">
          <span className={cx("af-pip", aud && "on")}></span>
          <span className={cx("af-pip", ton && "on")}></span>
        </span>
        <span className="af-cta">
          <Button variant="primary" size="lg" disabled={!ready} leading={<IconSparkle size={18} />}
            onClick={() => ready && showToast("开始写 → 进入流式生成剧场")}>开始写</Button>
        </span>
      </div>

      {toast && <div className="af-toast">{toast}</div>}
    </div>
  );
}

Object.assign(window, { AskFlow, AF_AUDIENCES, AF_TONES });
