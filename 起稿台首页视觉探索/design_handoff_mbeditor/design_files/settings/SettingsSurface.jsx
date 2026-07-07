// MBEditor · Direction A — 设置壳层 (SettingsSurface)  README §4(行4)/§5
// 桌面:TopBar + 左 nav(4 视觉分组 / 8 叶子 key)+ 右内容。
// 窄屏(<600px):左 nav 转受控手风琴(单开),deep-link 叶子 key 不变。
// section deep-link: wechat/aiengine/voice/gateway/imagehost/appearance/editor/about
//   (editor 经 normalizeSection 归一到 appearance)
// 依赖 ds/* · settings/SettingsSections.jsx · settings/SettingsAppearance.jsx
const { useState: useSS } = React;

(function injectSetShellCss() {
  if (document.getElementById("mb-setshell-css")) return;
  const s = document.createElement("style");
  s.id = "mb-setshell-css";
  s.textContent = `
  .set{position:relative;display:flex;flex-direction:column;height:100%;background:var(--bg);color:var(--ink);
    font-family:var(--f-sans);overflow:hidden;}
  .set .serif{font-family:var(--f-display);}

  /* TopBar — same chrome as Home */
  .set-top{flex:none;height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;
    background:color-mix(in srgb,var(--surface) 86%,transparent);backdrop-filter:saturate(1.1) blur(8px);
    border-bottom:1px solid var(--line);}
  .set-brand{display:flex;align-items:center;gap:11px;background:none;border:none;cursor:pointer;padding:4px;border-radius:var(--r-sm);}
  .set-brand .nm{font-weight:700;font-size:18px;letter-spacing:.4px;color:var(--ink-strong);}
  .set-tabs{display:flex;gap:4px;}
  .set-tab{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:var(--r-md);
    font-size:14.5px;color:var(--ink-soft);background:none;border:none;cursor:pointer;transition:all var(--t-micro) var(--ease);}
  .set-tab:hover{background:var(--surface-2);color:var(--ink);}
  .set-tab.on{background:var(--orange-50);color:var(--orange-700);font-weight:600;}
  .set-hdot{width:9px;height:9px;border-radius:50%;background:var(--ink-faint);opacity:.55;}

  .set-body{flex:1;display:flex;min-height:0;}

  /* ---- left nav ---- */
  .set-nav{flex:0 0 256px;border-right:1px solid var(--line);background:var(--surface);overflow-y:auto;padding:24px 16px 40px;}
  .set-navtitle{font-family:var(--f-display);font-weight:700;font-size:21px;color:var(--ink-strong);padding:0 12px;margin:0 0 20px;}
  .set-group{margin-bottom:22px;}
  .set-glabel{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink-faint);
    padding:0 12px;margin-bottom:7px;display:flex;align-items:center;gap:7px;}
  .set-item{display:flex;align-items:center;gap:11px;width:100%;height:42px;padding:0 12px;border-radius:var(--r-md);
    background:none;border:none;cursor:pointer;font-family:var(--f-sans);font-size:14.5px;color:var(--ink-soft);
    text-align:left;transition:all var(--t-micro) var(--ease);}
  .set-item + .set-item{margin-top:2px;}
  .set-item:hover{background:var(--surface-2);color:var(--ink);}
  .set-item.on{background:var(--orange-50);color:var(--orange-700);font-weight:600;}
  .set-item .ii{flex:none;display:flex;color:inherit;}
  .set-item .igrow{flex:1;}
  .set-itemdot{width:7px;height:7px;border-radius:50%;flex:none;}

  /* ---- right content ---- */
  .set-content{flex:1;min-width:0;overflow-y:auto;}
  .set-inner{max-width:760px;margin:0 auto;padding:36px 44px 80px;}

  /* ---- narrow accordion ---- */
  .set-acc{display:flex;flex-direction:column;}
  .set-accgroup{margin-bottom:18px;}
  .set-accglabel{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink-faint);
    padding:0 4px;margin-bottom:9px;}
  .set-accitem{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface);overflow:hidden;box-shadow:var(--sh-xs);}
  .set-accitem + .set-accitem{margin-top:10px;}
  .set-acchd{display:flex;align-items:center;gap:12px;width:100%;min-height:54px;padding:0 16px;background:none;border:none;
    cursor:pointer;font-family:var(--f-sans);font-size:15.5px;font-weight:600;color:var(--ink-strong);text-align:left;
    transition:background var(--t-micro) var(--ease);}
  .set-acchd:hover{background:var(--surface-2);}
  .set-acchd.on{background:var(--orange-50);color:var(--orange-700);}
  .set-acchd .hgrow{flex:1;}
  .set-acchd .hchev{transition:transform var(--t-base) var(--ease);color:var(--ink-faint);}
  .set-acchd.on .hchev{transform:rotate(180deg);color:var(--orange-600);}
  .set-acchd .hico{flex:none;display:flex;}
  .set-accbody{padding:18px 16px 22px;border-top:1px solid var(--line);animation:mb-rise var(--t-enter) var(--ease);}

  /* ---- bottom tab (narrow) ---- */
  .set-bottom{flex:none;display:flex;border-top:1px solid var(--line);background:var(--surface);padding-bottom:env(safe-area-inset-bottom);}
  .set-bottom button{flex:1;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:3px;background:none;border:none;cursor:pointer;font-size:11.5px;color:var(--ink-soft);}
  .set-bottom button.on{color:var(--orange-600);font-weight:600;}

  .set.narrow .set-top{padding:0 18px;height:56px;}
  .set.narrow .set-inner{padding:22px 18px 28px;}
  `;
  document.head.appendChild(s);
})();

