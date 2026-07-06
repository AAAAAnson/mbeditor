// 五个微信 SVG 模板的静态元数据 + 原始 HTML。
//
// 模板 HTML 通过 Vite `?raw` import 以字符串形式打包进前端 bundle，不走任何
// 网络请求。源文件维护在 docs/wechat-svg/templates/，发布时镜像到本目录的
// templates/ 子文件夹——前端 Docker build context 只覆盖 frontend/，无法跨
// 仓库跨界引用。元数据 (title / mode / topic / wordCount) 与 docs 下的
// README.md 保持一致，preview 则从每个模板的第一段正文文案中截取 (4 行内)。
//
// 维护规则：
//  - README.md 改了字数/选题/模式 → 同步改本文件
//  - 模板文件本身改了第一段 hook 段落 → 同步改 preview
//  - 新增模板 → 同步加 entry + 镜像到 ./templates/；不要删 filename 字段
//  - docs/wechat-svg/templates/*.html 改了 → 重跑 scripts/sync_template_mirror
//    或手动 cp 一份到 ./templates/（CI 可以加校验）

import stretchAccordionHtml from "./templates/stretch-accordion.html?raw";
import passthroughHotspotHtml from "./templates/passthrough-hotspot.html?raw";
import dualTouchCtaHtml from "./templates/dual-touch-cta.html?raw";
import zeroHeightStackHtml from "./templates/zero-height-stack.html?raw";
import whitelistHeroHtml from "./templates/whitelist-hero.html?raw";

/**
 * 单个可调配色参数（本地声明，形状对齐 effect-registry/types 的 ColorSlot，
 * 但故意不 import 跨目录类型——契约 C / E：模板面板不得耦合进 effect 目录）。
 *
 * 替换语义：插入前把 html 中所有 `match`（原始 hex 大写形式）整体替换成用户选的
 * 新 hex。`match` 必须是该模板 html 中真实出现的颜色字面量，否则配色无效——
 * templates.test.ts 会校验每个 match 都能在 html 里命中。
 */
export interface TemplateColorParam {
  /** 稳定名，用作 React key */
  name: string;
  /** 中文标签 */
  label: string;
  /** 原始颜色字面量（如 "#6366F1"），必须真实出现在 html 中 */
  match: string;
  /** 默认值（一般等于 match，表示"不改"） */
  default: string;
}

/**
 * 单个可调文案参数。替换语义：插入前把 html 中 `match`（一段唯一占位文案）
 * 整体替换成用户输入。`match` 必须在 html 中真实出现且唯一。
 */
export interface TemplateTextParam {
  name: string;
  label: string;
  match: string;
  default: string;
  /** 输入上限，超长截断 */
  maxLength: number;
}

export interface Template {
  /** 稳定 id，用作 React key 与埋点 */
  id: string;
  /** 与 docs/wechat-svg/templates 下文件名一致，供 Agent E 校验定位 */
  filename: string;
  /** 中文模板名 */
  title: string;
  /** 交互模式标签（对应 five-patterns.md 的五大模式之一） */
  pattern: string;
  /** 选题样本（README.md 里抄来的，用来向用户展示契合度） */
  topic: string;
  /** 全文字数，README.md 同步 */
  wordCount: number;
  /** 4 行以内预览 */
  preview: string;
  /** 模板原始 HTML（已经是经过校验的合法微信 SVG 内容） */
  html: string;
  /**
   * 卡片视觉缩略图：一段精简的静态 SVG 字符串（手工截取自模板第一段 <svg> 的
   * 视觉骨架，去掉 <animate>/<set>，只留形状 + 品牌色）。可选，向后兼容——
   * 缺省时 TemplateGallery 回退到主色色块占位。内联在本文件，绝不改 templates/*.html。
   */
  thumbnailSvg?: string;
  /** 插入前可调配色参数；缺省表示该模板不暴露配色调节 */
  colorParams?: TemplateColorParam[];
  /** 插入前可调文案参数；缺省表示该模板不暴露文案调节 */
  textParams?: TemplateTextParam[];
}

