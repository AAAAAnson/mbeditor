// Direction C — Playful-Confident · 「上手零压力」
// Orange-led bright palette + vibrant chip accents, rounded display type, geometric M motif, confident delight.
function HomePlayful() {
  const caps = [
    { t: "带娃日记", c: "#E8553A", b: "#fdece7" },
    { t: "读书手记", c: "#2BA89A", b: "#e3f4f1" },
    { t: "上新札记", c: "#E0A12B", b: "#fbf1da" },
    { t: "本地探店", c: "#6C7BE0", b: "#ebedfb" },
  ];
  const templates = [
    { t: "带娃的一天", c: "#E8553A", b: "#fdece7" },
    { t: "一本书的笔记", c: "#2BA89A", b: "#e3f4f1" },
    { t: "新品上架", c: "#E0A12B", b: "#fbf1da" },
    { t: "本地探店", c: "#6C7BE0", b: "#ebedfb" },
    { t: "节气问候", c: "#D8567F", b: "#fce8ef" },
  ];
  // little rounded-M chevron derived from the logo
  const Chev = ({ s = 40, c = "#E8553A" }) => (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-hidden="true"><path d="M20 70 L50 35 L80 70" fill="none" stroke={c} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round"></path></svg>
  );
  return (
    <div className="pf">
      <style>{`
      .pf{font-family:"Noto Sans SC",system-ui,sans-serif;color:#2a2320;background:#fff7ef;width:1280px;position:relative;overflow:hidden;
        --ink:#2a2320;--gray:#8b7d72;--orange:#e8553a;}
      .pf *{box-sizing:border-box;}
      .pf .round{font-family:"Baloo 2","ZCOOL KuaiLe",system-ui,sans-serif;}
      .pf .zk{font-family:"ZCOOL KuaiLe","Baloo 2",sans-serif;}
      .pf .blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.5;z-index:0;}
      .pf .topbar{position:relative;z-index:2;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;}
      .pf .brand{display:flex;align-items:center;gap:11px;}
      .pf .brand .nm{font-weight:700;font-size:20px;letter-spacing:.5px;}
      .pf .tabs{display:flex;gap:8px;background:#fff;padding:5px;border-radius:14px;box-shadow:0 6px 18px -10px rgba(180,90,40,.4);}
      .pf .tab{display:flex;align-items:center;gap:7px;padding:8px 16px;border-radius:10px;font-size:14.5px;color:var(--gray);font-weight:600;}
      .pf .tab.on{background:var(--orange);color:#fff;}
      .pf .hdot{width:10px;height:10px;border-radius:50%;background:#2BA89A;}
      .pf .hero{position:relative;z-index:2;padding:36px 70px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;}
      .pf .badge{display:inline-flex;align-items:center;gap:8px;background:#fff;color:var(--orange);font-weight:700;font-size:14px;padding:9px 18px;border-radius:999px;box-shadow:0 8px 20px -12px rgba(232,85,58,.7);}
      .pf h1{font-size:62px;line-height:1.08;margin:20px 0 14px;font-weight:700;letter-spacing:1px;}
      .pf h1 .pop{color:var(--orange);position:relative;display:inline-block;}
      .pf h1 .pop svg{position:absolute;top:-30px;right:-30px;}
      .pf .sub{font-size:18px;color:var(--gray);max-width:600px;line-height:1.7;}
      .pf .inputwrap{margin-top:30px;width:100%;max-width:720px;background:#fff;border-radius:24px;
        box-shadow:0 24px 50px -24px rgba(200,90,40,.55);padding:16px 16px 16px 24px;display:flex;align-items:center;gap:16px;border:2px solid #fde3d8;}
      .pf .mic{width:46px;height:46px;border-radius:14px;background:#fff2ec;color:var(--orange);display:flex;align-items:center;justify-content:center;flex:none;}
      .pf .ph{flex:1;text-align:left;color:#bcab9d;font-size:17px;}
      .pf .cta{display:inline-flex;align-items:center;gap:9px;background:var(--orange);color:#fff;font-weight:700;font-size:17px;padding:16px 26px;border-radius:16px;flex:none;box-shadow:0 12px 24px -10px rgba(232,85,58,.8);}
      .pf .caps{display:flex;flex-wrap:wrap;gap:11px;justify-content:center;margin-top:20px;}
      .pf .cap{font-size:14.5px;font-weight:600;padding:9px 18px;border-radius:999px;}
      .pf .alt{display:flex;gap:14px;justify-content:center;margin-top:26px;}
      .pf .altbtn{display:inline-flex;align-items:center;gap:9px;background:#fff;border:2px solid #f1e2d4;color:var(--ink);font-weight:600;font-size:15px;padding:12px 22px;border-radius:14px;}
      .pf .altbtn .ic{color:var(--orange);}
      .pf .sec{position:relative;z-index:2;padding:30px 70px 60px;}
      .pf .sechead{text-align:center;margin-bottom:26px;}
      .pf .sechead .st{font-size:26px;font-weight:700;}
      .pf .sechead .ss{font-size:15px;color:var(--gray);margin-top:6px;}
      .pf .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;}
      .pf .tpl{background:#fff;border-radius:22px;padding:22px 20px;display:flex;flex-direction:column;gap:14px;min-height:194px;box-shadow:0 16px 34px -22px rgba(150,90,50,.5);border:2px solid #fff;}
      .pf .tpl .thumb{height:74px;border-radius:16px;display:flex;align-items:center;justify-content:center;}
      .pf .tpl .tt{font-weight:700;font-size:17px;}
      .pf .tpl .tp{font-size:13px;color:var(--gray);display:flex;align-items:center;gap:6px;margin-top:auto;}
      `}</style>
      <div className="blob" style={{ width: 340, height: 340, background: "#ffd9c7", top: -120, left: -80 }}></div>
      <div className="blob" style={{ width: 280, height: 280, background: "#d6f0ea", top: 60, right: -90 }}></div>
      <div className="blob" style={{ width: 200, height: 200, background: "#fdeccb", bottom: 120, left: 40 }}></div>
      <div className="topbar">
        <div className="brand"><BrandMark size={34} radius={26} /><span className="nm round">MBEditor</span></div>
        <div className="tabs"><span className="tab on"><IconHome size={17} stroke="#fff" />起稿台</span><span className="tab"><IconGear size={17} />设置</span></div>
        <div className="hdot" title="服务正常"></div>
      </div>
      <div className="hero">
        <span className="badge"><IconSparkle size={15} stroke="#e8553a" />第一次来?随口讲一句就行</span>
        <h1 className="zk">动动嘴,<span className="pop">排版就好了<Chev s={42} /></span></h1>
        <p className="sub">说一句你想写的事,我来写成一篇好看、能直接发的推文。第一次,就能做出让自己满意的样子。</p>
        <div className="inputwrap">
          <span className="mic"><IconMic size={22} /></span>
          <span className="ph">比如:周末摆摊卖了第一杯手冲,有点小激动…</span>
          <span className="cta"><IconSparkle size={19} stroke="#fff" />让 AI 帮我写</span>
        </div>
        <div className="caps">
          {caps.map((c) => <span className="cap" key={c.t} style={{ background: c.b, color: c.c }}>{c.t}</span>)}
        </div>
        <div className="alt">
          <span className="altbtn"><span className="ic"><IconTemplate size={19} /></span>套用模板</span>
          <span className="altbtn"><span className="ic"><IconBlank size={19} /></span>空白自己写</span>
        </div>
      </div>
      <div className="sec">
        <div className="sechead"><div className="st round">挑个模板,一点就有内容</div><div className="ss">不知道写啥?这 5 套最受欢迎</div></div>
        <div className="grid">
          {templates.map((t) => (
            <div className="tpl" key={t.t} style={{ borderColor: t.b }}>
              <div className="thumb" style={{ background: t.b }}><Chev s={40} c={t.c} /></div>
              <div className="tt">{t.t}</div>
              <div className="tp"><IconArrow size={15} stroke={t.c} />套进去改成我的</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.HomePlayful = HomePlayful;
