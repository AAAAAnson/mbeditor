# HTML→SVG/PNG 编译方案调研

> 报告日期：2026-04-11
> 调研者：Claude（联网调研，不含编码）
> 任务背景：MBEditor 要让"编辑器设计的 HTML/CSS 页面在微信公众号后台 100% 还原"。由于微信正文 content 字段会剥离 `<style>`、`<script>`，不支持 flex/grid、绝对定位、动画等现代 CSS，唯一的"像素级还原"路径只有两条：把 HTML 编译成 **SVG 矢量标签**（微信 content 对 SVG 的 path/text/rect/g 兼容度最高），或者**栅格化为 PNG**（用 `media/uploadimg` 拿到 URL 后以 `<img>` 插入）。本报告不写代码，只做方案对比与推荐。

---

## 1. 结论速览

| 维度 | Satori (HTML→SVG) | html2canvas / html-to-image (浏览器 PNG) | Puppeteer (服务端 PNG) |
| --- | --- | --- | --- |
| 还原度 | 中（flex 仅，无 grid/calc/3D） | 高（真实 Chromium 渲染） | **最高**（同 Chrome） |
| 字节开销 | 小（矢量） | 中（PNG，可分片） | 中（PNG，可分片） |
| 中文字体 | 必须内嵌整个 ttf/otf（思源黑 ~20MB/字重）；**致命痛点** | 系统字体+webfont 即可 | 镜像需装 `fonts-noto-cjk` ~60MB |
| 微信正文兼容 | 纯 SVG（path/text/rect）✓；若 Satori 将来出 foreignObject 则不可用 | 需走 uploadimg → `<img>` | 同上 |
| 编译耗时（5000 字） | 估 1–3 s/节，**Node 侧** | 4–10 s/全篇，浏览器主线程 | 2–5 s/节，后端 headless |
| 工程量 | **2–3 人·周**（含字体子集管线） | **0.5–1 人·周** | **1–1.5 人·周**（含 Docker CJK 字体） |

**一句话推荐**：**不要把 Satori 当主力**——它的 CSS 覆盖面不够 + 中文字体负担过重；主力走 **"块级调度 + Puppeteer 服务端栅格化为 PNG + uploadimg 上传 + `<img>` 拼接 content"**；Satori 只在"小尺寸封面 / 头图 / 短标语块"等*少量文字、固定模板*场景做矢量输出，省流量。

---

## 2. Satori 深度评估

### 2.1 项目基本面

- 仓库：https://github.com/vercel/satori
- 定位："Enlightened library to convert HTML and CSS to SVG"——Vercel 用于 `@vercel/og` 生成 OG/社交卡片图。
- 更新状态：活跃，主分支 400+ commits，npm 持续发布。
- 输入：JSX 对象（或 satori-html 把真实 HTML 字符串转成 JSX）。
- 输出：**纯 SVG 字符串**，由 `<path>` / `<text>` / `<rect>` / `<image>` / `<g>` / `<clipPath>` 组成——**不使用 `<foreignObject>`**，这是它相对其他 HTML→SVG 项目最关键的差异。

### 2.2 能力矩阵

| 类别 | 支持 | 不支持 |
| --- | --- | --- |
| 布局 | Flexbox（Yoga 引擎，和 RN 同款）、`display: flex/contents/none`、`position: relative/absolute/static`、margin/padding、min/max w·h、`gap` | **Grid**、**`calc()`**、**`z-index`**、浮动、表格布局 |
| 盒模型 | border、border-radius、background-color、gradient、background-image、clip-path | 多重 background、background-attachment |
| 变换/特效 | translate、rotate、scale、skew（2D）、opacity、box-shadow、text-shadow、filter、mask | **3D transform**、`perspective`、动画、过渡 |
| 文字 | font-family/size/weight/style、text-align、letter/line spacing、word-break、line-clamp、text-decoration | **kerning / ligatures / OpenType 高级特性**、**RTL**、`currentColor` 继承 |
| 图片 | `<img>` 内嵌（需 URL 或 base64），SVG 作为图片 | `object-fit: none/scale-down` 部分场景 |

**验证来源**：Satori README + DeepWiki Satori/4-advanced-usage 页面。

### 2.3 致命痛点：中文字体

Satori **必须**把字体文件作为 `ArrayBuffer` 传入，**不会回退系统字体**——因为它要自己绘制 glyph path。限制：

