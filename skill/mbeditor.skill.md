---
name: mbeditor
description: "MBEditor — 首款 AI Agent 原生的微信公众号编辑器。帮助 Agent 设计任意风格的公众号文章，自动保证在微信后台 100% 还原呈现。当用户提到公众号、微信文章、推文、草稿箱、或要求写/排版/设计/发布公众号内容时触发。"
user-invocable: true
metadata:
  openclaw:
    emoji: "📝"
    requires:
      bins: ["curl"]
---

# MBEditor — AI Agent 原生的公众号编辑器

**API Base URL**: `http://localhost:7072/api/v1`
**Web 编辑器**: `http://localhost:7073`

---

## 🎯 核心使命（先读这一段）

MBEditor 给 Agent 两个承诺：

1. **最大设计自由** — 你可以用任何 HTML/CSS/SVG/栅格化手段实现你想要的视觉效果，不需要在创作时被微信的兼容性限制束缚思路。
2. **100% 微信还原** — 你设计的页面会**原样**呈现在微信公众号后台和读者的手机上，不会"预览好看但发布后崩掉"。

**这两件事看起来矛盾，因为微信正文支持的 HTML/CSS 极窄。** MBEditor 的做法是让你把设计**按复杂度分层**：能用微信原生 HTML 表达的就用 HTML，表达不了的用 SVG，SVG 也表达不了的用 Playwright 栅格化成 PNG。整个过程对你透明——你只管设计。

---

## 🧭 设计决策树（Agent 必读）

当用户要求某个视觉效果时，先问自己三个问题：

### 问题 1：这个效果能用"纯文字/图片/简单样式"表达吗？

**能 → 走 HTML 层。** 包括：标题、段落、列表、引用、代码块、表格、普通图片、边框、圆角、背景色、字体样式、颜色渐变（linear-gradient）、flexbox 简单布局（水平/垂直排列）。

**⚠️ 以下写法在 HTML 层会 100% 失效，必须改层：**
- `class` + 外部 `<style>` → 微信会剥光 style 标签
- `<script>` 任何形式 → 微信会删除
- `<input>` / `<label>` checkbox hack → 微信会删除
- `display: grid` → 微信不支持，会退化错乱
- `position: fixed / absolute` → 不生效
- CSS `@keyframes` / `animation` → 依赖 style 标签，会失效
- `:hover` / `:active` / `::before` / `::after` → 不生效

**正确的 HTML 层写法：所有样式写 inline，不使用任何 class / 外部 CSS。**

### 问题 2：这个效果是"点击触发、图形装饰、矢量图标、简单动画"吗？

**是 → 走 SVG 层。** 微信允许 `<svg>` 正文嵌入，支持一个**有限**的 SMIL 动画集合：
- `<animate>` + `begin="click"` / `"touchstart"` 可做点击触发的透明度/位移动画
- `<animateTransform>` 可做旋转/缩放/平移
- `<rect> <circle> <path> <text>` 可画任意几何图形和矢量文字
- `<linearGradient>` 可做渐变填充

**SVG 层硬禁令：**
- ❌ 绝对不要用 `id="..."` 属性（微信全过滤，会导致 `use`、`clipPath` 引用断裂）
- ❌ 绝对不要用 `<script>` / `onclick=` / `onload=` 等事件属性
- ❌ 不要在 svg 内嵌 `<style>` 标签（会被剥离）
- ❌ 不要用 `<a>` 超链接

SVG 的 CSS 必须直接写在元素的 `style="..."` 属性里，或作为 `fill=""` `stroke=""` 这类 SVG 原生属性。

### 问题 3：既不能 HTML 表达、也不能 SVG 表达？

**走 Raster 层（栅格化）。** 适用场景：
- `display: grid` 复杂布局
- 3D 翻转 / perspective
- 复杂的 CSS 动画背景
- 任何你觉得"微信肯定不支持"的花哨效果

Raster 层把你的 HTML+CSS 送到 Playwright 服务端用 headless Chromium 截图成 PNG，上传到微信 CDN，content 里最终只有一个 `<img>` 标签。**代价：** PNG 里的文字用户**不能选中复制**，也不能点击交互。但视觉上 100% 像素级还原。

