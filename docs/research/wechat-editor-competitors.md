# 微信公众号编辑器竞品深度拆解

> 调研时间：2026-04-11
> 调研者：Claude（为 MBEditor 项目产出）
> 调研方法：优先读源码（raw.githubusercontent.com），辅以中文技术博客与官方 API 文档
> 取材原则：**不把营销文案当拆解**。找不到的东西明说找不到。

---

## 0. TL;DR（给赶时间的人）

1. **CSS 内联没有秘密**。doocs/md 和 mdnice 都依赖 `juice` 这个同一个库做 CSS-to-inline-style。MBEditor 如果没在用 juice，基本等于在自己造一个更差的 juice。
2. **"所见即所得"本质是剪贴板 HTML Blob**。doocs/md 的做法是：用 `navigator.clipboard.write` 写一个 `ClipboardItem`，里面是 `text/html` + `text/plain` 两个 MIME，然后让用户手动粘贴到微信公众号后台。没有任何魔法，也没有走微信 draft/add API。
3. **微信后台的粘贴清洗器不是完全剥光 style，而是一个带白名单的 CSS 过滤器**：它会删掉 `position`、`id`、`<script>`、`<style>`、外链 `url()` 带引号的 background 等，但保留绝大部分内联 `style` 的常规属性（color/font-size/margin/padding/flex/width/height in px/vw/vh 等）。这就是为什么 Typora / juice 处理后的 HTML 能直接粘贴就好看。
4. **秀米、135 的交互组件是真 SVG，不是 HTML 特效**。靠 `<svg>` + `<foreignObject>` + SMIL `animate` 实现点击展开/翻页/轮播，绕开微信"不能放 JS/CSS"的限制。
5. **壹伴是另一条路：Chrome 扩展 content script 注入微信后台 iframe**。它不走"粘贴"，直接操作微信自己的 UEditor 实例。MBEditor 作为独立 Web 应用走不了这条路，除非也发布一个扩展。

---

## 1. 竞品能力矩阵

| 竞品 | 开源 | Markdown 解析 | CSS 内联 | 图片处理 | SVG 交互组件 | 预览-复制-发布一致性 | 同步公众号方式 |
|------|------|--------------|---------|---------|-----------|-------------------|-------------|
| **doocs/md** | ✅ MIT | `marked@18` | `juice@11.1.1` | 多图床（AWS S3 / 七牛 / 自定义） + `browser-image-compression` | 间接支持（通过 PlantUML `inlineSvg:true`、Mermaid、markedInfographic；没有"交互 SVG 模板库"） | **不完全一致**：预览走 CSS class + 主题变量；复制前有一整套 regex 替换 + DOM 改写 | 纯剪贴板粘贴（`navigator.clipboard.write`），不走微信 API |
| **mdnice** | ✅ GPL-3.0（但仓库较旧） | `markdown-it@8` | `juice@5.2.0`（声明在 package.json） | 自建图床（JWT 上传接口），微信后台再二次拉取到自己的 CDN | 有主题系统；未见交互 SVG 组件库 | 基本一致 | 剪贴板粘贴 |
| **秀米** | ❌ 闭源 | 不适用（非 Markdown，结构化积木编辑器） | 推测为服务端渲染成内联 style | 上传到自己 OSS，直出 | ✅ 原生 SVG + foreignObject + SMIL 动画；大量模板库 | 一致（因为是 WYSIWYG） | 有"秀米图文同步"接口（`ent.xiumi.us`），以及常规剪贴板 |
| **135 编辑器** | ❌ 闭源 | 不适用 | 同上 | 自有图床 | ✅ 有独立 SVG 编辑器子系统；"点击展开/轮播/弹幕"都是真 SVG | 一致 | 剪贴板 + 授权公众号同步 |
| **壹伴** | ❌ 闭源（Chrome 扩展） | 不适用 | 不适用 | 在微信后台内就地处理 | 提供 SVG 素材库 | 完全一致（就是在微信后台原地改） | **不需要同步**——它本身寄生在微信后台 |
| **Typora** | ❌ 闭源（但原理公开） | 内置 | 无（依赖主题 CSS，直接复制带 style 的 HTML） | 通过 PicGo 等外部工具 | ❌ | 一致（复制出的就是预览 DOM） | 浏览器级剪贴板 |

