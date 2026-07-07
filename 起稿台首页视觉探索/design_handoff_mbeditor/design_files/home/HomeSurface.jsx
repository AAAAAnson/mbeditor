// MBEditor · Direction A — 起稿台 / Home (HomeSurface)
// 唯一着陆页:sticky hero 永远给三条创建路径(AI 主 / 模板 / 空白),
// 下方按 articles.length 分支:空库→模板墙(5 范文)/ 有稿→最近的文章网格。
// 状态:firstVisit(仅改 hero 文案)· busy(创建中三 CTA 禁用)· deletingId · 删除二次确认。
// 响应式由 `narrow` prop 驱动(对应 <600px 单列 + hero 字号 clamp + 底部 tab)。
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx(已全局挂载)。
const { useState, useRef } = React;

(function injectHomeCss() {
  if (document.getElementById("mb-home-css")) return;
  const s = document.createElement("style");
  s.id = "mb-home-css";
  s.textContent = `
  .home{position:relative;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--f-sans);
    display:flex;flex-direction:column;min-height:100%;}
  .home .serif{font-family:var(--f-display);}

  /* ---- TopBar (sticky) ---- */
  .home-top{position:sticky;top:0;z-index:30;height:60px;display:flex;align-items:center;justify-content:space-between;
    padding:0 32px;background:color-mix(in srgb,var(--surface) 86%,transparent);
    backdrop-filter:saturate(1.1) blur(8px);border-bottom:1px solid var(--line);}
  .home-brand{display:flex;align-items:center;gap:11px;background:none;border:none;cursor:pointer;padding:4px;border-radius:var(--r-sm);}
  .home-brand .nm{font-weight:700;font-size:18px;letter-spacing:.4px;color:var(--ink-strong);}
  .home-tabs{display:flex;gap:4px;}
  .home-tab{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:var(--r-md);
    font-size:14.5px;color:var(--ink-soft);background:none;border:none;cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .home-tab:hover{background:var(--surface-2);color:var(--ink);}
  .home-tab.on{background:var(--orange-50);color:var(--orange-700);font-weight:600;}
  .home-hdot{width:9px;height:9px;border-radius:50%;background:var(--ink-faint);opacity:.55;}

  /* ---- Scroll body ---- */
  .home-scroll{flex:1;overflow-y:auto;}

  /* ---- Hero ---- */
  .home-hero{padding:52px 64px 36px;display:flex;flex-direction:column;align-items:center;text-align:center;}
  .home-greet{display:inline-flex;align-items:center;gap:8px;background:var(--orange-50);color:var(--orange-700);
    font-size:13.5px;font-weight:600;padding:7px 16px;border-radius:var(--r-pill);}
  .home-h1{font-size:clamp(28px,4.4vw,46px);line-height:1.16;margin:20px 0 12px;font-weight:700;letter-spacing:.4px;
    color:var(--ink-strong);max-width:680px;text-wrap:balance;}
  .home-h1 .hl{color:var(--orange-500);}
  .home-sub{font-size:clamp(15px,1.5vw,17.5px);color:var(--ink-soft);max-width:540px;line-height:1.7;margin:0;}

  /* path 1 — primary AI input */
  .home-ai{margin-top:30px;width:100%;max-width:700px;background:var(--surface);border:1.5px solid var(--line-strong);
    border-radius:var(--r-2xl);box-shadow:var(--sh-lg);padding:14px 14px 14px 20px;display:flex;align-items:center;gap:14px;
    transition:border-color var(--t-base) var(--ease),box-shadow var(--t-base) var(--ease);}
  .home-ai:focus-within{border-color:var(--orange-400);box-shadow:var(--sh-lg),var(--ring);}
  .home-ai .mic{width:44px;height:44px;border-radius:var(--r-md);background:var(--orange-50);color:var(--orange-500);
    display:flex;align-items:center;justify-content:center;flex:none;}
  .home-ai input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:var(--f-sans);
    font-size:16.5px;color:var(--ink);}
  .home-ai input::placeholder{color:var(--ink-faint);}

  /* inspiration capsules */
  .home-caps{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-top:16px;}
  .home-cap{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink-soft);background:var(--surface);
    border:1px solid var(--line);padding:7px 14px;border-radius:var(--r-pill);cursor:pointer;
    transition:all var(--t-micro) var(--ease);}
  .home-cap:hover{border-color:var(--orange-300);color:var(--orange-700);background:var(--orange-50);}
  .home-cap[disabled]{opacity:.5;cursor:not-allowed;}

  /* paths 2 & 3 — secondary cards */
  .home-alt{display:flex;gap:14px;justify-content:center;margin-top:26px;flex-wrap:wrap;}
  .home-altcard{display:flex;align-items:center;gap:13px;background:var(--surface);border:1px solid var(--line);
    border-radius:var(--r-lg);padding:14px 22px;min-width:248px;text-align:left;cursor:pointer;box-shadow:var(--sh-xs);
    transition:all var(--t-micro) var(--ease);}
  .home-altcard:hover{border-color:var(--line-strong);box-shadow:var(--sh-sm);transform:translateY(-1px);}
  .home-altcard[disabled]{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}
  .home-altcard .ic{width:40px;height:40px;border-radius:var(--r-md);background:var(--bg-sunk);color:var(--ink-soft);
    display:flex;align-items:center;justify-content:center;flex:none;}
  .home-altcard .at{font-weight:600;font-size:15px;color:var(--ink-strong);}
  .home-altcard .ad{font-size:12.5px;color:var(--ink-soft);margin-top:2px;}

  .home-safe{margin-top:30px;display:inline-flex;align-items:center;gap:8px;color:var(--success-ink);font-size:13px;
    background:var(--success-soft);padding:8px 15px;border-radius:var(--r-pill);}

  /* ---- Section below hero ---- */
  .home-sec{padding:6px 64px 64px;}
  .home-sechead{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px;}
  .home-sechead .st{font-size:22px;font-weight:700;color:var(--ink-strong);}
  .home-sechead .ss{font-size:13.5px;color:var(--ink-soft);flex:none;}

  /* template wall */
  .home-tplgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;}
  .home-tpl{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px;
    display:flex;flex-direction:column;gap:11px;min-height:188px;cursor:pointer;box-shadow:var(--sh-xs);
    transition:all var(--t-micro) var(--ease);}
  .home-tpl:hover{border-color:var(--orange-200);box-shadow:var(--sh-md);transform:translateY(-2px);}
  .home-tpl[disabled]{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}
  .home-tpl .thumb{height:58px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;}
  .home-tpl .tt{font-weight:700;font-size:16px;color:var(--ink-strong);}
  .home-tpl .td{font-size:12.5px;color:var(--ink-soft);line-height:1.55;flex:1;}

  /* recent grid */
  .home-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
  .home-art{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;
    box-shadow:var(--sh-xs);display:flex;flex-direction:column;transition:all var(--t-micro) var(--ease);position:relative;}
  .home-art:hover{border-color:var(--line-strong);box-shadow:var(--sh-md);transform:translateY(-2px);}
  .home-art .cover{height:104px;display:flex;align-items:flex-end;padding:14px 16px;position:relative;}
  .home-art .cover .pin{position:absolute;top:12px;right:12px;}
  .home-art .body{padding:14px 16px 12px;display:flex;flex-direction:column;gap:8px;flex:1;}
  .home-art .at{font-weight:700;font-size:16px;color:var(--ink-strong);line-height:1.4;}
  .home-art .ax{font-size:12.5px;color:var(--ink-soft);line-height:1.6;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;}
  .home-art .meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-faint);}
  .home-art .meta .dot{width:3px;height:3px;border-radius:50%;background:var(--ink-faint);}
  .home-art .acts{display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);padding:10px 12px;}
  .home-art .acts .grow{flex:1;}
  .home-art-del{position:absolute;inset:0;background:color-mix(in srgb,var(--surface) 78%,transparent);
    backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;gap:9px;color:var(--ink-soft);
    font-size:13.5px;z-index:2;}

  /* in-frame confirm overlay (contained, not viewport-fixed) */
  .home-confirm{position:absolute;inset:0;z-index:60;background:rgba(58,40,22,.32);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;padding:24px;animation:mb-fade var(--t-base) var(--ease);}
  .home-confirm .box{background:var(--surface);border-radius:var(--r-2xl);box-shadow:var(--sh-xl);width:100%;max-width:380px;
    padding:24px 24px 18px;animation:mb-pop var(--t-enter) var(--ease-spring);}

  /* ---- BottomTabBar (narrow only) ---- */
  .home-bottom{display:flex;border-top:1px solid var(--line);background:var(--surface);
    padding-bottom:env(safe-area-inset-bottom);}
  .home-bottom button{flex:1;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:3px;background:none;border:none;cursor:pointer;font-size:11.5px;color:var(--ink-soft);}
  .home-bottom button.on{color:var(--orange-600);font-weight:600;}

  /* ---- narrow overrides ---- */
  .home.narrow .home-top{padding:0 18px;height:56px;}
  .home.narrow .home-hero{padding:32px 18px 26px;}
  .home.narrow .home-ai{flex-direction:column;align-items:stretch;gap:12px;padding:16px;border-radius:var(--r-xl);}
  .home.narrow .home-ai .mic{width:38px;height:38px;}
  .home.narrow .home-ai .airow{display:flex;align-items:center;gap:12px;}
  .home.narrow .home-alt{flex-direction:column;}
  .home.narrow .home-altcard{min-width:0;}
  .home.narrow .home-sec{padding:4px 18px 28px;}
  .home.narrow .home-tplgrid{grid-template-columns:1fr;}
  .home.narrow .home-grid{grid-template-columns:1fr;}
  .home.narrow .home-sechead .st{font-size:19px;}
  `;
  document.head.appendChild(s);
})();