### 层级选择优先级（决策树速查）

```
用户要求 "xxx 效果"
    │
    ▼
能用 inline style HTML 表达？  ─── 是 ──▶ HTML 层（最优，文字可选）
    │
    否
    ▼
能用纯 SVG（无 id/script）表达？  ─── 是 ──▶ SVG 层（矢量清晰）
    │
    否
    ▼
走 Raster 层（栅格化兜底，牺牲可选文字换取视觉还原）
```

**核心原则：能用低层就用低层，不要过度滥用 Raster。** 栅格化每块增加 2-3 秒发布时间，且 PNG 无法被搜索引擎索引。但当且仅当低层无法表达时，raster 是你的免死金牌。

---

## ⚠️ 重要变更公告（2026-04）

**Agent 需要知道以下正在发生的架构重构：**

1. **"内置 6 种交互组件" 正在被移除。** 旧版宣传的"展开收起 / 前后对比 / 翻牌卡片 / 滑动轮播 / 渐显文字 / 长按揭秘"本质是 HTML checkbox hack（依赖 `<input>` + `<label>` + `<style>` + `:checked`），已被调研（`docs/research/wechat-svg-capability.md`）证明在微信正文中 4 样都会被剥光。**这些组件会在 Stage 0 删除**，不要再在代码里引用它们。如果用户要做点击交互，用 SVG + SMIL `begin="click"`；如果要做复杂卡片翻转，用 Raster 层。

2. **新的 MBDoc block 化 API 即将到来（Stage 1）。** 格式是 JSON block 列表，每个 block 是 `heading` / `paragraph` / `markdown` / `html` / `image` / `svg` / `raster` 之一。Agent 通过 POST JSON 即可完成文章生产，无需手动拼接 HTML 字符串。**Stage 1 上线前，继续用下面的 `/articles` API。**

3. **统一渲染管线：** 未来 `render → 一键复制 → 推送草稿箱` 三条路径会共享同一个 `render_for_wechat` 函数，保证预览和发布**字节级一致**（除图片 src 外）。目前的 `/publish/preview` 和 `/publish/draft` 仍在使用，但即将合并。

**执行中的 roadmap：** `docs/superpowers/plans/2026-04-11-mbeditor-wysiwyg-roadmap.md`

---

## MBDoc 文档模型（Stage 1 起可用）

MBDoc 是 MBEditor 的**新一代文档格式**，是 Block 化的 JSON 结构。AI Agent 推荐直接产出 MBDoc JSON 并 POST，跳过"自己拼接 HTML 字符串"的陷阱。

### Schema

```json
{
  "id": "doc-20260411-001",
  "version": "1",
  "meta": {
    "title": "文章标题",
    "author": "作者名",
    "digest": "一句话摘要",
    "cover": "/images/cover.jpg"
  },
  "blocks": [
    { "id": "b1", "type": "heading", "level": 1, "text": "主标题" },
    { "id": "b2", "type": "paragraph", "text": "正文段落。" }
  ]
}
```

**id 约束：** `id`（文档 id 和 block id）必须匹配 `^[A-Za-z0-9_-]+$`（只允许字母、数字、连字符、下划线）。

### 当前可用的 block 类型（Stage 1）

| type | 状态 | 必填字段 |
|---|---|---|
| `heading` | ✅ 可用 | `level` (1-6), `text` |
| `paragraph` | ✅ 可用 | `text` |
| `markdown` | 🚧 stub（Stage 2 实装） | `source` |
| `html` | 🚧 stub（Stage 2 实装） | `source` |
| `image` | 🚧 stub（Stage 3 实装） | `src`（禁止 `javascript:` / `data:` 协议） |
| `svg` | 🚧 stub（Stage 4 实装） | `source`（必须含 `<svg>` 标签） |
| `raster` | 🚧 stub（Stage 5 实装） | `html`, `css` |

**stub 状态**：这些 block 会被渲染为醒目的黄色警告框，提醒尚未实装。Stage 2-5 会依次替换。

### API 端点

