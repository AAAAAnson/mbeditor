# 微信公众号 SVG 能力调研

> 调研时间：2026-04-11
> 调研人：MBEditor 架构组
> 目标：判断"用 SVG 作为一等公民，把 HTML/Markdown 效果统一编译到 SVG"的可行性
> 方法：WebSearch/WebFetch 业界文章 + 阅读本项目既有代码做对照

---

## 1. 结论速览

**SVG 不能当 HTML 用。** 微信公众号对 SVG 的支持是一个"为做交互排版而开的一条窄缝"，不是一个"通用的 HTML 替代品"。具体说：SVG 内的 `<animate>/<animateTransform>/<set>/<animateMotion>` + `begin="click"/"touchstart"` 这一套 SMIL 交互链路是**可用**的；`<foreignObject>` 在历史文章里被证实"可以把 HTML 塞进去"，但微信会在进入 `<foreignObject>` 前把 HTML 内部的 `<style>/<script>/<input>/<id>` 等同样按正文规则过滤，所以它并没有打破任何封印。更致命的是，微信会**剥离所有 `id` 属性**（至少三处独立来源证实），这直接废掉了"多元素点击联动"的 SVG 常规写法，也让基于 `<input type=checkbox id=...> + <label for=...>` 的 HTML 伪交互在正文里必然失效。因此推荐路线是**"混合分层"**：正文文字/标题/图片走纯 HTML inline style（mdnice / doocs-md 路线），装饰块和动画块走纯 SVG + SMIL（秀米/135 路线），强复杂块（含 flex/3d/字体特效）走**栅格化兜底**。

---

## 2. SVG 标签/属性白名单

### 2.1 重要前置事实

- 微信官方**从未**发布 SVG 白名单。所有"白名单"都源自 2016 年 JZ Creative 团队与微信合作时内部约定、后被社区反向实证。关键词 "JZ Creative 2016 白名单" 在 ZER0N、知乎、segmentfault 多个独立文章里反复出现，相互印证。[1][2][7]
- 白名单随时间有漂移：2019 年前严格过滤 `transform` 内联样式；2020 年后 `transform` 内联样式可用。[4]
- **微信会过滤 `id` 属性**，这是最重要的一条硬约束，由至少三篇独立文章证实。[1][4][8]

### 2.2 元素白名单表

| 元素 | 状态 | 置信度 | 证据 |
|---|---|---|---|
| `svg` | ✅ 可用 | 硬（业界实证） | [1][2][4] |
| `g` | ✅ 可用（iOS 上 `<g>` 内 `style` 属性有 bug，Android/PC 正常）| 中 | [4] |
| `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path` | ✅ 可用 | 硬 | [1][2][7] |
| `text`, `tspan` | ✅ 可用 | 硬 | [1][10] |
| `defs`, `use`, `symbol` | ✅ 可用（从秀米/135 导出物间接验证） | 中 | [1][2] |
| `clipPath`, `mask` | ✅ 可用 | 中 | [1][2] |
| `linearGradient`, `radialGradient`, `stop` | ✅ 可用（但 "gradients cause excessive file bloat"） | 中 | [4] |
| `pattern` | ⚠️ 未见独立确认，理论可用 | 弱 | 无公开证据 |
| `filter`, `feGaussianBlur` | ⚠️ 未见独立确认；社区案例里极少出现 | 弱 | 无公开证据，推测依据 "gradients already cause bloat" 的同类风险 |
| `image` | ✅ 可用，但 **图片 URL 必须来自微信素材库**，外链和 base64 无效，且 iOS 下必须显式指定 `width/height` | 硬 | [4] |
| `foreignObject` | ⚠️ **可用但受限**——见第 4 节深度分析 | 中 | [4][9] |
| `animate` | ✅ 可用 | 硬 | [1][2][3][7] |
| `animateTransform` | ✅ 可用（`type=translate/scale/rotate/skew` 全部支持）| 硬 | [1][2][7] |
| `animateMotion` | ✅ 可用（但社区用得少） | 中 | [7] |
| `set` | ✅ 可用（用于即时值切换，如 visibility） | 硬 | [7] |
| `animateColor` | ⚠️ 文档列出但已被 SVG 规范废弃，不推荐 | 弱 | [2] |
| `style` 标签（SVG 内部） | ❌ **被过滤**，必须写 presentation attributes | 硬 | [8][4] |
| `script` | ❌ 被过滤 | 硬 | [8][4] |
| `a`（SVG 内的链接） | ❌ 被过滤 | 硬 | [8] |
| `input`, `label`（HTML 元素，即使包在 foreignObject 里） | ❌ 被过滤（按正文规则一并清洗）| 中 | [4] + 本项目 publish.py 的历史实践 |

