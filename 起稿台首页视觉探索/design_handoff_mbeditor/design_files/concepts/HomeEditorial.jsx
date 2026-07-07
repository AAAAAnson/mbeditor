// Direction B — Editorial-Clean · 「专业排版工具」
// Near-minimal B/W/gray, huge whitespace, orange = the ONLY accent. Serif heads + sans body.
// Shows the returning-user state: restrained hero + 最近的文章 grid.
function HomeEditorial() {
  const arts = [
    { t: "立秋这天,给老茶客的一封信", w: "1,240 字", d: "前天", k: "已复制" },
    { t: "三年带娃,我把焦虑写成了日记", w: "2,080 字", d: "上周三", k: "草稿箱" },
    { t: "巷口那家面馆,开了十九年", w: "960 字", d: "上周一", k: "已复制" },
    { t: "读《活着》后,只想说三句话", w: "1,510 字", d: "10 月 6 日", k: "—" },
    { t: "秋季上新 · 五件耐穿的好物", w: "780 字", d: "10 月 2 日", k: "草稿箱" },
    { t: "给同好们的本月书单", w: "1,120 字", d: "9 月 28 日", k: "已复制" },
  ];
  return (
    <div className="ed">
      <style>{`
      .ed{font-family:"Noto Sans SC",system-ui,sans-serif;color:#1b1b1a;background:#fcfcfa;width:1280px;
        --ink:#1b1b1a;--gray:#74726c;--line:#e7e5df;--orange:#e8553a;}
      .ed *{box-sizing:border-box;}
      .ed .serif{font-family:"Source Serif 4","Noto Serif SC",serif;}
      .ed .caps{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gray);}
      .ed .topbar{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;border-bottom:1px solid var(--line);}
      .ed .brand{display:flex;align-items:center;gap:12px;}
      .ed .brand .nm{font-weight:600;font-size:18px;letter-spacing:.3px;}
      .ed .tabs{display:flex;gap:30px;}
      .ed .tab{font-size:14px;color:var(--gray);padding-bottom:2px;}
      .ed .tab.on{color:var(--ink);border-bottom:2px solid var(--orange);font-weight:600;}
      .ed .hdot{width:8px;height:8px;border-radius:50%;background:#c9c7c0;opacity:.6;}
      .ed .hero{padding:64px 44px 40px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center;}
      .ed .eyebrow{margin-bottom:18px;}
      .ed h1{font-size:52px;line-height:1.12;font-weight:600;letter-spacing:.3px;margin:0;}
      .ed h1 em{font-style:italic;color:var(--orange);}
      .ed .lead{font-size:16px;color:var(--gray);line-height:1.75;margin-top:20px;max-width:440px;}
      .ed .inline{display:flex;align-items:center;border:1px solid var(--line);border-radius:6px;background:#fff;margin-top:30px;max-width:480px;}
      .ed .inline .ph{flex:1;padding:15px 18px;color:#a7a49c;font-size:15px;}
      .ed .inline .go{display:flex;align-items:center;gap:8px;background:var(--orange);color:#fff;font-weight:600;font-size:14.5px;padding:13px 20px;margin:5px;border-radius:4px;}
      .ed .paths{display:flex;flex-direction:column;gap:0;border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden;}
      .ed .path{display:flex;align-items:center;gap:16px;padding:22px 24px;border-bottom:1px solid var(--line);}
      .ed .path:last-child{border-bottom:none;}
      .ed .path .pn{width:30px;font-size:12px;color:var(--gray);}
      .ed .path .ic{width:36px;height:36px;border:1px solid var(--line);border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--ink);flex:none;}
      .ed .path.primary .ic{background:var(--orange);border-color:var(--orange);color:#fff;}
      .ed .path .pt{font-weight:600;font-size:16px;}
      .ed .path.primary .pt{color:var(--orange);}
      .ed .path .pd{font-size:12.5px;color:var(--gray);margin-top:2px;}
      .ed .path .arr{margin-left:auto;color:#b8b5ad;}
      .ed .sec{padding:40px 44px 60px;}
      .ed .sechead{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:8px;}
      .ed .sechead h2{font-size:15px;font-weight:600;letter-spacing:.04em;}
      .ed .grid{display:grid;grid-template-columns:repeat(3,1fr);}
      .ed .art{padding:26px 28px 26px 0;border-bottom:1px solid var(--line);border-right:1px solid var(--line);margin-right:28px;display:flex;flex-direction:column;gap:14px;min-height:150px;}
      .ed .art:nth-child(3n){border-right:none;margin-right:0;padding-right:0;}
      .ed .art .num{font-size:12px;color:#bdbab2;letter-spacing:.1em;}
      .ed .art .at{font-family:"Source Serif 4","Noto Serif SC",serif;font-size:20px;font-weight:600;line-height:1.35;flex:1;}
      .ed .art .meta{display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--gray);}
      .ed .art .meta .k{margin-left:auto;color:var(--ink);}
      .ed .art .meta .k.c{color:var(--orange);}
      `}</style>
      <div className="topbar">
        <div className="brand"><BrandMark size={30} radius={26} /><span className="nm serif">MBEditor</span></div>
        <div className="tabs"><span className="tab on">起稿台</span><span className="tab">设置</span></div>
        <div className="hdot" title="服务正常"></div>
      </div>
      <div className="hero">
        <div>
          <div className="caps eyebrow">动动嘴 · 排版就好了</div>
          <h1 className="serif">把一句话,<br />写成一篇<em>能直接发</em>的推文。</h1>
          <p className="lead">所见即所得地预览,你在这里看到的,就是粘进公众号后的样子——不多一分花哨,不少一分排版。</p>
          <div className="inline">
            <span className="ph">说一句你想写的事…</span>
            <span className="go"><IconSparkle size={16} stroke="#fff" />让 AI 帮我写</span>
          </div>
        </div>
        <div className="paths">
          <div className="path primary">
            <span className="pn">01</span><span className="ic"><IconSparkle size={18} stroke="#fff" /></span>
            <div><div className="pt">让 AI 帮我写</div><div className="pd">一句话,流式写出整篇</div></div>
            <span className="arr"><IconArrow size={18} /></span>
          </div>
          <div className="path">
            <span className="pn">02</span><span className="ic"><IconTemplate size={18} /></span>
            <div><div className="pt">套用模板</div><div className="pd">从范文改起,稳妥省心</div></div>
            <span className="arr"><IconArrow size={18} /></span>
          </div>
          <div className="path">
            <span className="pn">03</span><span className="ic"><IconBlank size={18} /></span>
            <div><div className="pt">空白自己写</div><div className="pd">一张白纸,自由发挥</div></div>
            <span className="arr"><IconArrow size={18} /></span>
          </div>
        </div>
      </div>
      <div className="sec">
        <div className="sechead"><h2 className="serif">最近的文章</h2><span className="caps">共 6 篇</span></div>
        <div className="grid">
          {arts.map((a, i) => (
            <div className="art" key={a.t}>
              <div className="num">{String(i + 1).padStart(2, "0")}</div>
              <div className="at">{a.t}</div>
              <div className="meta"><IconClock size={14} stroke="#74726c" />{a.d}<span>{a.w}</span><span className={"k" + (a.k === "已复制" ? " c" : "")}>{a.k}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.HomeEditorial = HomeEditorial;
