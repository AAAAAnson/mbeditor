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

const SAMPLE_HTML = `<section style="max-width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;line-height:1.8;">

<section style="text-align:center;padding:32px 0 16px;">
  <h1 style="font-size:28px;font-weight:bold;margin:0 0 8px;color:#1a1a1a;">MBEditor 功能全览</h1>
  <p style="font-size:15px;color:#888;margin:0;">首款支持 AI Agent 直接使用的微信公众号编辑器</p>
</section>

<section style="background:linear-gradient(135deg,#E8553A,#C9923E);border-radius:12px;padding:24px;margin:16px 0;color:#fff;">
  <h2 style="font-size:20px;margin:0 0 12px;color:#fff;">🚀 为什么选择 MBEditor？</h2>
  <p style="margin:0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.95);">MBEditor 不只是编辑器——它是公众号内容生产的自动化平台。支持 <strong>CLI 命令行</strong>操作，可直接对接 <strong>AI Agent</strong>（如 Claude Code、GPT Agent），实现从内容生成到排版发布的全链路自动化。</p>
</section>

<h2 style="font-size:20px;font-weight:bold;margin:24px 0 12px;color:#1a1a1a;border-bottom:2px solid #E8553A;padding-bottom:6px;">📋 三种编辑模式</h2>

<section style="display:flex;gap:12px;margin:16px 0;">
  <section style="flex:1;background:#f8f9fa;border-radius:8px;padding:16px;border-left:4px solid #E8553A;">
    <h3 style="font-size:16px;margin:0 0 6px;color:#E8553A;">HTML 模式</h3>
    <p style="margin:0;font-size:14px;color:#555;">直接编辑 HTML/CSS/JS，完全掌控排版。支持代码高亮、实时预览、智能提取。</p>
  </section>
  <section style="flex:1;background:#f8f9fa;border-radius:8px;padding:16px;border-left:4px solid #2c3e50;">
    <h3 style="font-size:16px;margin:0 0 6px;color:#2c3e50;">Markdown 模式</h3>
    <p style="margin:0;font-size:14px;color:#555;">用 Markdown 写作，自动转换为精美排版。多种主题可选，专注内容创作。</p>
  </section>
  <section style="flex:1;background:#f8f9fa;border-radius:8px;padding:16px;border-left:4px solid #27ae60;">
    <h3 style="font-size:16px;margin:0 0 6px;color:#27ae60;">可视化编辑</h3>
    <p style="margin:0;font-size:14px;color:#555;">所见即所得，在预览区直接编辑内容，拖拽组件，实时查看效果。</p>
  </section>
</section>

<h2 style="font-size:20px;font-weight:bold;margin:24px 0 12px;color:#1a1a1a;border-bottom:2px solid #E8553A;padding-bottom:6px;">🤖 CLI & Agent 集成</h2>

<section style="background:#1e1e1e;border-radius:8px;padding:16px;margin:16px 0;font-family:Menlo,Monaco,monospace;font-size:13px;line-height:1.6;color:#abb2bf;overflow-x:auto;">
<span style="color:#c678dd;"># 通过 CLI 创建文章</span><br/>
<span style="color:#98c379;">$</span> curl -X POST http://localhost:7072/api/v1/articles \\<br/>
&nbsp;&nbsp;-H "Content-Type: application/json" \\<br/>
&nbsp;&nbsp;-d '{"title": "AI 生成的文章", "mode": "html"}'<br/><br/>
<span style="color:#c678dd;"># Agent 直接推送到公众号</span><br/>
<span style="color:#98c379;">$</span> curl -X POST http://localhost:7072/api/v1/publish \\<br/>
&nbsp;&nbsp;-d '{"article_id": "abc123"}'
</section>

<section style="background:#fffbf0;border:1px solid #f0e4c8;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;font-size:14px;color:#8a6d3b;">💡 <strong>提示：</strong>MBEditor 的 RESTful API 设计对 AI Agent 非常友好。Claude Code 可以直接调用 API 完成文章创建、编辑、图片上传、一键发布等全部操作，无需人工介入。</p>
</section>

<h2 style="font-size:20px;font-weight:bold;margin:24px 0 12px;color:#1a1a1a;border-bottom:2px solid #E8553A;padding-bottom:6px;">🎨 SVG 交互组件展示</h2>
<p style="font-size:15px;color:#555;margin:0 0 16px;">以下是 MBEditor 内置的全部 SVG 交互模板，所有效果均为纯 CSS 实现，无需 JavaScript，完美兼容微信公众号。</p>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">1. 点击展开/收起</h3>
<section style="margin:16px 0;">
<style>
  #accS1:checked ~ .acc-bodyS1 { max-height:800px; opacity:1; }
  #accS1:checked ~ .acc-lblS1 .acc-arrowS1 { transform:rotate(180deg); }
  .acc-bodyS1 { max-height:0; opacity:0; overflow:hidden; transition:max-height 0.4s ease, opacity 0.3s ease; }
  .acc-arrowS1 { transition:transform 0.3s ease; display:inline-block; }
</style>
<input type="checkbox" id="accS1" style="display:none;" />
<label for="accS1" class="acc-lblS1" style="display:block;padding:12px 16px;background:#e8784a;color:#fff;font-size:16px;font-weight:bold;border-radius:6px 6px 0 0;cursor:pointer;">
  MBEditor 的核心优势是什么？ <span class="acc-arrowS1" style="float:right;">▼</span>
</label>
<section class="acc-bodyS1" style="background:#f5f5f5;padding:0 16px;border-radius:0 0 6px 6px;border:1px solid #e8784a;border-top:none;">
  <section style="padding:12px 0;font-size:14px;line-height:1.8;color:#333;">MBEditor 的核心优势在于：1）完整的 RESTful API，AI Agent 可直接调用；2）三种编辑模式灵活切换；3）内置丰富的交互组件；4）一键推送公众号草稿箱，自动处理图片上传。</section>
</section>
</section>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">2. 内容前后对比</h3>
<section style="margin:16px 0;position:relative;">
<style>
  #baS2:checked ~ .ba-wrapS2 .ba-afterS2 { opacity:1; }
  #baS2:checked ~ .ba-wrapS2 .ba-beforeS2 { opacity:0; }
  #baS2:checked ~ .ba-btnS2 { background:#2c3e50; }
  .ba-beforeS2, .ba-afterS2 { transition:opacity 0.5s ease; }
  .ba-afterS2 { opacity:0; position:absolute; top:0; left:0; width:100%; height:100%; }
</style>
<input type="checkbox" id="baS2" style="display:none;" />
<section class="ba-wrapS2" style="position:relative;overflow:hidden;border-radius:8px;">
  <section class="ba-beforeS2" style="background:#eee8e0;padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#333;">传统编辑器：手动排版 → 复制粘贴 → 反复调整</section>
  <section class="ba-afterS2" style="background:#2c3e50;padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#fff;display:flex;align-items:center;justify-content:center;">MBEditor：AI 生成 → 一键排版 → 直接发布 ✨</section>
</section>
<label for="baS2" class="ba-btnS2" style="display:block;margin-top:8px;padding:8px 0;text-align:center;background:#e8784a;color:#fff;font-size:14px;border-radius:6px;cursor:pointer;transition:background 0.3s;">点击对比</label>
</section>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">3. 翻牌效果</h3>
<section style="margin:16px auto;perspective:800px;width:300px;max-width:100%;">
<style>
  #flipS3:checked ~ .flip-innerS3 { transform:rotateY(180deg); }
  .flip-innerS3 { position:relative;width:100%;height:200px;transition:transform 0.6s;transform-style:preserve-3d; }
  .flip-frontS3, .flip-backS3 { position:absolute;width:100%;height:100%;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:16px;line-height:1.6;padding:16px;box-sizing:border-box;text-align:center;color:#fff; }
  .flip-backS3 { transform:rotateY(180deg); }
</style>
<input type="checkbox" id="flipS3" style="display:none;" />
<label for="flipS3" style="display:block;cursor:pointer;">
  <section class="flip-innerS3">
    <section class="flip-frontS3" style="background:#e8784a;">👆 点我翻转</section>
    <section class="flip-backS3" style="background:#2c3e50;">🎉 MBEditor 让排版变简单</section>
  </section>
</label>
</section>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">4. 多页轮播</h3>
<section style="margin:16px 0;overflow:hidden;border-radius:8px;">
<style>
  .car-trackS4 { display:flex;transition:transform 0.4s ease;width:300%; }
  .car-slideS4 { width:33.333%;flex-shrink:0; }
  #car1S4:checked ~ .car-wrapS4 .car-trackS4 { transform:translateX(0); }
  #car2S4:checked ~ .car-wrapS4 .car-trackS4 { transform:translateX(-33.333%); }
  #car3S4:checked ~ .car-wrapS4 .car-trackS4 { transform:translateX(-66.666%); }
  .car-dotsS4 label { display:inline-block;width:10px;height:10px;border-radius:50%;background:#ccc;margin:0 4px;cursor:pointer;transition:background 0.3s; }
  #car1S4:checked ~ .car-dotsS4 label[for="car1S4"],
  #car2S4:checked ~ .car-dotsS4 label[for="car2S4"],
  #car3S4:checked ~ .car-dotsS4 label[for="car3S4"] { background:#e8784a; }
</style>
<input type="radio" name="carS4" id="car1S4" checked style="display:none;" />
<input type="radio" name="carS4" id="car2S4" style="display:none;" />
<input type="radio" name="carS4" id="car3S4" style="display:none;" />
<section class="car-wrapS4" style="overflow:hidden;">
  <section class="car-trackS4">
    <section class="car-slideS4"><section style="padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#fff;min-height:120px;display:flex;align-items:center;justify-content:center;background:#e8784a;">📝 第一步：创建文章</section></section>
    <section class="car-slideS4"><section style="padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#fff;min-height:120px;display:flex;align-items:center;justify-content:center;background:#2c3e50;">🎨 第二步：排版设计</section></section>
    <section class="car-slideS4"><section style="padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#fff;min-height:120px;display:flex;align-items:center;justify-content:center;background:#27ae60;">🚀 第三步：一键发布</section></section>
  </section>
</section>
<section class="car-dotsS4" style="text-align:center;padding:10px 0;">
  <label for="car1S4"></label>
  <label for="car2S4"></label>
  <label for="car3S4"></label>
</section>
</section>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">5. 渐显文字</h3>
<section style="margin:16px 0;">
<style>
  @keyframes fadeInS5 { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  .fi-lineS5 { opacity:0; animation:fadeInS5 0.6s ease forwards; font-size:18px; line-height:2; color:#333; }
</style>
<section class="fi-lineS5" style="animation-delay:0s;">✅ 支持 AI Agent 自动化操作</section>
<section class="fi-lineS5" style="animation-delay:0.5s;">✅ 内置 6 种交互模板组件</section>
<section class="fi-lineS5" style="animation-delay:1s;">✅ 一键推送微信公众号</section>
</section>

<h3 style="font-size:16px;margin:20px 0 8px;color:#E8553A;">6. 长按显示</h3>
<section style="margin:16px 0;">
<style>
  .pr-wrapS6 { position:relative;padding:24px 16px;background:#f0f0f0;border-radius:8px;text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none; }
  .pr-coverS6 { font-size:16px;color:#999;transition:opacity 0.3s; }
  .pr-hiddenS6 { position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-size:15px;line-height:1.8;color:#333;opacity:0;transition:opacity 0.3s; }
  .pr-wrapS6:active .pr-coverS6 { opacity:0; }
  .pr-wrapS6:active .pr-hiddenS6 { opacity:1; }
</style>
<section class="pr-wrapS6">
  <section class="pr-coverS6">👆 长按这里查看隐藏内容</section>
  <section class="pr-hiddenS6">🎉 恭喜发现彩蛋！MBEditor 让公众号排版更有趣！</section>
</section>
</section>

<section style="background:#f8f9fa;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
  <p style="font-size:15px;color:#555;margin:0 0 4px;">以上所有交互效果均为纯 CSS 实现，无需 JS</p>
  <p style="font-size:15px;color:#555;margin:0;">完美兼容微信公众号内置浏览器 ✨</p>
</section>

<section style="text-align:center;padding:16px 0;border-top:1px solid #eee;margin-top:24px;">
  <p style="font-size:13px;color:#999;margin:0;">Powered by MBEditor · 首款 AI Agent 友好的公众号编辑器</p>
</section>

</section>`;

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
  "| **交互组件** | 6 种纯 CSS 交互模板 |",
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
  "- 支持 SVG 交互组件",
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
  "1. **交互组件**",
  "   - 手风琴（展开/收起）",
  "   - 翻牌效果",
  "   - 轮播卡片",
  "   - 渐显文字",
  "   - 长按显示",
  "   - 前后对比",
  "",
  "2. **发布选项**",
  "   - 自动上传本地图片到微信",
  "   - 自动生成文章封面",
  "   - 支持设置作者和摘要",
  "",
  "---",
  "",
  "## SVG 交互组件",
  "",
  "MBEditor 内置 **6 种交互模板**，全部基于纯 CSS 实现：",
  "",
  "1. **点击展开/收起** — 手风琴效果，适合 FAQ 类内容",
  "2. **前后对比** — 切换展示两段内容，适合效果对比",
  "3. **翻牌效果** — 卡片翻转，适合知识点展示",
  "4. **多页轮播** — 指示器切换卡片，适合分步说明",
  "5. **渐显文字** — 文字逐行淡入，适合重点强调",
  "6. **长按显示** — 长按查看隐藏内容，增加趣味性",
  "",
  "> 这些交互组件可以在左侧「SVG 交互模板」面板中直接插入，支持自定义文字、颜色等参数。",
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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
    content?: { html?: string; markdown?: string },
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
      await createArticle("html", "MBEditor HTML 示例", { html: SAMPLE_HTML }, true);
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
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
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

                    {/* Delete button (hover) */}
                    {hoveredId === a.id && (
                      <button
                        onClick={(e) => deleteArticle(a.id, e)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-fg-muted hover:text-accent transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
