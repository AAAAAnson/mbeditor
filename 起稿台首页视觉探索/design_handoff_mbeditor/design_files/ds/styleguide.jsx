// MBEditor · Direction A — Style Guide (single-screen, live).
// Composes tokens + components into a reference any later screen builds on.
const { useState } = React;

// ---- small layout helpers (doc-only, not part of the kit) ----
function Section({ n, title, desc, children }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--orange-600)", fontWeight: 700 }}>{n}</span>
        <h2 className="t-title" style={{ margin: 0, fontSize: 24 }}>{title}</h2>
      </div>
      {desc && <p className="t-body" style={{ color: "var(--ink-soft)", margin: "0 0 22px", maxWidth: 760 }}>{desc}</p>}
      {children}
    </section>
  );
}
function Panel({ children, pad = 24, style }) {
  return <div className="mb-card" style={{ padding: pad, ...style }}>{children}</div>;
}
function Label({ children }) {
  return <div style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, marginBottom: 12 }}>{children}</div>;
}

// ---- color helpers ----
function Swatch({ token, val, dark, big }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ height: big ? 64 : 48, borderRadius: "var(--r-md)", background: val,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: dark ? "#fbf4e8" : "var(--ink)" }}>{token}</span>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: dark ? "#b8a892" : "var(--ink-faint)" }}>{val}</span>
      </div>
    </div>
  );
}
function Ramp({ items, dark }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length},1fr)`, gap: 10 }}>
    {items.map(([t, v]) => <Swatch key={t} token={t} val={v} dark={dark} />)}
  </div>;
}

function Spec({ children }) {
  return <span style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>{children}</span>;
}

function StyleGuide() {
  const [seg, setSeg] = useState("write");
  const [chips, setChips] = useState({ "带娃日记": true });
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);
  const toggleChip = (k) => setChips((c) => ({ ...c, [k]: !c[k] }));

  const doCopy = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 40px 100px" }}>
      {/* ---------------- Masthead ---------------- */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "40px 0 30px", marginBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={52} />
          <div>
            <h1 className="t-display" style={{ margin: 0, fontSize: 30 }}>MBEditor 设计系统</h1>
            <p className="t-small" style={{ margin: "4px 0 0" }}>方向 A · 暖意亲和 — 全站单一连贯语言,消除「冷 IDE 主壳 vs 暖纸写作流」的割裂</p>
          </div>
        </div>
        <Tag color="orange" leading={<IconSparkle size={13} stroke="var(--orange-700)" />}>Direction A</Tag>
      </header>

      {/* ---------------- 1 · Color ---------------- */}
      <Section n="01" title="配色 Tokens"
        desc="浅色为主,深色(walnut)可选。整套界面由奶油米与暖中性面板承载;橙红 #E8553A 在新盘里只担一个角色:作为 logo 锚点定调,在 UI 中是唯一强调色(主操作 / 选中 / 链接),其余场合退为点睛——绝不铺满屏幕。">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <Panel>
            <Label>橙红强调阶 · 锚点</Label>
            <Ramp items={[["50", "#fdeee9"], ["100", "#fbdccf"], ["300", "#f0906f"], ["500", "#e8553a"], ["600", "#cf4329"], ["700", "#a8351f"]]} />
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--orange-500)" }}></span><span className="t-small"><b>500</b> 主操作 / 选中</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--orange-50)", boxShadow: "inset 0 0 0 1px var(--orange-200)" }}></span><span className="t-small"><b>50</b> 点睛底色</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--cream)", boxShadow: "inset 0 0 0 1px var(--line-strong)" }}></span><span className="t-small"><b>cream</b> 反白字 / glyph</span></div>
            </div>
          </Panel>
          <Panel>
            <Label>中性阶 · 暖土调(承载界面)</Label>
            <Ramp items={[["bg", "#fbf6ee"], ["sunk", "#f4ece0"], ["surface", "#fffdf9"], ["line", "#ece2d4"], ["ink-soft", "#7c7064"], ["ink", "#3a332c"]]} />
            <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--orange-50)", borderRadius: "var(--r-sm)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <IconInfo size={16} stroke="var(--orange-700)" style={{ marginTop: 2, flex: "none" }} />
              <span className="t-small" style={{ color: "var(--orange-700)" }}>统一规则:主壳与写作流共用同一组 surface / line / ink,不再有冷灰 IDE 面板。</span>
            </div>
          </Panel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Panel>
            <Label>语义色 · 成功 / 警告 / 信息 / 危险</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["成功", "success", <IconCheck size={15} />], ["警告", "warning", <IconWarn size={15} />], ["信息", "info", <IconInfo size={15} />], ["危险", "danger", <IconClose size={15} />]].map(([nm, key, ic]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: `var(--${key})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flex: "none" }}>{ic}</span>
                  <Tag color={key} leading={ic}>{nm}</Tag>
                  <Spec>--{key} · --{key}-soft · --{key}-ink</Spec>
                </div>
              ))}
            </div>
            <p className="t-caption" style={{ marginTop: 14 }}>危险红比品牌橙更深更褐,默认以描边/文字呈现,绝不与主 CTA 撞色。</p>
          </Panel>
          <Panel dark style={{ background: "#211b15", borderColor: "#3d3225" }}>
            <Label>深色 · walnut(可选)</Label>
            <Ramp dark items={[["bg", "#211b15"], ["surface", "#2c241c"], ["line", "#3d3225"], ["ink-soft", "#b8a892"], ["ink", "#efe6d8"], ["500", "#e8553a"]]} />
            <p style={{ marginTop: 14, fontSize: 12.5, color: "#b8a892", lineHeight: 1.6 }}>同一套语义与角色映射到暖深色,橙红保持强调身份,夜间仍是暖核桃木而非冷黑。</p>
          </Panel>
        </div>
      </Section>

      {/* ---------------- 2 · Type ---------------- */}
      <Section n="02" title="字体与排版"
        desc="中文优先三档:标题用思源宋体衬线给温度,正文思源黑体保证可读,等宽 JetBrains Mono / 思源等宽供配置与数据用。">
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
          <Panel>
            <Label>字号 / 行高刻度</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div><div className="t-display-xl">随口讲一句</div><Spec>display-xl · serif 700 · 46/1.14</Spec></div>
              <div><div className="t-title">把想法写成推文</div><Spec>title · serif 700 · 26/1.3</Spec></div>
              <div><div className="t-heading">最近的文章</div><Spec>heading · sans 700 · 20/1.4</Spec></div>
              <div><div className="t-body-lg">正文大号:你在这里看到的,就是粘进公众号后的样子。</div><Spec>body-lg · sans 400 · 17/1.75</Spec></div>
              <div><div className="t-body">正文:动动嘴,排版就交给我,全程不用碰代码。</div><Spec>body · sans 400 · 15/1.7</Spec></div>
              <div><div className="t-small">辅助说明文字</div><Spec>small · 13/1.6</Spec></div>
              <div><div className="t-mono">model: claude-3-5-sonnet · temp 0.7</div><Spec>mono · 14/1.6</Spec></div>
            </div>
          </Panel>
          <Panel>
            <Label>字族</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontFamily: "var(--f-display)", fontSize: 40, fontWeight: 700, lineHeight: 1 }}>永 文 Aa</div>
                <div className="t-small" style={{ marginTop: 6 }}>标题 · Source Serif 4 / 思源宋体</div>
              </div>
              <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontFamily: "var(--f-sans)", fontSize: 40, fontWeight: 700, lineHeight: 1 }}>永 文 Aa</div>
                <div className="t-small" style={{ marginTop: 6 }}>正文 · 思源黑体 Noto Sans SC</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 36, fontWeight: 500, lineHeight: 1 }}>永 Aa 0</div>
                <div className="t-small" style={{ marginTop: 6 }}>等宽 · JetBrains Mono</div>
              </div>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ---------------- 3 · Radius / Shadow / Space ---------------- */}
      <Section n="03" title="圆角 · 阴影 · 间距"
        desc="性格:圆角偏柔(卡片 16–20px、按钮 13px),阴影是暖褐色调、低且软,从不发灰;间距走 4 的倍数。">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <Panel>
            <Label>圆角</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[["sm", 10], ["md", 13], ["lg", 16], ["xl", 20], ["2xl", 26]].map(([t, v]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 52, height: 40, background: "var(--orange-50)", border: "1.5px solid var(--orange-200)", borderRadius: v, flex: "none" }}></div>
                  <span className="t-small"><b>{t}</b></span><Spec>{v}px</Spec>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <Label>阴影</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[["sm", "var(--sh-sm)"], ["md", "var(--sh-md)"], ["lg", "var(--sh-lg)"]].map(([t, v]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 52, height: 40, background: "var(--surface)", borderRadius: 12, boxShadow: v, flex: "none" }}></div>
                  <span className="t-small"><b>{t}</b></span>
                </div>
              ))}
            </div>
            <p className="t-caption" style={{ marginTop: 14 }}>rgba(120,80,40,…) 暖褐投影,非中性灰。</p>
          </Panel>
          <Panel>
            <Label>间距 (4-based)</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[["s-2", 8], ["s-3", 12], ["s-4", 16], ["s-6", 24], ["s-7", 32], ["s-9", 48]].map(([t, v]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: v, height: 14, background: "var(--orange-300)", borderRadius: 3, flex: "none" }}></div>
                  <span className="t-small"><b>{t}</b></span><Spec>{v}px</Spec>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ---------------- 4 · Components ---------------- */}
      <Section n="04" title="组件基件"
        desc="后面每一屏都从这些件搭。视觉权重以「小白主、pro 次」为准:主操作大而暖,进阶配置低调退后;所有可点目标 ≥44px。">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Buttons */}
          <Panel>
            <Label>按钮 · 主 / 次 / 幽灵 / 危险</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <Button variant="primary" size="lg" leading={<IconSparkle size={19} stroke="var(--cream)" />}>让 AI 帮我写</Button>
              <Button variant="secondary" leading={<IconTemplate size={18} />}>套用模板</Button>
              <Button variant="ghost" leading={<IconGear size={18} />}>设置</Button>
              <Button variant="danger" leading={<IconClose size={17} />}>删除草稿</Button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 14 }}>
              <Button variant="primary" loading>生成中</Button>
              <Button variant="secondary" size="sm">小号</Button>
              <Button variant="secondary" disabled>不可用</Button>
              <Button variant="secondary" iconOnly aria-label="复制"><IconCopy size={18} /></Button>
              <Button variant="primary" iconOnly aria-label="发送"><IconSend size={18} stroke="var(--cream)" /></Button>
            </div>
          </Panel>
          {/* Inputs */}
          <Panel>
            <Label>输入</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="API Key" hint="只保存在你本地浏览器,不经我们服务器">
                <Input lead={<IconLock size={17} />} placeholder="sk-ant-…" defaultValue="" />
              </Field>
              <Field label="作者名" error={err ? "这个名字已经被占用啦" : null}>
                <Input error={err} placeholder="想用什么名字署名?" onFocus={() => setErr(false)} onBlur={(e) => setErr(!e.target.value)} />
              </Field>
              <Textarea rows={2} placeholder="比如:今天带娃去公园,他第一次自己荡秋千…"></Textarea>
            </div>
          </Panel>
          {/* Chips + Tags + Segmented */}
          <Panel>
            <Label>Chip · 标签 · 分段控件</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {["带娃日记", "读书手记", "上新札记", "本地探店"].map((c) => (
                <Chip key={c} on={chips[c]} onClick={() => toggleChip(c)}>{c}</Chip>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              <Tag color="orange" leading={<IconSparkle size={12} stroke="var(--orange-700)" />}>AI 生成</Tag>
              <Tag color="success" leading={<IconCheck size={12} />}>已复制</Tag>
              <Tag color="warning" leading={<IconClock size={12} />}>草稿箱</Tag>
              <Tag color="info">本地探店</Tag>
              <Tag>1,240 字</Tag>
            </div>
            <div style={{ marginTop: 16 }}>
              <Segmented value={seg} onChange={setSeg} options={[
                { value: "write", label: "写作", icon: <IconPen size={15} /> },
                { value: "preview", label: "预览", icon: <IconEye size={15} /> },
                { value: "config", label: "配置", icon: <IconGear size={15} /> },
              ]} />
            </div>
          </Panel>
          {/* Switch + Dialog + Card */}
          <Panel>
            <Label>开关 · 对话框 · 卡片</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="t-body">流式生成(边写边出)</span><Switch on={sw1} onChange={setSw1} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                <span className="t-body">显示进阶参数</span><Switch on={sw2} onChange={setSw2} />
              </div>
              <Button variant="danger" onClick={() => setDlg(true)}>打开确认对话框</Button>
            </div>
          </Panel>
        </div>

        {/* skeleton / loading row */}
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Panel>
            <Label>骨架屏 · 加载</Label>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
              <Skeleton w={46} h={46} r={13} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton w="70%" h={13} /><Skeleton w="45%" h={11} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="mb-spin"></span><span className="t-small">连接中</span></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><LoadingDots /><span className="t-small">AI 正在思考</span></span>
            </div>
          </Panel>
          <Panel>
            <Label>徽标 / Logo 用法</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <BrandMark size={44} />
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--orange-500)", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandMarkCream size={34} /></div>
              <BrandMark size={28} />
              <span className="t-caption" style={{ maxWidth: 150 }}>几何像素级锁定:橙红圆角方块 + 暖白描边 M,不改比例、不改描边粗细。</span>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ---------------- 5 · Motion ---------------- */}
      <Section n="05" title="动效原则"
        desc="缓动以 cubic-bezier(.2,.7,.3,1) 温和收尾为主;庆祝时刻才用 spring 轻微回弹。时长分级:微反馈 120ms / 状态切换 200ms / 元素进入 320ms / 庆祝 600ms。三个关键时刻有专属动效语言。">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <Panel>
            <Label>关键时刻 1 · 流式生成</Label>
            <div style={{ minHeight: 96 }}>
              <p className="t-body" style={{ margin: 0 }}>立秋这天,风里第一次有了凉意。我想给老茶客们写几句<span className="mb-caret"></span></p>
            </div>
            <p className="t-caption" style={{ marginTop: 10 }}>逐字流入 + 橙红光标闪烁;不用进度条,让「写」本身可见。</p>
          </Panel>
          <Panel>
            <Label>关键时刻 2 · 成功庆祝</Label>
            <div style={{ minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckBurstReplay />
            </div>
            <p className="t-caption" style={{ marginTop: 10 }}>对勾盖章式弹入(spring 600ms),配薄荷绿——克制不撒花。</p>
          </Panel>
          <Panel>
            <Label>关键时刻 3 · 复制确认</Label>
            <div style={{ minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Button variant={copied ? "secondary" : "primary"} onClick={doCopy}
                leading={copied ? <IconCheck size={18} stroke="var(--success)" /> : <IconCopy size={18} stroke="var(--cream)" />}
                style={copied ? { color: "var(--success-ink)", borderColor: "var(--success)" } : {}}>
                {copied ? "已复制,去粘贴吧" : "复制全文"}
              </Button>
            </div>
            <p className="t-caption" style={{ marginTop: 10 }}>就地变身:图标与文案 200ms 内切换,1.8s 后自动复位。</p>
          </Panel>
        </div>
      </Section>

      <Dialog open={dlg} onClose={() => setDlg(false)}
        icon={<span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--danger-soft)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><IconWarn size={22} stroke="var(--danger)" /></span>}
        title="删除这篇草稿?"
        footer={<><Button variant="ghost" onClick={() => setDlg(false)}>再想想</Button><Button variant="danger" onClick={() => setDlg(false)}>删除</Button></>}>
        <p className="t-body" style={{ margin: 0, color: "var(--ink-soft)" }}>「带娃的一天」还没保存,删除后没法恢复。确定要删掉吗?</p>
      </Dialog>
    </div>
  );
}

function CheckBurstReplay() {
  const [k, setK] = useState(0);
  return <span onClick={() => setK((x) => x + 1)} style={{ cursor: "pointer" }} title="点一下重播"><CheckBurst key={k} /></span>;
}

window.StyleGuide = StyleGuide;
