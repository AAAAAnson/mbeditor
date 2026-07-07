# 开发交接:MBEditor 前端全界面重构(方向 A · Warm-Friendly)

> 给在 **Claude Code** 中实现的开发者。这份 README 自包含——即使你没参与设计对话,也能照此**像素级**重建全部界面。

---

## 1. 这个包里是什么

`design_files/` 里的是用 **HTML + React(Babel-in-browser JSX)** 写的**设计参考稿**——它们演示最终的外观与交互,**不是要你直接搬进生产的代码**。

你的任务:**用目标代码库已有的技术栈,把这些设计稿像素级重建出来**。

- 设计简报指明目标栈是 **React**(函数组件 + Hooks),**无 react-router**,导航是自研壳层 `Shell`(`history.pushState` + `Route` 联合类型)。请按这套来。
- 若目标仓库已存在,沿用它的组件写法、构建管线;若是从零起,直接用 React + 一个轻打包器(Vite)即可。
- `design_files/ds/theme.css` 和 `ds/ui.jsx` 已经把全部 **design tokens 和基础组件用真实像素值写好了**——直接照搬这两份的数值,不要凭记忆。

## 2. 保真度:高保真(hifi),像素级

所有稿都是**最终配色 / 字号 / 间距 / 圆角 / 阴影 / 动效**。请按 `ds/theme.css` 的 token 与各 `*.jsx` 的实现 **1:1 复刻**。`design_files/screenshots/` 里有每屏的渲染截图,作为像素对照基准。

## 3. 怎么本地跑设计稿(对照用)

每个 `.html` 顶部已用 CDN 引入 React 18 + Babel,直接在浏览器打开即可(或起个静态服务器):

```
cd design_files && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/起稿台首页.html 等
```

部分稿用了 `design-canvas.jsx`(一个可平移缩放的画布),把多个状态/变体并排展示。重建时只需取里面单个 artboard 的内容,画布本身不用复刻。

## 4. 选定的视觉方向

**方向 A — Warm-Friendly(暖意亲和 ·「被照顾的小帮手」)**,单一连贯设计系统覆盖全 app(消除旧版「主壳冷 IDE vs 写作流暖纸感」的割裂)。

- 橙红 `#E8553A`(Logo 色)是**唯一强单色强调**:只用于主 CTA / 选中态 / 链接;其余由奶油 + 暖中性面承载,**不要满屏橙**。
- 中文优先字体;大圆角(13–20px)、柔阴影、留白充裕。
- **禁用 emoji**,所有图标为内联 SVG(见 `ds/icons.jsx`,34 个)。
- 选 `concepts/` 里三选一对比的结果就是方向 A;`concepts/HomeEditorial`、`HomePlayful` 是落选方向,仅作参考、**不要实现**。

## 5. Design Tokens(权威值 —— 见 `ds/theme.css`,此处摘录关键项)

**品牌 / 橙阶**(oklch off `#E8553A`):
`--orange-50 #fdeee9` · `-100 #fbdccf` · `-200 #f6b9a1` · `-300 #f0906f` · `-400 #ec6f4d` · `-500 #e8553a`(主操作) · `-600 #cf4329`(hover/pressed) · `-700 #a8351f` · `-800 #7d2817` · `--cream #fbf4e8`(反白文字/字形)

**暖中性阶**:
`--bg #fbf6ee`(页) · `--bg-sunk #f4ece0`(凹槽/轨道) · `--surface #fffdf9`(卡/输入) · `--surface-2 #f8f1e6`(hover/条纹) · `--line #ece2d4`(发丝线) · `--line-strong #dccdb8`(输入边框) · `--ink #3a332c`(正文) · `--ink-strong #2a241e`(标题) · `--ink-soft #7c7064`(次要) · `--ink-faint #a99c8b`(占位/禁用)

**语义色**(每组:实色 / soft 底 / on-soft 文字):
- success `#3f8f72` / `#e6f1ea` / `#2c6a53`
- warning `#c07f23` / `#faedce` / `#8f5d12`
- info `#5b7a99` / `#e8eef4` / `#3f5a76`
- danger `#b23a2b` / `#f8e3df` / `#8c2d20`(刻意比品牌橙更深/偏褐，默认描边/文字呈现，destructive 永不被误读成主 CTA)

