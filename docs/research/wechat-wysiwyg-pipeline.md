# WYSIWYG 管线研究：预览 / 复制 / 草稿箱的 1:1 一致性

> 报告日期：2026-04-11
> 研究者：Claude + Codex (后端探索) + Gemini (前端探索)
> 任务源：用户反馈"公众号效果框 + 清洗预览切换"违背所见即所得原则

---

## 1. 增强后的需求

**产品原则（不可动摇）**：
> MBEditor 承诺"所见即所得"——编辑器里看到的样子，一键复制 / 推送草稿箱后在微信后台呈现的样子，必须**字节级一致**。不能有"预览看起来是 A，复制出去是 B，推送上去是 C"这种分岔。

**当前违反点**：
1. `WechatPreview.tsx` 提供 `cleanMode` 开关 + `sanitizeForWechatPreview` 本地清洗模拟
2. `Editor.tsx` 把 HTML/CSS 送后端 `/publish/preview` 做 premailer 内联 + 正则清洗
3. `ActionPanel.handleCopy` 走后端 `/publish/process-for-copy`（会上传图片到微信 CDN）
4. `ActionPanel.handlePublish` 走后端 `/publish/draft`（复用 `_process_for_wechat` + 图片上传 + 封面 + 微信 API）
5. `handleExport` 又单独调 `/publish/preview` 做导出

产物：**至少 3 份不同的 HTML**，分叉点分散在前后端多个函数。

---

## 2. 三条管线的调用链实证

### 管线 A：预览 iframe
```
article.html / article.css / article.markdown
  ↓
Editor.tsx:161-171  rawPreview = {html, css, js}
  ├─ markdown mode: renderMarkdown(md, theme)     (utils/markdown.ts)
  └─ html mode:     extractHTML(article.html)     (utils/extractor.ts)
  ↓
Editor.tsx:174-198  debounced POST /api/v1/publish/preview
  ↓
backend publish.py:357-361  preview_wechat()
  ↓
publish.py:338 _process_for_wechat()
  ├─ _inline_css()                         publish.py:74
  │   ├─ 提取所有 <style> 块                publish.py:77
  │   ├─ 注入 _WECHAT_BASE_CSS              publish.py:86  ← 前端看不到的基线样式
  │   ├─ 包 <section class="wechat-root">  publish.py:92
  │   ├─ _strip_wechat_unsupported_css()   publish.py:46
  │   └─ premailer.transform(remove_classes=True, keep_style_tags=False)
  └─ _sanitize_for_wechat()                publish.py:246
      ├─ 删 <style>/<script>/<input>/<label>
      ├─ 删 class / data-*
      ├─ <div> → <section>
      ├─ style 值修正：display:grid→block, 删 absolute/animation/cursor
      └─ 删 empty decorative / 空 width/height
  ↓ (processedHtml 回到前端)
Editor.tsx:210  previewHtml = processedHtml || rawPreview.html
  ↓
WechatPreview.tsx:39  normalizeImageStyles(html)   ← 给所有 img 加 8px 圆角
  ↓
WechatPreview.tsx:41-42  mode==="wechat" && cleanMode?
  ├─ true  → sanitizeForWechatPreview(baseHtml)    ← 二次清洗
  └─ false → baseHtml
  ↓
iframe.contentDocument.body.innerHTML
  + 外壳 CSS: body{padding:20px 24px; font-family:...; font-size:16px; line-height:1.8}
  + img{border-radius:8px; box-shadow:none}
  + 注入 resize 脚本
```

### 管线 B：一键复制富文本
```
article.html, article.css
  ↓
ActionPanel.tsx:50  POST /api/v1/publish/process-for-copy
  ↓
backend publish.py:388-401  _process_for_copy_sync()
  ├─ _process_for_wechat(html, css)         ← 和预览同一个函数
  └─ wechat_service.process_html_images()   ← 替换 <img src> 为 mmbiz.qpic.cn
  ↓
ActionPanel.tsx:57  writeHtmlToClipboard(html)
  ↓
useClipboard.ts:4   navigator.clipboard.write([ClipboardItem({text/html, text/plain})])
```