### 2.3 属性白名单要点

可动画化属性列表（综合 [1][2][7]）：

- 尺寸类：`x`, `y`, `width`, `height`, `r`, `rx`, `ry`, `cx`, `cy`
- 视觉类：`opacity`, `fill`, `stroke`, `stroke-width`, `stroke-dasharray`, `stroke-dashoffset`
- 结构类：`points`（polygon/polyline）, `d`（path）
- 变换类：`transform`（配合 `animateTransform`：translate/scale/rotate/skew）

**确认被过滤/有坑的属性**：

- `id` —— **完全剥离**。这条是硬约束，决定了所有"id.click+3s"链式触发都不可用。[1][4][8]
- `stroke-dasharray`（作为 animate 的 attributeName）—— 实测被过滤，"保存时被微信吃掉"。[8]
- `restart="never"` —— iOS 不生效，动画会被重复点击反复触发。[4]
- `<g>` 上的 `style` 属性 —— iOS 失效（Android/PC 正常）。[4]
- `position` CSS —— 会被剥离（这是 HTML 正文规则，SVG 不受影响）。[4]

---

## 3. SMIL 动画与交互的确定可用范围

### 3.1 `begin` 属性支持的事件

| 触发形式 | 状态 | 证据 |
|---|---|---|
| `0s`, `1.5s`（绝对时间） | ✅ 可用 | [3][7] |
| `indefinite` + 外部 `beginElement()` | ❌ 不可用（需要 JS） | 推论 |
| `click` | ✅ 可用（最稳定之一） | [1][2][7] |
| `touchstart` | ✅ 可用（响应最快） | [7] |
| `touchend`, `touchmove` | ⚠️ 部分终端有误触，推荐 `touchstart/click` | [7] |
| `tap` | ❌ "某些终端无响应" | [7] |
| `element_id.click+1s`（链式） | ❌ **不可用**，因为 `id` 被过滤 | [1][4][8] |
| `0s;3s`（列表触发） | ✅ 可用 | [3] |

事件响应优先级顺序（ZER0N 教程明确列出）："touchstart > touchmove > touchend > tap > click"。[7]

### 3.2 SMIL 的实战技巧（业界共识）

- **"编组代替 id 链接"**：因 `id` 被过滤，想要"点击 A 触发 B"必须把 A 和 B 包进同一个 `<g>`，然后把 `<animate begin="click">` 挂在 B 上。这是秀米/135 内部真正走的路数。[3]
- **文字动画路径化**：真正做交互排版的人不会用 `<text>` 来做动画，而是在 AI 里把文字转成 `<path>` —— 这样既避开了字体/换行问题，也避开了 `<text>` 的 `begin` 行为怪异。[3]
- **`values` + `keyTimes` + `keySplines`** 才是写 SMIL 动画的主力三件套，而不是 CSS keyframes。[3]
- **600ms 事件窗口**：有文章报告"点击事件只在 600ms 内响应，再深次点击就不触发了"。[8]

### 3.3 SMIL vs CSS @keyframes

在微信正文里的实际表现：

- **CSS `@keyframes`**：必须写在 `<style>` 标签里，而 `<style>` 标签在 HTML 正文中**会被整块删除**。唯一可用的办法是 `style="animation:..."` 内联到元素上，但这样没法定义 keyframes 本体。**结论：CSS 动画在正文里基本不可用**，本项目 `svg-templates.ts` 里的 `@keyframes fadeIn${id}` 写法上线后会被剥空。
- **SMIL**：作为 SVG 元素的子节点存在，不受 `<style>` 过滤影响，是公众号正文里**唯一可用的动画机制**。

---

## 4. `<foreignObject>` 的真实状态

### 4.1 结论

**`<foreignObject>` 没被显式封堵，但它并不是"绕过过滤的后门"。** 微信的过滤器是在 DOM 层级上对白名单做匹配，`<foreignObject>` 内部的 HTML 子树仍然会被同一套 HTML 白名单清洗：`<script>` 全没、`<style>` 全没、`id` 全没、`<input>/<label>` 按正文规则处理。所以"把 checkbox hack 包进 foreignObject 里就能活"**几乎是错觉**。