**圆角**:`--r-xs 6` · `sm 10` · `md 13` · `lg 16` · `xl 20` · `2xl 26` · `pill 999`(px)

**阴影**(暖褐调，低柔):见 theme.css `--sh-xs … --sh-xl`、`--ring`(focus,`0 0 0 3px rgba(232,85,58,.24)`)、`--ring-soft`(success ring)。直接照搬字符串。

**间距**(4 基):`--s-1 4` … `--s-10 64`(px)

**字体**:
- `--f-display`: `"Source Serif 4","Noto Serif SC",Georgia,serif`(标题，给温度)
- `--f-sans`: `"Noto Sans SC",-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif`(正文)
- `--f-mono`: `"JetBrains Mono","Noto Sans Mono",ui-monospace,Menlo,monospace`
- 字号阶(class）：`t-display-xl 46/1.14` · `t-display 34/1.2` · `t-title 26/1.3` · `t-heading 20/1.4` · `t-body-lg 17/1.75` · `t-body 15/1.7` · `t-small 13/1.6` · `t-caption 12/1.5` · `t-mono 14/1.6`

**动效**:
- ease: `--ease cubic-bezier(.2,.7,.3,1)`(默认缓出) · `--ease-spring cubic-bezier(.34,1.4,.5,1)`(轻微 overshoot)
- 时长: `--t-micro 120ms`(hover/press) · `--t-base 200ms` · `--t-enter 320ms`(入场) · `--t-celebrate 600ms`(成功/盖章)
- 位移: `--d-press 1px` · `--d-nudge 4px` · `--d-rise 10px`(列表项从下入场) · `--d-pop 12px`(对话框) · `--d-slide 16px`(页/面板切换) · `--stagger 55ms`(列表逐项延迟,封顶约 6 项)
- 入场动效写法:**可见末态作为基样式,从 hidden 动画进来**,门控 `[data-deck-active]` 等价的「激活」标记 + `@media (prefers-reduced-motion: no-preference)`,保证打印/无 JS/减少动效时落在末态。reduced-motion 媒体查询见 theme.css 末尾(把 caret 闪烁/spinner/pulse 都停掉)。

**可选暖深色(walnut)**:`[data-theme="dark"]` 覆盖层已在 theme.css 给好,见对应 block。深色主题若启用,注意 §7 的剪贴板防护(execCommand 兜底要把选区包进**不透明白底 div**,`collectThemeChromeColors` 要随 `--bg`/`--surface` 同步)。

## 6. 基础组件库(`ds/ui.jsx` —— 照搬尺寸/状态)

注入式样式表 `mb-ui-css` + 组件导出到 window。每个尺寸都是定值,复刻时别改:

- **Button** `mb-btn`：变体 `v-primary`(橙底奶油字)/`v-secondary`(surface+line-strong 边)/`v-ghost`/`v-danger`(描边红)。尺寸 `sz-sm 38px` / `sz-md 46px` / `sz-lg 54px`,各有 `icon-only` 等宽。`:active` 下沉 `translateY(1px) scale(.99)`，`:focus-visible` 用 `--ring`，disabled `opacity .45`。
- **Input / Field / Textarea** `mb-inputwrap`：高 46px、`--r-md`、`1.5px` `--line-strong` 边，`:focus-within` 转 `--orange-400` + ring；`.err` 用 danger 边。Field 含 label（带「选填」弱化标）+ hint/error。
- **Chip** `mb-chip`：药丸,高 40px,padding `0 17px`；hover 非选中转 `--orange-300` 边 + `--orange-50` 底；`.on` 橙底奶油字 + 投影。用于受众/调子/灵感胶囊。
- **Tag** `mb-tag`：高 24px 小标签,6 色映射(neutral/orange/success/warning/info/danger)。
- **Segmented** `mb-seg`：凹槽底分段控件,选中项 surface 抬起 + `--sh-sm`。
- **Card** `mb-card`：surface + `1px --line` + `--r-xl` + `--sh-sm`。
- **Switch** `mb-switch`：48×28,开态 `--success`,thumb spring 位移 20px。
- **Dialog** `mb-overlay`/`mb-dialog`：遮罩 `rgba(58,40,22,.34)` + `blur(3px)`,弹层 `--r-2xl` + `--sh-xl`,spring 弹入,max-width 默认 440。body `26px` padding,foot 右对齐按钮。
- **Skeleton / Spinner / LoadingDots / CheckBurst**：见文件；流式光标 `mb-caret`（橙、1s steps 闪烁）、`mb-stamp`（盖章 spring）、`mb-check`（描边勾 dashoffset 动画）都在这。

## 7. 每个界面的规格

> 每屏的真实实现就在对应 jsx；下面给定位、用途、关键状态。打开对应 `.html` + 截图逐像素对照。

### 7.1 设计系统总览 — `设计系统.html` → `ds/styleguide.jsx`
全部 token / 组件的活样张。**先读它**建立全局观,再做具体屏。`ds/icons.jsx`(34 图标)、`ds/motion-spec.jsx`(动效规范，对应 `动效规范.html`)是配套规范页。

### 7.2 起稿台 / Home — `起稿台首页.html` → `home/HomeSurface.jsx`（路由 `/`）
唯一着陆页（合并旧 welcome+列表）。sticky hero 永远给**三条创建路并列**：①「让 AI 帮我写」主 CTA（视觉权重压过另两条）②套用模板 ③空白自己写。hero 下按 `articles.length` 分支：空库→模板墙（5 套范文卡）；有稿→「最近的文章」网格。
- 关键状态：`firstVisit`（仅改 hero 文案，更亲和：「第一次来呀~」）· `busy`（创建中，三 CTA 禁用）· 卡操作 打开/删除（`window.confirm`+连带清草稿缓存）/`deletingId`。
- 窄屏强制单列（`gridTemplateColumns:"1fr"`），hero 字号 `clamp(28px,7vw,48px)`。
- 方向探索稿 `起稿台方向探索.html`（`concepts/`）仅记录三方向取舍，**不实现**。

### 7.3 写作流 / Compose — 路由 `/new`，状态机 `intent→asking→connect→generating→done`
命脉漏斗。草稿实时镜像 `sessionStorage`（key `mbeditor.compose.draft`，**仅 session、不进 localStorage**）。顶部恒有「← 返回起稿台」；`backendDown` 时顶部红条幅软预警（可照常起稿）。
- **intent**：一句话大输入框 + 4 灵感胶囊（带娃日记/读书手记/上新札记/本地探店，点击填整句 seed 并聚焦）+「落笔」（空文案禁用 / ⌘/Ctrl+Enter 提交）。
- **asking**：三道选择题——受众（单选 chip）+ 调子（单选 chip）+ 学笔法（两卡二选一，选「贴」展开 textarea）。**受众+调子皆选才解禁「开始写」**；学笔法可跳过。每问带悬浮术语解释 + 生活化例子。
- **connect（条件插入）** → `compose/ConnectAiWizard.jsx`，也对应独立稿 `连接AI向导.html`。见 §7.6。
- **generating→done** → `compose/GeneratingTheater.jsx`，对应 `流式生成剧场.html`，见 §7.4。

### 7.4 流式生成剧场（产品 HERO 时刻）— `流式生成剧场.html` → `compose/GeneratingTheater.jsx`
- 左侧 **5 工序竖轨**（立意→行文→制版→自检→核验）：每道 `pending→active→done`（done 显勾），`stage` 事件可带 `desc`（如「约 820 字」），顶部状态文案随 active 工序变。
- 右侧**逐字手稿**：`title` 点亮标题，`token` 逐字追加正文，流式时尾随**闪烁光标 + 火花 + 实时字数**。**禁止用空 loading 转圈替代流式**。
- `done`：盖「校样通过」印章（`mb-stamp`）→ 写 `articlesStore`、生成 slug → **不自动跳转**，亮**成功庆祝层**。
- **成功庆祝层（约束：绝不替用户决定/自动跳转）**：3 按钮 ①「看看效果」②「复制到公众号」③ **仅当已绑且本会话有 appsecret 的活跃号**才露「发到草稿箱」（`canPushDraft` 闸门）。
- 错误态：`no_provider`→「连接 AI 写手」唤起向导；其它码（`llm_timeout/llm_rate_limit/llm_refusal/safety_block/stream_error/validate_failed`）→ 后端中文 message +「换个说法/重试」回 asking。

### 7.5 编辑器双预览 — `编辑器双预览.html` → `editor/EditorSurface.jsx`（路由 `/a/<slug>`）
配套 `editor/editorParts.jsx`、`editor/ProStage.jsx`（pro 三栏舞台）、`editor/Dialogs.jsx`、`editor/DialogLayer.jsx`。
- 顶层 4 态：no articleId（空态）/ loading / loadError / 正常；叠加 `saveState`（idle/dirty/saving/saved/error）、预览态、对话框层。
- **双预览（不可合并）**：①「公众号效果」(wechat，默认)走后端 `POST /publish/preview`，渲进**可编辑 contentEditable div**，改完 debounce 同步回源码；②「交互预览」(raw) 纯前端 `iframe srcDoc sandbox`（无 allow-scripts/same-origin），验 SVG/SMIL 交互。切换给落差 hint。
- 简单模式：全屏可编辑「公众号效果」+ 富文本工具条 +「复制到公众号」主按钮；**无 Monaco/三栏/缩放**。
- pro 模式（`ProStage`）：三栏（结构面板 + 中舞台 + code 抽屉 Monaco HTML/CSS/JS）、手机预览 390×844 圆角 28px、尺寸拖拽手柄、缩放滑块 40–200%、Lint 侧栏、可视化 SVG 编辑。**硬闸**：`drawerOpen = showProChrome && (codeDrawerOpen||proCodeView)`——简单/窄屏绝不漏出 Monaco。

### 7.6 连接 AI 向导（BYOK）— `连接AI向导.html` → `compose/ConnectAiWizard.jsx`
compose 未连 key 时与 设置→AI 引擎复用。**「测连接通过」才放行**。
- 步 1 选服务商卡：DeepSeek（推荐位 `rec`）/Kimi/通义千问/Claude，每卡带可信度 + 价格锚小字（「写一篇约几分钱」）。**两块科普盒必须保留并放大**：①「这是什么?要花钱吗?」(BYOK/不经我们服务器/几分钱) ②「密钥只存本机/服务端，绝不上传第三方」(锁图标)。底部「我先去设置里配置」=cancel，deep-link `settings?section=aiengine`。
- 步 2 连接：3 步图文引导（注册→建密钥→粘贴，每步配「截屏框」chrome）+ 自动锁定 base_url/model（选 preset 即填）+ 单一 API Key 密码框（autoFocus）+「测试并连接」（空 key 禁用）。
- 闸门：`testLlmConnection`→失败显错不保存不放行；通过→`putLlmConfig`→续生成。「换一个」回步 1。
- 数据契约：GET `/settings/llm` 永不含 api_key（只 `keyConfigured` 布尔 + `source: stored|env`）；PUT 只发实填字段、写后不回显。

### 7.7 设置 — `设置.html` → `settings/SettingsSurface.jsx` + `SettingsSections.jsx` + `SettingsAppearance.jsx`（路由 `/settings?section=<key>`）
左 nav + 右内容；**4 视觉抽屉 / 8 叶子 key 契约**：写作（AI 引擎 `aiengine` / 音色档案 `voice`）· 发布（公众号 `wechat` / 发布服务器 `gateway` / 图床 `imagehost`）· 外观（`appearance`：界面模式 simple/pro 卡 + 主题 + 字体 + 密度 + 布局 + 内嵌编辑器默认行为；`section=editor` 经 `normalizeSection` 归一到 `appearance`）· 关于（`about`）。
- 公众号 section：账号列表（radio 选活跃号）+ 三态徽标（`密钥已保存` forest+锁 / `会话临时` gold / `未配置密钥`）+「添加公众号」开 `WeChatBindWizard`（步 0 名称+AppID→步 1 AppSecret，**测连接通过才解锁「确认绑定」**）。
- 窄屏 nav 转受控手风琴（`openGroup` 单开），8 叶子 key 零改。

### 7.8 对话框/浮层层 — `对话框浮层.html` → `editor/Dialogs.jsx` + `DialogLayer.jsx`
均挂在 Editor：`ValidationDialog`（警告可忽略推送）· `ValidationBlockDialog`（阻断级，draft+copy 两份，默认不可强过）· `SmilWarningDialog`（SVG-SMIL 信息级预警）· `PublishProgress`（发布/复制进度，与对话框互斥不叠）· `CopyReadyDialog`（复制二次点击，choose/chunks 两态 + 成功可停留确认面板）· `EffectGallery`/`TemplateGallery`（pro 插入画廊）。

## 8. 导航 / 路由 / 模式（骨架，改皮不改骨）

- 主导航 = **2 个全局目的地**：起稿台（`/`）+ 设置（`/settings`）。桌面 TopBar 高 44px（`--topbar-h`）：左品牌按钮（Logo+「MBEditor」回 `/`）/ 中 2 tab（编辑/写作流时换静态「编辑中」标签）/ 右后端健康灯 `HealthDot`（健康静默灰点 opacity .6，持续掉线才红可点 reload）。移动 BottomTabBar（<600px，非编辑路由挂载，触控 ≥52px，留 `env(safe-area-inset-bottom)`）。
- URL 契约（不可破）：`/`=起稿台 · `/new`=写作流 · `/a/<slug>`=编辑器 · `/settings?section=<key>`=设置 · `/welcome`→`/`。**editor 的 `intent`（publish/draft）绝不进 URL**，只活在 `history.state` + sessionStorage（三兜底:params→history.state→sessionStorage）。
- 双模式 `uiStore.uiMode: simple|pro`，**默认 simple**。派生 `chromeForUi`：simple 关 pro chrome、`defaultView=preview`、强制 `focus` 布局但保留 store 原偏好（收起不删除）。`applyMobileChrome` 窄屏强制收 pro chrome。
- 单一断点 `useIsMobile()=matchMedia("(max-width:600px)")` 驱动全部「<600px 转 X」；390px 是 CSS 层二级断点；触控 ≥44px。
- **统一返回语义**：编辑器无论从何进入，「返回」一律回 `/`（list），不走 history.back。

## 9. 不可破坏的产品约束(§7 护栏，重建时逐条自查)

**公众号输出契约**:正文只接受**行内 style 的 HTML/SVG**；外部 CSS/JS、`<style>/<script>/<link>/class/id/data-*/on*` 一律不进；`flex/grid/gap/position:absolute|fixed/transform/animation/float/!important` 等会被丢弃——布局只能 `<section>`+`inline-block`+`vertical-align`。**重建产出的主题 CSS 不会进公众号正文**；「公众号效果」预览**必须跑同一条后端净化管线**，不可用纯前端 CSS 冒充。SVG 子树当受保护契约整块抠出/拼回。

**双预览语义不可合并**;wechat 刷新只随 html+css 指纹打后端,改 JS/title/digest 不打;任何预览/草稿**不执行用户 JS**。

**发布:复制优先 → 草稿兜底(顺序不可倒置)**。复制零门槛主推（`/publish/process-for-copy`）；草稿次要/藏「更多方式」，**必须先绑号**，未绑不露入口也不撞死路；两路复用同一套校验闸 + SMIL 预警。

**剪贴板**:`navigator.clipboard.write`→`execCommand("copy")` 两层兜底；**不得**因 clipboard 缺失而禁用复制按钮;execCommand 兜底把选区包**不透明白底 div**;保留「服务端处理完用户**再点一次**才写剪贴板」(不自动写)。

**体积/SVG 原子性**:正文 >~400KB 走自动分段复制（每段约 250KB）；**`<svg>` 永不跨段拆分**，超预算整块前置预警。

**校验闸 + SMIL**:复制/草稿动作前跑硬闸,`issues.length>0`→`ValidationBlockDialog` 硬拦,warnings 仅 toast 放行;不可用时 fail-open 但显式 toast;含 SMIL 弹 `SmilWarningDialog`。保留实时 `CompatibilityBadge`（✓/⚠N/✕N，pro chrome 可隐能力须留）。

**BYOK + 流式**:不经平台服务器,密钥只存本机/后端、写后不回显、绝不上传第三方/进浏览器存储/进公开仓库;向导内明示三件事;连 AI 与绑号都「测连接才解锁」;SSE 5 型事件 `stage/title/token/done/error`(断连重连 1 次),`no_provider` 友好兜底;进生成前先确认已连 key(未连插入向导,不让中途才报错);后端 down 给顶部软预警不整体阻断。

**主漏斗骨架**:四步主线(一句话→受众+调子选择题→流式整篇→编辑器所见即所得→一键复制/发草稿)完整保留;受众+调子必选闸门(学笔法可跳);成稿后由用户在成功层主动选下一步,不自动跳转/发布。起稿台三条创建路并列。一句话意图+已选项实时镜像 sessionStorage(仅当次会话)。音色档案当单档案/无账号体系,`traits` 可空、空档案不解引用 null。

**双模 + Monaco 硬封死**:默认简单(无 Monaco/三栏/代码/IDE 状态栏);模式切换收起不删除;`drawerOpen = showProChrome && (...)` 简单/窄屏绝不漏代码界面;pro 全部能力可达。

**移动**:单一 600px 断点;窄屏强制单列 + 收 pro chrome;触控 ≥44px(底 tab ≥52px)+留安全区;编辑/写作流不挂底栏(自带返回);窄屏旁路真机双层手机壳 + 预览框 `width:100%`(陷阱:`scaledPreview*` 须保 number,别改成 `"100%"` 字符串)。

**多账号/隐私**:支持公众号多账号(`accounts[]`+活跃号),AppSecret 持久化时剥离(不进浏览器存储),徽标区分三态;**不做**账号体系/付费墙/多租户/收款;**不把**小白产品化方向写进公开文档(公开仓库对外仍是「微信交互式 SVG 编辑器/CLI」)。

> 完整 50 条 MUST/MUST NOT 见设计简报 §7。任一条被破坏会导致「公众号粘不进/被静默剥离/丢格式」或触碰隐私合规红线。

## 10. 唯一固定品牌资产:Logo（像素级不变,只可换容器底色）

- 画布 `viewBox="0 0 100 100"`。容器:圆角方块 `<rect width="100" height="100" rx="22">`,填充**橙红 `#E8553A`**。
- 字母 M:单条折线 `d="M24 74 L24 28 L50 54 L76 28 L76 74"`,**描边非填充**(`fill="none"`),描边色**奶油 `#FBF4E8`**,`stroke-width="13"`,`stroke-linecap="round"`+`stroke-linejoin="round"`。
- 特征:左右两竖等高、中间 V 形下凹落在 y=54(未触底),圆润亲和、非衬线 M。
- 落位 `brand/`:`mark-orange.svg`(橙底奶油 M,主用)· `mark-cream.svg`(奶油/透明底+橙红 M)· `icon-rounded.svg`(favicon/PWA)· `avatar.svg`(头像,加内边距)。
- 继承边界:**唯一**继承的品牌线索 = 两色 `#E8553A`/`#FBF4E8` + M 的圆角几何。除此之外全部按本设计系统(已推翻旧 cozy/拟物皮肤)。

## 11. 文件清单(design_files/)

- `ds/theme.css` — **全部 token,照搬数值**
- `ds/ui.jsx` — 基础组件库(Button/Input/Field/Chip/Tag/Segmented/Card/Switch/Dialog/Skeleton/Spinner/CheckBurst…)
- `ds/icons.jsx` — 34 个内联 SVG 图标(禁 emoji)
- `ds/styleguide.jsx`(`设计系统.html`)· `ds/motion-spec.jsx`(`动效规范.html`)— 规范活样张
- `home/HomeSurface.jsx`(`起稿台首页.html`)— 起稿台 `/`
- `compose/ConnectAiWizard.jsx`(`连接AI向导.html`)· `compose/GeneratingTheater.jsx`(`流式生成剧场.html`)— 写作流子屏
- `editor/EditorSurface.jsx` + `editorParts.jsx` + `ProStage.jsx` + `Dialogs.jsx` + `DialogLayer.jsx`(`编辑器双预览.html` / `对话框浮层.html`)— 编辑器 + 对话框层
- `settings/SettingsSurface.jsx` + `SettingsSections.jsx` + `SettingsAppearance.jsx`(`设置.html`)— 设置 4 抽屉
- `concepts/*`(`起稿台方向探索.html`)— 方向取舍记录,**落选项不实现**
- `design-canvas.jsx` — 仅演示画布,**不复刻**
- `screenshots/*.png` — 各屏像素对照基准

---

**实现顺序建议(按情绪权重)**:Compose 主漏斗(intent/asking/connect/流式剧场/庆祝层)> 起稿台 Home > 编辑器(双预览+复制优先发布)> 设置 4 抽屉 > 对话框层。流式生成 + 成功庆祝层是产品唯一情绪峰值,值得最重笔墨。
