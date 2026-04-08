---
name: mbeditor
description: "MBEditor — 首款 AI Agent 原生的微信公众号编辑器。创建/编辑/预览文章，管理图床，插入交互组件，一键推送到公众号草稿箱。当用户提到公众号、微信文章、推文、草稿箱、或要求写/排版/发布公众号内容时触发。"
user-invocable: true
metadata:
  openclaw:
    emoji: "📝"
    requires:
      bins: ["curl"]
---

# MBEditor — 公众号文章编辑发布

通过 MBEditor 服务创建、编辑、预览和发布微信公众号文章。

**API Base URL**: `http://localhost:7072/api/v1`
**Web 编辑器**: `http://localhost:7073`

用户可以直接说"帮我写一篇公众号文章"、"把这段内容发到公众号"、"上传封面图"等自然语言，你来调用对应 API。

---

## 工作流

### 典型流程：写文章 → 发布

1. 创建文章（获取 article_id）
2. 生成 HTML/CSS 内容（或 Markdown），写入文章
3. 上传图片到图床（如需要）
4. 推送到草稿箱 / 告诉用户打开 Web 编辑器复制富文本

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

### HTML 模式公众号兼容规则

写给公众号的 HTML 必须遵守以下规则（系统会自动做 CSS inline 化和标签过滤，但源码遵守这些规则效果最好）：

- **使用 `<section>` 代替 `<div>`**（公众号对 section 支持更好）
- **字号用 px**，不用 rem/em
- **颜色用十六进制** `#333333`，不用 rgb()/CSS 变量
- **不使用 CSS Grid**
- **不使用 position: fixed/absolute**
- **flexbox 谨慎使用**（部分公众号客户端不完全支持）
- **内容宽度不超过 578px**
- **图片加 `style="max-width:100%;"`**
- **用 inline style 最可靠**，class 和 `<style>` 标签会被公众号过滤

### 内置交互组件

MBEditor 内置 6 种纯 CSS 交互模板，可通过编辑器左侧面板插入：

- **展开收起** — 点击标题展开/折叠内容
- **前后对比** — 支持纯文字、纯图片、图文混合三种模式
- **翻牌卡片** — 点击翻转查看背面内容
- **滑动轮播** — 触摸滑动 + 指示器切换
- **渐显文字** — 滚动到可见区域时逐行淡入
- **长按揭秘** — 长按查看隐藏内容

所有组件基于纯 CSS + checkbox/radio hack，无需 JavaScript，100% 微信兼容。

### Markdown 模式

更新文章时设置 `"mode":"markdown"`，然后写入 `"markdown"` 字段：
```bash
curl -X PUT http://localhost:7072/api/v1/articles/{id} \
  -H "Content-Type: application/json" \
  -d '{"mode":"markdown","markdown":"# 标题\n\n正文 **加粗** 内容"}'
```
Web 编辑器会自动用主题渲染为带 inline style 的 HTML。Markdown 模式也支持插入 HTML 交互组件。

### 预览文章

告诉用户打开 Web 编辑器查看效果：
```
请打开 http://localhost:7073/editor/{article_id} 查看预览效果
```

### 完整示例：Agent 写文章并发布

```bash
# 1. 创建文章
curl -s -X POST http://localhost:7072/api/v1/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"AI 如何改变我们的生活","mode":"html"}' | jq .data.id
# 返回: "abc123def456"

# 2. 写入内容
curl -X PUT http://localhost:7072/api/v1/articles/abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<section style=\"padding:20px;\"><h1 style=\"font-size:24px;color:#333;text-align:center;\">AI 如何改变我们的生活</h1><section style=\"margin-top:16px;\"><p style=\"font-size:16px;line-height:1.8;color:#333;\">人工智能正在深刻地改变着我们的日常生活...</p></section></section>",
    "css": "p { margin: 12px 0; }",
    "author": "Anson",
    "digest": "探讨 AI 技术对日常生活的影响"
  }'

# 3. 上传封面图（如果有的话）
curl -X POST http://localhost:7072/api/v1/images/upload -F "file=@cover.jpg"
# 返回 path，然后更新文章的 cover 字段

# 4. 推送到草稿箱
curl -X POST http://localhost:7072/api/v1/publish/draft \
  -H "Content-Type: application/json" \
  -d '{"article_id":"abc123def456","author":"Anson"}'

# 或者告诉用户去 Web 编辑器复制富文本：
# http://localhost:7073/editor/abc123def456
```
