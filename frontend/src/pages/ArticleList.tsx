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

<!-- Interactive Templates -->
<section style="margin:0 0 24px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">INTERACTIVE COMPONENTS</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 8px;">六种交互模板</h2>
  <p style="font-size:14px;color:#8a7e6e;margin:0 0 24px;">所有效果基于纯 CSS 实现，无需 JavaScript，完美兼容微信内置浏览器。点击下方组件亲自体验。</p>
</section>

<!-- 1. Accordion -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">01 / 展开收起</section>
  <section contenteditable="false" style="margin:0;">
    <style>
      #accS1:checked ~ .acc-bodyS1 { max-height:800px; opacity:1; }
      #accS1:checked ~ .acc-lblS1 .acc-arrowS1 { transform:rotate(180deg); }
      .acc-bodyS1 { max-height:0; opacity:0; overflow:hidden; transition:max-height 0.4s ease, opacity 0.3s ease; }
      .acc-arrowS1 { transition:transform 0.3s ease; display:inline-block; }
    </style>
    <input type="checkbox" id="accS1" style="display:none;" />
    <label for="accS1" class="acc-lblS1" style="display:block;padding:14px 18px;background:#3d3730;color:#f0ebe4;font-size:15px;font-weight:500;border-radius:8px 8px 0 0;cursor:pointer;">
      MBEditor 的核心优势是什么？ <span class="acc-arrowS1" style="float:right;">▾</span>
    </label>
    <section class="acc-bodyS1" style="background:#faf8f5;padding:0 18px;border-radius:0 0 8px 8px;border:1px solid #e8e2d9;border-top:none;">
      <section style="padding:14px 0;font-size:14px;line-height:1.9;color:#5c5650;">完整的 RESTful API 让 AI Agent 可直接调用；三种编辑模式灵活适配不同场景；内置交互组件让排版更生动；一键推送公众号草稿箱，图片自动上传处理。</section>
    </section>
  </section>
</section>

<!-- 2. Before/After -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">02 / 前后对比</section>
  <section contenteditable="false" style="margin:0;position:relative;">
    <style>
      #baS2:checked ~ .ba-wrapS2 .ba-afterS2 { opacity:1; }
      #baS2:checked ~ .ba-wrapS2 .ba-beforeS2 { opacity:0; }
      #baS2:checked ~ .ba-btnS2 { background:#3d3730; }
      .ba-beforeS2, .ba-afterS2 { transition:opacity 0.5s ease; }
      .ba-afterS2 { opacity:0; position:absolute; top:0; left:0; width:100%; height:100%; }
    </style>
    <input type="checkbox" id="baS2" style="display:none;" />
    <section class="ba-wrapS2" style="position:relative;overflow:hidden;border-radius:8px;">
      <section class="ba-beforeS2" style="background:#f0ebe4;padding:36px 24px;text-align:center;font-size:16px;font-weight:500;color:#5c5650;">手动排版 · 反复调整 · 复制粘贴</section>
      <section class="ba-afterS2" style="background:#3d3730;padding:36px 24px;text-align:center;font-size:16px;font-weight:500;color:#f0ebe4;display:flex;align-items:center;justify-content:center;">AI 生成 · 一键排版 · 直接发布</section>
    </section>
    <label for="baS2" class="ba-btnS2" style="display:block;margin-top:8px;padding:10px 0;text-align:center;background:#c4a76c;color:#fff;font-size:13px;font-weight:500;border-radius:8px;cursor:pointer;transition:background 0.3s;letter-spacing:1px;">点击切换对比</label>
  </section>
</section>

