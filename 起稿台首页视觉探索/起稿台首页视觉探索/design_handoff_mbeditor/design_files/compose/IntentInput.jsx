// MBEditor · Direction A — Compose 第 1 态:一句话意图 (IntentInput)
// README §7.3 流程1 · intent。命脉漏斗的第一步:
//  · 顶部恒有「← 返回起稿台」。
//  · 一句话大输入框(多行 + 左侧装饰麦克风),placeholder 降门槛。
//  · 4 个灵感胶囊(带娃日记 / 读书手记 / 上新札记 / 本地探店):点击 = 把整句示例
//    填进输入框并聚焦,治「不知道写啥」。
//  · 主按钮「落笔」(v-primary sz-lg):空文案禁用,有字才亮;⌘/Ctrl+Enter 提交。
// props: seed(预填一句话) · narrow
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx(全局挂载)。
const { useState: useIiState, useRef: useIiRef } = React;

(function injectIiCss() {
  if (document.getElementById("mb-ii-css")) return;
  const s = document.createElement("style");
  s.id = "mb-ii-css";
  s.textContent = `
  .ii{position:relative;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}
  .ii .serif{font-family:var(--f-display);}

  /* ---- top bar (compose chrome) ---- */
  .ii-top{height:56px;flex:none;display:flex;align-items:center;gap:14px;padding:0 20px;
    border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 88%,transparent);
    backdrop-filter:saturate(1.1) blur(8px);z-index:6;}
  .ii-back{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px 0 11px;border-radius:var(--r-md);
    background:none;border:none;color:var(--ink-soft);font-size:14px;font-family:var(--f-sans);cursor:pointer;
    transition:all var(--t-micro) var(--ease);}
  .ii-back:hover{background:var(--surface-2);color:var(--ink);}
  .ii-back:focus-visible{outline:none;box-shadow:var(--ring);}
  .ii-grow{flex:1;}

  /* ---- centered stage ---- */
  .ii-scroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;
    padding:48px 28px 60px;}
  .ii-wrap{width:100%;max-width:680px;display:flex;flex-direction:column;}
  .ii-greet{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;height:32px;padding:0 14px 0 11px;
    border-radius:var(--r-pill);background:var(--orange-50);color:var(--orange-700);font-size:13px;font-weight:600;
    border:1px solid var(--orange-100);margin-bottom:18px;}
  .ii-h1{font-family:var(--f-display);font-weight:700;font-size:38px;line-height:1.2;letter-spacing:.3px;
    color:var(--ink-strong);margin:0;text-wrap:balance;}
  .ii-h1 em{font-style:normal;color:var(--orange-600);}
  .ii-lead{font-size:15.5px;line-height:1.7;color:var(--ink-soft);margin:14px 0 28px;max-width:520px;}

  /* big input card */
  .ii-inputcard{position:relative;display:flex;gap:14px;background:var(--surface);border:1.5px solid var(--line-strong);
    border-radius:var(--r-xl);padding:20px 20px 18px;box-shadow:var(--sh-sm);
    transition:border-color var(--t-base) var(--ease),box-shadow var(--t-base) var(--ease);}
  .ii-inputcard.focus{border-color:var(--orange-400);box-shadow:var(--ring),var(--sh-md);}
  .ii-mic{flex:none;width:42px;height:42px;border-radius:50%;background:var(--orange-50);color:var(--orange-500);
    display:flex;align-items:center;justify-content:center;margin-top:2px;}
  .ii-ta{flex:1;min-width:0;border:none;outline:none;background:transparent;resize:none;font-family:var(--f-sans);
    font-size:18px;line-height:1.7;color:var(--ink);min-height:96px;padding:7px 0 0;}
  .ii-ta::placeholder{color:var(--ink-faint);}

  /* action row under the card */
  .ii-actions{display:flex;align-items:center;gap:16px;margin-top:20px;}
  .ii-kbd{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink-faint);}
  .ii-key{font-family:var(--f-mono);font-size:11.5px;font-weight:600;background:var(--bg-sunk);
    border:1px solid var(--line-strong);border-bottom-width:2px;border-radius:5px;padding:1px 7px;color:var(--ink-soft);}
  .ii-count{font-size:12.5px;color:var(--ink-faint);font-variant-numeric:tabular-nums;}

  /* inspiration chips */
  .ii-inspire{margin-top:38px;padding-top:26px;border-top:1px solid var(--line);}
  .ii-inspirecap{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-soft);margin-bottom:14px;}
  .ii-inspirecap .si{color:var(--orange-500);}
  .ii-chiprow{display:flex;flex-wrap:wrap;gap:11px;}
  .ii-chip{display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 18px;border-radius:var(--r-pill);
    background:var(--surface);color:var(--ink);border:1.5px solid var(--line-strong);font-family:var(--f-sans);
    font-size:14.5px;font-weight:500;cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .ii-chip:hover{border-color:var(--orange-300);background:var(--orange-50);transform:translateY(-1px);}
  .ii-chip:active{transform:translateY(0);}
  .ii-chip:focus-visible{outline:none;box-shadow:var(--ring);}
  .ii-chip .ci{flex:none;color:var(--orange-500);display:flex;}

  /* toast */
  .ii-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--ink-strong);
    color:var(--cream);font-size:13.5px;font-weight:500;padding:11px 18px;border-radius:var(--r-pill);
    box-shadow:var(--sh-lg);animation:mb-rise var(--t-enter) var(--ease);max-width:88%;}

  /* ---- narrow (<600px) ---- */
  .ii.narrow .ii-scroll{padding:28px 16px 44px;}
  .ii.narrow .ii-h1{font-size:27px;}
  .ii.narrow .ii-lead{font-size:14.5px;margin:12px 0 22px;}
  .ii.narrow .ii-inputcard{padding:15px 15px 14px;gap:10px;}
  .ii.narrow .ii-mic{width:36px;height:36px;}
  .ii.narrow .ii-ta{font-size:16.5px;min-height:104px;}
  .ii.narrow .ii-actions{flex-direction:column-reverse;align-items:stretch;gap:12px;}
  .ii.narrow .ii-actions .ii-cta{width:100%;}
  .ii.narrow .ii-kbd{justify-content:center;}
  .ii.narrow .ii-chip{height:42px;}
  `;
  document.head.appendChild(s);
})();

