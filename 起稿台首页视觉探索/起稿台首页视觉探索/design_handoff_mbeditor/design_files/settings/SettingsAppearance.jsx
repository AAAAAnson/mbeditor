// MBEditor · Direction A — 设置:外观 (Appearance, 内含 Editor) + 关于 (About)
// 外观:界面模式 simple/pro 卡片选择器 +「专业模式能解锁这些」预告盒 + 主题 + 字体 + 密度 + 布局 + 内嵌编辑器默认。
// 依赖 ds/* · settings/SettingsSections.jsx(SecHead + 局部图标全局挂载)。
const { useState: useAS } = React;

// ---- option data ----
const AP_THEMES = [
  { id: "warm",   name: "暖意奶油", bg: "linear-gradient(135deg,#fbf6ee 60%,#fbdccf)", dot: "#e8553a" },
  { id: "paper",  name: "米白纸感", bg: "linear-gradient(135deg,#f7f2e7 60%,#efe4cf)", dot: "#c07f23" },
  { id: "mist",   name: "雾蓝清爽", bg: "linear-gradient(135deg,#f1f4f7 60%,#dbe6f0)", dot: "#5b7a99" },
  { id: "walnut", name: "胡桃暖夜", bg: "linear-gradient(135deg,#2c241c 60%,#3d3225)", dot: "#ec6f4d" },
];
const AP_FONTS = [
  { id: "rounded", name: "圆润", sample: "Aa 早安", ff: "var(--f-sans)" },
  { id: "serif",   name: "人文衬线", sample: "Aa 早安", ff: "var(--f-display)" },
  { id: "system",  name: "系统", sample: "Aa 早安", ff: "-apple-system,system-ui,sans-serif" },
];
const AP_DENSITY = [{ id: "cozy", name: "舒适" }, { id: "compact", name: "紧凑" }];
const AP_LAYOUT = [
  { id: "focus", name: "专注", desc: "只留预览,最干净", icon: (p) => <IcLayout {...p} /> },
  { id: "split", name: "分栏", desc: "源码 + 预览并排", icon: (p) => <IcCode {...p} /> },
  { id: "triptych", name: "三栏", desc: "结构 + 预览 + 代码", icon: (p) => <IcTree {...p} /> },
];
const PRO_UNLOCKS = [
  { ic: (p) => <IcTree {...p} />, t: "三栏结构大纲" },
  { ic: (p) => <IcCode {...p} />, t: "代码编辑(Monaco)" },
  { ic: (p) => <IcPhone {...p} />, t: "手机预览 + 缩放拖拽" },
  { ic: (p) => <IconCheck {...p} />, t: "实时兼容校验侧栏" },
  { ic: (p) => <IcImage {...p} />, t: "可视化 SVG 编辑" },
  { ic: (p) => <IconSparkle {...p} />, t: "三段视图自由切换" },
];

function ModeCard({ on, ico, name, rec, desc, onClick }) {
  return (
    <button className={cx("ss-mode", on && "on")} onClick={onClick} aria-pressed={on}>
      <span className="ss-modechk"><IconCheck size={14} stroke="var(--cream)" /></span>
      <div className="ss-modetop">
        <span className="ss-modeico">{ico}</span>
        <div><span className="ss-modenm">{name}</span>{rec && <span className="ss-moderec">推荐</span>}</div>
      </div>
      <div className="ss-modedesc">{desc}</div>
    </button>
  );
}

