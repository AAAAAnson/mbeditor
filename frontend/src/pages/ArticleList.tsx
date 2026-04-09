import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import api from "@/lib/api";
import type { ArticleSummary } from "@/types";
import EmptyState from "@/components/editor/EmptyState";
import { toast } from "@/stores/toastStore";
import ArticleListHeader from "@/components/layout/ArticleListHeader";
import { ArticleCardSkeleton } from "@/components/ui/Skeleton";

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #2D1B4E, #1A3A5C 50%, #0D4A4A)",
  "linear-gradient(45deg, #1A4A3E, #0D6B5C)",
  "linear-gradient(180deg, #5C3A1A, #8B6034)",
  "linear-gradient(90deg, #4A1A2E, #7B3048)",
  "linear-gradient(200deg, #1A3A5C, #3A5A7C)",
  "linear-gradient(60deg, #2E4A1A, #4A6B34)",
];

const SAMPLE_HTML = `<section style="max-width:100%;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB',sans-serif;color:#2d2a26;line-height:1.9;letter-spacing:0.3px;">

<!-- Hero -->
<section style="padding:40px 0 24px;text-align:center;">
  <section style="display:inline-block;padding:4px 16px;border:1px solid #c4b5a0;border-radius:20px;font-size:12px;color:#8a7e6e;letter-spacing:2px;margin-bottom:20px;">OPEN SOURCE EDITOR</section>
  <h1 style="font-size:26px;font-weight:700;margin:16px 0 12px;color:#1a1714;line-height:1.4;">让公众号排版<br/>回归内容本身</h1>
  <p style="font-size:15px;color:#8a7e6e;margin:0;line-height:1.7;">MBEditor — 首款支持 AI Agent 直接驱动的公众号编辑器</p>
</section>

<section style="height:1px;background:linear-gradient(90deg,transparent,#d4c9b8,transparent);margin:8px 0 32px;"></section>

<!-- What -->
<section style="margin:0 0 32px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">WHAT IS MBEDITOR</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 14px;">三种模式，一个目标</h2>
  <p style="font-size:15px;color:#5c5650;margin:0 0 20px;">我们相信，好的编辑器应该让创作者忘记工具的存在。无论你习惯写代码、写 Markdown，还是直接拖拽排版——MBEditor 都能让你专注于内容。</p>

  <section style="margin:0 0 12px;padding:18px 20px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;">
    <section style="font-size:14px;font-weight:600;color:#1a1714;margin-bottom:4px;">HTML 模式</section>
    <section style="font-size:13px;color:#8a7e6e;line-height:1.7;">完全掌控每一个像素。HTML / CSS / JS 三栏编辑，实时预览。适合追求极致排版的设计师。</section>
  </section>
  <section style="margin:0 0 12px;padding:18px 20px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;">
    <section style="font-size:14px;font-weight:600;color:#1a1714;margin-bottom:4px;">Markdown 模式</section>
    <section style="font-size:13px;color:#8a7e6e;line-height:1.7;">用最简洁的语法写作，自动转换为精美排版。多种主题可选，让写作回归纯粹。</section>
  </section>
  <section style="margin:0 0 12px;padding:18px 20px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;">
    <section style="font-size:14px;font-weight:600;color:#1a1714;margin-bottom:4px;">可视化编辑</section>
    <section style="font-size:13px;color:#8a7e6e;line-height:1.7;">所见即所得，在预览区直接编辑。插入图片、调整样式，所有变化实时呈现。</section>
  </section>
</section>

<section style="height:1px;background:linear-gradient(90deg,transparent,#d4c9b8,transparent);margin:0 0 32px;"></section>

<!-- HTML Showcase -->
<section style="margin:0 0 32px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">HTML SHOWCASE</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 14px;">纯 HTML 排版效果展示</h2>
  <p style="font-size:15px;color:#5c5650;margin:0 0 24px;">以下所有效果均为纯 inline style 实现，复制到公众号后完美还原，所见即所得。</p>

  <!-- Colored Tags -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">01 / 标签徽章</section>
    <section style="display:flex;flex-wrap:wrap;gap:8px;">
      <section style="display:inline-block;padding:4px 14px;background:#e8553a;color:#fff;border-radius:14px;font-size:12px;font-weight:500;">Hot</section>
      <section style="display:inline-block;padding:4px 14px;background:#1a73e8;color:#fff;border-radius:14px;font-size:12px;font-weight:500;">New</section>
      <section style="display:inline-block;padding:4px 14px;background:#0d9488;color:#fff;border-radius:14px;font-size:12px;font-weight:500;">AI Agent</section>
      <section style="display:inline-block;padding:4px 14px;background:#c4a76c;color:#fff;border-radius:14px;font-size:12px;font-weight:500;">Open Source</section>
      <section style="display:inline-block;padding:4px 14px;background:transparent;color:#8a7e6e;border-radius:14px;font-size:12px;font-weight:500;border:1px solid #d4c9b8;">MIT License</section>
    </section>
  </section>

  <!-- Gradient Card -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">02 / 渐变卡片</section>
    <section style="border-radius:12px;padding:32px 24px;background:linear-gradient(135deg,#1a1714 0%,#3d3730 50%,#5c554c 100%);text-align:center;">
      <section style="font-size:22px;font-weight:700;color:#f0ebe4;margin-bottom:8px;">Write Once, Publish Everywhere</section>
      <section style="font-size:14px;color:#c4b5a0;line-height:1.7;">一次编写，自动处理图片上传、CSS 内联、格式兼容<br/>直接推送到微信公众号草稿箱</section>
    </section>
  </section>

  <!-- Stats Grid -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">03 / 数据看板</section>
    <section style="display:flex;gap:12px;">
      <section style="flex:1;padding:20px 16px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;text-align:center;">
        <section style="font-size:28px;font-weight:700;color:#e8553a;">3</section>
        <section style="font-size:12px;color:#8a7e6e;margin-top:4px;">编辑模式</section>
      </section>
      <section style="flex:1;padding:20px 16px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;text-align:center;">
        <section style="font-size:28px;font-weight:700;color:#c4a76c;">100%</section>
        <section style="font-size:12px;color:#8a7e6e;margin-top:4px;">开源免费</section>
      </section>
      <section style="flex:1;padding:20px 16px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;text-align:center;">
        <section style="font-size:28px;font-weight:700;color:#0d9488;">API</section>
        <section style="font-size:12px;color:#8a7e6e;margin-top:4px;">AI 原生</section>
      </section>
    </section>
  </section>

  <!-- Timeline -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">04 / 时间线</section>
    <section style="padding-left:20px;border-left:2px solid #ece6dd;">
      <section style="position:relative;padding:0 0 20px 20px;">
        <section style="position:absolute;left:-27px;top:2px;width:12px;height:12px;border-radius:50%;background:#e8553a;border:2px solid #fff;"></section>
        <section style="font-size:12px;color:#c4a76c;font-weight:600;margin-bottom:2px;">Step 1 · 创建</section>
        <section style="font-size:14px;color:#5c5650;line-height:1.7;">选择 HTML 或 Markdown 模式，新建一篇文章</section>
      </section>
      <section style="position:relative;padding:0 0 20px 20px;">
        <section style="position:absolute;left:-27px;top:2px;width:12px;height:12px;border-radius:50%;background:#c4a76c;border:2px solid #fff;"></section>
        <section style="font-size:12px;color:#c4a76c;font-weight:600;margin-bottom:2px;">Step 2 · 编辑</section>
        <section style="font-size:14px;color:#5c5650;line-height:1.7;">编写内容、插入图片，实时预览公众号效果</section>
      </section>
      <section style="position:relative;padding:0 0 20px 20px;">
        <section style="position:absolute;left:-27px;top:2px;width:12px;height:12px;border-radius:50%;background:#0d9488;border:2px solid #fff;"></section>
        <section style="font-size:12px;color:#c4a76c;font-weight:600;margin-bottom:2px;">Step 3 · 发布</section>
        <section style="font-size:14px;color:#5c5650;line-height:1.7;">一键复制富文本 或 直接推送到公众号草稿箱</section>
      </section>
    </section>
  </section>

  <!-- Quote Styles -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">05 / 引用样式</section>
    <section style="padding:16px 20px;border-left:3px solid #c4a76c;background:#f7f5f0;border-radius:0 8px 8px 0;margin-bottom:12px;">
      <section style="font-size:14px;color:#6b6158;line-height:1.8;"><strong style="color:#1a1714;">提示：</strong>好的排版不是让文字更花哨，而是让阅读更舒适。MBEditor 的设计理念是「少即是多」。</section>
    </section>
    <section style="padding:16px 20px;background:#faf8f5;border-radius:10px;border:1px solid #ece6dd;position:relative;">
      <section style="font-size:32px;color:#d4c9b8;line-height:1;position:absolute;top:10px;left:16px;">"</section>
      <section style="font-size:14px;color:#5c5650;line-height:1.8;padding-left:24px;font-style:italic;">工具应该隐于无形，让创作者全身心投入到内容本身。</section>
    </section>
  </section>

  <!-- Feature Comparison Table -->
  <section style="margin:0 0 20px;">
    <section style="font-size:12px;color:#b8a99a;margin-bottom:10px;letter-spacing:1px;">06 / 对比表格</section>
    <section style="border-radius:10px;overflow:hidden;border:1px solid #ece6dd;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#3d3730;">
          <td style="padding:12px 16px;color:#f0ebe4;font-weight:600;">特性</td>
          <td style="padding:12px 16px;color:#f0ebe4;font-weight:600;text-align:center;">MBEditor</td>
          <td style="padding:12px 16px;color:#f0ebe4;font-weight:600;text-align:center;">传统编辑器</td>
        </tr>
        <tr style="background:#faf8f5;">
          <td style="padding:10px 16px;color:#5c5650;">AI Agent 支持</td>
          <td style="padding:10px 16px;text-align:center;color:#0d9488;font-weight:600;">✓ 原生 API</td>
          <td style="padding:10px 16px;text-align:center;color:#b8a99a;">✗</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#5c5650;">自定义 HTML</td>
          <td style="padding:10px 16px;text-align:center;color:#0d9488;font-weight:600;">✓ 完全自由</td>
          <td style="padding:10px 16px;text-align:center;color:#b8a99a;">受限</td>
        </tr>
        <tr style="background:#faf8f5;">
          <td style="padding:10px 16px;color:#5c5650;">CLI 自动化</td>
          <td style="padding:10px 16px;text-align:center;color:#0d9488;font-weight:600;">✓ RESTful</td>
          <td style="padding:10px 16px;text-align:center;color:#b8a99a;">✗</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#5c5650;">私有化部署</td>
          <td style="padding:10px 16px;text-align:center;color:#0d9488;font-weight:600;">✓ Docker</td>
          <td style="padding:10px 16px;text-align:center;color:#b8a99a;">SaaS 依赖</td>
        </tr>
        <tr style="background:#faf8f5;">
          <td style="padding:10px 16px;color:#5c5650;">开源</td>
          <td style="padding:10px 16px;text-align:center;color:#0d9488;font-weight:600;">✓ MIT</td>
          <td style="padding:10px 16px;text-align:center;color:#b8a99a;">闭源</td>
        </tr>
      </table>
    </section>
  </section>
</section>

<section style="height:1px;background:linear-gradient(90deg,transparent,#d4c9b8,transparent);margin:0 0 32px;"></section>

<!-- CLI & Agent -->
<section style="margin:0 0 32px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">FOR DEVELOPERS</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 14px;">CLI 和 AI Agent 原生支持</h2>
  <p style="font-size:15px;color:#5c5650;margin:0 0 16px;">MBEditor 提供完整的 RESTful API。你可以用命令行脚本批量生产内容，也可以让 Claude Code 等 AI Agent 全自动完成从写作到发布的全流程。</p>

  <section style="background:#1c1b1a;border-radius:10px;padding:18px 20px;margin:0 0 16px;font-family:'SF Mono',Menlo,Monaco,monospace;font-size:12px;line-height:1.8;color:#a09888;overflow-x:auto;">
    <section style="color:#6b8e6b;"># 创建一篇新文章</section>
    <section>curl -X POST /api/v1/articles \</section>
    <section>&nbsp;&nbsp;-d '{"title":"周报","mode":"html"}'</section>
    <section style="color:#6b8e6b;margin-top:10px;"># 一键推送到公众号草稿箱</section>
    <section>curl -X POST /api/v1/publish \</section>
    <section>&nbsp;&nbsp;-d '{"article_id":"abc123"}'</section>
  </section>

  <section style="padding:14px 18px;background:#f7f5f0;border-left:3px solid #c4a76c;border-radius:0 8px 8px 0;font-size:13px;color:#6b6158;line-height:1.7;">
    <strong style="color:#1a1714;">工作流示例：</strong>Claude Code 读取需求 → 调用 API 创建文章 → 生成 HTML 内容 → 上传图片 → 一键发布。全程零人工干预。
  </section>
</section>

<section style="height:1px;background:linear-gradient(90deg,transparent,#d4c9b8,transparent);margin:0 0 32px;"></section>

<!-- Quick Start -->
<section style="margin:0 0 32px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">QUICK START</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 14px;">三行命令，开始使用</h2>
  <section style="background:#1c1b1a;border-radius:10px;padding:18px 20px;font-family:'SF Mono',Menlo,Monaco,monospace;font-size:12px;line-height:2;color:#a09888;overflow-x:auto;">
    <section>git clone github.com/.../MBEditor</section>
    <section>cd MBEditor</section>
    <section>docker compose up -d</section>
    <section style="color:#6b8e6b;"># 访问 localhost:7073</section>
  </section>
</section>

<!-- Footer -->
<section style="text-align:center;padding:24px 0 8px;">
  <section style="display:inline-block;width:40px;height:1px;background:#d4c9b8;margin-bottom:16px;"></section>
  <p style="font-size:12px;color:#b8a99a;margin:0;letter-spacing:1px;">MBEditor · Open Source · MIT License</p>
</section>

</section>`;