<!-- 3. Flip Card -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">03 / 翻牌卡片</section>
  <section contenteditable="false" style="margin:0 auto;perspective:800px;width:280px;max-width:100%;position:relative;">
    <style>
      #flipS3:checked ~ .flip-innerS3 { transform:rotateY(180deg); }
      .flip-innerS3 { position:relative;width:100%;height:180px;transition:transform 0.6s;transform-style:preserve-3d;cursor:pointer; }
      .flip-frontS3, .flip-backS3 { position:absolute;width:100%;height:100%;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:15px;line-height:1.6;padding:20px;box-sizing:border-box;text-align:center; }
      .flip-backS3 { transform:rotateY(180deg); }
    </style>
    <input type="checkbox" id="flipS3" style="display:none;" />
    <label for="flipS3" style="display:block;position:absolute;width:100%;height:180px;cursor:pointer;z-index:2;"></label>
    <section class="flip-innerS3">
      <section class="flip-frontS3" style="background:#3d3730;color:#f0ebe4;">点击卡片<br/>查看背面</section>
      <section class="flip-backS3" style="background:linear-gradient(135deg,#c4a76c,#a08850);color:#fff;">MBEditor<br/>让排版更优雅</section>
    </section>
  </section>
</section>

<!-- 4. Carousel -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">04 / 滑动轮播</section>
  <section contenteditable="false" style="margin:0;border-radius:10px;overflow:hidden;">
    <style>
      .car-trackS4 { display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;scroll-behavior:smooth; }
      .car-trackS4::-webkit-scrollbar { display:none; }
      .car-dotsS4 label { display:inline-block;width:8px;height:8px;border-radius:50%;background:#d4c9b8;margin:0 4px;cursor:pointer;transition:background 0.3s; }
      #car1S4:checked ~ .car-dotsS4 label[for="car1S4"],
      #car2S4:checked ~ .car-dotsS4 label[for="car2S4"],
      #car3S4:checked ~ .car-dotsS4 label[for="car3S4"] { background:#3d3730; }
    </style>
    <input type="radio" name="carS4" id="car1S4" checked style="display:none;" />
    <input type="radio" name="carS4" id="car2S4" style="display:none;" />
    <input type="radio" name="carS4" id="car3S4" style="display:none;" />
    <section class="car-trackS4" id="carTrackS4">
      <section id="carSlide1S4" style="scroll-snap-align:start;flex-shrink:0;width:100%;box-sizing:border-box;padding:36px 24px;text-align:center;font-size:16px;font-weight:500;color:#f0ebe4;min-height:130px;display:flex;align-items:center;justify-content:center;background:#3d3730;">创建 — 选择模式，开始写作</section>
      <section id="carSlide2S4" style="scroll-snap-align:start;flex-shrink:0;width:100%;box-sizing:border-box;padding:36px 24px;text-align:center;font-size:16px;font-weight:500;color:#f0ebe4;min-height:130px;display:flex;align-items:center;justify-content:center;background:#5c554c;">排版 — 选择主题，插入组件</section>
      <section id="carSlide3S4" style="scroll-snap-align:start;flex-shrink:0;width:100%;box-sizing:border-box;padding:36px 24px;text-align:center;font-size:16px;font-weight:500;color:#f0ebe4;min-height:130px;display:flex;align-items:center;justify-content:center;background:#c4a76c;">发布 — 一键推送到公众号</section>
    </section>
    <section class="car-dotsS4" style="text-align:center;padding:12px 0;background:#faf8f5;">
      <label for="car1S4" onclick="document.getElementById('carSlide1S4').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
      <label for="car2S4" onclick="document.getElementById('carSlide2S4').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
      <label for="car3S4" onclick="document.getElementById('carSlide3S4').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
    </section>
  </section>
</section>

<!-- 5. Fade-in Text -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">05 / 渐显文字</section>
  <section contenteditable="false" style="margin:0;padding:20px 0;" id="fiWrapS5">
    <style>
      @keyframes fadeInS5 { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      .fi-lineS5 { opacity:0; font-size:16px; line-height:2.2; color:#3d3730; }
      .fi-lineS5.fi-visibleS5 { animation:fadeInS5 0.6s ease forwards; }
    </style>
    <section class="fi-lineS5" style="animation-delay:0s;">API 驱动，天然适配 AI Agent</section>
    <section class="fi-lineS5" style="animation-delay:0.4s;">六种交互模板，纯 CSS 实现</section>
    <section class="fi-lineS5" style="animation-delay:0.8s;">一键发布，图片自动上传</section>
    <script>
    (function(){
      var w=document.getElementById('fiWrapS5');if(!w)return;
      var l=w.querySelectorAll('.fi-lineS5');
      if('IntersectionObserver' in window){
        new IntersectionObserver(function(e,o){e.forEach(function(x){if(x.isIntersecting){l.forEach(function(i){i.classList.add('fi-visibleS5')});o.disconnect();}});},{threshold:0.2}).observe(w);
      } else { l.forEach(function(i){i.classList.add('fi-visibleS5')}); }
    })();
    <\/script>
  </section>
</section>

<!-- 6. Press Reveal -->
<section style="margin:0 0 28px;">
  <section style="font-size:12px;color:#b8a99a;margin-bottom:8px;letter-spacing:1px;">06 / 长按揭秘</section>
  <section contenteditable="false" style="margin:0;">
    <style>
      .pr-wrapS6 { position:relative;padding:28px 20px;background:#faf8f5;border:1px solid #e8e2d9;border-radius:10px;text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none; }
      .pr-coverS6 { font-size:14px;color:#b8a99a;transition:opacity 0.3s; }
      .pr-hiddenS6 { position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-size:14px;line-height:1.8;color:#3d3730;opacity:0;transition:opacity 0.3s;background:#faf8f5;border-radius:10px; }
      .pr-wrapS6:active .pr-coverS6 { opacity:0; }
      .pr-wrapS6:active .pr-hiddenS6 { opacity:1; }
    </style>
    <section class="pr-wrapS6">
      <section class="pr-coverS6">长按此处，查看隐藏内容</section>
      <section class="pr-hiddenS6">MBEditor 完全开源，MIT 协议发布</section>
    </section>
  </section>
</section>

<section style="height:1px;background:linear-gradient(90deg,transparent,#d4c9b8,transparent);margin:8px 0 24px;"></section>

<!-- Quick Start -->
<section style="margin:0 0 32px;">
  <section style="font-size:11px;color:#b8a99a;letter-spacing:3px;margin-bottom:8px;">QUICK START</section>
  <h2 style="font-size:20px;font-weight:600;color:#1a1714;margin:0 0 14px;">三行命令，开始使用</h2>
  <section style="background:#1c1b1a;border-radius:10px;padding:18px 20px;font-family:'SF Mono',Menlo,Monaco,monospace;font-size:12px;line-height:2;color:#a09888;overflow-x:auto;">
    <section>git clone https://github.com/AAAAnson/MBEditor.git</section>
    <section>cd MBEditor && docker compose up -d</section>
    <section style="color:#6b8e6b;"># 打开 http://localhost:7073 开始创作</section>
  </section>
</section>

<!-- Footer -->
<section style="text-align:center;padding:24px 0 8px;">
  <section style="display:inline-block;width:40px;height:1px;background:#d4c9b8;margin-bottom:16px;"></section>
  <p style="font-size:12px;color:#b8a99a;margin:0;letter-spacing:1px;">MBEditor · Open Source · MIT License</p>
</section>

</section>`;

const SAMPLE_CSS = `/* MBEditor 示例样式 — 注入到预览 <style> */

/* 卡片 hover 微动效 */
section[style*="faf8f5"][style*="border-radius:10px"] {
  transition: box-shadow 0.2s ease;
}
section[style*="faf8f5"][style*="border-radius:10px"]:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

/* 代码块选中色 */
::selection { background: rgba(196,167,108,0.2); }

/* 链接样式 */
a { color: #c4a76c; text-decoration: none; border-bottom: 1px solid rgba(196,167,108,0.3); }
a:hover { border-bottom-color: #c4a76c; }`;

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