// ---- nav model: 4 visual groups → leaf keys (8) ----
const SET_GROUPS = [
  { label: "写作", icon: (p) => <IconPen {...p} />, items: [
    { key: "aiengine", name: "AI 引擎", icon: (p) => <IconSparkle {...p} /> },
    { key: "voice", name: "音色档案", icon: (p) => <IconMic {...p} /> },
  ]},
  { label: "发布", icon: (p) => <IconSend {...p} />, items: [
    { key: "wechat", name: "公众号", icon: (p) => <IcServer {...p} /> },
    { key: "gateway", name: "发布服务器", icon: (p) => <IcLink {...p} /> },
    { key: "imagehost", name: "图床", icon: (p) => <IcImage {...p} /> },
  ]},
  { label: "外观", icon: (p) => <IcSun {...p} />, items: [
    { key: "appearance", name: "外观与模式", icon: (p) => <IcLayout {...p} /> },
  ]},
  { label: "关于", icon: (p) => <IconInfo {...p} />, items: [
    { key: "about", name: "关于", icon: (p) => <IconInfo {...p} /> },
  ]},
];

// normalizeSection: editor → appearance
function normalizeSection(k) { return k === "editor" ? "appearance" : k; }

function renderSection(key, narrow, bind) {
  switch (key) {
    case "aiengine": return <AIEngineSection narrow={narrow} />;
    case "voice": return <BrandVoiceSection narrow={narrow} />;
    case "wechat": return <WeChatSection narrow={narrow} bind={bind} />;
    case "gateway": return <GatewaySection narrow={narrow} />;
    case "imagehost": return <ImageHostSection narrow={narrow} />;
    case "appearance": return <AppearanceSection narrow={narrow} />;
    case "about": return <AboutSection />;
    default: return null;
  }
}

function SettingsSurface({ narrow = false, section = "appearance", _bind = null }) {
  const start = normalizeSection(section);
  const [active, setActive] = useSS(start);       // desktop selected leaf
  const [open, setOpen] = useSS(start);           // narrow accordion single-open leaf
  const [tab, setTab] = useSS("settings");

  return (
    <div className={cx("set", narrow && "narrow")}>
      {/* TopBar */}
      <div className="set-top">
        <button className="set-brand" title="回起稿台">
          <BrandMark size={narrow ? 26 : 30} />
          {!narrow && <span className="nm serif">MBEditor</span>}
        </button>
        {!narrow && (
          <div className="set-tabs">
            <button className="set-tab"><IconHome size={17} />起稿台</button>
            <button className="set-tab on"><IconGear size={17} />设置</button>
          </div>
        )}
        <div className="set-hdot" title="写作服务正常"></div>
      </div>

      <div className="set-body">
        {narrow ? (
          /* ---- narrow: controlled accordion (single open) ---- */
          <div className="set-content">
            <div className="set-inner">
              <h1 className="set-navtitle" style={{ marginBottom: 18 }}>设置</h1>
              <div className="set-acc">
                {SET_GROUPS.map((g) => (
                  <div className="set-accgroup" key={g.label}>
                    <div className="set-accglabel">{g.label}</div>
                    {g.items.map((it) => {
                      const isOpen = open === it.key;
                      return (
                        <div className="set-accitem" key={it.key}>
                          <button className={cx("set-acchd", isOpen && "on")}
                            onClick={() => setOpen(isOpen ? null : it.key)} aria-expanded={isOpen}>
                            <span className="hico">{it.icon({ size: 19 })}</span>
                            {it.name}
                            <span className="hgrow"></span>
                            <span className="hchev"><IconChevDown size={18} /></span>
                          </button>
                          {isOpen && <div className="set-accbody ss-narrow">{renderSection(it.key, true, it.key === "wechat" ? _bind : null)}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ---- desktop: left nav + right content ---- */
          <>
            <nav className="set-nav">
              <h1 className="set-navtitle">设置</h1>
              {SET_GROUPS.map((g) => (
                <div className="set-group" key={g.label}>
                  <div className="set-glabel">{g.icon({ size: 13, stroke: "var(--ink-faint)" })}{g.label}</div>
                  {g.items.map((it) => (
                    <button key={it.key} className={cx("set-item", active === it.key && "on")}
                      onClick={() => setActive(it.key)}>
                      <span className="ii">{it.icon({ size: 18 })}</span>
                      {it.name}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="set-content">
              <div className="set-inner">{renderSection(active, false, active === "wechat" ? _bind : null)}</div>
            </div>
          </>
        )}
      </div>

      {/* BottomTabBar (narrow) */}
      {narrow && (
        <div className="set-bottom">
          <button className={cx(tab === "home" && "on")} onClick={() => setTab("home")}><IconHome size={22} />起稿台</button>
          <button className={cx(tab === "settings" && "on")} onClick={() => setTab("settings")}><IconGear size={22} />设置</button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SettingsSurface, SET_GROUPS, normalizeSection });
