export interface SvgTemplateConfig {
  [key: string]: string | string[] | number;
}

export interface SvgTemplate {
  id: string;
  name: string;
  description: string;
  category: "click" | "animation" | "slide";
  fields: {
    key: string;
    label: string;
    type: "text" | "color" | "textarea" | "number";
    default: string | number;
  }[];
  render: (config: Record<string, string | number>) => string;
}

function uid(): string {
  return "_" + Math.random().toString(36).slice(2, 8);
}

const accordion: SvgTemplate = {
  id: "accordion",
  name: "点击展开/收起",
  description: "点击标题展开或收起内容区域",
  category: "click",
  fields: [
    { key: "title", label: "标题", type: "text", default: "点击展开" },
    { key: "content", label: "内容", type: "textarea", default: "这里是隐藏的内容，点击标题即可展开查看。" },
    { key: "bgColor", label: "背景色", type: "color", default: "#f5f5f5" },
    { key: "accentColor", label: "强调色", type: "color", default: "#e8784a" },
  ],
  render(config) {
    const id = uid();
    const title = config.title || "点击展开";
    const content = config.content || "";
    const bgColor = config.bgColor || "#f5f5f5";
    const accentColor = config.accentColor || "#e8784a";
    return `<section style="margin:16px 0;">
<style>
  #acc${id}:checked ~ .acc-body${id} { max-height:800px; opacity:1; }
  #acc${id}:checked ~ .acc-lbl${id} .acc-arrow${id} { transform:rotate(180deg); }
  .acc-body${id} { max-height:0; opacity:0; overflow:hidden; transition:max-height 0.4s ease, opacity 0.3s ease; }
  .acc-arrow${id} { transition:transform 0.3s ease; display:inline-block; }
</style>
<input type="checkbox" id="acc${id}" style="display:none;" />
<label for="acc${id}" class="acc-lbl${id}" style="display:block;padding:12px 16px;background:${accentColor};color:#fff;font-size:16px;font-weight:bold;border-radius:6px 6px 0 0;cursor:pointer;">
  ${title} <span class="acc-arrow${id}" style="float:right;">▼</span>
</label>
<section class="acc-body${id}" style="background:${bgColor};padding:0 16px;border-radius:0 0 6px 6px;border:1px solid ${accentColor};border-top:none;">
  <section style="padding:12px 0;font-size:14px;line-height:1.8;color:#333;">${content}</section>
</section>
</section>`;
  },
};

const beforeAfter: SvgTemplate = {
  id: "before-after",
  name: "图片前后对比",
  description: "点击按钮切换前后两张图片",
  category: "click",
  fields: [
    { key: "beforeImage", label: "前图片URL", type: "text", default: "https://via.placeholder.com/600x400/eee/999?text=Before" },
    { key: "afterImage", label: "后图片URL", type: "text", default: "https://via.placeholder.com/600x400/333/fff?text=After" },
    { key: "buttonText", label: "按钮文字", type: "text", default: "点击查看" },
    { key: "width", label: "宽度(%)", type: "number", default: 100 },
  ],
  render(config) {
    const id = uid();
    const before = config.beforeImage || "";
    const after = config.afterImage || "";
    const btnText = config.buttonText || "点击查看";
    const width = config.width || 100;
    return `<section style="margin:16px 0;width:${width}%;position:relative;">
<style>
  #ba${id}:checked ~ .ba-after${id} { opacity:1; }
  #ba${id}:checked ~ .ba-before${id} { opacity:0; }
  #ba${id}:checked ~ .ba-btn${id} { background:#2c3e50; }
  .ba-before${id}, .ba-after${id} { transition:opacity 0.5s ease; }
  .ba-after${id} { opacity:0; position:absolute; top:0; left:0; width:100%; }
</style>
<input type="checkbox" id="ba${id}" style="display:none;" />
<section style="position:relative;overflow:hidden;border-radius:8px;">
  <img class="ba-before${id}" src="${before}" style="max-width:100%;display:block;" />
  <img class="ba-after${id}" src="${after}" style="max-width:100%;display:block;position:absolute;top:0;left:0;" />
</section>
<label for="ba${id}" class="ba-btn${id}" style="display:block;margin-top:8px;padding:8px 0;text-align:center;background:#e8784a;color:#fff;font-size:14px;border-radius:6px;cursor:pointer;transition:background 0.3s;">${btnText}</label>
</section>`;
  },
};