#### 1. 创建 MBDoc
```bash
curl -X POST http://localhost:7072/api/v1/mbdoc \
  -H "Content-Type: application/json" \
  -d '{
    "id": "doc-20260411-001",
    "version": "1",
    "meta": {"title": "Hello MBDoc", "author": "Anson"},
    "blocks": [
      {"id": "h1", "type": "heading", "level": 1, "text": "欢迎"},
      {"id": "p1", "type": "paragraph", "text": "这是第一个 MBDoc 文档。"}
    ]
  }'
```

#### 2. 获取 MBDoc
```bash
curl http://localhost:7072/api/v1/mbdoc/doc-20260411-001
```

#### 3. 更新 MBDoc（完整替换）
```bash
curl -X PUT http://localhost:7072/api/v1/mbdoc/doc-20260411-001 \
  -H "Content-Type: application/json" \
  -d '{ ... 完整 MBDoc JSON ... }'
```

注意：PUT body 中的 `id` 必须与 URL 中的一致，否则返回 400。

#### 4. 列出所有 MBDoc
```bash
curl http://localhost:7072/api/v1/mbdoc
```
返回 `{"code":0,"data":[{"id":"...","title":"..."}, ...]}`

#### 5. 渲染为 HTML（预览模式）
```bash
curl -X POST "http://localhost:7072/api/v1/mbdoc/doc-20260411-001/render?upload_images=false"
```
返回 `{"code":0,"data":{"html":"<h1 style=\"...\">欢迎</h1>\n<p style=\"...\">...</p>","uploaded_images":false}}`

#### 6. 渲染为 HTML（发布模式 — Stage 3 起真正上传图片）
```bash
curl -X POST "http://localhost:7072/api/v1/mbdoc/doc-20260411-001/render?upload_images=true"
```

#### 7. 删除 MBDoc
```bash
curl -X DELETE http://localhost:7072/api/v1/mbdoc/doc-20260411-001
```

### WYSIWYG 不变量

`render_for_wechat` 是 MBEditor 预览/复制/推送草稿箱三条路径**唯一的真相来源**。调用两次同一个 MBDoc（一次 `upload_images=false`，一次 `upload_images=true`），产出的 HTML diff **必须只在 `<img src>` 属性上**。对纯文本文档（无 image block），两次调用产出完全一致。

### Agent 工作流示例

```bash
cat > /tmp/doc.json <<'EOF'
{
  "id": "demo-001",
  "version": "1",
  "meta": {"title": "AI 生成的文章", "author": "Claude"},
  "blocks": [
    {"id": "h1", "type": "heading", "level": 1, "text": "AI 如何改变写作"},
    {"id": "p1", "type": "paragraph", "text": "人工智能正在重塑内容生产方式..."},
    {"id": "h2", "type": "heading", "level": 2, "text": "关键变化"},
    {"id": "p2", "type": "paragraph", "text": "效率、质量、创意都被重新定义。"}
  ]
}
EOF

curl -X POST http://localhost:7072/api/v1/mbdoc \
  -H "Content-Type: application/json" -d @/tmp/doc.json

curl -sX POST "http://localhost:7072/api/v1/mbdoc/demo-001/render" | jq -r .data.html
```

### Stage 1 限制（已知）

- `markdown` / `html` / `image` / `svg` / `raster` 5 种 block 都是 stub（渲染为黄色警告框）
- `render?upload_images=true` 还没有真正的图片上传逻辑（Stage 3 实装）
- 前端 Editor 页面仍在 legacy `/articles` 界面；MBDoc 目前**只能通过 API 操作**
- `/articles` 和 `/mbdoc` 是两套独立存储，无数据迁移工具
- MBDocStorage 无并发锁（单用户单机假设），两个并发 PUT 有竞争

### 什么时候用哪套 API？

| 场景 | 推荐 |
|---|---|
| AI Agent 通过 CLI 生产文章（Stage 1+） | `/mbdoc` |
| 程序员手写 HTML 直接推送草稿箱（现在） | `/articles` |
| 运营者在 Web 编辑器里操作（现在） | `/articles` |
| Stage 6 起 | 全部 `/mbdoc`，`/articles` 下线 |

---

## 工作流