### 4.2 证据

- **正面证据（foreignObject 确实可用）**：cnblogs 2020 年"css 布局和 SVG 推文的一些坑"明确写："foreignObject works - it allows embedding HTML elements inside SVG, enabling use cases like simultaneous animation and audio playback."[4] 同文档还报告了一个具体 bug："在 iOS 深色模式下，foreignObject 里的 img 会变得很大超出屏幕"——这说明 foreignObject 在真实设备上确实渲染了。[4][9]
- **负面证据（foreignObject 不是免死金牌）**：同一份文档也说"不能写 JavaScript，不能写 CSS，只能在 HTML 标签里写内联样式"——这条限制适用于 foreignObject 内部。[9] 而且多篇文章说 **`id` 被过滤是 HTML 正文级别的操作**[1][4][8]，这意味着即使你把 `<input id="x">` 包进 foreignObject，`id="x"` 照样会掉。
- **2024-2026 年的明确实证**：**查不到**。最近两年没有任何一篇公开博客明确声明"2024/2025 我刚在公众号上测了 foreignObject+HTML 还能用"。所有能找到的证据文章都集中在 2020-2023 年。
- **本项目的内部证据**：`backend/app/api/v1/publish.py:185-215` 的 `_wrap_in_svg_foreignobject` 函数当前处于**被禁用状态**。代码注释写："WeChat strips `<input>/<label>/<style>` from article body HTML, but preserves them inside `<svg><foreignObject>`. This is the industry-standard technique used by Xiumi (秀米), 135editor, etc." —— 这条注释本身是一个**乐观假设**，并没有实测证据支撑；而该函数被禁用本身就是这个假设被证伪的行为证据。

### 4.3 秀米/135 的翻页、轮播、点击展开到底走什么管线

基于 WebFetch 拿到的 135 "连续翻页再点击展开"官方教程[11]：**教程层面完全不暴露技术细节**，只说"生成一段包含所有 SVG 代码的 HTML"。但从三处侧面证据拼出来：

1. 135 文章规范要求"所有用于连续翻页的图片宽度必须完全相同，高度也尽量一致" —— 这是典型的**纯 SVG `viewBox` + `<image>` + `<animateTransform translate>`** 做法，不需要 HTML flex 布局也能做到。[11]
2. 知乎"详细教你微信公众号正文页 SVG 交互开发"[1]和 segmentfault"公众号 SVG 动画交互实战"[2] 给出的所有代码示例都是**纯 SVG + SMIL**，没有任何一篇示例用到 foreignObject。
3. ZER0N 课程第三节[7]讲的是 `<animate>/<set>/<animateTransform>/<animateMotion>` 四件套 + `begin` 事件，**完全不涉及 foreignObject**。

**推断**：秀米/135 的交互组件底层是**纯 SVG + SMIL**，不是 foreignObject 内嵌 HTML。foreignObject 只是少数个人开发者用来"塞二维码图片"的小众用法[9]。我们项目里"用 foreignObject + CSS checkbox hack 做翻页"的路线**没有任何竞品前例**，并且被多条证据判死刑。

---

## 5. HTML → SVG 编译方案的成熟度

### 5.1 Satori（Vercel）能力边界 [12][13]

Satori 是当前最成熟的"HTML+CSS → SVG"编译器，定位是 **Open Graph 图片生成**，不是通用编译器。

**支持**：
- Flexbox 布局（`display:flex`, `flex-direction`, `wrap`, `grow`, `shrink`, `basis`, 对齐, `gap`）
- 定位：`position:relative|static|absolute`
- 字体：`font-family/size/weight/style`, `text-align`, `letter-spacing`, `line-height`, `text-shadow`, `word-break`
- 视觉：`color`, `opacity`, `transform`（2D：translate/rotate/scale/skew）, 背景色/渐变/图片, `box-shadow`, `filter`, `clip-path`, `mask-*`, `border-radius`
- CSS 变量（含 fallback）
- `object-fit`, `object-position`
- 输出格式：**直接输出 SVG 字符串**