---

## 2. doocs/md 源码级拆解（核心对照对象）

### 2.1 调用链总览（函数级）

用户点"复制到微信" → 进入 `apps/web/src/components/editor/editor-header/index.vue` 的 `copyToWeChat()`：

```
copyToWeChat()
    │  copyMode.value = 'txt'
    ▼
copy()
    │  emit('startCopy')               ← 通知预览区进入"临时注入 style 的可复制状态"
    │  setTimeout(..., 350)            ← 给 DOM 350ms 完成样式注入
    ▼
processClipboardContent(primaryColor)  ← 来自 @/utils (即 apps/web/src/utils/index.ts)
    │
    ├─ getStylesToAdd()                ← 拼主题 CSS + hljs 代码高亮 CSS
    │     themeStyles + hljsStyles
    │
    ├─ 把 style 字符串 prepend 到 #output.innerHTML
    │
    ├─ mergeCss(html)                  ← juice 上场：真正的 CSS → inline style 转换
    │     juice(html, {
    │       inlinePseudoElements: true,
    │       preserveImportant: true,
    │       resolveCSSVariables: false,   ← 故意不解析 CSS 变量，交给 postcss 处理
    │     })
    │
    ├─ modifyHtmlStructure(html)       ← 把 <li> 里的嵌套 <ul>/<ol> 提到外面
    │                                   （因为微信后台对嵌套列表显示不稳）
    │
    ├─ 一堆 regex 替换
    │     .replace(/([^-])top:(.*?)em/g, `$1transform: translateY($2em)`)
    │     .replace(/hsl\(var\(--foreground\)\)/g, `#3f3f3f`)
    │     .replace(/var\(--blockquote-background\)/g, `#f7f7f7`)
    │     .replace(/var\(--md-primary-color\)/g, primaryColor)
    │
    ├─ solveWeChatImage()              ← 把 img 的 width/height 属性移到 style
    │
    └─ 附加空节点 / 修 Mermaid / 修文字颜色 / 修 antv 信息图
    ▼
（回到 copy()）读取 #output 的 innerHTML
    ▼
navigator.clipboard.write([
  new ClipboardItem({
    'text/html':  new Blob([html], {type: 'text/html'}),
    'text/plain': new Blob([plain], {type: 'text/plain'}),
  })
])
    ▼