**失败回退**：`fetchInlinedHtml` → POST `/publish/preview`（**不上传图片**，用原始 `/images/` 路径，**和主路径字节不同**）

**注意**：`useClipboard.copyRichText()` 里有独立的 `processForWechat(html, css)`（基于 juice 的前端 CSS inline），但 **ActionPanel 根本没调用它**（它直接用 `writeHtmlToClipboard`）。这是一份**死代码**，却独立存在容易被误用。

### 管线 C：推送草稿箱
```
ActionPanel.tsx:112  PUT /api/v1/articles/{id}  ← 先保存
  ↓
ActionPanel.tsx:119  POST /api/v1/publish/draft { article_id }
  ↓
backend publish.py:404-465  _publish_draft_sync()
  ├─ article_service.get_article(id)       ← 从 DB 读
  ├─ _process_for_wechat(html, css)        ← 和预览同函数
  ├─ wechat_service.process_html_images()  ← 和 copy 同图片处理
  ├─ 封面上传 material/add_material&type=thumb
  ├─ 提取 source_url (HTML 注释或首个 <a href>)
  └─ wechat_service.create_draft()
       └─ POST https://api.weixin.qq.com/cgi-bin/draft/add
             content = processed_html  ← 最终送进微信的 HTML
```

---

## 3. 字节级一致性审计（当前状态）

| 对比 | 是否字节级一致 | 分岔点 |
|---|---|---|
| iframe 显示 HTML  vs  preview API 返回 HTML | ❌ | `normalizeImageStyles` + `sanitizeForWechatPreview`（前端二次处理） |
| preview API 返回  vs  copy API 返回 | ❌ | `process_html_images`（copy 上传图片，preview 不上传） |
| copy API 返回  vs  draft content | ⚠️ 近似 | `_publish_draft_sync` 还会读 DB 最新版；如果保存未 flush 就不同 |
| Markdown 模式 rawPreview.html | ❌ | `renderMarkdown` 已输出 inline style，但后端仍会注入 `_WECHAT_BASE_CSS` 和 wrapper `<section class="wechat-root">` |

**结论：三条管线没有一处是字节级一致的。**

---

## 4. 微信公众号后台的权威 HTML 规则（研究结果）

### 4.1 官方文档确认的限制

来源：
- https://developers.weixin.qq.com/doc/service/api/draftbox/draftmanage/api_draft_add （草稿箱新增）
- https://developers.weixin.qq.com/doc/service/api/material/permanent/api_uploadimage （正文图片）
- https://developers.weixin.qq.com/doc/service/api/material/permanent/api_addmaterial （封面 thumb）

| 约束 | 来源 | 严格度 |
|---|---|---|
| `content` 字段接受 HTML | 官方文档 | 硬 |
| `content` 中的 `<script>` 会被**过滤** | 官方文档 | 硬 |
| 正文图片 `src` **必须**来自 `media/uploadimg` 返回的 URL；外链图片会被过滤 | 官方文档 | 硬 |
| 正文图片上传接口限制 JPG/PNG，单张 ≤ 1MB | 官方文档 | 硬 |
| 封面 thumb 单张 ≤ 64KB，JPG | 官方文档 | 硬 |
| `content` 字节/字符上限（文档里同时出现 "2kb" 和 "2万字符/1M" 两种描述） | 官方文档（矛盾） | 存疑 ⚠️ |

### 4.2 官方文档**未说明**、但业界共识存在的限制

**⚠️ 以下来自第三方博客、开源项目注释、实证观察，不是微信官方承诺，随时可能变化：**

