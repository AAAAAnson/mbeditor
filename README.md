<div align="center">

# MBEditor

**支持 CLI 化操作的微信公众号编辑器**

编辑 · 预览 · 发布 · 一体化 · AI 驱动

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-一键部署-blue.svg)](docker-compose.yml)
[![AI Skill](https://img.shields.io/badge/AI_Skill-Claude_|_Codex_|_OpenClaw-purple.svg)](skill/SKILL.md)

</div>

---

![MBEditor 编辑器](docs/screenshots/editor.png)

## 为什么选 MBEditor

> 告诉 AI「写一篇 Docker 入门推文，暗色科技风，卡片式排版」—— AI 自动生成 HTML，实时预览，一键推送到微信草稿箱。

<table>
<tr>
<td width="33%">

**Skill 化**

将 SKILL.md 注册为 AI Agent 的 Skill，Claude Code / Codex / OpenClaw 即装即用，任意目录下操作编辑器。

</td>
<td width="33%">

**自然语言排版**

用对话描述你想要的排版风格，AI 直接生成微信兼容的 HTML/CSS，所见即所得。

</td>
<td width="34%">

**CLI 全流程**

每个功能都有 REST API。创建、编辑、上传、发布，全部 curl 搞定，CI/CD 无缝集成。

</td>
</tr>
</table>

## 功能

<table>
<tr><td>

**编辑器** — 双模式编辑（HTML 三栏 + Markdown 多主题）、Monaco 代码编辑器、所见即所得预览、原始/微信双视图切换

**发布** — 一键复制富文本、一键推送草稿箱（自动 CSS 内联 + 图片上传微信 CDN）、导出 HTML

**素材** — 本地图床（MD5 去重 / 按日归档）、格式自动转换（WebP/SVG/BMP → PNG）、SVG 交互模板（点击展开/翻牌/轮播/渐显）

**微信兼容** — premailer CSS 内联化、智能清洗不支持的 CSS、`div` → `section` 标签转换、自动生成封面图

**REST API** — 文章 CRUD、图片上传、发布推送、配置管理，完整覆盖所有功能

</td></tr>
</table>

## 内置排版模板

MBEditor + AI 可以用自然语言生成各种风格的公众号排版，以下是 6 种内置示例：

<table>
<tr>
<td align="center" width="33%"><strong>明亮清新</strong></td>
<td align="center" width="33%"><strong>暗黑终端</strong></td>
<td align="center" width="34%"><strong>报纸编辑部</strong></td>
</tr>
<tr>
<td><img src="docs/screenshots/preview.png" alt="明亮清新" /></td>
<td><img src="docs/screenshots/design-v1-terminal.png" alt="暗黑终端" /></td>
<td><img src="docs/screenshots/design-v2-newspaper.png" alt="报纸编辑部" /></td>
</tr>
<tr>
<td align="center" width="33%"><strong>霓虹赛博</strong></td>
<td align="center" width="33%"><strong>大地暖色</strong></td>
<td align="center" width="34%"><strong>瑞士极简</strong></td>
</tr>
<tr>
<td><img src="docs/screenshots/design-v3-neon.png" alt="霓虹赛博" /></td>
<td><img src="docs/screenshots/design-v4-earth.png" alt="大地暖色" /></td>
<td><img src="docs/screenshots/design-v5-swiss.png" alt="瑞士极简" /></td>
</tr>
</table>

> 所有模板均为纯 inline style + `<section>` 标签，100% 微信公众号兼容。你也可以用自然语言描述任意风格，AI 会实时生成。

<details>
<summary><strong>生成这些风格的提示词参考</strong></summary>

以下是生成上述 6 种风格时使用的提示词，你可以直接复制使用，也可以在此基础上自由发挥：

**明亮清新**
```
帮我写一篇 MBEditor 介绍推文，明亮清新风格。
浅色渐变背景，彩色图标卡片，圆润友好的设计。
功能用带颜色图标的横向卡片展示，技术栈用三栏对比，底部深色 footer。
```

**暗黑终端**
```
帮我写一篇 MBEditor 介绍推文，暗黑终端/黑客风格。
纯黑背景 #0c0c0c，荧光绿 #00e87b 为主色调，搭配琥珀黄 #ffbe0b 和品红 #ff006e。
功能区用左侧彩色边框卡片，代码区模拟终端界面，等宽字体 Menlo，章节用 01/02/03 编号。
```

**报纸编辑部**
```
帮我写一篇 MBEditor 介绍推文，复古报纸/杂志编辑部风格。
奶油色背景 #f4f1eb，黑色油墨文字，双线装饰边框，衬线字体 Georgia。
功能用双栏报纸排版，大号衬线体编号，BREAKING NEWS / EXCLUSIVE REPORT 等新闻标签。
```

**霓虹赛博**
```
帮我写一篇 MBEditor 介绍推文，赛博朋克/霓虹风格。
深海蓝背景 #0a0e27，霓虹青 #00d4ff 和热粉 #ff1493 为点缀色。
用 box-shadow 做发光效果，全等宽字体，MOD_01 编号体系，[ SYSTEM ONLINE ] 标签。
```

**大地暖色**
```
帮我写一篇 MBEditor 介绍推文，大地色/手工匠人风格。
深棕背景 #2c1810，赤陶色 #c1440e、沙色 #e8d5b7、森林绿 #2d5016 搭配。
圆角卡片，编号圆圈，Georgia 衬线标题，温暖有质感的手工艺人感觉。
```

**瑞士极简**
```
帮我写一篇 MBEditor 介绍推文，瑞士国际主义/极简风格。
纯白背景，纯黑文字，唯一的彩色是红色 #ff0000 色块。
极致留白，功能用表格式水平排列（编号 + 标题 + 简述），无装饰，严格网格对齐。
```

你也可以完全自定义：
```
帮我写一篇推文，主题是 [你的主题]，风格是 [你想要的风格描述]，
色调 [你喜欢的颜色]，排版要 [你的排版偏好]
```

</details>

## 技术栈

| 前端 | 后端 | 部署 |
|------|------|------|
| React 19 | FastAPI | Docker Compose |
| TypeScript | Python | Nginx |
| Tailwind CSS 4 | premailer | Uvicorn |
| Monaco Editor | Pillow | 一键启动 |

## 快速开始

### Docker 部署

```bash
git clone https://github.com/AAAAAnson/mbeditor.git
cd mbeditor

# 配置微信凭据
cp data/config.json.example data/config.json
# 编辑 data/config.json，填入 appid 和 appsecret

# 启动
docker compose up -d
```

访问 **http://localhost:7070** 开始使用。

### 本地开发

```bash
# 后端
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 7071

# 前端
cd frontend && npm install && npm run dev
```

## AI 工具集成

MBEditor 的每个功能都有 REST API，天然支持 AI 代理操作。

### Claude Code

```bash
# 在项目目录下
claude "帮我写一篇关于 AI 的推文，排版精美，推送到草稿箱"

# 安装为全局 Skill（任意目录可用）
cp skill/SKILL.md ~/.claude/skills/wechat-editor.md
```

### Codex

```bash
codex "部署这个微信编辑器，然后创建一篇文章"
```

### OpenClaw

```bash
openclaw skill add ./skill/SKILL.md
openclaw "写一篇公众号推文，主题是 Docker 入门"
```

### REST API

```bash
# 创建 → 编辑 → 发布，三步搞定
curl -X POST http://localhost:7071/api/v1/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"我的文章","mode":"html"}'

curl -X PUT http://localhost:7071/api/v1/articles/{id} \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>标题</h1><p>正文</p>"}'

curl -X POST http://localhost:7071/api/v1/publish/draft \
  -H "Content-Type: application/json" \
  -d '{"article_id":"{id}"}'
```

<details>
<summary><strong>完整 API 参考</strong></summary>

### 文章管理

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/v1/articles` | 创建文章 |
| `GET` | `/api/v1/articles` | 列出所有文章 |
| `GET` | `/api/v1/articles/{id}` | 获取文章详情 |
| `PUT` | `/api/v1/articles/{id}` | 更新文章 |
| `DELETE` | `/api/v1/articles/{id}` | 删除文章 |

### 图片管理

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/v1/images/upload` | 上传图片 |
| `GET` | `/api/v1/images` | 列出所有图片 |
| `DELETE` | `/api/v1/images/{id}` | 删除图片 |

### 发布

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/v1/publish/html/{id}` | 获取处理后的 HTML |
| `POST` | `/api/v1/publish/preview` | 预览处理（CSS 内联） |
| `POST` | `/api/v1/publish/process` | 处理文章图片 |
| `POST` | `/api/v1/publish/draft` | 推送到微信草稿箱 |

### 配置

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/v1/config` | 查看配置状态 |
| `PUT` | `/api/v1/config` | 设置 AppID / AppSecret |

</details>

## 项目结构

```
mbeditor/
├── frontend/              # React 19 + TypeScript + Tailwind 4
│   └── src/
│       ├── pages/         # 编辑器 / 文章列表 / 设置
│       ├── components/    # Monaco 编辑器 / 预览 / 操作面板 / 图片管理
│       └── utils/         # CSS 内联 / Markdown 渲染 / HTML 提取
├── backend/               # FastAPI + Python
│   └── app/
│       ├── api/v1/        # REST API 路由
│       └── services/      # 文章 / 图片 / 微信 API 服务
├── skill/                 # AI Agent Skill 定义
│   └── SKILL.md           # Claude Code / OpenClaw 兼容
├── data/                  # 运行时数据（gitignored）
├── docker-compose.yml     # 一键部署
└── LICENSE
```

<details>
<summary><strong>微信公众号后台</strong></summary>

<img src="docs/screenshots/wechat-backend.png" alt="微信公众号后台" />

</details>

## 贡献者

<a href="https://github.com/AAAAAnson">
  <img src="https://github.com/AAAAAnson.png" width="60" style="border-radius:50%;" alt="AAAAAnson" />
</a>

**[AAAAAnson](https://github.com/AAAAAnson)** — 创建者与维护者

欢迎提交 [Issue](https://github.com/AAAAAnson/mbeditor/issues) 和 [Pull Request](https://github.com/AAAAAnson/mbeditor/pulls)!

## 许可证

[MIT](LICENSE) &copy; 2026 Anson