const flipCard: SvgTemplate = {
  id: "flip-card",
  name: "翻牌效果",
  description: "点击卡片翻转查看背面内容",
  category: "click",
  fields: [
    { key: "frontText", label: "正面文字", type: "textarea", default: "点击翻转" },
    { key: "backText", label: "背面文字", type: "textarea", default: "这是背面内容" },
    { key: "frontBg", label: "正面背景", type: "color", default: "#e8784a" },
    { key: "backBg", label: "背面背景", type: "color", default: "#2c3e50" },
    { key: "width", label: "宽度(px)", type: "number", default: 300 },
    { key: "height", label: "高度(px)", type: "number", default: 200 },
  ],
  render(config) {
    const id = uid();
    const frontText = config.frontText || "点击翻转";
    const backText = config.backText || "";
    const frontBg = config.frontBg || "#e8784a";
    const backBg = config.backBg || "#2c3e50";
    const w = config.width || 300;
    const h = config.height || 200;
    return `<section style="margin:16px auto;perspective:800px;width:${w}px;max-width:100%;">
<style>
  #flip${id}:checked ~ .flip-inner${id} { transform:rotateY(180deg); }
  .flip-inner${id} { position:relative;width:100%;height:${h}px;transition:transform 0.6s;transform-style:preserve-3d; }
  .flip-front${id}, .flip-back${id} { position:absolute;width:100%;height:100%;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:16px;line-height:1.6;padding:16px;box-sizing:border-box;text-align:center;color:#fff; }
  .flip-back${id} { transform:rotateY(180deg); }
</style>
<input type="checkbox" id="flip${id}" style="display:none;" />
<label for="flip${id}" style="display:block;cursor:pointer;">
  <section class="flip-inner${id}">
    <section class="flip-front${id}" style="background:${frontBg};">${frontText}</section>
    <section class="flip-back${id}" style="background:${backBg};">${backText}</section>
  </section>
</label>
</section>`;
  },
};

const carousel: SvgTemplate = {
  id: "carousel",
  name: "多图轮播",
  description: "通过点击指示器切换多张图片",
  category: "slide",
  fields: [
    { key: "image1", label: "图片1 URL", type: "text", default: "https://via.placeholder.com/600x400/e8784a/fff?text=1" },
    { key: "image2", label: "图片2 URL", type: "text", default: "https://via.placeholder.com/600x400/2c3e50/fff?text=2" },
    { key: "image3", label: "图片3 URL", type: "text", default: "https://via.placeholder.com/600x400/27ae60/fff?text=3" },
    { key: "indicatorColor", label: "指示器颜色", type: "color", default: "#e8784a" },
  ],
  render(config) {
    const id = uid();
    const img1 = config.image1 || "";
    const img2 = config.image2 || "";
    const img3 = config.image3 || "";
    const ic = config.indicatorColor || "#e8784a";
    return `<section style="margin:16px 0;overflow:hidden;border-radius:8px;">
<style>
  .car-track${id} { display:flex;transition:transform 0.4s ease;width:300%; }
  .car-slide${id} { width:33.333%;flex-shrink:0; }
  .car-slide${id} img { width:100%;display:block; }
  #car1${id}:checked ~ .car-wrap${id} .car-track${id} { transform:translateX(0); }
  #car2${id}:checked ~ .car-wrap${id} .car-track${id} { transform:translateX(-33.333%); }
  #car3${id}:checked ~ .car-wrap${id} .car-track${id} { transform:translateX(-66.666%); }
  .car-dots${id} label { display:inline-block;width:10px;height:10px;border-radius:50%;background:#ccc;margin:0 4px;cursor:pointer;transition:background 0.3s; }
  #car1${id}:checked ~ .car-dots${id} label[for="car1${id}"],
  #car2${id}:checked ~ .car-dots${id} label[for="car2${id}"],
  #car3${id}:checked ~ .car-dots${id} label[for="car3${id}"] { background:${ic}; }
</style>
<input type="radio" name="car${id}" id="car1${id}" checked style="display:none;" />
<input type="radio" name="car${id}" id="car2${id}" style="display:none;" />
<input type="radio" name="car${id}" id="car3${id}" style="display:none;" />
<section class="car-wrap${id}" style="overflow:hidden;">
  <section class="car-track${id}">
    <section class="car-slide${id}"><img src="${img1}" style="max-width:100%;" /></section>
    <section class="car-slide${id}"><img src="${img2}" style="max-width:100%;" /></section>
    <section class="car-slide${id}"><img src="${img3}" style="max-width:100%;" /></section>
  </section>
</section>
<section class="car-dots${id}" style="text-align:center;padding:10px 0;">
  <label for="car1${id}"></label>
  <label for="car2${id}"></label>
  <label for="car3${id}"></label>
</section>
</section>`;
  },
};