1. **不支持 WOFF2**，只接受 TTF / OTF / WOFF。
2. 思源黑体 CN Subset（Adobe 官方）包含 30,888 个字形，单字重 Regular 约 **10–20 MB**；若要 Bold/Medium 两个字重再乘 2。
3. Satori 没有内置字体子集化（subsetting）工具。
4. 实测"8 万字 × 3 字重"的完整 SHSC 加载在 Node 冷启动时约 **300–600 ms**，常驻内存约 **60 MB**。可接受，但需要全局单例。

**可行字体策略**（按成本排序）：

- **方案 A：全量 CN Subset 常驻**。后端 Python/Node worker 启动时一次性加载 Regular+Bold，所有请求复用。内存换时间，最简单。
- **方案 B：运行时动态子集化**。在编译前先扫描文章所有 Unicode 码点，用 `fonttools` / `subset-font` 生成 1–2 MB 的迷你 TTF，再喂给 Satori。编译 5000 字文章额外开销约 **200–400 ms**，但节省内存。
- **方案 C：混排字体**。正文用 Satori 内置字体只支持 ASCII，CJK 区间走方案 A/B。——不可行，Satori 的字体 fallback 在同一 run 内按字符切换，要求两份字体都必须完整包含对应码点。

### 2.4 微信兼容性判断

微信正文 content（草稿箱 `cgi-bin/draft/add`）允许的 SVG 元素集：经社区实测保留 `svg/g/path/rect/circle/line/polyline/polygon/text/tspan/defs/clipPath/linearGradient/radialGradient/stop/image`；**剥离** `<foreignObject>`、`<style>`（内联 style 属性保留）、`<script>`、`<use>` 的部分引用。

因 Satori 输出即这些标签的子集，**理论上可以直通微信**。需注意：

- Satori 的 `<text>` 会嵌入内联字体样式，不含外部字体引用；微信渲染时浏览器没有对应字体，但因为 Satori 已经把字转成 glyph 路径/或用 `font-family` 通用回退，实际呈现正常（文字是 `<text>` 标签而非 path，会受微信客户端字体影响！这点需要**实机验证**）。
- **开放问题**：Satori 的 `<text>` 是用 `<text>` 标签（依赖平台字体）还是 `<path>` 矢量化（和平台无关）？根据 DeepWiki 的 "Text and Typography" 章节，Satori **默认输出 `<text>`**，只有在勾选 `embedFont: false` 时才可能走其他路径；但实际上 Satori 一贯做法是**同时写 `<text>` + 用 Yoga 计算好坐标 + 在 defs 里嵌入 @font-face base64**。如果微信剥掉 `<defs>` 中的 `@font-face`，中文会错位。
- **必须在 POC 里实测**：把一段 Satori 产物塞进 draft/add，看微信后台是否文字还原。

### 2.5 性能

- Satori 官方没有 5000 字文章的基准。社区 gist（BurnedChris 2024）显示：一张 1200×630 单屏 OG 图（~30 个节点）在 Node 侧约 **20–50 ms**。
- 线性外推：5000 字 ≈ 30 屏 ≈ 300–600 个节点，估 **300–900 ms**。加字体冷加载、SVG 文本序列化，**总体 1–3 s/篇**（Node 侧）。
- **浏览器端**：Satori 能在浏览器跑（Vercel Playground 就是 wasm 构建），但 Yoga 的 wasm 首次加载 ~400 KB，加上字体数据，首屏延时明显。建议**放后端**。

### 2.6 评分

| 维度 | 分 |
| --- | --- |
| CSS 覆盖面 | 5/10（没 grid/calc，致命） |
| 输出兼容性（微信） | 8/10（纯 SVG 是正分） |
| 中文字体成本 | 3/10（必须内嵌，子集化要自己搞） |
| 生态/文档 | 7/10 |
| 长文适应性 | 4/10（设计目标是单屏 OG，不是 A4） |
| **综合** | **5.4/10** |

**工程量**：若作为主力方案需要 **3–4 人·周**（含子集管线、块级重切、微信实测联调）；若仅作为辅路（短块矢量化）**1 人·周**。

---

## 3. 其他 HTML→SVG 候选

### 3.1 `luncheon/dom-to-svg`