export const TEMPLATES: Template[] = [
  {
    id: "stretch-accordion",
    filename: "stretch-accordion.html",
    title: "手风琴展开榜单",
    pattern: "伸长动画 + 零高结构",
    topic: "2026 年度 AI 生产力工具精选榜 TOP 10",
    wordCount: 2040,
    preview:
      "从写作、开发、设计到自动化，我们用了 11 个月，测完 147 款工具。\n只留这 10 个，敢让你把一年的订阅预算押进去。\n10 张工具卡点击展开详细评测，height 从 0 到 260 的伸长动画。\n适合做年度盘点、TOP N 榜单、课程目录等“信息密度高、按需展开”的场景。",
    html: stretchAccordionHtml,
    thumbnailSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160" width="280" height="160"><rect width="280" height="160" fill="#10141F"/><rect x="20" y="18" width="240" height="30" rx="6" fill="#1B2235"/><rect x="30" y="28" width="10" height="10" rx="2" fill="#6366F1"/><rect x="50" y="29" width="120" height="8" rx="4" fill="#D3DAE8"/><rect x="20" y="56" width="240" height="52" rx="6" fill="#141926" stroke="#6366F1" stroke-width="1.5"/><rect x="30" y="66" width="10" height="10" rx="2" fill="#10B981"/><rect x="50" y="67" width="100" height="8" rx="4" fill="#D3DAE8"/><rect x="30" y="86" width="200" height="6" rx="3" fill="#8CA0C2"/><rect x="30" y="96" width="160" height="6" rx="3" fill="#8CA0C2"/><rect x="20" y="116" width="240" height="26" rx="6" fill="#1B2235"/><rect x="30" y="125" width="10" height="10" rx="2" fill="#F59E0B"/><rect x="50" y="126" width="130" height="8" rx="4" fill="#D3DAE8"/></svg>',
    colorParams: [
      { name: "primary", label: "主色", match: "#6366F1", default: "#6366F1" },
      { name: "accent", label: "强调色", match: "#10B981", default: "#10B981" },
    ],
  },
  {
    id: "passthrough-hotspot",
    filename: "passthrough-hotspot.html",
    title: "产业图热区点击",
    pattern: "穿透触发 + 精确热区 + 伸长",
    topic: "一张图看懂 2026 新能源汽车产业链",
    wordCount: 2120,
    preview:
      "从锂矿到 Robotaxi，六个环节，72 家代表企业，一张可点的图。\n点图上的热点，看这一环节今年发生了什么。\n产业链图上 6 个 pointer-events:all 圆点，点击展开对应环节详情。\n适合做产业地图、流程拆解、知识图谱等“整体看形、局部看细”的场景。",
    html: passthroughHotspotHtml,
    thumbnailSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160" width="280" height="160"><rect width="280" height="160" fill="#F7F9FD"/><line x1="30" y1="80" x2="250" y2="80" stroke="#D9E0F0" stroke-width="2"/><circle cx="40" cy="80" r="9" fill="#2A4BDB"/><circle cx="82" cy="80" r="9" fill="#2A4BDB"/><circle cx="124" cy="80" r="11" fill="#8B5CF6" stroke="#2A4BDB" stroke-width="2"/><circle cx="166" cy="80" r="9" fill="#2A4BDB"/><circle cx="208" cy="80" r="9" fill="#2A4BDB"/><rect x="98" y="104" width="84" height="40" rx="6" fill="#FFFFFF" stroke="#D9E0F0" stroke-width="1.5"/><rect x="108" y="114" width="50" height="7" rx="3" fill="#1A202C"/><rect x="108" y="126" width="64" height="6" rx="3" fill="#4A5568"/><rect x="40" y="22" width="200" height="9" rx="4" fill="#2A4BDB"/></svg>',
    colorParams: [
      { name: "primary", label: "主色", match: "#2A4BDB", default: "#2A4BDB" },
      { name: "accent", label: "强调色", match: "#8B5CF6", default: "#8B5CF6" },
    ],
  },
  {
    id: "dual-touch-cta",
    filename: "dual-touch-cta.html",
    title: "长按揭示投票卡",
    pattern: "双层触发 (touchstart → click)",
    topic: "年终行业共鸣投票 · 10 条判断",
    wordCount: 2170,
    preview:
      "一年快过完，是时候认真说一句“这件事我信”或“这事我不信”了。\n按住每张卡片查看背景，松手即为投票。\n10 张遮罩卡 touchstart 隐藏上层、露出下层投票结果。\n适合做年终投票、观点对决、品牌 CTA 等“先悬念再揭示”的互动场景。",
    html: dualTouchCtaHtml,
    thumbnailSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160" width="280" height="160"><rect width="280" height="160" fill="#2A1810"/><rect x="24" y="24" width="110" height="112" rx="10" fill="#5A3F2E"/><rect x="38" y="40" width="80" height="9" rx="4" fill="#FEF3C7"/><rect x="38" y="58" width="64" height="7" rx="3" fill="#F3E8D8"/><circle cx="79" cy="100" r="20" fill="#D97706"/><path d="M71 100 l6 6 l12 -13" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><rect x="146" y="24" width="110" height="112" rx="10" fill="#FEF3C7"/><rect x="160" y="40" width="80" height="9" rx="4" fill="#B45309"/><rect x="160" y="58" width="64" height="7" rx="3" fill="#D97706"/><circle cx="201" cy="100" r="20" fill="none" stroke="#D97706" stroke-width="3"/><rect x="194" y="98" width="14" height="4" rx="2" fill="#D97706"/></svg>',
    colorParams: [
      { name: "primary", label: "主色", match: "#D97706", default: "#D97706" },
      { name: "accent", label: "强调色", match: "#B45309", default: "#B45309" },
    ],
  },
  {
    id: "zero-height-stack",
    filename: "zero-height-stack.html",
    title: "零高时间轴编年史",
    pattern: "零高结构 · 多 SVG 堆叠",
    topic: "国产大模型编年史 2019 — 2026",
    wordCount: 2030,
    preview:
      "从第一篇预训练论文到自主产出万亿参数模型，中国 AI 用了整整七年。\n这是这段路程的每一年。\n时间轴下方 7 个零高展开条，点击年份独立展开该年三件大事。\n适合做编年史、发展复盘、版本里程碑等“线性时间 + 事件展开”的场景。",
    html: zeroHeightStackHtml,
    thumbnailSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160" width="280" height="160"><rect width="280" height="160" fill="#FCFAF5"/><line x1="30" y1="44" x2="250" y2="44" stroke="#D4A574" stroke-width="2"/><circle cx="50" cy="44" r="7" fill="#8B6C3F"/><circle cx="110" cy="44" r="7" fill="#D4A574"/><circle cx="170" cy="44" r="7" fill="#8B6C3F"/><circle cx="230" cy="44" r="7" fill="#D4A574"/><rect x="30" y="68" width="220" height="20" rx="4" fill="#FFFFFF" stroke="#EDE4D3" stroke-width="1.5"/><rect x="40" y="74" width="44" height="8" rx="4" fill="#8B6C3F"/><rect x="100" y="75" width="120" height="6" rx="3" fill="#6B6B6B"/><rect x="30" y="96" width="220" height="20" rx="4" fill="#FFFFFF" stroke="#EDE4D3" stroke-width="1.5"/><rect x="40" y="102" width="44" height="8" rx="4" fill="#D4A574"/><rect x="100" y="103" width="120" height="6" rx="3" fill="#6B6B6B"/><rect x="30" y="124" width="220" height="20" rx="4" fill="#FFFFFF" stroke="#EDE4D3" stroke-width="1.5"/><rect x="40" y="130" width="44" height="8" rx="4" fill="#8B6C3F"/><rect x="100" y="131" width="120" height="6" rx="3" fill="#6B6B6B"/></svg>',
    colorParams: [
      { name: "primary", label: "主色", match: "#8B6C3F", default: "#8B6C3F" },
      { name: "accent", label: "强调色", match: "#D4A574", default: "#D4A574" },
    ],
  },
  {
    id: "whitelist-hero",
    filename: "whitelist-hero.html",
    title: "白名单动画报告封面",
    pattern: "白名单动画 · 入场装饰",
    topic: "《2026 创业者年度复盘报告》发布",
    wordCount: 2080,
    preview:
      "装饰光圈呼吸、主标题淡入、核心数字描边绘制、装饰圆点脉动。\n全部为时间驱动（begin=\"0s/0.6s/…\"），打开即播放，无需点击。\n使用的 opacity / transform / r / stroke-dashoffset / width 均在 20 属性白名单内。\n适合做报告发布、品牌年鉴、产品首发等“强视觉 hero + 正文数据条”的场景。",
    html: whitelistHeroHtml,
    thumbnailSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160" width="280" height="160"><rect width="280" height="160" fill="#0B0B10"/><circle cx="230" cy="40" r="34" fill="none" stroke="#F5A623" stroke-width="1.5" opacity="0.5"/><circle cx="230" cy="40" r="20" fill="none" stroke="#EC6E2B" stroke-width="1.5" opacity="0.7"/><rect x="24" y="28" width="84" height="9" rx="4" fill="#F5A623"/><rect x="24" y="50" width="150" height="13" rx="4" fill="#F3F4F8"/><rect x="24" y="72" width="120" height="13" rx="4" fill="#F3F4F8"/><rect x="24" y="104" width="44" height="22" rx="4" fill="#F5A623"/><rect x="92" y="104" width="44" height="22" rx="4" fill="#EC6E2B"/><rect x="160" y="104" width="44" height="22" rx="4" fill="#10B981"/><rect x="24" y="138" width="200" height="6" rx="3" fill="#9BA0B0"/></svg>',
    colorParams: [
      { name: "primary", label: "主色", match: "#F5A623", default: "#F5A623" },
      { name: "accent", label: "强调色", match: "#EC6E2B", default: "#EC6E2B" },
    ],
    textParams: [
      {
        name: "eyebrow",
        label: "封面眉标",
        match: "ANNUAL REPORT",
        default: "ANNUAL REPORT",
        maxLength: 40,
      },
    ],
  },
];