// ---- seed content ----
const HOME_CAPS = [
  { label: "带娃日记", seed: "今天带娃去公园,他第一次自己荡秋千…", icon: IconStroller },
  { label: "读书手记", seed: "刚读完一本书,有几句话特别想记下来…", icon: IconBook },
  { label: "上新札记", seed: "店里新到了一批好东西,想介绍给老顾客…", icon: IconStore },
  { label: "本地探店", seed: "巷子里发现一家小店,味道和样子都想分享…", icon: IconPin },
];

const HOME_TEMPLATES = [
  { t: "带娃的一天", d: "把今天的小事写成有温度的日记", tone: ["#f7ede0", "#f0ddc8", "var(--orange-400)"], icon: IconStroller },
  { t: "一本书的笔记", d: "读完想说的话,整理成清爽书评", tone: ["#e8eef4", "#dbe6f0", "var(--info)"], icon: IconBook },
  { t: "新品上架", d: "三段话讲清楚一件好东西", tone: ["#e6f1ea", "#d6ebe0", "var(--success)"], icon: IconStore },
  { t: "本地探店", d: "一家店的味道与样子,带人去逛", tone: ["#faedce", "#f3e0b6", "var(--warning)"], icon: IconPin },
  { t: "节气问候", d: "应景的一段话,发给老朋友们", tone: ["#fdeee9", "#fbdccf", "var(--orange-500)"], icon: IconSparkle },
];