function AppearanceSection({ narrow }) {
  const [mode, setMode] = useAS("simple");
  const [theme, setTheme] = useAS("warm");
  const [font, setFont] = useAS("rounded");
  const [density, setDensity] = useAS("cozy");
  const [layout, setLayout] = useAS("focus");
  const [edFmt, setEdFmt] = useAS("html");
  const [autosave, setAutosave] = useAS(true);
  const [edSize, setEdSize] = useAS(15);

  return (
    <div>
      <SecHead eyebrow={<><IcSun size={13} stroke="var(--orange-600)" />外观</>}
        title="外观" sub="挑一套看着舒服的样子。界面模式决定露出多少功能——默认「简单」,把代码和复杂控件都收起来。" />

      {/* ---- 界面模式 ---- */}
      <div className="ss-card">
        <div className="ss-cardhd"><IcLayout size={17} stroke="var(--ink-soft)" /><span className="ct">界面模式</span></div>
        <div className="ss-cardbody">
          <div className="ss-modes">
            <ModeCard on={mode === "simple"} ico={<IconSparkle size={20} />} name="简单" rec
              desc="只看「公众号效果」预览,所见即所得。没有代码、没有三栏,适合专心写。" onClick={() => setMode("simple")} />
            <ModeCard on={mode === "pro"} ico={<IcCode size={20} />} name="专业"
              desc="解锁三栏、代码编辑与精修控件。给会写代码、想像素级控版的人。" onClick={() => setMode("pro")} />
          </div>

          {/* 专业模式能解锁这些 — 预告盒 */}
          <div className="ss-unlock">
            <div className="ss-unlockhd"><IcCode size={15} stroke="var(--orange-600)" />专业模式能解锁这些</div>
            <div className="ss-unlockgrid">
              {PRO_UNLOCKS.map((u) => (
                <div className="ss-unlockitem" key={u.t}>
                  <span className="uk">{u.ic({ size: 14 })}</span>{u.t}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 13, display: "flex", alignItems: "center", gap: 7 }}>
              <IconLock size={12} stroke="var(--ink-faint)" />切回简单模式只是「收起」,你的布局偏好会留着,不会丢。
            </div>
          </div>
        </div>
      </div>

      {/* ---- 主题 ---- */}
      <div className="ss-card">
        <div className="ss-cardhd"><IcSun size={17} stroke="var(--ink-soft)" /><span className="ct">主题</span></div>
        <div className="ss-cardbody">
          <div className="ss-opts">
            {AP_THEMES.map((t) => (
              <div key={t.id} className={cx("ss-swatch", theme === t.id && "on")} onClick={() => setTheme(t.id)}>
                <span className="ss-swatchbox" style={{ background: t.bg }}>
                  <span style={{ position: "absolute", right: 6, bottom: 6, width: 12, height: 12, borderRadius: "50%", background: t.dot }}></span>
                </span>
                <span className="ss-swatchlab">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- 字体 + 密度 ---- */}
      <div className="ss-card">
        <div className="ss-cardbody">
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">字体</div>
              <div className="ss-rowdesc">界面与正文的字体气质。</div>
            </div>
            <div className="ss-rowctrl">
              <div className="ss-opts">
                {AP_FONTS.map((f) => (
                  <button key={f.id} className={cx("ss-pillopt", font === f.id && "on")} onClick={() => setFont(f.id)}>
                    <span style={{ fontFamily: f.ff }}>{f.sample}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">密度</div>
              <div className="ss-rowdesc">控件与间距的松紧。</div>
            </div>
            <div className="ss-rowctrl">
              <Segmented value={density} onChange={setDensity}
                options={AP_DENSITY.map((d) => ({ value: d.id, label: d.name }))} />
            </div>
          </div>
        </div>
      </div>

      {/* ---- 布局(仅专业可用) ---- */}
      <div className="ss-card" style={{ opacity: mode === "pro" ? 1 : 0.55 }}>
        <div className="ss-cardhd">
          <IcLayout size={17} stroke="var(--ink-soft)" /><span className="ct">编辑器布局</span>
          <span className="cgrow"></span>
          {mode !== "pro" && <span className="ss-badge none"><IconLock size={11} stroke="var(--ink-soft)" />专业模式可用</span>}
        </div>
        <div className="ss-cardbody">
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr 1fr", gap: 11, pointerEvents: mode === "pro" ? "auto" : "none" }}>
            {AP_LAYOUT.map((l) => (
              <button key={l.id} className={cx("ss-mode", layout === l.id && "on")} style={{ padding: 14 }} onClick={() => setLayout(l.id)}>
                <span className="ss-modechk"><IconCheck size={13} stroke="var(--cream)" /></span>
                <div className="ss-modetop" style={{ marginBottom: 8 }}>
                  <span className="ss-modeico" style={{ width: 34, height: 34 }}>{l.icon({ size: 17 })}</span>
                  <span className="ss-modenm" style={{ fontSize: 15 }}>{l.name}</span>
                </div>
                <div className="ss-modedesc" style={{ fontSize: 12 }}>{l.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- 内嵌编辑器默认 ---- */}
      <div className="ss-card">
        <div className="ss-cardhd"><IcCode size={17} stroke="var(--ink-soft)" /><span className="ct">编辑器默认行为</span></div>
        <div className="ss-cardbody">
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">默认编辑格式</div>
              <div className="ss-rowdesc">新建文档时用哪种源码格式。</div>
            </div>
            <div className="ss-rowctrl">
              <Segmented value={edFmt} onChange={setEdFmt}
                options={[{ value: "html", label: "HTML" }, { value: "md", label: "Markdown" }]} />
            </div>
          </div>
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">自动保存</div>
              <div className="ss-rowdesc">编辑时自动存草稿,刷新不丢。</div>
            </div>
            <div className="ss-rowctrl"><Switch on={autosave} onChange={setAutosave} /></div>
          </div>
          <div className="ss-row">
            <div className="ss-rowmain">
              <div className="ss-rowlabel">编辑器字号</div>
              <div className="ss-rowdesc">源码区文字大小。</div>
            </div>
            <div className="ss-rowctrl" style={{ width: narrow ? "100%" : 220 }}>
              <div className="ss-slider" style={{ width: "100%" }}>
                <input type="range" min="12" max="22" step="1" value={edSize} onChange={(e) => setEdSize(+e.target.value)} />
                <span className="ss-slidernum">{edSize}px</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
//  关于 (About)
// ====================================================================
function AboutSection() {
  return (
    <div>
      <SecHead eyebrow={<><IconInfo size={13} stroke="var(--orange-600)" />关于</>}
        title="关于 MBEditor" sub="一个会写会排版的小帮手 —— 动动嘴,排版就好了。" />

      <div className="ss-card">
        <div className="ss-cardbody" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={56} radius={24} />
          <div>
            <div style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22, color: "var(--ink-strong)" }}>MBEditor</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 3 }}>微信公众号写作 · 排版小帮手</div>
          </div>
          <span style={{ flex: 1 }}></span>
          <span className="ss-badge saved"><IconCheck size={12} stroke="var(--success-ink)" />已是最新</span>
        </div>
      </div>

      <div className="ss-card">
        <div className="ss-cardbody">
          <div className="ss-about-rows">
            <div className="ss-about-row"><span className="ss-about-k">版本</span><span className="ss-about-v">v2.4.1</span></div>
            <div className="ss-about-row"><span className="ss-about-k">仓库</span><a className="ss-about-v" style={{ color: "var(--orange-700)", textDecoration: "none" }}>github.com/mbeditor<IconArrow size={12} style={{ display: "inline", marginLeft: 4, verticalAlign: "-1px" }} /></a></div>
            <div className="ss-about-row"><span className="ss-about-k">许可</span><span className="ss-about-v">MIT License</span></div>
            <div className="ss-about-row"><span className="ss-about-k">构建</span><span className="ss-about-v">2026.06.20 · a1b2c3d</span></div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 7, margin: "4px 2px" }}>
        <IconLock size={13} stroke="var(--ink-faint)" />开源免费 · 无账号体系 · 内容与密钥不经平台服务器。
      </p>
    </div>
  );
}

Object.assign(window, {
  AppearanceSection, AboutSection, ModeCard,
  AP_THEMES, AP_FONTS, AP_DENSITY, AP_LAYOUT, PRO_UNLOCKS,
});