用户可以直接说"帮我写一篇公众号文章"、"把这段内容发到公众号"、"上传封面图"等自然语言，你来调用对应 API。

### 典型流程：写文章 → 发布

1. **分层决策** — 先根据上文的"设计决策树"判断每个视觉块应该走 HTML / SVG / Raster 哪一层
2. **创建文章** — `POST /api/v1/articles` 获取 `article_id`
3. **生成内容** — 按分层决策组装 HTML/CSS 或 Markdown 源码（严格遵守 HTML 层写作规范）
4. **上传图片** — 通过 `/api/v1/images/upload` 上传到图床（自动 MD5 去重）
5. **推送草稿箱** — `POST /api/v1/publish/draft` 一键发布，或提示用户去 Web 编辑器复制富文本

---

## API 文档

### 一、文章管理

#### 1. 创建文章
```bash
curl -X POST http://localhost:7072/api/v1/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"文章标题","mode":"html"}'
```
- **mode**: `html` 或 `markdown`
- 返回文章对象，包含 `id` 字段（后续操作都用这个 id）

#### 2. 列出所有文章
```bash
curl http://localhost:7072/api/v1/articles
```

#### 3. 获取文章详情
```bash
curl http://localhost:7072/api/v1/articles/{article_id}
```

#### 4. 更新文章内容
```bash
curl -X PUT http://localhost:7072/api/v1/articles/{article_id} \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>标题</h1><p>正文内容</p>","css":"h1{color:#333;font-size:24px;}"}'
```
可更新字段：`title`, `mode`, `html`, `css`, `js`, `markdown`, `cover`, `author`, `digest`

#### 5. 删除文章
```bash
curl -X DELETE http://localhost:7072/api/v1/articles/{article_id}
```

### 二、图片管理（图床）

#### 1. 上传图片
```bash
curl -X POST http://localhost:7072/api/v1/images/upload \
  -F "file=@/path/to/image.jpg"
```
- 返回：`{"data":{"id":"md5hash","path":"2026/04/04/md5hash.jpg",...}}`
- 在文章 HTML 中引用：`<img src="/images/2026/04/04/md5hash.jpg" style="max-width:100%;" />`
- 同一张图自动 MD5 去重

#### 2. 列出所有图片
```bash
curl http://localhost:7072/api/v1/images
```

#### 3. 删除图片
```bash
curl -X DELETE http://localhost:7072/api/v1/images/{image_id}
```

### 三、发布

#### 1. 获取处理后的 HTML（供查看）
```bash
curl http://localhost:7072/api/v1/publish/html/{article_id}
```
返回原始 HTML + CSS。

#### 2. 处理文章图片（替换为微信 CDN URL）
```bash
curl -X POST http://localhost:7072/api/v1/publish/process \
  -H "Content-Type: application/json" \
  -d '{"article_id":"xxx"}'
```
- 将文章中所有本地图片上传到微信 CDN 并替换 URL
- 需要先配置微信 AppID/AppSecret

#### 3. 推送到微信草稿箱
```bash
curl -X POST http://localhost:7072/api/v1/publish/draft \
  -H "Content-Type: application/json" \
  -d '{"article_id":"xxx","author":"作者名","digest":"文章摘要"}'
```
- 自动处理图片上传到微信 CDN + URL 替换
- 自动上传封面图
- 需要先配置微信 API

### 四、配置

#### 1. 查看配置状态
```bash
curl http://localhost:7072/api/v1/config
```

#### 2. 设置微信 AppID/AppSecret
```bash
curl -X PUT http://localhost:7072/api/v1/config \
  -H "Content-Type: application/json" \
  -d '{"appid":"wx...","appsecret":"..."}'
```

---

## 写作指南

### HTML 层写作规范（Agent 请严格遵守）

> 这是针对**HTML 层**的规范。如果你要写的是 SVG 或 Raster block，规则不同——分别参照上文的决策树。

**必须遵守（违反就会出错）：**