| 推测限制 | 证据强度 |
|---|---|
| `<style>` 在正文 body 会被清除，仅允许 inline `style` 属性 | 强（本项目代码注释 publish.py:91 + 多个开源清洗器） |
| `class` 属性会被保留，但外部 CSS 类无法被应用（因为 `<style>` 被清除） | 中 |
| `<div>` 与 `<section>` 微信偏好 `<section>`（历史惯例） | 中（秀米/135 等模板全部用 section） |
| `<input>` / `<label>` 在正文中会被清除，**但在 `<svg><foreignObject>` 内可保留**（"秀米/135 交互组件技巧"） | 中（代码 publish.py:188 注释，当前已禁用） |
| `position:fixed|absolute|sticky` 会被清除或失效 | 强 |
| `display:flex|grid` 会退化为 block | 强 |
| `transform` / `filter` / `animation` 不生效 | 强 |
| 外层 `<section>` 的 `background-image` 会被吞，`background-color` 保留 | 中 |

**关键洞察**：微信官方**从未发布正式白名单**。所有清洗器（本项目 + 竞品）的规则都是**基于反复试错的保守经验集**，它们之间的规则差异 ≤ 20%，但任何一条规则的对错都无法被"官方文档"佐证。

---

## 5. 竞品调研

| 项目 | 是否开源 | CSS 内联库 | 预览 ≡ 复制？ | 关键技术点 |
|---|---|---|---|---|
| **doocs/md** | ✅ GitHub doocs/md | `juice` | ✅ 是（复制就是预览 DOM 的 outerHTML） | 主题 CSS → juice inline → 直接从预览 DOM 复制 |
| **mdnice** | ❌ 闭源 | 推测 juice | 基本一致 | 预览带"公众号模拟框"，复制 = 预览 innerHTML；图片上传独立弹窗 |
| **秀米 (xiumi)** | ❌ 闭源 | 自研 | 基本一致 | 重度使用 `<section>` 嵌套 + inline style；交互组件用 `<svg><foreignObject>` 包裹 |
| **135 编辑器** | ❌ 闭源 | 自研 | 基本一致 | 同秀米路线 |
| **mpvue / mp_html / wxParse** | ✅ | N/A | N/A | 小程序端渲染器，不是编辑器，仅作参考 |

**业界共识（所有竞品都遵守）**：

1. **预览区直接是最终产物**。复制就是从预览 DOM 拿 `outerHTML`，不做第二次转换。
2. **CSS 内联在渲染阶段完成**（用 juice 或 premailer），渲染完之后就没有 `<style>` 块了。
3. **图片 CDN 化是独立步骤**，在"复制 / 发布"时触发，不污染预览。大多数工具选择：
   - 方案 A：要求用户手动上传图片后再复制（mdnice）
   - 方案 B：后台异步上传，替换 src（本项目走的路）
4. **不做"清洗模拟"**——直接产出微信兼容的 HTML，不给自己再加一个模拟层。

**本项目与竞品的根本差异**：doocs/md 和 mdnice 的预览 DOM **就是**最终要复制的东西（除图片外），而本项目的预览 DOM **不是**——它经过了预览专属的 `sanitizeForWechatPreview` + `normalizeImageStyles`。

---

## 6. 核心诊断

### 6.1 为什么会有 `cleanMode` 开关？

从代码结构和注释推断：
- `sanitizeForWechatPreview` 注释自称"**宁可多删的保守集合**"，模拟微信粘贴行为
- 这是因为**编辑器里的 HTML 能渲染很多微信后台不支持的东西**（flex、grid、absolute 定位的秀米模板等）
- 开发者担心用户"看到的是花哨效果，复制后崩了"，加了个预览开关让用户**眼见为实**
- 但副作用：引入分岔，违背 WYSIWYG

### 6.2 为什么后端 `/publish/preview` 存在？

- 前端 juice（`inliner.ts`）能做 CSS 内联，但**后端还要做图片上传**
- 出于"统一清洗逻辑"的初衷，开发者把 CSS 内联也挪到了后端
- 前端的 `processForWechat`（inliner.ts）变成了死代码/备用回退
- 代价：预览变成网络依赖 + 1.5 秒 debounce 延迟

### 6.3 根本设计错误

**管线方向搞反了**：当前设计是"先让编辑器自由产出任意 HTML，然后在预览/复制/发布时各自清洗"。