const SEED_ARTICLES = [
  { id: "a1", t: "周末带娃逛了趟植物园,他认识了第一片银杏", x: "原本只想随便走走,没想到他蹲在落叶堆里看了整整二十分钟。回来的路上一直在问,叶子为什么会变黄。", date: "今天 14:20", words: 842, status: "draft", tone: ["#f7ede0", "#f0ddc8", "var(--orange-400)"] },
  { id: "a2", t: "《被讨厌的勇气》读完了,记三句最戳我的话", x: "课题分离这件事,说起来简单做起来难。但至少现在,我能分清哪些焦虑本来就不属于我。", date: "昨天 21:08", words: 1136, status: "published", tone: ["#e8eef4", "#dbe6f0", "var(--info)"] },
  { id: "a3", t: "本周上新|三款手冲豆子,附冲煮参数", x: "这次选的都是中浅烘,果酸明亮。日晒耶加给到了柑橘和茉莉,水温建议压到 90 度。", date: "3 天前", words: 658, status: "draft", tone: ["#e6f1ea", "#d6ebe0", "var(--success)"] },
  { id: "a4", t: "巷子深处那家面馆,开了十二年", x: "老板娘记得每个熟客的口味。我的那碗永远是宽面、多醋、辣子另放——她说,这样面不坨。", date: "上周", words: 974, status: "published", tone: ["#faedce", "#f3e0b6", "var(--warning)"] },
  { id: "a5", t: "立冬了,给远方的朋友们写几句", x: "天冷了,记得添衣。这一年我们都没怎么见面,但每次想起,心里都是暖的。", date: "11 月 7 日", words: 521, status: "draft", tone: ["#fdeee9", "#fbdccf", "var(--orange-500)"] },
  { id: "a6", t: "整理了一份阳台种菜的新手清单", x: "其实不用很大地方,一个朝南的阳台就够。小葱、薄荷、生菜最好养,基本死不了。", date: "11 月 3 日", words: 1290, status: "draft", tone: ["#e8eef4", "#dbe6f0", "var(--info)"] },
];