失败则 fallback 到 legacyCopy()（textarea + document.execCommand('copy')）
```

### 2.2 关键代码片段

**A. CSS 内联（唯一一处 juice 调用）**
文件：`apps/web/src/utils/index.ts`
```ts
function mergeCss(html: string): string {
  return juice(html, {
    inlinePseudoElements: true,
    preserveImportant: true,
    resolveCSSVariables: false,
  })
}
```
→ GitHub: https://github.com/doocs/md/blob/main/apps/web/src/utils/index.ts

**B. 列表结构修正**
```ts
function modifyHtmlStructure(htmlString: string): string {
  const tempDiv = document.createElement(`div`)
  tempDiv.innerHTML = htmlString
  tempDiv.querySelectorAll(`li > ul, li > ol`).forEach((originalItem) => {
    originalItem.parentElement!.insertAdjacentElement(`afterend`, originalItem)
  })
  return tempDiv.innerHTML
}
```
这个细节非常重要——它说明 doocs/md **确认微信后台对 `<li><ul>...</ul></li>` 这种嵌套会出样式问题**，只能"打平"。MBEditor 如果还没踩到这个坑，迟早会踩。

**C. 图片尺寸兜底**
```ts
export function solveWeChatImage() {
  const clipboardDiv = document.getElementById(`output`)!
  const images = clipboardDiv.getElementsByTagName(`img`)
  Array.from(images).forEach((image) => {
    const width = image.getAttribute(`width`)
    const height = image.getAttribute(`height`)
    if (width) {
      image.removeAttribute(`width`)
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }
    if (height) {
      image.removeAttribute(`height`)
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  })
}
```
→ 证据：微信后台的白名单不认 `<img width>` 属性，只认 inline style。

**D. 剪贴板双 MIME 写入**
文件：`apps/web/src/utils/clipboard.ts`
三个函数：`legacyCopy` / `copyPlain` / `copyHtml`。`copyHtml` 的要点是用 `ClipboardItem` 同时写 `text/html` 和 `text/plain`，失败降级到 `execCommand('copy')`。
→ GitHub: https://github.com/doocs/md/blob/main/apps/web/src/utils/clipboard.ts

**E. 入口按钮**
文件：`apps/web/src/components/editor/editor-header/index.vue`
```ts
import { useClipboard } from '@vueuse/core'
import { addPrefix, generatePureHTML, processClipboardContent } from '@/utils'
//...
function copyToWeChat() {
  copyMode.value = 'txt'
  copy()
}
```

### 2.3 SVG / 交互组件？
**doocs/md 没有"SVG 交互组件库"这个产品形态**。它对 SVG 的支持是间接的：
- `packages/core/src/extensions/plantuml.ts` 用 `markedPlantUML({inlineSvg: true})` 把 PlantUML 渲染成内联 SVG。
- 有 `markedInfographic`、`markedSlider`、`markedMermaid` 等扩展（见 `packages/core/src/extensions/`）。
- 但**没有像 135 编辑器那样的"点击展开 / 轮播 / 翻页"SVG 模板库**。

### 2.4 图片处理策略
看 `apps/web/package.json` 声明的依赖：
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`（S3 兼容图床）
- `qiniu-js`（七牛）
- `browser-image-compression`（上传前压缩）
- 没有"自己运营的公共图床"——**全靠用户自配**。

对比 mdnice：mdnice 提供免费公共图床，但需要登录拿 JWT。doocs/md 走的是"BYO 图床"路线，对个人开发者门槛稍高但更干净。

### 2.5 预览 vs 复制 的分岔
**有分岔，但很克制**：
- **预览**使用 CSS class + CSS 变量（主题）+ tailwind 运行时样式。渲染器 `renderer-impl.ts` 生成的是 `class="xxx"` 的 HTML，不是 inline style。
- **复制**通过 `processClipboardContent` 临时在 `#output` 节点上**额外注入一大段 `<style>`**，然后 juice 把它内联进去，这份"富 style 的 HTML"只作为剪贴板内容存在一瞬间，复制完就回到预览状态。

这就是为什么 `copy()` 里有 `emit('startCopy')` 和 `setTimeout(350)`——要等预览区切到"注入了完整 style 的临时态"后再读 DOM。

### 2.6 评价
- **干净**：没有过度设计，就是 marked → renderer (class) → 临时注 style → juice → regex fixup → 写剪贴板。
- **不完美**：那一堆 regex 替换（`transform: translateY` / `hsl(var(--foreground))`）暴露出"CSS 变量在 juice 里处理不好"这个暗债。作者知道，所以 `resolveCSSVariables: false` 然后手动替换。
- **对 MBEditor 的直接价值**：这套管线几乎可以照抄。特别是 `modifyHtmlStructure`、`solveWeChatImage`、`copyHtml` 三个函数是最小可用集合。

---

## 3. mdnice 行为逆向

### 3.1 观察到的事实
- 仓库 `mdnice/markdown-nice` 开源（GPL-3.0），但**主站 mdnice.com 的前端很可能已与开源版分叉**，开源版停在较老的版本（React 16 + MobX 5）。
- `src/utils/helper.js` 里能看到 `markdownParser`、`replaceStyle(id, css)`、`url2Blob`、`b64toBlob`、`download`——**没有直接命名为 copy/wechat 的函数**。
- `package.json` **声明了 `juice@5.2.0` 和 `markdown-it@8.4.2`**，但我用 raw URL 读了 `layout/EditorMenu.js` / `Navbar.js` / `MenuLeft/File.js` 都没找到 juice 的实际调用点。可能位于我没打开的 `Paragraph.js` 或 dialog 组件，或者在主站的新版本里。
- GitHub 代码搜索 `repo:mdnice/markdown-nice juice` 返回 0 匹配 —— 说明 juice 有可能已经是 orphan 依赖，或调用被动态构建。

### 3.2 推测的内部实现
从现有信号（`juice`、`markdown-it`、`highlight.js`、React + MobX）可以推断 mdnice 的管线：
1. markdown-it 渲染 → 带主题 class 的 HTML（预览态）
2. 主题 CSS 注入 → juice 内联 → 写剪贴板
3. 图片走自家图床，生成 `https://files.mdnice.com/...` 链接。用户粘到微信，**微信后台会自动拉取远程图到自家 CDN**（这一点多家技术博客都证实）。

换句话说，**mdnice 的图片处理不是"上传到微信"，而是"上传到自己的 CDN，然后靠微信的远程图抓取"**。MBEditor 如果要走这条路，需要保证自己的图床:
- HTTPS 可达
- Content-Type 正确
- 没有防盗链黑名单拦截微信爬虫

### 3.3 技术博客引用
- Alpha Hinex 博客（alphahinex.github.io）提到 mdnice 的图床 API 通过 JWT 上传，从浏览器 devtools 的 Fetch/XHR 里能抓到 Authorization 头。
- 腾讯云"和微信公众号编辑器战斗的日子"一文复盘了微信后台对 HTML 的清洗规则，与 doocs/md 源码里的 regex 补丁集互相印证。

---

## 4. 秀米拆解

### 4.1 编辑器 DOM 结构（基于公开讨论）
- 秀米是**结构化积木编辑器**，不是 Markdown。编辑态的 DOM 是"大容器 > 布局块 > 积木"的三层结构，每个块都有自己的 style 属性。
- 博客园 / CSDN 拆解文章指出：**秀米预览区的 DOM 基本就是最终发到公众号的 DOM**，即 inline style 已经写进每个元素的 style 属性里了。这和 Typora / doocs/md 的策略一致——"复制时的 DOM = 发布时的 DOM"。

### 4.2 同步公众号的真实管线
- 秀米官方有"图文同步接口"：`https://ent.xiumi.us/`。这是**机构/企业用户**的接口，允许绑定公众号后将秀米的图文直接同步过去。个人用户界面看不到这个。
- 对个人用户，秀米走的是**剪贴板粘贴**：Cmd/Ctrl+C 复制预览区 → 去微信公众号后台 Cmd/Ctrl+V。
- 核心观察：**秀米从不走 `draft/add` 官方 API 的原因很可能是那个接口的 content 字段会被严格清洗，而秀米的交互 SVG 组件在 `draft/add` 里很可能被干掉**。剪贴板粘贴走的是浏览器 HTML 粘贴通道，微信后台的清洗规则反而更宽松（因为它预期接收富文本编辑器来源）。

### 4.3 交互组件的真实 content HTML
**未能找到公开样本**。秀米的"点击展开 / 翻页 / 轮播"这些组件发到公众号后的最终 HTML，我没在调研中找到完整的代码样本。能找到的是原理层面的描述：
- 是 `<svg>` 根 + `<foreignObject>` 嵌 HTML + SMIL `<animate>` / `<set>` 实现点击状态机。
- 博客园 haqiao 的文章和知乎文章都描述了这套机制，但都是"怎么手写一个"，不是"秀米的真实产物"。
- 如果 MBEditor 未来要做这块，**建议用 Playwright 开秀米编辑器，同步一篇包含交互块的到测试公众号，然后用 `getdraft` API 拉出来看真实 content HTML**。这个实验没做，因为本次调研不涉及账号操作。

---

## 5. 135 编辑器拆解

- 135 的 SVG 模块是**独立子应用**（`www.135editor.com/svgeditor/`），有专门的动画时间轴和预设模板库。
- **真 SVG**，不是 HTML 特效。从官方教程的截图可以确认 SVG 导出后的代码块开头就是 `<section><svg xmlns=...`。
- 交互类型：点击展开、翻页、轮播、弹幕、文字切换——全部是 SVG SMIL 动画 + `<foreignObject>` 嵌入 HTML 子树的组合。
- 135 的样式系统（主题 / 模板库）就是一个富文本组件库 + 服务端 CSS 渲染。没有公开技术拆解；对 MBEditor 的参考价值主要在"**SVG 模板需要一个可视化编辑器子系统**"这个架构判断——不是一个简单的 Markdown 后处理能搞定的。

---

## 6. 壹伴的"寄生"思路

- 壹伴是纯 Chrome 扩展（已上架 Chrome Web Store：`ibefaeehajgcpooopoegkifhgecigeeg`）。
- 技术原理：**content script 注入微信公众号后台的编辑页（`mp.weixin.qq.com/cgi-bin/appmsg?...`）**，在其 UEditor 富文本编辑器实例周围注入自己的 UI 按钮、菜单、侧边栏。
- 工作方式：劫持 UEditor 的 DOM，插入素材 / 执行一键排版 / 调自家服务端接口。
- **对 MBEditor 的借鉴意义**：
  - 如果 MBEditor 发一个极简的 Chrome 扩展版本，在微信后台**原地**注入"从 MBEditor 云端导入排好的文章"按钮，就能绕过"复制-粘贴-清洗"这条线——不过这条路要求用户装扩展，和"独立 Web 应用"的产品形态是两种生态。
  - 更实际的借鉴：**MBEditor 的某个"发布"按钮可以做成 mini bookmarklet 或扩展**，在用户已经把内容粘到微信后台后，自动修正那些被清洗掉的 inline style。

---

## 7. Typora 复制到公众号的启示

Typora 能直接 Cmd+A → Cmd+C → 粘贴到微信后台且样式保留良好，这不是偶然：

1. **Typora 内核是 Chromium**（Electron 之前是基于 CEF 的私有构建）。Cmd+C 复制的是渲染层的 DOM，携带**完整 computed style 的 HTML 片段**。
2. 浏览器在复制时会把 computed style **序列化为内联 `style=""`** 放进 `text/html` 剪贴板 Blob——这是 Chromium 的默认行为。
3. 微信公众号后台的粘贴清洗器**并不是"删除所有 style"，而是一个带白名单的 CSS 过滤器**。根据博客园 haqiao、CSDN、腾讯云开发者社区多篇拆解，能整理出一个**微信后台内联样式白/黑名单大致规则**：

| 类别 | 规则 |
|------|------|
| **被删掉** | `position` 所有值、`id` 属性、`<script>`、`<style>`、`background:url("...")` 带引号、百分比 transform、某些 `z-index` |
| **保留** | `color`、`font-size`、`font-weight`、`line-height`、`text-align`、`margin`、`padding`、`width`/`height` 用 px/vw/vh、`display: flex`、`border-radius`、`background-color`、`opacity`、`pointer-events` |
| **iOS 特殊** | `<g style>` 里的 `transform-origin` 会被忽略；`foreignObject` 里 `<img>` 在 Dark Mode 下显示异常 |

**核心结论**：微信的清洗器更像是一个"iframe 富文本编辑器的防 XSS 白名单"，不是"删样式的清洁工"。这是为什么 Typora → 微信 / juice → 微信 / 秀米 → 微信 都能走通的根本原因。

**对 MBEditor 的意义**：
- 不需要预计算"哪些 CSS 属性会被干掉"再手动绕开，直接让 juice 把一切都变成 inline style，微信的清洗器自己会处理剩下的。
- 唯一要绕的是少量坑（`position` / `id` / `<li>` 嵌套 `<ul>` / `<img width>` 属性 / CSS 变量不被 juice 解析）——这恰好就是 doocs/md 那几十行 regex 和 helper 做的事。

---

## 8. MBEditor 的可借鉴点（每条抄谁、抄哪里）

1. **抄 doocs/md 的 `processClipboardContent` 管线**。特别是：
   - 读 `apps/web/src/utils/index.ts` 的 `processClipboardContent` + `mergeCss` + `modifyHtmlStructure` + `solveWeChatImage`；
   - 读 `apps/web/src/utils/clipboard.ts` 的 `copyHtml`（`ClipboardItem` 双 MIME + `execCommand` 降级）；
   - 如果 MBEditor 还没引入 juice，**先 `pnpm add juice`**。不要自己写 CSS 内联器。

2. **抄 doocs/md 的"预览走 class，复制时临时注 style 再 juice"双态策略**。不要让预览区天天顶着完整 inline style 跑，性能会垮；也不要让编辑器写作时就预计算导出态。真正的秘密是那个 `setTimeout(350)` + `emit('startCopy')` 的两阶段切换。

3. **抄 mdnice 的图床 + 远程图抓取策略**。MBEditor 自建一个 HTTPS 图床（或接 S3/OSS），让图片 URL 可以被微信服务端爬走——比强制要求用户手动上传到公众号素材库流畅 10 倍。不要再去碰微信 `media/upload` 接口，那东西在 2026 年依然很坑。

4. **抄 135/秀米的"SVG 子编辑器"产品形态（如果真的要做交互组件）**。Markdown 路线走不通交互块，必须做一个独立的"SVG 画布"工具，输出的是一段带 `<foreignObject>` 的原生 SVG。这是一整个子项目，不是一个语法扩展。**决定要不要做这个，应该是 MBEditor 路线图里的一个战略分叉点**。

5. **把壹伴思路作为"B 计划"存档**。如果 MBEditor 的剪贴板管线在某些浏览器/微信后台版本上经常崩，最后一道保险是做一个极薄的 Chrome 扩展：它的职责只有一个——**在微信后台粘贴完成后，用 content script 把被清洗掉的样式补回去**。这比重写整个编辑器简单得多。

---

## 9. 证据清单

### doocs/md 源码（github.com/doocs/md，main 分支）
| 文件 | 用途 | URL |
|------|------|-----|
| `apps/web/package.json` | 确认 `juice@11.1.1` + `marked@18` | https://github.com/doocs/md/blob/main/apps/web/package.json |
| `apps/web/src/utils/index.ts` | 主流水线 `processClipboardContent` / `mergeCss` / `solveWeChatImage` / `modifyHtmlStructure` | https://github.com/doocs/md/blob/main/apps/web/src/utils/index.ts |
| `apps/web/src/utils/clipboard.ts` | `copyHtml` / `legacyCopy` | https://github.com/doocs/md/blob/main/apps/web/src/utils/clipboard.ts |
| `apps/web/src/components/editor/editor-header/index.vue` | 按钮入口 `copy()` / `copyToWeChat()` / `handleCopy()` | https://github.com/doocs/md/blob/main/apps/web/src/components/editor/editor-header/index.vue |
| `packages/core/src/renderer/renderer-impl.ts` | marked 渲染器，class 命名，PlantUML `inlineSvg:true` | https://github.com/doocs/md/blob/main/packages/core/src/renderer/renderer-impl.ts |
| `packages/core/src/utils/markdownHelpers.ts` | `postProcessHtml`（加阅读时间、脚注、容器） | https://github.com/doocs/md/blob/main/packages/core/src/utils/markdownHelpers.ts |
| `packages/core/src/extensions/` | 11 个扩展：alert / footnotes / infographic / katex / markup / mermaid / plantuml / ruby / slider / toc | https://github.com/doocs/md/tree/main/packages/core/src/extensions |

### mdnice 源码（github.com/mdnice/markdown-nice，master 分支）
| 文件 | 发现 | URL |
|------|------|-----|
| `package.json` | `juice@5.2.0` + `markdown-it@8.4.2` + `highlight.js@9` + React 16 + MobX 5 | https://github.com/mdnice/markdown-nice/blob/master/package.json |
| `src/utils/helper.js` | `markdownParser` / `replaceStyle` / `url2Blob`（未显式出现 juice） | https://github.com/mdnice/markdown-nice/blob/master/src/utils/helper.js |
| `src/layout/` | 10 个布局文件，EditorMenu / Navbar / Sidebar / StyleEditor | https://github.com/mdnice/markdown-nice/tree/master/src/layout |

### 秀米（闭源）
- 官方图文同步接口文档：https://ent.xiumi.us/
- 原理与使用教程（非源码拆解）：
  - 简书 https://www.jianshu.com/p/ab1b384f9e7f
  - CSDN https://blog.csdn.net/weixin_45892228/article/details/127420839
- **未能找到公开的真实 content HTML 样本**（交互组件在微信后台发布后的 DOM）。

### 135 编辑器（闭源）
- SVG 编辑器入口：https://www.135editor.com/svgeditor/
- 官方 SVG 教程（给的是产品使用视角，非源码拆解）：
  - https://www.135editor.com/books/chapter/1/501
  - https://www.135editor.com/books/chapter/1/670
  - https://www.135editor.com/books/chapter/1/1330

### 壹伴（Chrome 扩展）
- Chrome Web Store：https://chromewebstore.google.com/detail/ibefaeehajgcpooopoegkifhgecigeeg
- 技术剖析（CSDN）：https://blog.csdn.net/weixin_69348069/article/details/149193894

### Typora → 微信的原理
- Typora 官方博客：https://www.typora.net/1147.html
- 少数派：https://sspai.com/post/40524
- V2EX 讨论：https://v2ex.com/t/647454

### 微信后台 SVG / 粘贴清洗白名单
- 博客园 haqiao（最硬核，列了具体规则）：https://www.cnblogs.com/haqiao/p/13438686.html
- 知乎详细 SVG 交互开发：https://zhuanlan.zhihu.com/p/75023148
- 知乎 SVG 动画交互实战：https://zhuanlan.zhihu.com/p/144314282
- 腾讯云开发者社区"和微信公众号编辑器战斗的日子"：https://cloud.tencent.com/developer/article/1513183

### 微信草稿 API（作为"反面参考"）
- 官方文档：https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html
- `POST /cgi-bin/draft/add?access_token=...`，content 字段接 HTML，但会被服务端追加 `&nbsp;` 之类的微调并清洗。**没有一家主流编辑器走这条路发布交互 SVG**，间接证明这个接口对富文本不够友好。

---

## 10. 调研失败记录

1. **mdnice 的 juice 实际调用点**：package.json 声明了，但我遍历了 `layout/*.js`、`component/MenuLeft/*.js`、`utils/helper.js` 都没命中。GitHub 代码搜索 `repo:mdnice/markdown-nice juice` 返回 0 匹配。**可能性**：开源版 juice 是僵尸依赖；或用在我没打开的文件（如 `Paragraph.js`、某个 Dialog）；或 mdnice 主站跑的是和开源仓库分叉后的私有版本。**结论**：mdnice 的 copy 管线只能基于行为观察推测，不能像 doocs/md 那样给出函数级引用。

2. **秀米 / 135 编辑器发布到公众号后的真实 content HTML**：没有样本。需要用 Playwright + 测试公众号实测才能拿到——这次调研没做账号级操作。

3. **微信后台粘贴清洗器的完整白名单**：没有官方文档，上面表格里的规则是从多篇拆解文章交叉验证出的经验结论，**不保证完整**。