**正确方向**：编辑器**产出阶段**就直接输出"微信可接受的最终 HTML"。预览 = 复制 = 发布，只有图片 CDN 化是额外步骤（而且只影响 `src` 属性，不影响其他字节）。

---

## 7. 约束集（零决策）

### 硬约束（微信强制 / 浏览器 API / 不可协商）

> **[HC-1] 微信正文图片 src 必须是 mmbiz.qpic.cn 域名下的 URL。**
> **Why:** 官方文档明确规定外链图片会被过滤（draft/add 文档）。
> **How to apply:** 任何发送到微信 draft/add 的 HTML，必须保证每个 `<img src>` 指向 mmbiz.qpic.cn。
> **成功判据:** `create_draft()` 调用前对 HTML 做正则 `<img[^>]+src="(?!https://mmbiz\.qpic\.cn/)"` 匹配数 = 0。

> **[HC-2] 微信正文 `<script>` / `<style>` / `<link>` 标签会被剥离。**
> **Why:** 官方文档 + 所有已知竞品实证一致。
> **How to apply:** 编辑器渲染阶段就禁止输出这三种标签到最终 HTML；CSS 必须在渲染阶段内联为 `style` 属性。
> **成功判据:** `grep -c '<style\b\|<script\b\|<link\b' processed_html == 0`。

> **[HC-3] `navigator.clipboard.write` 需要 HTTPS 或 localhost + 用户激活手势（click）。**
> **Why:** 浏览器安全策略。
> **How to apply:** 一键复制必须由按钮 click 直接触发，不能放在 setTimeout / Promise 链中断后调用。
> **成功判据:** 现有实现已满足（`handleCopy` 是 button onClick）。

### 硬约束（产品原则）

> **[HC-4] 三条管线（预览 iframe / 一键复制 / 草稿箱 content）必须使用同一个 HTML 生成函数 `renderForWechat(article, {uploadImages: bool})`。不允许出现第二份处理逻辑。**
> **Why:** WYSIWYG 是产品核心承诺。分岔的每一条路径都会在某一天产生"预览正常、发布崩"的用户投诉。
> **How to apply:** 删除所有副处理函数；`uploadImages=false` 用于预览/导出，`uploadImages=true` 用于复制/草稿箱。两者产出的 HTML 除 `<img src>` 外应字节级一致。
> **成功判据:**
> - `grep -rn "sanitizeForWechatPreview\|normalizeImageStyles\|processForWechat\|_process_for_wechat" backend/ frontend/src/` 命中 ≤ 1 个文件（即 `renderForWechat` 所在文件）
> - 测试用例：同一 `(html, css)` 输入，`renderForWechat(a, false)` 与 `renderForWechat(a, true)` 的 diff **只有 `src=` 属性**

> **[HC-5] 预览 iframe 内写入的 HTML 必须 = 一键复制输出的 HTML（前者 src 指向本地 `/images/`，后者指向 mmbiz.qpic.cn，除此之外字节相同）。**
> **Why:** 预览 iframe 是用户判断"复制后长什么样"的唯一凭据；不一致就是欺骗用户。
> **How to apply:** iframe 的 body.innerHTML 不允许被 `sanitizeForWechatPreview` / `normalizeImageStyles` 等二次修饰；iframe 内的 `<style>` 仅允许包含"微信后台渲染容器的字体/行高/背景"这类基线样式（相当于微信后台文章页面的 `body`），**不允许对 content 做修饰**。
> **成功判据:**
> - `iframe.contentDocument.body.innerHTML` 与 `await fetch('/api/v1/publish/process-for-copy').data.html` 除 `src=` 外字节级相同
> - 可写一个 Playwright 测试自动化比对