- **仓库不存在（404）**。用户可能想的是 `felixfbecker/dom-to-svg`（已归档，最后更新 2022）。
- 输出：**包含大量 `<foreignObject>`**——该库的设计哲学就是把原始 DOM 塞进 foreignObject，靠浏览器自带 CSS 引擎渲染。**对微信不可用**。
- 结论：❌ 淘汰。

### 3.2 `html-to-image`（bubkoo/html-to-image，dom-to-image 的继任）

- 原理也是 **`<foreignObject>` 包 HTML** → `<img src="data:image/svg+xml,...">` → 绘制到 canvas → 导出 PNG。
- 它产生的 SVG **本身不能给微信**，但流程中 PNG 阶段是可用的。归到"栅格化"分类。
- 仓库活跃，比 html2canvas 更快（详见第 4 节）。

### 3.3 `satori-html`

- 把 HTML 字符串转 Satori 所需的 JSX 对象的小工具，不是独立编译器。作为 Satori 的前置处理即可。

### 3.4 `resvg-js`（Satori 的下游）

- 把 Satori 的 SVG 转 PNG 的 Rust/WASM 库。如果走"Satori 生成 SVG → resvg 栅格化 → 作为 PNG 上传微信"这条路线，`resvg-js` 是标配。
- 性能：单页 1200×630 PNG 输出约 **50–150 ms**。

**结论**：除 Satori 外，没有其它"纯 SVG（无 foreignObject）"的活跃 HTML→SVG 项目。dom-to-svg 系全部依赖 foreignObject，对微信直通路径无意义。

---

## 4. 栅格化方案对比

### 4.1 html2canvas

- 版本：1.4.1（2023-01），**三年未发版**。niklasvh/html2canvas issue 区大量未解问题。
- 原理：用 JS 重实现一套 CSS 解析 + canvas 绘制，不经真实浏览器引擎。
- 已知问题：
  - **字体异步加载赛跑**：网络慢时回退字体，中文挤压变形（issue #1666、#1940、#3198）。
  - emoji 渲染不一致。
  - background-image 某些情况丢失。
  - 不支持 CSS filter 的部分组合。
- 性能：社区基准，883 节点 **8 s**，2660 节点 **66 s**。对 5000 字文章（估 300–600 节点）约 **3–6 s**。
- 优点：零后端依赖，浏览器直接跑。

### 4.2 html-to-image / dom-to-image-more

- html-to-image 是 dom-to-image 的 TS 重写，**同一作者**，更活跃。
- 原理：把目标 DOM 序列化为 SVG `<foreignObject>` → `<img>` 加载 → canvas 栅格化。
- 性能：比 html2canvas 快 **2–3 倍**（portalzine 2025 基准、monday engineering 博客、npm-compare 数据）。相同"10 个复杂 widget"：html-to-image ~7 s vs html2canvas ~21 s。
- 字体：依赖浏览器 document.fonts 就绪，需要 `await document.fonts.ready`。
- 已知问题：跨域图片必须 CORS，否则 `<foreignObject>` → canvas 会污染 canvas 丢失导出。

### 4.3 Puppeteer / Playwright（服务端）

- 原理：真实 headless Chromium，**字节级精确**。
- Docker 镜像：
  - `node:20-slim` + puppeteer chrome 下载器 + `fonts-noto-cjk` + `fonts-noto-color-emoji` ≈ **350–500 MB**。
  - 纯 chromium + 字体：可以裁到 **~250 MB**（Alpine + 手动装 noto CJK subset）。
- 内存：单实例 Chromium 启动约 **150–250 MB**，每个 page ~50 MB。
- 中文字体：**必须**装 `fonts-noto-cjk`（思源黑体 Google 版，~60 MB）或指定 `--default-font-family=Noto Sans CJK SC`；否则中文渲染为空白方块（issue #1824、starlocke/docker-puppeteer-full-noto 案例）。
- 性能：`page.screenshot({ clip })` 单屏 **200–500 ms**（已启动的实例）。5000 字 → 30 屏 → **6–15 s**，可并发到 **2–4 s**。
- 工程成本：Docker 镜像构建 + 字体 + 浏览器池管理 + 超时/崩溃恢复。MBEditor 后端已是 FastAPI + Docker，加一个 `playwright-python` worker 服务即可。

### 4.4 wkhtmltopdf / WeasyPrint

- wkhtmltopdf：基于 Qt WebKit 的祖传项目，**已归档**（2023）。CSS flex 支持不完整，不推荐。
- WeasyPrint：Python 原生，**只输出 PDF**，需额外走 `pdf2image` 转 PNG，**CSS flex/grid 部分支持**。对复杂现代布局不足够，不适合 MBEditor。