**明确不支持**：
- **3D transforms**
- **`z-index`**（按文档顺序叠层）
- **`calc()`**
- **CSS 选择器和伪类**（必须全部直接写在 element 上）
- **RTL 语言**
- 高级排版：kerning、ligatures、OpenType features
- 交互元素：`<input>`, `cursor`
- 外部资源：`<style>`, `<link>`, `<script>`

**对我们的意义**：Satori 的输出是静态 SVG（带 `<text>` 和 `<rect>`），**不含 SMIL 动画，不含交互**。它能解决"文字+图片+布局 → SVG 静态视觉"，但不能解决"点击交互"。而且 Satori 生成的 SVG 里会有大量 `<text>` 元素——这些元素在微信里能正常显示，但**无法被用户长按选中复制**（这是 SVG `<text>` 的固有行为），这对"公众号文章"是一个严重用户体验问题。

### 5.2 其他开源项目对比 [14]

| 项目 | 方案 | 是否用 foreignObject | 能否跑在浏览器 | 成熟度 |
|---|---|---|---|---|
| **vercel/satori** | 自研 yoga-flexbox + SVG primitive | 否（纯 SVG 元素） | ✅ | 高（周下载 30k+，Vercel 生产使用）|
| **felixfbecker/dom-to-svg** | 浏览器 DOM → SVG "screenshot"，保留 a11y、链接、可选中文本 | **显式不使用 foreignObject**（"SVGs will work in design tools like Illustrator, Figma"）| ✅ | 中（个人项目，更新缓慢）|
| **MrPeak/html2svg** | 将 HTML 渲染为 SVG image | 未说明 | ✅ | 低（实验性）|
| **svgdotjs/svgdom** | Node.js 的 SVG DOM polyfill | N/A | Node only | 中（svg.js 生态使用）|

**专门为"微信公众号输出"设计的开源 HTML→SVG 编译器：查不到任何一个。** 这个领域是"既要懂前端渲染，又要懂微信过滤规则"的小众交叉，开源界没有先例。

### 5.3 自研工程量估计

若要做一个 "MBEditor HTML → 公众号安全 SVG" 编译器，至少需要：

1. **一个 layout engine**（可 fork satori 或 dom-to-svg，二选一）—— 1-2 周对接
2. **字体 shaping**（中文字体 subset、长文本自动换行算法）—— 满足"可换行 `<text>`"至少 1 周，体积控制再 1 周
3. **图片入材料库上传**（image 必须是微信素材 URL）—— 2 天
4. **SMIL 注入层**（把交互 block 的 `:active/:checked` 翻译成 `<animate begin="click">`）—— 这是最关键且没有先例的部分，工程上等于自己实现一门"伪 CSS-to-SMIL 编译器"，估 3-4 周
5. **白名单清洗 + 兼容性测试**（iOS 深色模式、安卓、PC 三端差异）—— 持续性成本，初版 2 周

**保守估计：1.5 - 2.5 人月** 可以做出 MVP，3-6 个月才能做到"能对外声称支持大多数 Markdown 样式"。而且一旦微信悄悄改过滤规则，维护成本是持续的。

---

## 6. 栅格化方案的业界案例

### 6.1 现有工具

- **html2canvas** —— 业内最成熟的"HTML→Canvas→PNG"方案。大量公众号 H5 活动页的"长按保存海报"都是它做的。[15] 已知坑：iOS/Android 差异（PNG vs JPEG）、margin 遮挡、字体渲染轻微偏移。
- **dom-to-image** —— 同类，API 稍简单，社区活跃度略低。
- **puppeteer.screenshot** —— 服务端方案，最准确但最重，每篇推文要起一个 headless Chrome。

### 6.2 切片策略

知乎"公众号长图用多大尺寸"问题下的共识：**宽度 1000-1200px 最佳**，高度按内容动态。[15] 超过 2000-3000px 的图在旧安卓机上容易 OOM，因此**超长文章必须切片**。建议切片策略：

- 固定宽度 1080px（等同微信文章正文视口）
- 每片高度 ≤ 2400px（iPhone Safari 4096 纹理上限安全线）
- 切片时避免在段落中间切，按 block 边界切
- 每片生成独立 PNG，按顺序 `<img src>` 插入正文

### 6.3 文字清晰度 vs 体积

1080px 宽 + 2400px 高的 PNG，纯文字 + 少量颜色 → 典型 150-300KB；含复杂渐变/阴影 → 600KB-1.2MB。公众号单篇图片总和有软上限（未见官方数字，但超过 5MB 容易发送失败），因此栅格化的"总图片量"应控制在 **10 张以内**。