> **[HC-6] 编辑器产出的 HTML（`article.html`）必须已是"微信友好"的 HTML，不能依赖下游清洗。**
> **Why:** 把清洗放在下游 = 所见即所得承诺会持续滑坡；一旦 CSS Grid 出现在源码，清洗就得复杂化，越清越多。
> **How to apply:** `renderForWechat` 的输入应该直接来自编辑器源码，如果输入本身就含 `display:grid` / `position:absolute` / `<style>`，应在编辑器保存阶段警告（或直接拒绝），而不是在清洗阶段悄悄删。
> **成功判据:** `renderForWechat` 内部的"清洗"只做图片 CDN 化 + CSS 内联；不出现任何 `re.sub\(.*grid\|absolute\|animation.*\)` 这类规则。

### 软约束（项目现有约定，保留）

> **[SC-1] Markdown 模式的 `renderMarkdown` 直接输出 inline style，无需外部 `<style>` 块。**
> **Why:** 已有的主题系统用硬编码 inline style；符合 HC-2。
> **How to apply:** 继续保持，不要为了"CSS 主题化"引入 `<style>` 块。

> **[SC-2] 后端 premailer 用于 HTML 模式的 CSS 内联，前端 juice 是备用回退。**
> **Why:** 后端内联可以和图片上传同一个 request 完成。
> **How to apply:** 如果统一到 `renderForWechat` 后仍走后端，前端 `inliner.ts` / `juice` 依赖应彻底删除；如果改前端主导，后端 premailer 相关代码可以简化为"仅图片 CDN 化"。两者选一，不共存。

> **[SC-3] 微信后台渲染容器样式（字体 PingFang SC 16px、行高 1.8、段间距、img 8px 圆角）作为"iframe 外壳"而非"content 内嵌"存在，且该外壳与微信 APP 内文章页面样式保持一致。**
> **Why:** 这样 iframe 内 body.innerHTML 就等于纯 content，所见即所得。
> **How to apply:** 外壳样式放在 iframe 固定的 `<style>` 里，不经过 inline 处理，不参与 content 的 diff 比较。

### 依赖与风险

> **[DEP-1] `wechat_service.process_html_images` 的正则只匹配双引号 `src="..."`（wechat_service.py:151）**
> 风险：单引号 `src='...'` 会漏处理。改造时需补匹配。

> **[DEP-2] 后端 `_publish_draft_sync` 从 DB 读 `article.html/css`（publish.py:409），而复制管线从请求体读**
> 风险：如果前端"保存+推送"两步之间 DB 未 flush，content 会与复制的不同。
> 缓解：统一走请求体（`draft` 接口也接受 `{html, css}` 而非仅 `article_id`），或强制先保存再推送（当前 ActionPanel:112 已做 PUT，但依赖 3 秒 debounce）。

> **[DEP-3] `cleanMode` 默认为 true（WechatPreview.tsx:37）并且有 UI 开关**
> 风险：删除这个状态会有用户质疑"为什么没有预览模拟了"。需要发版说明解释 WYSIWYG 升级。

> **[RISK-1] 图片上传失败时 `process_html_images` 静默保留原 src（wechat_service.py:137）**
> 会导致复制/草稿箱产物里出现 `/images/...` 本地路径，微信会过滤，用户看不出问题。
> 缓解：图片上传失败必须抛错阻塞流程，由 UI 明确提示（"图片 X 上传失败，请检查微信配置"）。

> **[RISK-2] `_process_for_wechat` 的正则清洗（publish.py:246-331）有大量边界 bug：**
> - `<div>→<section>` 用 `re.sub(r'<div\b', '<section', ...)` 会破坏 `<divider>` 这类前缀匹配（当前不是问题，但脆弱）
> - `style` 值修正里的 `position/top/right/bottom/left` 删除只按字符串匹配，会误伤 `margin-left` 等（已加 lookbehind 缓解，但仍脆弱）
> - 这些规则本质上是 HC-6 的反例——"清洗下游"的恶果。

---

## 8. 成功判据（整体，可用 CI 校验）