// seed sentences — chips drop a whole example in, so 「不知道写啥」一点就有
const II_SEEDS = [
  { key: "baby",  label: "带娃日记", icon: (p) => <IconStroller {...p} />,
    seed: "今天带娃去公园,他第一次自己荡秋千,荡得老高还回头冲我笑,那一瞬间觉得他突然长大了。" },
  { key: "book",  label: "读书手记", icon: (p) => <IconBook {...p} />,
    seed: "这周读完一本书,最打动我的是结尾那几句话,想把当时的几点感想认真记下来。" },
  { key: "shop",  label: "上新札记", icon: (p) => <IconStore {...p} />,
    seed: "小店这周上了几款新东西,想写一篇好看的上新札记,介绍给一直关照的老顾客。" },
  { key: "local", label: "本地探店", icon: (p) => <IconPin {...p} />,
    seed: "周末去了家新开的咖啡馆,环境很安静、一杯手冲也用心,想安利给附近的街坊。" },
];

function IntentInput({ seed = "", narrow = false }) {
  const [text, setText] = useIiState(seed);
  const [focus, setFocus] = useIiState(false);
  const [toast, setToast] = useIiState(null);
  const taRef = useIiRef(null);
  const toastT = useIiRef(null);

  function showToast(m) { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2200); }
  function fillSeed(s) {
    setText(s);
    const el = taRef.current;
    if (el) { el.focus(); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s.length; }); }
  }
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) {
      e.preventDefault();
      showToast("落笔 → 进入「几道选择题」");
    }
  }

  const empty = !text.trim();
  const count = text.trim().length;
  const mac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");

  return (
    <div className={cx("ii", narrow && "narrow")}>
      {/* top */}
      <div className="ii-top">
        <button className="ii-back" onClick={() => showToast("← 返回起稿台")}><IconArrowL size={18} />返回起稿台</button>
        <span className="ii-grow"></span>
        <BrandMark size={26} />
      </div>

      <div className="ii-scroll">
        <div className="ii-wrap">
          <span className="ii-greet"><IconSparkle size={15} stroke="var(--orange-600)" />第一次来呀~ 随口讲一句就行</span>
          <h1 className="ii-h1">想写点什么?<em>讲给我听</em>就好</h1>
          <p className="ii-lead">用大白话说一句你想写的事,我来帮你写成一篇排版好看、能直接发的公众号推文。全程不用碰代码。</p>

          {/* big multiline input */}
          <div className={cx("ii-inputcard", focus && "focus")}>
            <span className="ii-mic" aria-hidden="true"><IconMic size={20} /></span>
            <textarea
              ref={taRef}
              className="ii-ta"
              value={text}
              placeholder="比如:今天带娃去公园,他第一次自己荡秋千,荡得老高还回头冲我笑…"
              aria-label="说一句你想写的事"
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              onKeyDown={onKey}
            ></textarea>
          </div>

          {/* action row */}
          <div className="ii-actions">
            <span className="ii-cta">
              <Button variant="primary" size="lg" disabled={empty} leading={<IconPen size={18} />}
                style={{ width: narrow ? "100%" : undefined }}
                onClick={() => !empty && showToast("落笔 → 进入「几道选择题」")}>落笔</Button>
            </span>
            <span className="ii-kbd">
              <span className="ii-key">{mac ? "⌘" : "Ctrl"}</span><span className="ii-key">Enter</span>也能落笔
            </span>
            <span className="ii-grow"></span>
            {!empty && <span className="ii-count">{count} 字</span>}
          </div>

          {/* inspiration chips */}
          <div className="ii-inspire">
            <div className="ii-inspirecap"><span className="si"><IconSparkle size={15} /></span>不知道写啥?点一个,我先帮你起个头</div>
            <div className="ii-chiprow">
              {II_SEEDS.map((s) => (
                <button key={s.key} className="ii-chip" onClick={() => fillSeed(s.seed)}>
                  <span className="ci">{s.icon({ size: 17 })}</span>{s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="ii-toast">{toast}</div>}
    </div>
  );
}

Object.assign(window, { IntentInput, II_SEEDS });