1. **全部用 inline style**。禁止 `class="..."` + 外部 `<style>` 块。CSS 必须直接写在元素的 `style=""` 属性里。
2. **用 `<section>` 代替 `<div>`**。微信 WebView 对 section 支持更好，是 Xiumi/135 的业界惯例。
3. **用 `<p>` 写段落**，不要用 `<section><br></section>`。
4. **图片必须是微信 CDN URL**（mmbiz.qpic.cn）或走 MBEditor 图片上传管线。外链图片会被微信过滤。**你不需要手动上传**——用 `/api/v1/images/upload` 上传后插入 `<img src="/images/...">`，推送草稿箱时 MBEditor 会自动替换为 mmbiz URL。
5. **图片加 `style="max-width:100%;display:block;"`** 避免在手机上溢出。
6. **内容宽度 ≤ 578px**（微信文章有效宽度）。
7. **`<script>`、`<style>`、`<link>` 不能出现在 content 里**——即便写了也会被后端清洗掉，不如从一开始就不写。

**建议（效果更好）：**

- 字号用 `px` 不用 `rem/em`（微信 WebView 对相对单位不稳定）
- 颜色用 16 进制 `#333333`，不用 `rgb()` 或 CSS 变量
- 字体栈建议：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 行高 `1.8` 阅读最舒适
- 正文字号 `16px`，一级标题 `26px`，二级标题 `22px`，三级标题 `19px`

**禁止（写了会出视觉问题）：**

- ❌ `display: grid`（微信不支持，会变成堆叠）
- ❌ `position: fixed / absolute / sticky`（不生效）
- ❌ `transform: rotate() / translate() / scale()`（不稳定）
- ❌ `@keyframes`、`animation:`（依赖 style 标签）
- ❌ `:hover`、`:active`、`::before`、`::after`（伪类/伪元素不生效）
- ❌ `flex` 的复杂嵌套（简单水平/垂直排列可以，嵌套 3 层以上不行）
- ❌ `backdrop-filter`、`mix-blend-mode`（WebView 不支持）
- ❌ 任何引用 `class` 的选择器

**如果用户的设计要求必须用以上禁止写法，你应该把这一块改投到 SVG 层或 Raster 层**，而不是强行写 HTML。

### 交互组件（Stage 0 起已下线）

> ⚠️ **不要使用"展开收起 / 前后对比 / 翻牌卡片 / 滑动轮播 / 渐显文字 / 长按揭秘"这 6 种旧组件。** 它们基于 `<input type=checkbox>` + `<label>` + `<style>` + `:checked` 的 HTML hack，微信正文会把 `<input>` / `<label>` / `<style>` / `class` 四样**全部剥光**，用户看到的是崩溃的静态布局。调研详情：`docs/research/wechat-svg-capability.md` §4。

**想实现交互效果的正确做法：**

| 想要的效果 | 正确的层级 | 实现方式 |
|---|---|---|
| 点击展开 / 收起 | SVG 层 | `<animate begin="click" attributeName="opacity" from="0" to="1">` |
| 点击切换图片（前后对比） | SVG 层 | 两个 `<image>` + 点击时 SMIL 切换 opacity |
| 翻牌 / 卡片翻转 | Raster 层 | 栅格化整个卡片，丢失翻转动画但保留视觉 |
| 图片轮播 | SVG 层 | 三个 `<image>` + `<animate>` 轮流切换 |
| 文字渐入 | SVG 层 | `<text>` + `<animate attributeName="opacity" begin="0s" dur="1s">` |
| 长按显示 | 放弃 | 微信 WebView 没有稳定的 long-press 模型 |

**通用原则：** 交互 = SVG + SMIL，视觉复杂 = Raster，两者之外放弃交互改用静态形式。

### Markdown 模式

更新文章时设置 `"mode":"markdown"`，然后写入 `"markdown"` 字段：
```bash
curl -X PUT http://localhost:7072/api/v1/articles/{id} \
  -H "Content-Type: application/json" \
  -d '{"mode":"markdown","markdown":"# 标题\n\n正文 **加粗** 内容"}'
```
Web 编辑器会自动用主题渲染为带 inline style 的 HTML。

**限制：** Markdown 模式只覆盖 HTML 层（段落、标题、列表、引用、代码、表格、图片）。如果你需要 SVG 或 Raster 效果，要么：
- 在 Markdown 里直接嵌入 `<svg>` 标签（marked 会原样透传）
- 切换到 `mode: "html"` 手写完整结构
- 等 Stage 1 的 MBDoc API 上线后用 block 化格式，混合 markdown + svg + raster