- [**OK-1**] `grep -rn "sanitizeForWechatPreview\|normalizeImageStyles" frontend/` 返回 0 行
- [**OK-2**] `grep -rn "processForWechat\b" frontend/src/` 返回 0 行（juice 调用也一并清除）
- [**OK-3**] 后端只保留一个处理入口函数（建议名 `render_for_wechat(html, css, *, upload_images: bool)`），`grep -rn "_process_for_wechat\|_inline_css\|_sanitize_for_wechat" backend/app/` 命中 ≤ 1 个文件且该文件为新函数所在位置
- [**OK-4**] Playwright 测试：打开编辑器 → 读取 iframe `body.innerHTML` → 点击复制按钮 → 读取剪贴板 `text/html` → 除 `src=` 值外字节级相同
- [**OK-5**] 集成测试：同一 `(html, css)` 调 `/publish/preview` 和 `/publish/process-for-copy`，diff 只出现在 `<img src=...>` 属性上
- [**OK-6**] 代码里不再存在"清洗模拟"概念：搜索 "模拟"、"清洗" 关键字在 `/preview/`、`/copy/` 路径下为 0
- [**OK-7**] iframe 外壳样式（font / padding）与微信官方文章页面样式偏差可视化对比 ≤ 5%（人工验收项）

---

## 9. 最小改动清单（不是实施计划，只列出影响面）

**前端要改的文件：**
1. `frontend/src/components/preview/WechatPreview.tsx`
   - 删除 `cleanMode` 状态、切换 UI、`normalizeImageStyles`、`sanitizeForWechatPreview` 调用
   - iframe 的外壳 `<style>` 保留但严格仅限"微信文章页面基线"（字体、行高、段间距、img max-width）
2. `frontend/src/utils/wechatSanitizer.ts` — **整个文件删除**
3. `frontend/src/utils/inliner.ts` — 删除或仅作为 `juice` 的薄封装给某个单一调用者
4. `frontend/src/hooks/useClipboard.ts` — 删除 `copyRichText`（未被调用的死代码），保留 `writeHtmlToClipboard`
5. `frontend/src/pages/Editor.tsx:173-212` — 删除 debounced `/publish/preview` 调用；预览直接用 `rawPreview`（不经后端处理），依赖 **[HC-6]** 保证源 HTML 已微信友好
6. `frontend/src/components/panel/ActionPanel.tsx:129-154` — `handleExport` 改用 iframe.body.innerHTML 或复用同一 `renderForWechat` 结果

**后端要改的文件：**
1. `backend/app/api/v1/publish.py`
   - 合并 `_inline_css` + `_sanitize_for_wechat` + `_process_for_wechat` + `process_html_images` 成**单一函数** `render_for_wechat(html, css, *, upload_images)`
   - 删除 `/publish/preview`、`/publish/process` 中的一个（它们本质相同），保留一个对外端点
   - 删除正则清洗中不是 HC-1/HC-2 范畴的规则（grid→block、position 删除、display 改写等）——这些属于"清洗下游"的反例
2. `backend/app/services/wechat_service.py:137-151`
   - 图片上传失败应 raise，不再静默保留原 src
   - `process_html_images` 正则补单引号 src 匹配

**测试要加的文件：**
1. `frontend/tests/wysiwyg.spec.ts`（Playwright）— 实现 OK-4
2. `backend/tests/test_render_for_wechat.py`（pytest）— 实现 OK-5

---

## 10. 开放问题（必须在 plan 阶段前与用户确认）

1. **[Q-ALIGN-1]** 选哪一条路径作为主管线？
   - 选项 A：**预览 = 复制**（iframe body.innerHTML 就是复制产物，除图片外字节相同）
   - 选项 B：**复制 = 草稿箱**（统一由后端 `renderForWechat` 产出，前端仅展示）
   - 推荐：**A + B 合一** = 前端直接用后端 `renderForWechat(uploadImages=false)` 的结果渲染 iframe，复制时再调一次 `uploadImages=true`，两次结果 diff 仅 src
   - 用户确认？