const SAMPLE_CSS = `/* MBEditor 示例样式 */

/* 代码块选中色 */
::selection { background: rgba(196,167,108,0.2); }

/* 链接样式 */
a { color: #c4a76c; text-decoration: none; border-bottom: 1px solid rgba(196,167,108,0.3); }`;

const SAMPLE_JS = `// MBEditor 示例脚本 — 仅用于本地预览增强（微信公众号不支持 JS）

(function() {
  // 阅读进度条 — 暖金色细线
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;height:2px;background:#c4a76c;z-index:9999;transition:width 0.15s;width:0;';
  document.body.appendChild(bar);
  window.addEventListener('scroll', function() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = h > 0 ? (window.scrollY / h * 100) + '%' : '0';
  });
})();`;

const CB = "```";  // code block fence
const SAMPLE_MARKDOWN = [
  "# MBEditor 功能全览",
  "",
  "> **MBEditor** —— 首款支持 AI Agent 直接使用的微信公众号编辑器，让内容创作自动化成为现实。",
  "",
  "---",
  "",
  "## 什么是 MBEditor？",
  "",
  "MBEditor 是一款开源的微信公众号编辑器，专为 **AI Agent** 和 **CLI 自动化** 设计。它不仅是一个编辑工具，更是公众号内容生产的自动化平台。",
  "",
  "### 核心特性",
  "",
  "| 功能 | 说明 |",
  "|------|------|",
  "| **三种编辑模式** | HTML / Markdown / 可视化编辑 |",
  "| **CLI 集成** | RESTful API，命令行直接操作 |",
  "| **AI Agent** | Claude Code / GPT 等 Agent 直接调用 |",
  "| **一键发布** | 推送公众号草稿箱，自动处理图片 |",
  "| **HTML 排版** | 纯 inline style 丰富组件 |",
  "| **主题系统** | 多种排版主题可选 |",
  "",
  "---",
  "",
  "## CLI & AI Agent 集成",
  "",
  "MBEditor 提供完整的 RESTful API，AI Agent 可以直接调用完成全部操作：",
  "",
  CB + "bash",
  "# 创建文章",
  'curl -X POST http://localhost:7072/api/v1/articles \\',
  '  -H "Content-Type: application/json" \\',
  '  -d \'{"title": "AI 生成的文章", "mode": "markdown"}\'',
  "",
  "# 更新内容",
  "curl -X PUT http://localhost:7072/api/v1/articles/{id} \\",
  '  -d \'{"markdown": "# Hello World"}\'',
  "",
  "# 一键发布到公众号",
  "curl -X POST http://localhost:7072/api/v1/publish \\",
  '  -d \'{"article_id": "abc123"}\'',
  CB,
  "",
  "> **提示：** Claude Code 可以通过 MBEditor 的 API 完成文章创建、编辑、图片上传、一键发布等全部操作，无需人工介入。",
  "",
  "---",
  "",
  "## Markdown 格式示例",
  "",
  "### 文字样式",
  "",
  "这是一段包含 **粗体**、*斜体*、`行内代码` 的文字。Markdown 模式会自动将这些语法转换为微信公众号兼容的样式。",
  "",
  "### 引用",
  "",
  "> 好的工具不是替代创作者，而是解放创作者。MBEditor 让你专注于内容本身，排版交给自动化。",
  "",
  "### 有序列表",
  "",
  "1. 选择编辑模式（HTML / Markdown / 可视化）",
  "2. 编写或粘贴内容",
  "3. 选择排版主题",
  "4. 预览效果",
  "5. 一键推送到公众号",
  "",
  "### 无序列表",
  "",
  "- 支持图片上传和管理",
  "- 支持自定义 HTML 排版组件",
  "- 支持深色/浅色主题",
  "- 支持 Docker 一键部署",
  "- 完全开源，MIT 协议",
  "",
  "### 代码块",
  "",
  CB + "python",
  "import requests",
  "",
  "# 用 Python 脚本自动化公众号发布",
  "def publish_article(title, content):",
  '    api = "http://localhost:7072/api/v1"',
  "    # 创建文章",
  '    res = requests.post(f"{api}/articles", json={',
  '        "title": title, "mode": "html"',
  "    })",
  '    article_id = res.json()["data"]["id"]',
  "    # 更新内容",
  '    requests.put(f"{api}/articles/{article_id}", json={',
  '        "html": content',
  "    })",
  "    # 发布",
  '    requests.post(f"{api}/publish", json={',
  '        "article_id": article_id',
  "    })",
  '    print(f"Article published: {title}")',
  CB,
  "",
  "### 嵌套格式",
  "",
  "MBEditor 支持以下 **高级功能**：",
  "",
  "1. **排版组件**",
  "   - 标签徽章",
  "   - 渐变卡片",
  "   - 数据看板",
  "   - 时间线",
  "   - 引用样式",
  "   - 对比表格",
  "",
  "2. **发布选项**",
  "   - 自动上传本地图片到微信",
  "   - 自动生成文章封面",
  "   - 支持设置作者和摘要",
  "",
  "---",
  "",
  "## HTML 排版组件",
  "",
  "MBEditor 的 HTML 模式支持丰富的纯 inline style 排版组件：",
  "",
  "1. **标签徽章** — 彩色圆角标签，适合分类标记",
  "2. **渐变卡片** — 深色渐变背景 + 亮色文字，适合重点强调",
  "3. **数据看板** — 多列数字统计展示",
  "4. **时间线** — 带节点的步骤流程图",
  "5. **引用样式** — 侧边线引用 + 装饰引号",
  "6. **对比表格** — 功能对比矩阵，适合产品介绍",
  "",
  "> 所有排版组件使用纯 inline style，复制到公众号后完美还原，无需额外处理。",
  "",
  "---",
  "",
  "## 快速开始",
  "",
  CB + "bash",
  "# 克隆项目",
  "git clone https://github.com/AAAAnson/MBEditor.git",
  "cd MBEditor",
  "",
  "# Docker 一键启动",
  "docker compose up -d",
  "",
  "# 访问",
  "# 前端: http://localhost:7073",
  "# API:  http://localhost:7072",
  CB,
  "",
  "---",
  "",
  "*Powered by MBEditor · 首款 AI Agent 友好的公众号编辑器*",
].join("\n");