function StatusTag({ status }) {
  return status === "published"
    ? <Tag color="success" leading={<IconCheck size={12} />}>已发布</Tag>
    : <Tag color="neutral" leading={<IconPen size={12} />}>草稿</Tag>;
}

function HomeSurface({ narrow = false, firstVisit = false, initialArticles = [] }) {
  const [articles, setArticles] = useState(initialArticles);
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(null);      // null | "ai" | "template" | "blank"
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [tab, setTab] = useState("home");
  const timer = useRef(null);

  const isBusy = busy !== null;
  const hasArticles = articles.length > 0;

  // create paths — set busy, mimic navigation handoff to /new
  function create(kind) {
    if (isBusy) return;
    setBusy(kind);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBusy(null), 1600);
  }

  function confirmDelete() {
    const id = confirmId;
    setConfirmId(null);
    setDeletingId(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setArticles((a) => a.filter((x) => x.id !== id));
      setDeletingId(null);
    }, 900);
  }

  const target = articles.find((a) => a.id === confirmId);

  return (
    <div className={cx("home", narrow && "narrow")}>
      {/* ---- TopBar ---- */}
      <div className="home-top">
        <button className="home-brand" title="回起稿台">
          <BrandMark size={narrow ? 26 : 30} />
          {!narrow && <span className="nm serif">MBEditor</span>}
        </button>
        {!narrow && (
          <div className="home-tabs">
            <button className="home-tab on"><IconHome size={17} />起稿台</button>
            <button className="home-tab"><IconGear size={17} />设置</button>
          </div>
        )}
        <div className="home-hdot" title="写作服务正常"></div>
      </div>

      <div className="home-scroll">
        {/* ---- Hero (3 creation paths) ---- */}
        <div className="home-hero">
          {firstVisit
            ? <span className="home-greet"><IconSparkle size={15} />第一次来呀~ 随口讲一句就行</span>
            : <span className="home-greet"><IconPen size={15} />欢迎回来,今天想写点什么</span>}
          <h1 className="home-h1 serif">
            {firstVisit ? <>说一句话,<span className="hl">排版我来搞定</span></> : <>动动嘴,<span className="hl">下一篇就出来了</span></>}
          </h1>
          <p className="home-sub">
            {firstVisit
              ? "你说想写点什么,我帮你写成一篇好看、能直接发的公众号推文。全程不碰代码。"
              : "随口讲一句,我接着帮你写成排版好看、能直接发的推文。"}
          </p>

          {/* path 1 — AI (primary, heaviest) */}
          <div className="home-ai">
            {narrow ? (
              <>
                <div className="airow">
                  <span className="mic"><IconMic size={18} /></span>
                  <input value={intent} onChange={(e) => setIntent(e.target.value)}
                    placeholder="比如:今天带娃去公园,他第一次自己荡秋千…" disabled={isBusy} />
                </div>
                <Button variant="primary" size="lg" disabled={isBusy} loading={busy === "ai"}
                  leading={busy !== "ai" && <IconSparkle size={18} />} onClick={() => create("ai")}
                  style={{ width: "100%" }}>让 AI 帮我写</Button>
              </>
            ) : (
              <>
                <span className="mic"><IconMic size={20} /></span>
                <input value={intent} onChange={(e) => setIntent(e.target.value)}
                  placeholder="比如:今天带娃去公园,他第一次自己荡秋千…" disabled={isBusy} />
                <Button variant="primary" size="lg" disabled={isBusy} loading={busy === "ai"}
                  leading={busy !== "ai" && <IconSparkle size={18} />} onClick={() => create("ai")}>让 AI 帮我写</Button>
              </>
            )}
          </div>

          {/* inspiration capsules */}
          <div className="home-caps">
            <span style={{ fontSize: 13, color: "var(--ink-faint)", alignSelf: "center" }}>不知道写啥?试试</span>
            {HOME_CAPS.map((c) => {
              const I = c.icon;
              return (
                <button key={c.label} className="home-cap" disabled={isBusy}
                  onClick={() => { setIntent(c.seed); }}>
                  <I size={14} stroke="var(--orange-500)" />{c.label}
                </button>
              );
            })}
          </div>

          {/* paths 2 & 3 — secondary */}
          <div className="home-alt">
            <button className="home-altcard" disabled={isBusy} onClick={() => create("template")}>
              <span className="ic">{busy === "template" ? <span className="mb-spin"></span> : <IconTemplate size={20} />}</span>
              <div><div className="at">套用模板</div><div className="ad">挑个范文,改成你的</div></div>
            </button>
            <button className="home-altcard" disabled={isBusy} onClick={() => create("blank")}>
              <span className="ic">{busy === "blank" ? <span className="mb-spin"></span> : <IconBlank size={20} />}</span>
              <div><div className="at">空白自己写</div><div className="ad">从一张白纸开始</div></div>
            </button>
          </div>

          <span className="home-safe">
            <IconLock size={14} stroke="var(--success-ink)" />
            用你自己的 AI 账号,一篇几分钱,内容不经我们服务器
          </span>
        </div>

        {/* ---- Branch: empty → template wall / has → recent grid ---- */}
        {hasArticles ? (
          <div className="home-sec">
            <div className="home-sechead">
              <span className="st serif">最近的文章</span>
              <span className="ss">{articles.length} 篇</span>
            </div>
            <div className="home-grid">
              {articles.map((a) => (
                <div className="home-art" key={a.id}>
                  {deletingId === a.id && (
                    <div className="home-art-del"><span className="mb-spin"></span>正在删除…</div>
                  )}
                  <div className="cover" style={{ background: `linear-gradient(135deg,${a.tone[0]},${a.tone[1]})` }}>
                    <span className="pin" style={{ color: a.tone[2] }}><a.iconish /></span>
                    <StatusTag status={a.status} />
                  </div>
                  <div className="body">
                    <div className="at">{a.t}</div>
                    <div className="ax">{a.x}</div>
                    <div className="meta">
                      <IconClock size={13} /><span>{a.date}</span>
                      <span className="dot"></span><span>{a.words} 字</span>
                    </div>
                  </div>
                  <div className="acts">
                    <Button variant="secondary" size="sm" leading={<IconPen size={15} />}
                      onClick={() => {}} disabled={isBusy || deletingId === a.id}>打开</Button>
                    <span className="grow"></span>
                    <Button variant="danger" size="sm" iconOnly aria-label="删除"
                      onClick={() => setConfirmId(a.id)} disabled={deletingId === a.id}>
                      <Icon size={16}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"></path></Icon>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="home-sec">
            <div className="home-sechead">
              <span className="st serif">不知道从哪开始?挑个模板套进去</span>
              <span className="ss">5 套生活化范文</span>
            </div>
            <div className="home-tplgrid">
              {HOME_TEMPLATES.map((t) => {
                const I = t.icon;
                return (
                  <button className="home-tpl" key={t.t} disabled={isBusy} onClick={() => create("template")}>
                    <div className="thumb" style={{ background: `linear-gradient(135deg,${t.tone[0]},${t.tone[1]})`, color: t.tone[2] }}>
                      <I size={24} />
                    </div>
                    <div className="tt">{t.t}</div>
                    <div className="td">{t.d}</div>
                    <Tag color="neutral" leading={<IconArrow size={12} />}>套用</Tag>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- BottomTabBar (narrow) ---- */}
      {narrow && (
        <div className="home-bottom">
          <button className={cx(tab === "home" && "on")} onClick={() => setTab("home")}>
            <IconHome size={22} />起稿台
          </button>
          <button className={cx(tab === "settings" && "on")} onClick={() => setTab("settings")}>
            <IconGear size={22} />设置
          </button>
        </div>
      )}

      {/* ---- Delete confirm (contained overlay) ---- */}
      {target && (
        <div className="home-confirm" onClick={() => setConfirmId(null)}>
          <div className="box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={{ width: 42, height: 42, borderRadius: "var(--r-md)", background: "var(--danger-soft)",
                color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Icon size={20}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"></path></Icon>
              </span>
              <div className="t-heading" style={{ fontSize: 18 }}>删除这篇文章?</div>
            </div>
            <p className="t-body" style={{ color: "var(--ink-soft)", margin: "0 0 4px" }}>
              「{target.t.length > 18 ? target.t.slice(0, 18) + "…" : target.t}」将被删除,草稿缓存也会一并清除。此操作无法撤销。
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <Button variant="ghost" size="md" onClick={() => setConfirmId(null)}>再想想</Button>
              <Button variant="danger" size="md" onClick={confirmDelete}
                leading={<Icon size={16}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"></path></Icon>}>删除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// give each seed article an icon component for the cover pin
SEED_ARTICLES.forEach((a, i) => { a.iconish = [IconStroller, IconBook, IconStore, IconPin, IconSparkle, IconBook][i % 6]; });

Object.assign(window, { HomeSurface, SEED_ARTICLES });