### 预览文章

告诉用户打开 Web 编辑器查看效果：
```
请打开 http://localhost:7073/editor/{article_id} 查看预览效果
```

### 完整示例：Agent 写文章并发布（HTML 模式）

> **注意：** 这是**当前可用**的 legacy `/articles` API 示例。Stage 1 之后推荐用 `/mbdoc` block API（正在开发）。

```bash
# 1. 创建文章
curl -s -X POST http://localhost:7072/api/v1/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"AI 如何改变我们的生活","mode":"html"}' | jq .data.id
# 返回: "abc123def456"

# 2. 写入内容（全 inline style，无 class，无 <style> 块）
curl -X PUT http://localhost:7072/api/v1/articles/abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<section style=\"padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,\\\"PingFang SC\\\",sans-serif;\"><h1 style=\"font-size:26px;font-weight:700;line-height:1.4;color:#222;text-align:center;margin:0 0 20px;\">AI 如何改变我们的生活</h1><p style=\"font-size:16px;line-height:1.8;color:#333;margin:12px 0;\">人工智能正在深刻地改变着我们的日常生活...</p></section>",
    "css": "",
    "author": "Anson",
    "digest": "探讨 AI 技术对日常生活的影响"
  }'

# 3. 上传封面图（会自动去重）
curl -X POST http://localhost:7072/api/v1/images/upload -F "file=@cover.jpg"
# 返回 path，然后更新文章的 cover 字段

# 4. 推送到草稿箱（会自动上传正文图片到微信 CDN）
curl -X POST http://localhost:7072/api/v1/publish/draft \
  -H "Content-Type: application/json" \
  -d '{"article_id":"abc123def456","author":"Anson"}'
```

### SVG 层示例：可点击展开的图形装饰

当用户要求"点击展开"、"点击切换"等交互时，用 SVG + SMIL：

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 200" style="width:100%;">
  <!-- 封面：点击后淡出 -->
  <rect x="0" y="0" width="580" height="200" fill="#e8784a">
    <animate attributeName="opacity"
             from="1" to="0"
             begin="click" dur="0.5s" fill="freeze"/>
  </rect>
  <text x="290" y="100" text-anchor="middle" fill="#fff"
        font-size="24" font-weight="bold">
    点击展开
    <animate attributeName="opacity"
             from="1" to="0"
             begin="click" dur="0.5s" fill="freeze"/>
  </text>

  <!-- 底层：点击后淡入 -->
  <rect x="0" y="0" width="580" height="200" fill="#2c3e50" opacity="0">
    <animate attributeName="opacity"
             from="0" to="1"
             begin="click" dur="0.5s" fill="freeze"/>
  </rect>
  <text x="290" y="100" text-anchor="middle" fill="#fff"
        font-size="18" opacity="0">
    这是隐藏内容！
    <animate attributeName="opacity"
             from="0" to="1"
             begin="click" dur="0.5s" fill="freeze"/>
  </text>
</svg>
```

**要点：**
- 所有元素**没有 `id="..."`**（微信过滤）
- `begin="click"` 是微信支持的 SMIL 事件
- `fill="freeze"` 让动画结束后保持最终状态（不回滚）
- 整个 svg 用 `style="width:100%;"` 自适应微信文章宽度

可以直接把这个 `<svg>` 塞进 `article.html` 字段，微信不会改动它。

### Raster 层的使用时机

当用户要求"炫酷 3D 翻转"、"CSS grid 仪表盘"、"渐变动画背景"等**绝对无法用 HTML 或 SVG 表达**的效果时：

1. **Stage 1 之前（当前）**：告诉用户"这种效果需要栅格化兜底，等 MBEditor 的 raster block 上线后可用。"或者先用 HTML2Canvas 在前端截图上传，作为静态图片插入。
2. **Stage 5 之后（可用后）**：用 MBDoc 的 `raster` block，传 `{"type":"raster","html":"...","css":"..."}`，后端会自动用 Playwright 渲染为 PNG。