const fadeInText: SvgTemplate = {
  id: "fade-in-text",
  name: "渐显文字",
  description: "文字逐行淡入显示",
  category: "animation",
  fields: [
    { key: "line1", label: "第一行", type: "text", default: "你好" },
    { key: "line2", label: "第二行", type: "text", default: "欢迎阅读" },
    { key: "line3", label: "第三行", type: "text", default: "这是一段渐显文字效果" },
    { key: "color", label: "文字颜色", type: "color", default: "#333333" },
    { key: "delay", label: "间隔(秒)", type: "number", default: 0.5 },
  ],
  render(config) {
    const id = uid();
    const line1 = config.line1 || "";
    const line2 = config.line2 || "";
    const line3 = config.line3 || "";
    const color = config.color || "#333";
    const delay = Number(config.delay) || 0.5;
    return `<section style="margin:16px 0;">
<style>
  @keyframes fadeIn${id} { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  .fi-line${id} { opacity:0; animation:fadeIn${id} 0.6s ease forwards; font-size:18px; line-height:2; color:${color}; }
</style>
<section class="fi-line${id}" style="animation-delay:${delay * 0}s;">${line1}</section>
<section class="fi-line${id}" style="animation-delay:${delay * 1}s;">${line2}</section>
<section class="fi-line${id}" style="animation-delay:${delay * 2}s;">${line3}</section>
</section>`;
  },
};

const pressReveal: SvgTemplate = {
  id: "press-reveal",
  name: "长按显示",
  description: "长按区域显示隐藏内容",
  category: "click",
  fields: [
    { key: "coverText", label: "封面文字", type: "text", default: "长按查看" },
    { key: "hiddenText", label: "隐藏内容", type: "textarea", default: "恭喜你发现了隐藏内容！" },
    { key: "bgColor", label: "背景色", type: "color", default: "#f0f0f0" },
  ],
  render(config) {
    const id = uid();
    const coverText = config.coverText || "长按查看";
    const hiddenText = config.hiddenText || "";
    const bgColor = config.bgColor || "#f0f0f0";
    return `<section style="margin:16px 0;">
<style>
  .pr-wrap${id} { position:relative;padding:24px 16px;background:${bgColor};border-radius:8px;text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none; }
  .pr-cover${id} { font-size:16px;color:#999;transition:opacity 0.3s; }
  .pr-hidden${id} { position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-size:15px;line-height:1.8;color:#333;opacity:0;transition:opacity 0.3s; }
  .pr-wrap${id}:active .pr-cover${id} { opacity:0; }
  .pr-wrap${id}:active .pr-hidden${id} { opacity:1; }
</style>
<section class="pr-wrap${id}">
  <section class="pr-cover${id}">${coverText}</section>
  <section class="pr-hidden${id}">${hiddenText}</section>
</section>
</section>`;
  },
};

export const svgTemplates: SvgTemplate[] = [
  accordion,
  beforeAfter,
  flipCard,
  carousel,
  fadeInText,
  pressReveal,
];

export function getTemplatesByCategory(category: SvgTemplate["category"]): SvgTemplate[] {
  return svgTemplates.filter((t) => t.category === category);
}

export function getTemplateById(id: string): SvgTemplate | undefined {
  return svgTemplates.find((t) => t.id === id);
}
