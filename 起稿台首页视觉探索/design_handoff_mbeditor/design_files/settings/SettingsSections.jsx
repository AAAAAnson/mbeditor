// MBEditor · Direction A — 设置内容区 (6 Section + 公众号绑定向导)
// README §4(行4)/§5。每个 Section 是一个纯内容渲染器,同时被桌面右栏与窄屏手风琴复用。
// 写作: AIEngine / BrandVoice · 发布: WeChat / Gateway / ImageHost · 外观: Appearance(内含 Editor) · 关于: About
// 依赖 ds/theme.css · ds/icons.jsx · ds/ui.jsx · compose/ConnectAiWizard.jsx(CW_PROVIDERS)。
const { useState: useS, useRef: useR } = React;

(function injectSetSecCss() {
  if (document.getElementById("mb-setsec-css")) return;
  const s = document.createElement("style");
  s.id = "mb-setsec-css";
  s.textContent = `
  /* ---- shared section scaffold ---- */
  .ss-head{margin-bottom:24px;}
  .ss-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:1.6px;
    text-transform:uppercase;color:var(--orange-600);margin-bottom:12px;}
  .ss-title{font-family:var(--f-display);font-weight:700;font-size:27px;line-height:1.2;color:var(--ink-strong);margin:0;}
  .ss-sub{font-size:14px;line-height:1.65;color:var(--ink-soft);margin:9px 0 0;max-width:560px;}

  .ss-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-xl);box-shadow:var(--sh-xs);
    overflow:hidden;margin-bottom:18px;}
  .ss-cardhd{display:flex;align-items:center;gap:11px;padding:16px 20px;border-bottom:1px solid var(--line);}
  .ss-cardhd .ct{font-weight:700;font-size:15.5px;color:var(--ink-strong);}
  .ss-cardhd .cgrow{flex:1;}
  .ss-cardbody{padding:18px 20px;}

  /* ---- setting row (label + control) ---- */
  .ss-row{display:flex;align-items:flex-start;gap:18px;padding:15px 0;border-bottom:1px solid var(--line);}
  .ss-row:last-child{border-bottom:0;padding-bottom:0;}
  .ss-row:first-child{padding-top:0;}
  .ss-rowmain{flex:1;min-width:0;}
  .ss-rowlabel{font-weight:600;font-size:14.5px;color:var(--ink-strong);}
  .ss-rowdesc{font-size:12.5px;line-height:1.55;color:var(--ink-soft);margin-top:3px;}
  .ss-rowctrl{flex:none;display:flex;align-items:center;gap:10px;padding-top:2px;}

  /* ---- source / key badges ---- */
  .ss-badge{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:var(--r-pill);
    font-size:12px;font-weight:600;}
  .ss-badge.saved{background:var(--success-soft);color:var(--success-ink);}
  .ss-badge.session{background:var(--warning-soft);color:var(--warning-ink);}
  .ss-badge.none{background:var(--bg-sunk);color:var(--ink-soft);}
  .ss-badge.env{background:var(--info-soft);color:var(--info-ink);}

  /* ---- wechat account rows ---- */
  .ss-acct{display:flex;align-items:center;gap:14px;padding:15px 18px;border:1.5px solid var(--line);
    border-radius:var(--r-lg);cursor:pointer;background:var(--surface);transition:all var(--t-micro) var(--ease);}
  .ss-acct + .ss-acct{margin-top:10px;}
  .ss-acct:hover{border-color:var(--line-strong);background:var(--surface-2);}
  .ss-acct.on{border-color:var(--orange-400);background:var(--orange-50);box-shadow:var(--ring);}
  .ss-radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--line-strong);flex:none;position:relative;
    transition:all var(--t-micro) var(--ease);}
  .ss-acct.on .ss-radio{border-color:var(--orange-500);}
  .ss-acct.on .ss-radio::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--orange-500);}
  .ss-acctav{width:42px;height:42px;border-radius:var(--r-md);flex:none;display:flex;align-items:center;
    justify-content:center;font-family:var(--f-display);font-weight:700;font-size:17px;color:var(--cream);}
  .ss-acctmid{flex:1;min-width:0;}
  .ss-acctname{font-weight:700;font-size:15px;color:var(--ink-strong);display:flex;align-items:center;gap:9px;}
  .ss-acctid{font-family:var(--f-mono);font-size:11.5px;color:var(--ink-soft);margin-top:3px;}

  /* ---- preset list (aiengine) ---- */
  .ss-preset{display:flex;align-items:center;gap:13px;padding:13px 14px;border:1.5px solid var(--line);
    border-radius:var(--r-md);cursor:pointer;background:var(--surface);transition:all var(--t-micro) var(--ease);text-align:left;width:100%;font-family:var(--f-sans);}
  .ss-preset + .ss-preset{margin-top:9px;}
  .ss-preset:hover{border-color:var(--orange-300);background:var(--orange-50);}
  .ss-preset.on{border-color:var(--orange-400);background:var(--orange-50);}
  .ss-ptile{width:38px;height:38px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;
    font-family:var(--f-display);font-weight:700;font-size:17px;background:var(--bg-sunk);color:var(--ink-strong);
    box-shadow:inset 0 0 0 1px var(--line);}
  .ss-ptile.cur{background:var(--ink-strong);color:var(--cream);box-shadow:none;}
  .ss-pmid{flex:1;min-width:0;}
  .ss-pname{font-weight:700;font-size:14.5px;color:var(--ink-strong);display:flex;align-items:center;gap:8px;}
  .ss-ptrust{font-size:12px;color:var(--ink-soft);margin-top:2px;}
  .ss-pprice{font-family:var(--f-mono);font-size:11.5px;color:var(--ink-soft);flex:none;}

  /* ---- mode card selector (appearance) ---- */
  .ss-modes{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .ss-mode{position:relative;text-align:left;padding:18px;border:1.5px solid var(--line-strong);border-radius:var(--r-lg);
    background:var(--surface);cursor:pointer;transition:all var(--t-base) var(--ease);font-family:var(--f-sans);}
  .ss-mode:hover{border-color:var(--orange-300);}
  .ss-mode.on{border-color:var(--orange-500);background:var(--orange-50);box-shadow:var(--sh-sm);}
  .ss-modetop{display:flex;align-items:center;gap:11px;margin-bottom:11px;}
  .ss-modeico{width:40px;height:40px;border-radius:var(--r-md);flex:none;display:flex;align-items:center;justify-content:center;
    background:var(--bg-sunk);color:var(--ink-soft);transition:all var(--t-base) var(--ease);}
  .ss-mode.on .ss-modeico{background:var(--orange-500);color:var(--cream);}
  .ss-modenm{font-weight:700;font-size:16px;color:var(--ink-strong);}
  .ss-moderec{font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--orange-600);
    border:1px solid color-mix(in srgb,var(--orange-300) 70%,transparent);border-radius:var(--r-pill);padding:1px 7px;margin-left:7px;}
  .ss-modedesc{font-size:12.5px;line-height:1.6;color:var(--ink-soft);}
  .ss-modechk{position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;background:var(--orange-500);
    display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);transition:all var(--t-base) var(--ease-spring);}
  .ss-mode.on .ss-modechk{opacity:1;transform:scale(1);}

  /* ---- pro unlock preview ---- */
  .ss-unlock{margin-top:14px;background:var(--bg-sunk);border:1px dashed var(--line-strong);border-radius:var(--r-lg);
    padding:16px 18px;}
  .ss-unlockhd{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:var(--ink-strong);margin-bottom:13px;}
  .ss-unlockgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px 18px;}
  .ss-unlockitem{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--ink-soft);}
  .ss-unlockitem .uk{width:24px;height:24px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;
    background:var(--surface);color:var(--orange-600);box-shadow:inset 0 0 0 1px var(--line);}

  /* ---- swatch / pill option groups ---- */
  .ss-opts{display:flex;flex-wrap:wrap;gap:9px;}
  .ss-swatch{display:inline-flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;}
  .ss-swatchbox{width:54px;height:40px;border-radius:var(--r-sm);border:2px solid transparent;box-shadow:inset 0 0 0 1px var(--line);
    transition:all var(--t-micro) var(--ease);position:relative;overflow:hidden;}
  .ss-swatch.on .ss-swatchbox{border-color:var(--orange-500);box-shadow:var(--ring);}
  .ss-swatchlab{font-size:11.5px;color:var(--ink-soft);}
  .ss-swatch.on .ss-swatchlab{color:var(--ink-strong);font-weight:600;}

  .ss-pillopt{height:36px;padding:0 15px;border-radius:var(--r-pill);border:1.5px solid var(--line-strong);background:var(--surface);
    font-family:var(--f-sans);font-size:13.5px;color:var(--ink);cursor:pointer;transition:all var(--t-micro) var(--ease);
    display:inline-flex;align-items:center;gap:7px;}
  .ss-pillopt:hover{border-color:var(--orange-300);}
  .ss-pillopt.on{border-color:var(--orange-500);background:var(--orange-50);color:var(--orange-700);font-weight:600;}

  /* ---- slider (font size) ---- */
  .ss-slider{display:flex;align-items:center;gap:14px;}
  .ss-slider input[type=range]{flex:1;accent-color:var(--orange-500);height:4px;}
  .ss-slidernum{font-family:var(--f-mono);font-size:13px;color:var(--ink-strong);min-width:46px;text-align:right;}

  /* ---- about ---- */
  .ss-about-rows{display:flex;flex-direction:column;}
  .ss-about-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid var(--line);}
  .ss-about-row:last-child{border-bottom:0;}
  .ss-about-k{font-size:13.5px;color:var(--ink-soft);}
  .ss-about-v{font-family:var(--f-mono);font-size:13px;color:var(--ink-strong);}

  /* ---- empty (voice) ---- */
  .ss-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:30px 24px;gap:12px;}
  .ss-emptyico{width:56px;height:56px;border-radius:50%;background:var(--bg-sunk);color:var(--ink-faint);
    display:flex;align-items:center;justify-content:center;}

  /* ---- trait chips ---- */
  .ss-traits{display:flex;flex-wrap:wrap;gap:8px;}
  .ss-trait{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 13px;border-radius:var(--r-pill);
    background:var(--orange-50);color:var(--orange-700);font-size:12.5px;font-weight:500;border:1px solid color-mix(in srgb,var(--orange-200) 70%,transparent);}

  /* ---- bind wizard overlay ---- */
  .bw-ov{position:absolute;inset:0;z-index:70;background:rgba(58,40,22,.36);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;padding:24px;animation:mb-fade var(--t-base) var(--ease);}
  .bw{background:var(--surface);border-radius:var(--r-2xl);box-shadow:var(--sh-xl);width:100%;max-width:520px;
    overflow:hidden;animation:mb-pop var(--t-enter) var(--ease-spring);display:flex;flex-direction:column;max-height:100%;}
  .bw-top{display:flex;align-items:center;gap:13px;padding:20px 22px;border-bottom:1px solid var(--line);}
  .bw-topico{width:42px;height:42px;border-radius:var(--r-md);background:var(--success-soft);color:var(--success);
    display:flex;align-items:center;justify-content:center;flex:none;}
  .bw-toptitle{font-weight:700;font-size:17px;color:var(--ink-strong);}
  .bw-topsub{font-size:12.5px;color:var(--ink-soft);margin-top:2px;}
  .bw-steps{display:flex;align-items:center;gap:9px;padding:14px 22px;border-bottom:1px solid var(--line);background:var(--surface-2);}
  .bw-stepdot{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink-faint);}
  .bw-stepdot.on{color:var(--orange-700);}
  .bw-stepdot.done{color:var(--success-ink);}
  .bw-stepn{width:22px;height:22px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;
    justify-content:center;font-size:11px;flex:none;}
  .bw-stepdot.on .bw-stepn{background:var(--orange-500);color:var(--cream);border-color:var(--orange-500);}
  .bw-stepdot.done .bw-stepn{background:var(--success);color:#fff;border-color:var(--success);}
  .bw-stepsep{flex:1;height:1px;background:var(--line-strong);max-width:40px;}
  .bw-body{padding:22px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;}
  .bw-foot{display:flex;align-items:center;gap:10px;padding:16px 22px;border-top:1px solid var(--line);}
  .bw-foot .fgrow{flex:1;}
  .bw-okbar{display:flex;align-items:center;gap:9px;background:var(--success-soft);color:var(--success-ink);
    border-left:3px solid var(--success);border-radius:var(--r-sm);padding:11px 14px;font-size:13px;font-weight:600;animation:mb-rise var(--t-enter) var(--ease);}
  .bw-errbar{display:flex;align-items:flex-start;gap:10px;background:var(--danger-soft);color:var(--danger-ink);
    border-left:3px solid var(--danger);border-radius:var(--r-sm);padding:12px 14px;animation:mb-rise var(--t-enter) var(--ease);}

  /* ---- narrow tweaks ---- */
  .ss-narrow .ss-modes{grid-template-columns:1fr;}
  .ss-narrow .ss-unlockgrid{grid-template-columns:1fr;}
  .ss-narrow .ss-row{flex-direction:column;gap:11px;}
  .ss-narrow .ss-rowctrl{padding-top:0;}
  .ss-narrow .ss-title{font-size:23px;}
  `;
  document.head.appendChild(s);
})();

