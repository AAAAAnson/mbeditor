// Direction A — Warm-Friendly · 「被照顾的小帮手」
// Cream base, orange as sparing anchor, mint = success/safety, humanist serif headlines.
function HomeWarm() {
  const caps = ["带娃日记", "读书手记", "上新札记", "本地探店"];
  const templates = [
    { t: "带娃的一天", d: "把今天的小事写成有温度的日记", tag: "亲子" },
    { t: "一本书的笔记", d: "读完想说的话,整理成清爽书评", tag: "阅读" },
    { t: "新品上架", d: "三段话讲清楚一件好东西", tag: "小店" },
    { t: "本地探店", d: "一家店的味道与样子,带人去逛", tag: "生活" },
    { t: "节气问候", d: "应景的一段话,发给老朋友们", tag: "节令" },
  ];
  return (
    <div className="warm">
      <style>{`
      .warm{font-family:"Noto Sans SC",system-ui,sans-serif;color:#3a332c;background:#fbf6ee;width:1280px;
        --ink:#3a332c;--ink-soft:#7c7064;--line:#ece2d4;--card:#fffdf9;--orange:#e8553a;--mint:#3f8f72;}
      .warm *{box-sizing:border-box;}
      .warm .serif{font-family:"Noto Serif SC","Newsreader",serif;}
      .warm .topbar{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;border-bottom:1px solid var(--line);background:#fdfaf4;}
      .warm .brand{display:flex;align-items:center;gap:11px;}
      .warm .brand .nm{font-weight:700;font-size:18px;letter-spacing:.5px;}
      .warm .tabs{display:flex;gap:6px;}
      .warm .tab{display:flex;align-items:center;gap:7px;padding:8px 15px;border-radius:11px;font-size:14.5px;color:var(--ink-soft);}
      .warm .tab.on{background:#f3e7d8;color:var(--ink);font-weight:600;}
      .warm .hdot{width:9px;height:9px;border-radius:50%;background:#cbb8a3;opacity:.6;}
      .warm .hero{padding:54px 80px 40px;display:flex;flex-direction:column;align-items:center;text-align:center;}
      .warm .greet{display:inline-flex;align-items:center;gap:8px;background:#f5e7d6;color:#9a5a2e;font-size:13.5px;font-weight:600;padding:7px 15px;border-radius:999px;}
      .warm h1{font-size:46px;line-height:1.18;margin:22px 0 12px;font-weight:700;letter-spacing:.5px;}
      .warm h1 .hl{color:var(--orange);}
      .warm .sub{font-size:17px;color:var(--ink-soft);max-width:560px;line-height:1.7;}
      .warm .inputwrap{margin-top:30px;width:100%;max-width:680px;background:var(--card);border:1.5px solid var(--line);border-radius:20px;
        box-shadow:0 18px 44px -28px rgba(120,80,40,.4);padding:14px 14px 14px 22px;display:flex;align-items:center;gap:14px;}
      .warm .mic{width:42px;height:42px;border-radius:13px;background:#f5ede1;color:#a98a63;display:flex;align-items:center;justify-content:center;flex:none;}
      .warm .ph{flex:1;text-align:left;color:#a99c8b;font-size:16.5px;}
      .warm .cta{display:inline-flex;align-items:center;gap:9px;background:var(--orange);color:#fff;font-weight:700;font-size:16px;
        padding:14px 22px;border-radius:15px;flex:none;box-shadow:0 10px 22px -10px rgba(232,85,58,.7);}
      .warm .caps{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:18px;}
      .warm .cap{font-size:14px;color:var(--ink-soft);background:#fff;border:1px solid var(--line);padding:8px 16px;border-radius:999px;}
      .warm .cap b{color:var(--orange);font-weight:700;}
      .warm .alt{display:flex;gap:16px;justify-content:center;margin-top:30px;}
      .warm .altcard{display:flex;align-items:center;gap:13px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 22px;min-width:236px;text-align:left;}
      .warm .altcard .ic{width:38px;height:38px;border-radius:11px;background:#f3ece1;color:#8c7a64;display:flex;align-items:center;justify-content:center;flex:none;}
      .warm .altcard .at{font-weight:600;font-size:15px;}
      .warm .altcard .ad{font-size:12.5px;color:var(--ink-soft);margin-top:2px;}
      .warm .safe{margin-top:34px;display:inline-flex;align-items:center;gap:8px;color:var(--mint);font-size:13px;}
      .warm .sec{padding:14px 80px 64px;}
      .warm .sechead{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px;}
      .warm .sechead .st{font-size:21px;font-weight:700;}
      .warm .sechead .ss{font-size:14px;color:var(--ink-soft);}
      .warm .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;}
      .warm .tpl{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 18px;display:flex;flex-direction:column;gap:10px;min-height:178px;}
      .warm .tpl .thumb{height:54px;border-radius:12px;background:linear-gradient(135deg,#f7ede0,#f1e2cf);display:flex;align-items:center;justify-content:center;color:#caa478;}
      .warm .tpl .tt{font-weight:700;font-size:16px;}
      .warm .tpl .td{font-size:13px;color:var(--ink-soft);line-height:1.55;flex:1;}
      .warm .tpl .tg{align-self:flex-start;font-size:11.5px;color:#9a5a2e;background:#f5e7d6;padding:3px 10px;border-radius:999px;}
      `}</style>
      {/* TopBar */}
      <div className="topbar">
        <div className="brand"><BrandMark size={30} /><span className="nm serif">MBEditor</span></div>
        <div className="tabs">
          <span className="tab on"><IconHome size={17} />起稿台</span>
          <span className="tab"><IconGear size={17} />设置</span>
        </div>
        <div className="hdot" title="服务正常"></div>
      </div>
      {/* Hero */}
      <div className="hero">
        <span className="greet"><IconSparkle size={15} stroke="#9a5a2e" />第一次来呀~ 先不用想太多</span>
        <h1 className="serif">随口讲一句,<span className="hl">排版就交给我</span></h1>
        <p className="sub">你说想写点什么,我帮你写成一篇好看、能直接发的公众号推文。全程不用碰代码。</p>
        <div className="inputwrap">
          <span className="mic"><IconMic size={20} /></span>
          <span className="ph">比如:今天带娃去公园,他第一次自己荡秋千…</span>
          <span className="cta"><IconSparkle size={18} stroke="#fff" />让 AI 帮我写</span>
        </div>
        <div className="caps">
          {caps.map((c) => <span className="cap" key={c}>试试 <b>{c}</b></span>)}
        </div>
        <div className="alt">
          <div className="altcard"><span className="ic"><IconTemplate size={20} /></span><div><div className="at">套用模板</div><div className="ad">挑个范文,改成你的</div></div></div>
          <div className="altcard"><span className="ic"><IconBlank size={20} /></span><div><div className="at">空白自己写</div><div className="ad">从一张白纸开始</div></div></div>
        </div>
        <span className="safe"><Icon size={15} stroke="#3f8f72"><rect x="5" y="10" width="14" height="9" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></Icon>用你自己的 AI 账号,几分钱一篇,内容不经我们服务器</span>
      </div>
      {/* Template wall */}
      <div className="sec">
        <div className="sechead"><span className="st serif">不知道从哪开始?挑个模板套进去</span><span className="ss">5 套生活化范文</span></div>
        <div className="grid">
          {templates.map((t) => (
            <div className="tpl" key={t.t}>
              <div className="thumb"><IconPen size={22} /></div>
              <div className="tt">{t.t}</div>
              <div className="td">{t.d}</div>
              <span className="tg">{t.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.HomeWarm = HomeWarm;