### 6.4 "全图片公众号" 真实案例

**有大量实例但几乎没有技术博客拆解。** 手帐号、插画号、漫画号、营养食谱号这些垂类里，"整篇文章只有 3-10 张图 + 几句标题 " 是标准打法。它们的生产管线通常是：

- Photoshop / Procreate 直接画成图 → 微信素材库上传 → 手动插入
- 或者 Figma / Canva 导出 → 同上

**用"编辑器自动栅格化"这条路的先例：查不到明确案例**。这说明这是一个**市场空白**，也说明**没人做是因为用户就直接画图了**——这对我们的市场假设是一个警告。

---

## 7. 竞品拆解

### 7.1 秀米（xiumi.us）[16]

- **Chrome 插件 `xiumi-ue-dialog`**：官方插件解决"复制粘贴到公众号后台时格式丢失"的问题。实现上走的是 UEditor 插件 API，**直接把 DOM 写进微信后台的 iframe**，而不是走系统剪贴板。
- **技术推断**：秀米的排版块绝大多数是 `<section style="...">` + 大量内联样式 + 偶尔嵌入 SVG 装饰（线条、分割线、徽章、动画），**主力是 HTML+inline style，SVG 只做少数交互和装饰**。
- **交互组件（翻页、展开、轮播）**：从 ZER0N 课程[7]和 segmentfault 案例[2]的写法推断，**纯 SVG + SMIL**，不走 foreignObject。
- **没有公开的技术拆解博客**——秀米作为商业产品不披露技术实现。

### 7.2 135 编辑器（135editor.com）[11][17]

- 官方介绍"1000+ SVG 动态组件"——数量级印证是"装饰组件库"而非"通用编译器"。
- "连续翻页"规范（"所有图片宽度必须完全相同")——强烈提示底层是**纯 SVG `<image>` + `<animateTransform>` 做整体 translate**。
- "发布方式：同步（授权同步到公众号草稿箱）或 导出（生成包含 SVG 的 HTML）"——说明 135 的架构和秀米一致：**HTML 承载排版 + SVG 承载动画和交互**。
- 同样没有技术博客拆解过实现。

### 7.3 mdnice（mdnice.com / github: mdnice/markdown-nice）[18]

- 纯 **Markdown → 主题 CSS inline → 复制 HTML** 路线。**完全不用 SVG**。
- 主题系统是 CSS-in-JS：主题数据 = JSON { themeId, name, cover, css }。
- 复制时走浏览器的 `document.execCommand('copy')` 或 Clipboard API，把带有内联样式的 HTML 塞进系统剪贴板，粘贴到公众号后台由微信编辑器消化。
- **预览和复制完全一致**，因为复制的就是预览 DOM。

### 7.4 doocs/md（github.com/doocs/md）[19]

- Vue + TypeScript。定位和 mdnice 一样，走**纯 HTML inline style** 路线。
- 源码没能直接拉到结构说明，但从项目描述（"Markdown 文档自动即时渲染为微信图文"）+ 文件构成（Vue 55% / TS 38%）看，**完全不涉及 SVG 编译或 foreignObject**。
- 我们项目如果只做"Markdown 转公众号文章"，这就是参考答案——但 MBEditor 的定位比这高一级。

### 7.5 壹伴（yiban.io）[20]

- 形态：**Chrome 扩展**，直接注入微信公众号后台页面。
- 实现路径：Chrome extension 的 content script 监听 `mp.weixin.qq.com` 的 DOM，在微信编辑器 iframe 里塞自己的工具栏 + 批量替换 DOM 节点 + 调用微信后台的未公开 API 做上传。
- **根本不经过"复制到剪贴板"这条路**，所以它能用微信不允许但后台 iframe 内部允许的一些操作。
- 对我们的启示：如果走"浏览器插件 + 直接写入微信后台 DOM"路线，可以**绕开正文 HTML 过滤的部分约束**，因为过滤发生在"保存/发布时"，插件直接操作的是编辑态 DOM。但这是另一个产品形态，不在本次架构决策范围内。

---

## 8. 推荐架构对比

### 方案 A：纯 SVG 路线（HTML→SVG 编译 + SMIL）