export default function ArticleList() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [sortBy, setSortBy] = useState<"updated" | "created">("updated");
  // hoveredId removed — delete button now uses CSS group-hover for better touch device support
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("全部文章");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/articles").then((res) => {
      if (res.data.code === 0) setArticles(res.data.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createArticle = async (
    mode: "html" | "markdown" = "html",
    title = "未命名文章",
    content?: { html?: string; css?: string; js?: string; markdown?: string },
    shouldNavigate = true,
  ) => {
    try {
      const res = await api.post("/articles", { title, mode });
      if (res.data.code === 0) {
        const id = res.data.data.id;
        if (content) {
          await api.put(`/articles/${id}`, content);
        }
        if (shouldNavigate) navigate(`/editor/${id}`);
        return id;
      }
    } catch {
      toast.error("创建失败", "无法创建文章，请稍后重试");
    }
    return null;
  };

  const createSamples = async () => {
    try {
      await createArticle("markdown", "MBEditor Markdown 示例", { markdown: SAMPLE_MARKDOWN }, false);
      await createArticle("html", "MBEditor HTML 示例", { html: SAMPLE_HTML, css: SAMPLE_CSS, js: SAMPLE_JS }, true);
    } catch {
      toast.error("创建失败", "无法创建示例文章");
    }
  };

  const createBlank = () => {
    createArticle("html");
  };

  const deleteArticle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/articles/${id}`);
      toast.success("已删除", "文章已成功删除");
      load();
    } catch {
      toast.error("删除失败");
    }
  };

  const sorted = [...articles].sort((a, b) => {
    const key = sortBy === "updated" ? "updated_at" : "created_at";
    return new Date(b[key]).getTime() - new Date(a[key]).getTime();
  });

  const filtered = sorted.filter(a =>
    !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header - always shown */}
      <ArticleListHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateNew={createBlank}
      />

      {/* Body */}
      {!loading && articles.length === 0 ? (
        <EmptyState onCreateSample={createSamples} onCreateBlank={createBlank} />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="px-12 py-8">
            {/* Stats row */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-[13px] text-fg-muted">
                共 {filtered.length} 篇文章
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-fg-muted">排序:</span>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "updated" | "created")}
                    className="appearance-none bg-surface-secondary border border-border-secondary rounded-md px-2.5 py-1 pr-7 text-[12px] text-fg-secondary cursor-pointer focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="updated">最近修改</option>
                    <option value="created">最近创建</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Card grid */}
            {loading ? (
              <div className="grid grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-5">
                {filtered.map((a, i) => (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/editor/${a.id}`)}
                    className="relative bg-surface-secondary rounded-xl border border-border-primary cursor-pointer hover:border-border-secondary transition-all group overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                  >
                    {/* Cover */}
                    <div
                      className="h-[140px] relative flex items-end p-3.5"
                      style={{ background: COVER_GRADIENTS[i % COVER_GRADIENTS.length] }}
                    >
                      <h3 className="text-white font-bold text-[14px] leading-snug line-clamp-2 drop-shadow-sm">
                        {a.title || "未命名文章"}
                      </h3>
                    </div>

                    {/* Body */}
                    <div className="p-3.5 flex flex-col gap-2">
                      <div className="text-[13px] font-semibold text-fg-primary truncate">
                        {a.title || "未命名文章"}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-fg-muted">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          a.mode === "markdown"
                            ? "bg-accent-bg text-accent"
                            : "bg-info-bg text-info"
                        }`}>
                          {a.mode}
                        </span>
                        <span>
                          {new Date(a.updated_at).toLocaleString("zh-CN", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-bg text-warning">
                          草稿
                        </span>
                      </div>
                    </div>

                    {/* Delete button — visible on hover (desktop) or always visible (touch) */}
                    <button
                      onClick={(e) => deleteArticle(a.id, e)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-fg-muted hover:text-accent transition-all opacity-0 group-hover:opacity-100 touch-device:opacity-100 [@media(hover:none)]:opacity-70"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {/* New article card */}
                <div
                  onClick={createBlank}
                  className="flex flex-col items-center justify-center h-[264px] rounded-xl border border-border-secondary hover:border-fg-muted cursor-pointer transition-colors group"
                >
                  <Plus size={28} className="text-fg-muted group-hover:text-fg-secondary transition-colors mb-2" />
                  <span className="text-[13px] text-fg-muted group-hover:text-fg-secondary transition-colors">
                    新建文章
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