// ---- local icons (inline SVG, no emoji) ----
const IcImage = (p) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.2"></rect><circle cx="8.5" cy="9.5" r="1.6"></circle><path d="M4 16l4.5-4 4 3.5L16 12l4 4"></path></Icon>;
const IcType  = (p) => <Icon {...p}><path d="M5 6.5V5h14v1.5"></path><path d="M12 5v14"></path><path d="M9 19h6"></path></Icon>;
const IcLayout= (p) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 5v14"></path><path d="M9 11h11"></path></Icon>;
const IcDensity=(p) => <Icon {...p}><path d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></Icon>;
const IcPlus  = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"></path></Icon>;
const IcTrash = (p) => <Icon {...p}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"></path></Icon>;
const IcImport= (p) => <Icon {...p}><path d="M12 3v11"></path><path d="M8 10l4 4 4-4"></path><path d="M5 19h14"></path></Icon>;
const IcServer= (p) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="6" rx="1.6"></rect><rect x="3.5" y="13.5" width="17" height="6" rx="1.6"></rect><path d="M7 7.5v.1M7 16.5v.1"></path></Icon>;
const IcCert  = (p) => <Icon {...p}><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"></path><path d="M9 12l2 2 4-4"></path></Icon>;
const IcKey   = (p) => <Icon {...p}><circle cx="8" cy="15" r="4.2"></circle><path d="M11 12l8.5-8.5"></path><path d="M16 7l2.5 2.5"></path><path d="M18.5 4.5L21 7"></path></Icon>;
const IcSun   = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"></path></Icon>;
const IcLink  = (p) => <Icon {...p}><path d="M9 15l6-6"></path><path d="M11 6l1.5-1.5a4 4 0 0 1 5.7 5.7L16 12"></path><path d="M13 18l-1.5 1.5a4 4 0 0 1-5.7-5.7L8 12"></path></Icon>;
const IcCode  = (p) => <Icon {...p}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"></path></Icon>;
const IcPhone = (p) => <Icon {...p}><rect x="7" y="3" width="10" height="18" rx="2.4"></rect><path d="M11 18h2"></path></Icon>;
const IcTree  = (p) => <Icon {...p}><rect x="4" y="4" width="6" height="5" rx="1"></rect><path d="M7 9v4h6M13 13v3"></path><rect x="13" y="11" width="6" height="4" rx="1"></rect><rect x="13" y="16" width="6" height="4" rx="1"></rect></Icon>;
const IcShield2=(p) => <Icon {...p}><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"></path></Icon>;