- **做法**：自研或 fork satori，将编辑器内所有块编译成一张或多张 SVG。交互通过 SMIL 注入。
- **优点**：理论上 1:1 视觉；交互可用；文字是矢量清晰。
- **缺点**：
  - Satori 不支持 SMIL 和交互，需要自研注入层（3-4 周工程量）。
  - 中文字体 subset + SVG `<text>` 换行算法要自己写。
  - SVG `<text>` 不能被用户长按选中复制——**对阅读型公众号是灾难**。
  - `id` 被过滤使多元素联动必须用"编组 hack"，DSL 到 SMIL 的映射复杂度爆炸。
  - 没有任何业界先例证明这条路能工业化。
- **可行性评分：3/10**

### 方案 B：栅格化路线（HTML→PNG 兜底）

- **做法**：编辑器 HTML → html2canvas/puppeteer → 切片 PNG → 上传微信素材库 → 按顺序插入正文。
- **优点**：
  - 100% 还原，零过滤烦恼（图片就是图片，微信不会改）。
  - 工程量最小，html2canvas 成熟度最高。
  - 手帐/插画号类垂类已经这样做了，只是人工方式。
- **缺点**：
  - **文字不可选中复制**，丢失 SEO 和阅读辅助能力。
  - **图片总量受限**（单篇 10 张内较安全）。
  - 视网膜清晰度 vs 体积需要调参。
  - 和方案 A 一样没有"自动化编辑器"先例。
- **可行性评分：6/10**

### 方案 C：混合分层（块级调度）★ 推荐

- **做法**：编辑器内部是 block-based（参考 BlockNote 架构[21]），每种 block 声明自己的"输出目标"：
  - **文字块**（段落、标题、引用、列表、代码块）→ HTML + inline style（mdnice/doocs 路线）
  - **装饰块**（分割线、徽章、图标、花边）→ 纯 SVG（静态）
  - **动画/交互块**（翻页、展开、轮播）→ 纯 SVG + SMIL（秀米/135 路线）
  - **复杂视觉块**（卡片、含 flex/3d/自定义字体）→ 栅格化兜底（html2canvas → 图片）
- **优点**：
  - 每个块走最擅长的路线，整体还原度和体验平衡最好。
  - 文字段落保持 HTML → 用户可选中复制、SEO 友好、体积小。
  - 动画走 SMIL 与秀米对齐，是已被实战验证过的方案。
  - 不需要从零做"通用 HTML→SVG 编译器"。
  - 给编辑器 UI 做"块无法在微信渲染时提示用户"留出位置。
- **缺点**：
  - 需要一套 block schema 和调度器，工程量中等。
  - 需要规定哪些 CSS 特性"会触发栅格化兜底"，这条线要跑测试来定。
- **可行性评分：8/10**

---

## 9. 证据清单

### 硬（微信官方 / 多源独立证实）