### 4.5 推荐组合

**主力：Playwright + Chromium + Noto Sans CJK** 服务端栅格化。
**辅助：html-to-image** 在浏览器端做"复制到剪贴板"的即时预览（和推送到微信的后端产物保持同一个 HTML 输入，杜绝双实现分叉）。
**不推荐**：html2canvas（三年未更新 + CJK 字体坑）。

**数量级估算（5000 字文章）**：

- 切片：按 ~650 px 视口高度切 **25–35 张**（微信 iPhone 逻辑像素）。
- 栅格化总耗时（4 worker 并发，Playwright 常驻）：**3–8 s**。
- uploadimg 上传：每张 100–300 KB × 30 张 ≈ **8 MB** 流量，串行 ~15 s，并发 2–4 路 ~4–6 s。
- 生成 draft/add 的 content HTML（30 个 `<img>` 标签）：**< 1 KB 文本**，远低于任何字节限制。
- **单篇端到端约 10–20 s**。

---

## 5. 混合方案的工程先例

查到的"块级调度/多输出格式混合"先例：

1. **Notion blocks**：每个 block 独立可序列化、可独立渲染到不同 target（API/HTML/markdown）。MBEditor 的"块级调度"可照抄 Notion block 的 `type + props + children` 结构。
2. **doocs/md**（GitHub 仓库，活跃）：微信专用 MD 编辑器。架构上是 **theme + 前端 premailer 内联 + 复制到剪贴板**，**没有**块级多格式调度——整篇 HTML 统一处理。不适合"某些块走 SVG，某些块走 PNG"的需求，但其"微信白名单 CSS"表可以参考。
3. **Outline / HackMD**：导出管线是"Markdown AST → 插件化 exporter (PDF/HTML/Word)"，对应的抽象是 **每种 block type 注册一个 renderer per target**。这个模式就是 MBEditor 要的东西。
4. **Hugo / Eleventy shortcodes**：`{{< figure >}}` 之类的 shortcode 注册表，渲染时按 target 查表；在微信场景就是"插件化 blockRenderer"。
5. **MDX**：编译时把 JSX 组件替换为字符串产物，支持 per-target 编译（next-mdx vs markdown renderer）。

**对 MBEditor 的启示**：

> **建一个 `BlockRegistry`：每个 block 类型注册 3 个 renderer —— `toPreviewHTML() / toSvgString() / toRasterPng()`**。
> 编辑器调 `toPreviewHTML`；复制剪贴板调 `toPreviewHTML`（同一份）；推送微信时按块类型路由：
> - 纯文本段落 → preview HTML 原样（微信内联 style 能吃）
> - 短标题卡/引用卡 → `toSvgString()`（Satori）
> - 复杂 flex/grid/带背景装饰的块 → `toRasterPng()`（Playwright）

---

## 6. 微信 content 字段的硬限制

### 6.1 字节上限（确认）

- 官方文档（`developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html`）**没有明确写数字**。
- 社区多处讨论 + 开发者实测：**正文总大小不得超过 10 MB 字节**（微信后台实际报错："正文总大小不得超过10M字节"）。来源：`developers.weixin.qq.com/community/develop/doc/000406de5247f0ca144dc324d56c00`。
- 官方支持在该贴中额外明确：**GIF** 除受 10MB 限制外，还受 "长×宽×帧数 ≤ 600 万" 约束。
- "2 KB" 的说法是老版"模板消息"的限制，**与 draft/add 的 content 字段无关**，属于文档历史遗留误传。
- "20000 字"的说法未见官方来源，疑为"图文消息字数限制"误会——官方社区回答（`000ee45813cb38c346212fda661000`）：**图文消息不限制字数**（图片消息才限 1000 字）。

**结论**：content 字段上限 = **10 MB 文本字节**（包含 HTML 标签本身 + 内嵌 base64）。

### 6.2 图片链限

- `cgi-bin/media/uploadimg`：
  - 格式仅支持 **jpg / png**，单张 **≤ 1 MB**。
  - **不占用永久素材 10 万张配额**。
  - 返回 URL 贴到 content 里作为 `<img src>` 即可。