// ====================================================================
//  公众号绑定向导 (WeChatBindWizard) — step0 名称+AppID → step1 AppSecret
//  闸门:测连接通过才解锁「确认绑定」;改密钥重置 tested。
// ====================================================================
function WeChatBindWizard({ initialStep = 0, initialTest = "idle", onClose }) {
  const [step, setStep] = useS(initialStep);
  const [name, setName] = useS(initialStep > 0 ? "城南旧事" : "");
  const [appid, setAppid] = useS(initialStep > 0 ? "wx8a1b2c3d4e5f6g7h" : "");
  const [secret, setSecret] = useS(initialTest !== "idle" ? "9f3c••••••••••••••a1b2" : "");
  const [test, setTest] = useS(initialTest); // idle | testing | fail | ok
  const tt = useR(null);

  const step0Ok = name.trim() && appid.trim().length >= 8;
  function runTest() {
    if (!secret.trim()) return;
    setTest("testing");
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setTest(secret.trim().length < 10 ? "fail" : "ok"), 1400);
  }

  return (
    <div className="bw-ov" onClick={onClose}>
      <div className="bw" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bw-top">
          <span className="bw-topico"><IcServer size={20} stroke="var(--success)" /></span>
          <div style={{ flex: 1 }}>
            <div className="bw-toptitle">添加公众号</div>
            <div className="bw-topsub">填好 AppID 与密钥,测通才能绑定。密钥只存服务端、不进浏览器。</div>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="关闭" onClick={onClose}><IconClose size={18} /></Button>
        </div>

        <div className="bw-steps">
          <span className={cx("bw-stepdot", step === 0 && "on", step > 0 && "done")}>
            <span className="bw-stepn">{step > 0 ? <IconCheck size={13} stroke="#fff" /> : "1"}</span>账号信息
          </span>
          <span className="bw-stepsep"></span>
          <span className={cx("bw-stepdot", step === 1 && "on")}>
            <span className="bw-stepn">2</span>密钥 + 测连接
          </span>
        </div>

        <div className="bw-body">
          {step === 0 ? (
            <>
              <Field label="公众号名称" hint="只用于你在这里识别,可随便起。">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如:城南旧事" autoFocus />
              </Field>
              <Field label="AppID(开发者 ID)" hint="公众号后台 → 设置与开发 → 基本配置 里复制。">
                <Input value={appid} onChange={(e) => setAppid(e.target.value)} placeholder="wx..." lead={<IcServer size={16} />} />
              </Field>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-strong)" }}>{name || "未命名公众号"}</div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-soft)" }}>{appid}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep(0); setTest("idle"); }}>改</Button>
              </div>
              <Field label="AppSecret(开发者密码)" optional
                hint={test === "fail" ? null : "服务器已存可留空。只存服务端、写后不回显,绝不进浏览器。"}
                error={test === "fail" ? "这个密钥没测通,检查后重试。" : null}>
                <Input type="password" value={secret} error={test === "fail"}
                  onChange={(e) => { setSecret(e.target.value); if (test !== "testing") setTest("idle"); }}
                  placeholder="粘贴 AppSecret" lead={<IcKey size={16} />} />
              </Field>
              {test === "ok" && (
                <div className="bw-okbar"><IconCheck size={16} stroke="var(--success)" />测通了!可以确认绑定了。</div>
              )}
              {test === "fail" && (
                <div className="bw-errbar">
                  <IconWarn size={17} stroke="var(--danger-ink)" />
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    微信返回 <span style={{ fontFamily: "var(--f-mono)" }}>40001 invalid credential</span>:AppSecret 可能填错或已重置。改好再测一次——测通了才能绑定。
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bw-foot">
          {step === 1 && <Button variant="ghost" size="md" onClick={() => { setStep(0); setTest("idle"); }} leading={<IconArrowL size={16} />}>上一步</Button>}
          <span className="fgrow"></span>
          <Button variant="ghost" size="md" onClick={onClose}>取消</Button>
          {step === 0 ? (
            <Button variant="primary" size="md" disabled={!step0Ok} trailing={<IconArrow size={16} />}
              onClick={() => setStep(1)}>下一步</Button>
          ) : test === "ok" ? (
            <Button variant="primary" size="md" leading={<IconCheck size={17} />}
              onClick={onClose}>确认绑定</Button>
          ) : (
            <Button variant="primary" size="md" disabled={!secret.trim() || test === "testing"}
              loading={test === "testing"} leading={test === "testing" ? null : <IcLink size={16} />}
              onClick={runTest}>{test === "testing" ? "正在测试…" : "测试连接"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// shared head
function SecHead({ eyebrow, title, sub }) {
  return (
    <div className="ss-head">
      <div className="ss-eyebrow">{eyebrow}</div>
      <h2 className="ss-title">{title}</h2>
      {sub && <p className="ss-sub">{sub}</p>}
    </div>
  );
}

// ====================================================================
//  公众号 (WeChat)
// ====================================================================
const WX_ACCOUNTS = [
  { id: "w1", name: "城南旧事", appid: "wx8a1b2c3d4e5f6g7h", state: "saved", grad: "linear-gradient(135deg,#3f8f72,#2f6f57)" },
  { id: "w2", name: "小店日常", appid: "wx2f3e4d5c6b7a8901", state: "session", grad: "linear-gradient(135deg,var(--orange-400),var(--orange-600))" },
  { id: "w3", name: "读书手记", appid: "wx9z8y7x6w5v4u3t2s", state: "none", grad: "linear-gradient(135deg,#5b7a99,#3f5a76)" },
];
function KeyBadge({ state }) {
  if (state === "saved") return <span className="ss-badge saved"><IconLock size={12} stroke="var(--success-ink)" />密钥已保存</span>;
  if (state === "session") return <span className="ss-badge session"><IconClock size={12} stroke="var(--warning-ink)" />会话临时</span>;
  return <span className="ss-badge none"><IconWarn size={12} stroke="var(--ink-soft)" />未配置密钥</span>;
}
function WeChatSection({ narrow, bind = null }) {
  const [active, setActive] = useS("w1");
  const [wizard, setWizard] = useS(!!bind);
  return (
    <div>
      <SecHead eyebrow={<><IcServer size={13} stroke="var(--orange-600)" />发布 · 公众号</>}
        title="公众号绑定" sub="选一个当前要发布的公众号。复制到公众号零门槛、不需绑号;只有「发到草稿箱」才需要在这里绑定并填密钥。" />

      <div className="ss-card">
        <div className="ss-cardhd">
          <IcServer size={18} stroke="var(--ink-soft)" />
          <span className="ct">我的公众号</span>
          <span className="cgrow"></span>
          <span className="ss-badge none" style={{ background: "var(--bg-sunk)" }}>{WX_ACCOUNTS.length} 个</span>
        </div>
        <div className="ss-cardbody">
          {WX_ACCOUNTS.map((a) => (
            <div key={a.id} className={cx("ss-acct", active === a.id && "on")} onClick={() => setActive(a.id)}
              role="radio" aria-checked={active === a.id}>
              <span className="ss-radio"></span>
              <div className="ss-acctmid">
                <div className="ss-acctname">{a.name}{active === a.id && <Tag color="orange" leading={<IconCheck size={11} />}>当前发布</Tag>}</div>
                <div className="ss-acctid">{a.appid}</div>
              </div>
              {!narrow && <KeyBadge state={a.state} />}
              <Button variant="danger" size="sm" iconOnly aria-label="删除" onClick={(e) => { e.stopPropagation(); }}><IcTrash size={16} /></Button>
            </div>
          ))}
          {narrow && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {WX_ACCOUNTS.map((a) => <KeyBadge key={a.id} state={a.state} />)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="primary" size="md" leading={<IcPlus size={17} />} onClick={() => setWizard(true)}>添加公众号</Button>
        <Button variant="secondary" size="md" leading={<IcImport size={17} />}>导入旧数据</Button>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "16px 0 0", display: "flex", alignItems: "center", gap: 7 }}>
        <IconLock size={13} stroke="var(--ink-faint)" />删除公众号会一并清除服务端保存的密钥。三态徽标:密钥已保存(服务端)/ 会话临时(仅本次)/ 未配置密钥。
      </p>

      {wizard && <WeChatBindWizard onClose={() => setWizard(false)}
        initialStep={bind === "ok" ? 1 : 0} initialTest={bind === "ok" ? "ok" : "idle"} />}
    </div>
  );
}

// ====================================================================
//  AI 引擎 (AIEngine)
// ====================================================================
function AIEngineSection({ narrow }) {
  const provs = (window.CW_PROVIDERS || []);
  const [cur, setCur] = useS("deepseek");
  return (
    <div>
      <SecHead eyebrow={<><IconSparkle size={13} stroke="var(--orange-600)" />写作 · AI 引擎</>}
        title="AI 引擎" sub="用你自己的 AI 账号写(BYOK),内容不经我们服务器,一篇通常几分钱。换服务商时,测连接通过才会保存。" />

      <div className="ss-card">
        <div className="ss-cardhd">
          <span className="ss-ptile cur" style={{ width: 34, height: 34, fontSize: 15 }}>D</span>
          <div style={{ flex: 1 }}>
            <div className="ct" style={{ display: "flex", alignItems: "center", gap: 9 }}>当前已连接 · DeepSeek <span className="ss-badge saved"><IconCheck size={12} stroke="var(--success-ink)" />测通</span></div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>api.deepseek.com · deepseek-chat</div>
          </div>
          <span className="ss-badge env"><IcServer size={12} stroke="var(--info-ink)" />来源 stored</span>
        </div>
        <div className="ss-cardbody" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--ink-soft)" }}>
            <IconLock size={13} stroke="var(--ink-faint)" />密钥写后不回显。当前来源 stored(存于服务端);若来自环境变量则标 env。
          </div>
        </div>
      </div>

      <div className="ss-card">
        <div className="ss-cardhd"><IconSparkle size={17} stroke="var(--ink-soft)" /><span className="ct">换一个服务商</span></div>
        <div className="ss-cardbody">
          {provs.map((p) => (
            <button key={p.id} className={cx("ss-preset", cur === p.id && "on")} onClick={() => setCur(p.id)}>
              <span className={cx("ss-ptile", cur === p.id && "cur")}>{p.mono}</span>
              <div className="ss-pmid">
                <div className="ss-pname">{p.name}{p.rec && <span className="ss-moderec">推荐</span>}{cur === p.id && <Tag color="success" leading={<IconCheck size={11} />}>使用中</Tag>}</div>
                <div className="ss-ptrust">{p.trust}</div>
              </div>
              {!narrow && <span className="ss-pprice">{p.price}</span>}
            </button>
          ))}
          <button className="ss-preset" style={{ marginTop: 9 }}>
            <span className="ss-ptile"><IcCode size={18} stroke="var(--ink-soft)" /></span>
            <div className="ss-pmid">
              <div className="ss-pname">其它…</div>
              <div className="ss-ptrust">手动填 provider / base_url / model(OpenAI 兼容)</div>
            </div>
          </button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="primary" size="md" leading={<IcLink size={16} />}>测试并保存</Button>
      </div>
    </div>
  );
}

// ====================================================================
//  音色档案 (BrandVoice)
// ====================================================================
const VOICE_TRAITS = ["口语化", "句子偏短", "爱用比喻", "结尾留温度", "少用感叹号", "偶尔自嘲", "细节具体", "不爱套话"];
function BrandVoiceSection({ narrow }) {
  const [hasProfile, setHasProfile] = useS(true);
  return (
    <div>
      <SecHead eyebrow={<><IconMic size={13} stroke="var(--orange-600)" />写作 · 音色档案</>}
        title="音色档案" sub="贴几篇你写过的旧文,我学一学你的笔法,以后写出来更像你。只有一份档案,不需要账号。" />

      <div className="ss-card">
        <div className="ss-cardhd">
          <IconMic size={17} stroke="var(--ink-soft)" />
          <span className="ct">{hasProfile ? "你的笔法特征" : "还没有音色档案"}</span>
          <span className="cgrow"></span>
          {hasProfile && <button className="ss-pillopt" onClick={() => setHasProfile(false)} style={{ height: 32 }}><IcTrash size={14} />清空</button>}
        </div>
        <div className="ss-cardbody">
          {hasProfile ? (
            <>
              <div className="ss-traits">{VOICE_TRAITS.map((t) => <span className="ss-trait" key={t}><IconCheck size={12} stroke="var(--orange-600)" />{t}</span>)}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
                <IconClock size={13} />学自 3 篇旧文 · 更新于 2 天前
              </div>
            </>
          ) : (
            <div className="ss-empty">
              <span className="ss-emptyico"><IconMic size={26} /></span>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-strong)" }}>贴一篇旧文,我来学你的笔法</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", maxWidth: 360, lineHeight: 1.6 }}>没有档案也能正常写,只是少了点「你的味道」。空档案会被当作「无档案」处理,不影响生成。</div>
            </div>
          )}
        </div>
      </div>

      <div className="ss-card">
        <div className="ss-cardhd"><IcImport size={17} stroke="var(--ink-soft)" /><span className="ct">贴旧文,学笔法</span></div>
        <div className="ss-cardbody">
          <Textarea rows={narrow ? 4 : 5} placeholder="把一篇你满意的旧推文粘到这里(越像你平时的风格越好)…" />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="primary" size="md" leading={<IconSparkle size={16} />} onClick={() => setHasProfile(true)}>学这篇的笔法</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
//  发布服务器 (Gateway)
// ====================================================================
function GatewaySection({ narrow }) {
  const [on, setOn] = useS(true);
  return (
    <div>
      <SecHead eyebrow={<><IcServer size={13} stroke="var(--orange-600)" />发布 · 发布服务器</>}
        title="发布服务器" sub="可选。配一个自建网关来代理「发到草稿箱」等请求;不配也能用「复制到公众号」。令牌写后不回显。" />

      <div className="ss-card">
        <div className="ss-cardbody">
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">启用发布服务器</div>
              <div className="ss-rowdesc">关闭时走默认直连;开启后所有发布请求经你的网关。</div>
            </div>
            <div className="ss-rowctrl"><Switch on={on} onChange={setOn} /></div>
          </div>
          <div className="ss-row" style={{ opacity: on ? 1 : 0.5, pointerEvents: on ? "auto" : "none" }}>
            <div className="ss-rowmain" style={{ maxWidth: narrow ? "none" : 230 }}>
              <div className="ss-rowlabel">网关地址</div>
              <div className="ss-rowdesc">你的服务部署地址。</div>
            </div>
            <div className="ss-rowctrl" style={{ flex: narrow ? "none" : 1, width: narrow ? "100%" : "auto" }}>
              <div style={{ width: narrow ? "100%" : 300 }}><Input defaultValue="https://gw.myhost.com" lead={<IcLink size={16} />} /></div>
            </div>
          </div>
          <div className="ss-row" style={{ opacity: on ? 1 : 0.5, pointerEvents: on ? "auto" : "none" }}>
            <div className="ss-rowmain" style={{ maxWidth: narrow ? "none" : 230 }}>
              <div className="ss-rowlabel">访问令牌</div>
              <div className="ss-rowdesc">写后不回显(write-only)。</div>
            </div>
            <div className="ss-rowctrl" style={{ flex: narrow ? "none" : 1, width: narrow ? "100%" : "auto" }}>
              <div style={{ width: narrow ? "100%" : 300 }}><Input type="password" placeholder="留空 = 不修改" lead={<IcKey size={16} />} /></div>
            </div>
          </div>
          <div className="ss-row" style={{ opacity: on ? 1 : 0.5, pointerEvents: on ? "auto" : "none" }}>
            <div className="ss-rowmain">
              <div className="ss-rowlabel">证书(PEM)</div>
              <div className="ss-rowdesc">如网关用自签证书,可上传 PEM。</div>
            </div>
            <div className="ss-rowctrl"><Button variant="secondary" size="sm" leading={<IcCert size={15} />}>上传 PEM</Button></div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="ss-badge env"><IcServer size={12} stroke="var(--info-ink)" />来源 stored</span>
        <span className="cgrow" style={{ flex: 1 }}></span>
        <Button variant="ghost" size="md" leading={<IcLink size={16} />}>测试连接</Button>
        <Button variant="primary" size="md">保存</Button>
      </div>
    </div>
  );
}

// ====================================================================
//  图床 (ImageHost)
// ====================================================================
const IMG_HOSTS = [
  { id: "mmbiz", name: "公众号素材库", desc: "默认。复制 / 草稿时本地图自动传 mmbiz。", rec: true },
  { id: "cos", name: "腾讯云 COS", desc: "对象存储,适合大量图片。" },
  { id: "qiniu", name: "七牛云", desc: "CDN 加速,免费额度友好。" },
  { id: "custom", name: "自定义 S3 兼容", desc: "填 endpoint / bucket / key。" },
];
function ImageHostSection({ narrow }) {
  const [host, setHost] = useS("mmbiz");
  return (
    <div>
      <SecHead eyebrow={<><IcImage size={13} stroke="var(--orange-600)" />发布 · 图床</>}
        title="图床" sub="文章里的本地图片在发布前会先上传到图床,换成可访问的网址。默认用公众号素材库,够用就不用改。" />
      <div className="ss-card">
        <div className="ss-cardhd"><IcImage size={17} stroke="var(--ink-soft)" /><span className="ct">选择图床</span></div>
        <div className="ss-cardbody">
          {IMG_HOSTS.map((h) => (
            <button key={h.id} className={cx("ss-preset", host === h.id && "on")} onClick={() => setHost(h.id)}>
              <span className={cx("ss-ptile", host === h.id && "cur")}><IcImage size={18} stroke={host === h.id ? "var(--cream)" : "var(--ink-soft)"} /></span>
              <div className="ss-pmid">
                <div className="ss-pname">{h.name}{h.rec && <span className="ss-moderec">默认</span>}</div>
                <div className="ss-ptrust">{h.desc}</div>
              </div>
              {host === h.id && <IconCheck size={18} stroke="var(--orange-600)" />}
            </button>
          ))}
        </div>
      </div>
      {host !== "mmbiz" && (
        <div className="ss-card mb-rise">
          <div className="ss-cardhd"><IcKey size={17} stroke="var(--ink-soft)" /><span className="ct">{IMG_HOSTS.find((h) => h.id === host).name} · 凭证</span></div>
          <div className="ss-cardbody" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Endpoint / 域名"><Input placeholder="https://..." lead={<IcLink size={16} />} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 14 }}>
              <Field label="Access Key"><Input placeholder="AK..." /></Field>
              <Field label="Secret Key"><Input type="password" placeholder="写后不回显" lead={<IcKey size={16} />} /></Field>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="primary" size="md">保存</Button>
      </div>
    </div>
  );
}

Object.assign(window, {
  WeChatBindWizard, SecHead, KeyBadge,
  WeChatSection, AIEngineSection, BrandVoiceSection, GatewaySection, ImageHostSection,
  WX_ACCOUNTS, VOICE_TRAITS, IMG_HOSTS,
  IcImage, IcType, IcLayout, IcDensity, IcPlus, IcTrash, IcImport, IcServer, IcCert, IcKey, IcSun, IcLink, IcCode, IcPhone, IcTree, IcShield2,
});