- [1] [详细教你微信公众号正文页SVG交互开发 - 知乎 (2019, zhuanlan.zhihu.com/p/75023148)](https://zhuanlan.zhihu.com/p/75023148) —— JZ Creative 2016 白名单来源，`id` 被过滤，begin 事件列表
- [2] [公众号SVG动画交互实战 - SegmentFault](https://segmentfault.com/a/1190000022788173) —— 同等信息的独立复述
- [3] [微信公众号SVG动画交互实战 - 知乎](https://zhuanlan.zhihu.com/p/144314282) —— `id.click+3s` 不可用的独立确认，"编组 hack" 出处
- [4] [微信公众号css布局和SVG推文的一些坑 - 博客园 (2020, haqiao)](https://www.cnblogs.com/haqiao/p/13438686.html) —— foreignObject 可用 + iOS bug；position 被过滤；stroke-dasharray 被吃；`<g>` style 属性 iOS 失效
- [7] [微信公众号高级编辑排版 第三节 让SVG画面动起来 - ZER0N](https://zer0n.cn/archives/course3) —— animate/set/animateTransform/animateMotion 四件套；事件优先级 touchstart > click
- [8] [写 SVG 动画必看！SVG系列文章4-微信公众号编写 - CSDN (SiShen654)](https://blog.csdn.net/SiShen654/article/details/134956473) —— id 过滤、style/script/a 标签禁止、600ms 点击窗口

### 中（知名技术博客 / 活跃仓库源码）

- [9] [foreignObject - MDN](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Element/foreignObject) —— foreignObject 规范行为
- [10] [SVG text tspan 中文换行 - 知乎](https://zhuanlan.zhihu.com/p/195108059) —— SVG `<text>` 不自动换行是规范行为
- [11] [公众号SVG效果教程：连续翻页再点击展开 - 135editor](https://www.135editor.com/geo/svgeditor/1824/) —— 135 翻页组件的规范和发布方式
- [12] [vercel/satori README - GitHub](https://github.com/vercel/satori) —— Satori 能力边界（硬）
- [13] [CSS Support - vercel/satori DeepWiki](https://deepwiki.com/vercel/satori/4-advanced-usage) —— Satori CSS 支持列表
- [14] [felixfbecker/dom-to-svg - GitHub](https://github.com/felixfbecker/dom-to-svg) —— 显式不使用 foreignObject
- [15] [html2canvas - 微信长按存图 - 腾讯云](https://cloud.tencent.com/developer/article/1191774) —— html2canvas 在微信场景案例
- [16] [秀米编辑器官网](https://xiumi.us/) + [秀米 UEditor 插件示例](https://ent.xiumi.us/ue/) —— 秀米的集成路径
- [18] [mdnice/markdown-nice - GitHub](https://github.com/mdnice/markdown-nice) —— mdnice 源码
- [19] [doocs/md - GitHub](https://github.com/doocs/md) —— doocs 源码
- [20] [壹伴 官网](https://yiban.io/) —— 壹伴产品介绍
- [21] [TypeCellOS/BlockNote - GitHub](https://github.com/TypeCellOS/BlockNote) —— Notion-style block 架构参考
- [22] [Tiptap Schema 文档](https://tiptap.dev/docs/editor/core-concepts/schema) —— ProseMirror/Tiptap 的 schema 模型

### 弱（个人博客 / 过时资料 / 商业产品自吹）

- [17] [135编辑器 在线 SVG 编辑器](https://www.135editor.com/svgeditor/) —— 产品宣传页，无技术细节
- [23] [归零数媒 ZER0N 第一节](https://www.zer0n.cn/archives/clouse1) —— 基础 HTML 教程，未直接回答白名单
- [24] [SVG公众号排版 可重复点击 - 微信开放社区](https://developers.weixin.qq.com/community/develop/article/doc/00084ec0a743309e209e7a87351413) —— 用户投稿，非官方声明

---

## 10. 仍存在的开放问题

以下问题本次调研**没能钉死**，建议后续用真机实测补证：

1. **`filter` / `feGaussianBlur` / `pattern` 三个元素在微信 2026 年是否仍可用？** 公开证据全部来自 2020 前后，近两年没有独立确认。建议做一份最小测试页上传验证。
2. **foreignObject 里的 `<input type="checkbox" id="..." style="display:none">` 在 2026 年是否还能触发 `:checked` 选择器？** 本项目 publish.py 的注释假设"可以"，但代码被禁用本身就是反向证据。**没有任何一篇 2024-2026 的文章确认 foreignObject + checkbox hack 还能活**，建议在决定方案前做一轮真机测试。
3. **秀米/135 的实际导出 HTML 长什么样？** 没有任何技术博客拆解过。获取方法：注册一个秀米账号 → 做一个翻页组件 → 点"导出 HTML" → 肉眼看 outerHTML。这是最有价值的一次实证（成本 30 分钟）。
4. **微信 iOS/Android 对 SVG 内 `<text>` 字体的一致性**。目前只知道"iOS 用 PingFang，Android 用思源"，但 fallback 行为（字体缺失时怎么显示）没有公开文档。
5. **SVG `<text>` 能否被长按选中复制**。理论上 SVG text 在移动端 WebView 里可被选中，但微信 WebView 可能做了限制，查不到明确答案。这条直接影响方案 A 的可行性评分。
6. **栅格化图片数量上限**。"单篇公众号正文图片总大小/总数量上限" 微信没有公开数字，社区传说 5MB / 50 张，但均无官方出处。

---

**调研结论一句话**：不要押"纯 SVG 路线"，不要继续优化 `svg-templates.ts` 里的 checkbox hack。用**方案 C 混合分层**，把文字交给 HTML inline style，装饰和动画交给 SVG+SMIL，复杂视觉交给栅格化兜底——这是唯一一条每个子问题都有业界先例撑腰的路。