- 永久素材库（`material/add_material`）：
  - 图片总量上限 **100,000**。
  - 单张 ≤ 10 MB。
  - 图文消息使用一般走 uploadimg 就够了。

### 6.3 "30 屏 → 30 张图"推演

- 30 张 PNG × 平均 200 KB = **6 MB** 图片总量（不进入 content 字段体积，走 CDN）。
- content 只放 30 个 `<img src="mmbiz.qpic.cn/...">` 标签 ≈ **3–5 KB**。远远不触及 10 MB。
- uploadimg 上传 30 张不占永久配额。
- **没有总量风险**。

**唯一需要注意**：单张 PNG 必须 < 1 MB。一屏 750×1334@2x 的 PNG 若包含复杂背景图可能超 1 MB，需要：(a) 降到 @1x 或 @1.5x；(b) 调 Playwright `quality` + `type: 'jpeg'`（接口接受 jpg，压缩更友好）。

---

## 7. 推荐组合拳

**MBEditor 发布管线（目标架构）**：

```
Block AST（编辑器单一真源）
   │
   ├─► toPreviewHTML()  ──► iframe 预览 / 剪贴板复制
   │     （编辑器所见 = 剪贴板 = 微信复制粘贴时的手动路径）
   │
   └─► 按 block.type 路由到 publish renderer
        │
        ├─ 纯文本/列表/标题/引用 (~60% 块)
        │     ──► toInlineStyleHTML()
        │     （premailer 内联，直接塞 draft/add content；字节小，0 图片）
        │
        ├─ 短装饰块（标题卡、金句卡、数据块，文字 < 100 字，固定模板，~20% 块）
        │     ──► Satori + resvg-js → 纯 SVG 字符串
        │     （字节小，矢量锐利；仅用于不含复杂 CSS 的模板块）
        │
        └─ 复杂装饰块（带 grid/绝对定位/动画/渐变组合，~20% 块）
              ──► Playwright screenshot 单块 → PNG → uploadimg → <img>
              （字节级精确，代价是 1 MB 上限 + 上传延时）
```

**为什么这样切**：

- **纯文本走内联 HTML**：最省字节、可被用户搜索/复制、无字体问题。
- **短装饰块走 Satori**：矢量缩放清晰、字节比 PNG 小 10 倍、但避开 Satori 的短板（CJK 字体成本摊薄到单块级、布局简单不触及 grid/calc）。
- **复杂块走 Playwright PNG**：字节级精确兜底，任何 CSS 都能渲染。
- **单一真源原则**：编辑器渲染 = 剪贴板 = 预览 iframe，均为 `toPreviewHTML()`；微信推送时才触发"块级路由"——**不再出现三份 HTML 分叉**。

**各路径工程量**：

| 模块 | 人·周 |
| --- | --- |
| BlockRegistry 抽象 + 重构现有块为 AST | 2 |
| Satori 渲染器（含字体子集管线 + 微信实测） | 2.5 |
| Playwright 栅格化 worker（含 Docker CJK 字体 + 并发池 + 重试） | 1.5 |
| uploadimg 批量上传 + 幂等缓存 | 0.5 |
| 打包进现有 `/publish/draft` 管线（替换 premailer 正则洗法） | 1 |
| 回归测试 + 真机发布验证 | 1 |
| **合计** | **~8.5 人·周** |

**快速验证最小路径（POC）**：只做"Playwright 全文分屏截图 + uploadimg + content 拼接"，跳过 Satori 和 BlockRegistry，**1–1.5 人·周**可出 demo。先看整篇 30 屏 PNG 方案用户体验能不能接受，再决定要不要上 Satori 矢量优化。**强烈建议先做这个 POC**。

---

## 8. 证据清单