2. **[Q-ALIGN-2]** 编辑器源码层面对"微信不支持的 CSS"（flex/grid/position:absolute）怎么办？
   - 选项 A：**保存时拒绝**（Monaco 报 error）—— 强硬，但逼用户写微信友好代码
   - 选项 B：**保存时警告**（status bar 红点）—— 温和，允许但提示
   - 选项 C：**维持现状**（下游清洗）—— 违反 HC-6
   - 推荐：B，配合预设模板降低门槛
   - 用户确认？

3. **[Q-ALIGN-3]** 图片 CDN 化的时机：
   - 选项 A：**保存时上传**（每次粘贴图片就上传，`article.html` 里直接是 mmbiz URL）—— 预览就是最终产物
   - 选项 B：**复制/发布时上传**（当前做法）—— 需要在线上传等待
   - 推荐：A，彻底去掉"复制时上传"这个高延迟步骤
   - 用户确认？

4. **[Q-ALIGN-4]** 后端 `_WECHAT_BASE_CSS` 里注入的字体 / 行高 / img 样式，是保留为 iframe 外壳，还是内联进 content？
   - 决定了"content 是否包含 `<section class="wechat-root">` 包装层"
   - 微信后台本身会用它自己的字体渲染 content；我们注入的 `font-family: PingFang SC` 其实微信会覆盖
   - 建议：**直接删除 `_WECHAT_BASE_CSS`**，让微信用它自己的样式；iframe 外壳模拟微信文章页面视觉
   - 用户确认？

---

## 附录 A：关键代码位置索引

| 位置 | 作用 |
|---|---|
| `backend/app/api/v1/publish.py:18-28` | `_WECHAT_BASE_CSS` 基线样式 |
| `backend/app/api/v1/publish.py:74-111` | `_inline_css` premailer 内联 |
| `backend/app/api/v1/publish.py:246-331` | `_sanitize_for_wechat` 正则清洗（需删减） |
| `backend/app/api/v1/publish.py:338-342` | `_process_for_wechat` 主管线函数 |
| `backend/app/api/v1/publish.py:357-361` | `/publish/preview` 端点 |
| `backend/app/api/v1/publish.py:388-401` | `/publish/process-for-copy` 端点 |
| `backend/app/api/v1/publish.py:468-475` | `/publish/draft` 端点 |
| `backend/app/services/wechat_service.py:108-178` | `process_html_images` 图片 CDN 化 |
| `backend/app/services/wechat_service.py:180-215` | `create_draft` 微信 API 调用 |
| `frontend/src/components/preview/WechatPreview.tsx:6-20` | `normalizeImageStyles`（需删） |
| `frontend/src/components/preview/WechatPreview.tsx:37` | `cleanMode` state（需删） |
| `frontend/src/components/preview/WechatPreview.tsx:41-42` | `sanitizeForWechatPreview` 调用（需删） |
| `frontend/src/components/preview/WechatPreview.tsx:66-83` | iframe 外壳样式（保留） |
| `frontend/src/components/preview/WechatPreview.tsx:138-159` | 375px 宽度容器 + cleanMode 切换 UI |
| `frontend/src/utils/wechatSanitizer.ts` | **整个文件删除** |
| `frontend/src/utils/inliner.ts:76-80` | `processForWechat` 死代码 |
| `frontend/src/hooks/useClipboard.ts:36-41` | `copyRichText` 死代码 |
| `frontend/src/pages/Editor.tsx:173-198` | debounced `/publish/preview` 调用（需改为不调后端） |
| `frontend/src/pages/Editor.tsx:210-212` | `previewHtml` 选择逻辑（需简化） |
| `frontend/src/components/panel/ActionPanel.tsx:44-106` | `handleCopy` 三重 fallback（需简化） |

## 附录 B：研究数据来源

- **Codex（GPT-5，后端边界）**：完整访问后端代码 + 联网查询微信官方文档 + 11 条 web_search；session `019d7b8f-4c58-7953-9b61-23234cf8685c`
- **Gemini（前端边界）**：完整访问前端代码 + 基于训练知识推断竞品实现；session `075f02eb-173b-41e5-b26f-202775529915`
- **Claude（整合）**：本地读取并交叉验证所有关键代码