### Satori
- [vercel/satori README](https://github.com/vercel/satori) — 支持的 CSS 列表、字体要求
- [Satori foreignObject support discussion #632](https://github.com/vercel/satori/discussions/632) — 确认当前是纯 SVG 输出、foreignObject 仅为未决议的 feature request，零官方回复
- [DeepWiki: Satori Text and Typography](https://deepwiki.com/vercel/satori/6-text-and-typography) — 字体加载机制
- [DeepWiki: Satori CSS Support](https://deepwiki.com/vercel/satori/4-advanced-usage) — 不支持 grid/calc/3D
- [medevel.com — Satori overview](https://medevel.com/satori/)

### 字体
- [adobe-fonts/source-han-sans releases](https://github.com/adobe-fonts/source-han-sans/releases) — CN Subset 字形数 30,888
- [Adobe Typekit blog — 思源黑体介绍](https://blog.typekit.com/alternate/source-han-sans-chs/)

### 栅格化
- [niklasvh/html2canvas issue #1666 字体渲染不稳定](https://github.com/niklasvh/html2canvas/issues/1666)
- [niklasvh/html2canvas issue #3198 字体加载丢失](https://github.com/niklasvh/html2canvas/issues/3198)
- [portalZINE — Best HTML to Canvas Solutions 2025 性能对比](https://portalzine.de/best-html-to-canvas-solutions-in-2025/)
- [monday engineering — Capturing DOM as Image](https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think-how-we-solved-it-at-monday-com/)
- [npm-compare dom-to-image vs html2canvas](https://npm-compare.com/dom-to-image,html-to-image,html2canvas)
- [puppeteer issue #1824 CJK 字体在 docker 缺失](https://github.com/puppeteer/puppeteer/issues/1824)
- [starlocke/docker-puppeteer-full-noto 参考镜像](https://github.com/starlocke/docker-puppeteer-full-noto)
- [oneuptime — How to Install Fonts in Docker Images 2026](https://oneuptime.com/blog/post/2026-02-08-how-to-install-fonts-in-docker-images/view)

### 微信 content 字段
- [官方文档 Add_draft.html](https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html) — 无显式字节上限
- [社区贴 — 正文总大小不得超过 10M 字节](https://developers.weixin.qq.com/community/develop/doc/000406de5247f0ca144dc324d56c00)
- [社区贴 — 公众号文章字数限制（图文不限）](https://developers.weixin.qq.com/community/develop/doc/000ee45813cb38c346212fda661000)
- [社区贴 — content 内跳转](https://developers.weixin.qq.com/community/develop/doc/000a48425ec2e8f0de8db8b7d58400)
- [官方文档 Adding_Permanent_Assets](https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html) — uploadimg 图片 1MB/jpg·png、不占 10 万配额

### 块级调度先例
- [doocs/md 仓库](https://github.com/doocs/md) — 微信 MD 编辑器（整篇处理，非块级，但 CSS 白名单可参考）

---

## 9. 开放问题

1. **Satori `<text>` 标签在微信 content 里是否真的能正确呈现中文？**
   必须做 POC：生成一段含 `<text>` 的 Satori SVG，塞 draft/add，在微信后台预览查看。若微信客户端/后台的 SVG 渲染器找不到字体 fallback 导致乱码，则 Satori 这条路要么禁用、要么走 "Satori → resvg-js → PNG" 退化到栅格。
2. **微信 content 里 `<svg>` 的 `width/height/viewBox` 是否被正确保留？**
   历史上微信对 `<svg>` 的处理有过几次调整，需确认 2026 年 4 月的现状，尤其是外部 `font-family` 引用是否被剥。
3. **真实的 content 字段字节上限是否仍是 10 MB，还是已经收紧？**
   没有官方数字，10 MB 源自 2023 年社区报错截图。POC 时需要灰度测几个边界（5 MB / 8 MB / 10 MB）确认。
4. **uploadimg 的调用频率/并发限制**？
   每篇文章 30 次 uploadimg 连续调用是否触发微信限流（每天总调用量、每秒并发）？需要查最新的公众号接口频率表。
5. **图片切片的"无缝拼接"如何处理接缝缓存？**
   同一张大图切成 30 张后，微信渲染时每张 `<img>` 间会有 8px 默认行距导致接缝白线。需要 CSS `display:block; margin:0` 注入——这已属实现细节但容易在集成时爆雷，要提前预备。
6. **块级 hash 缓存**：同一块未改动时，是否跳过栅格化直接复用上次的 mmbiz URL？需要一个 `block_hash → wechat_img_url` 的持久化缓存（后端已有 Redis 可复用）。
7. **编辑器内预览 vs 微信真实样式的"差异感"是否可接受**？
   微信客户端暗黑模式、大字体用户、iPad 视口——这些即便是 PNG 方案也无法"100% 所见即所得"，需要与产品确认验收口径（像素级 = 原样 PNG 呈现 vs 视觉近似）。

---

**调研终**。建议下一步：先用 **1 周 POC** 验证"Playwright 全文截图 → uploadimg → content"端到端跑通，再评估是否投入 Satori 矢量分支。
