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

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
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
    return `<section contenteditable="false" style="margin:16px 0;">
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
  name: "前后对比",
  description: "支持纯文字、纯图片、图文混合三种对比",
  category: "click",
  fields: [
    { key: "beforeImage", label: "前·图片URL（留空则纯文字）", type: "text", default: "" },
    { key: "afterImage", label: "后·图片URL（留空则纯文字）", type: "text", default: "" },
    { key: "beforeText", label: "前·文字（留空则纯图片）", type: "text", default: "修改前" },
    { key: "afterText", label: "后·文字（留空则纯图片）", type: "text", default: "修改后" },
    { key: "beforeColor", label: "前·背景色", type: "color", default: "#f0ebe4" },
    { key: "afterColor", label: "后·背景色", type: "color", default: "#3d3730" },
    { key: "buttonText", label: "按钮文字", type: "text", default: "点击切换对比" },
  ],
  render(config) {
    const id = uid();
    const beforeImg = String(config.beforeImage || "").trim();
    const afterImg = String(config.afterImage || "").trim();
    const beforeText = String(config.beforeText || "").trim();
    const afterText = String(config.afterText || "").trim();
    const beforeColor = config.beforeColor || "#f0ebe4";
    const afterColor = config.afterColor || "#3d3730";
    const btnText = config.buttonText || "点击切换对比";
    const beforeTextColor = isLightColor(String(beforeColor)) ? "#333" : "#fff";
    const afterTextColor = isLightColor(String(afterColor)) ? "#333" : "#fff";

    // Build inner content for before/after panels
    function buildPanel(img: string, text: string, bgColor: string, textColor: string): string {
      if (img && text) {
        // Image + text
        return `<section style="background:${bgColor};padding:24px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;">
  <img src="${img}" style="max-width:90%;max-height:220px;border-radius:6px;display:block;" />
  <section style="margin-top:14px;font-size:15px;font-weight:500;color:${textColor};text-align:center;line-height:1.6;">${text}</section>
</section>`;
      }
      if (img) {
        // Image only
        return `<section style="background:${bgColor};padding:20px;text-align:center;min-height:160px;display:flex;align-items:center;justify-content:center;">
  <img src="${img}" style="max-width:90%;max-height:260px;border-radius:6px;display:block;" />
</section>`;
      }
      // Text only
      return `<section style="background:${bgColor};padding:48px 28px;text-align:center;font-size:18px;font-weight:500;color:${textColor};min-height:120px;display:flex;align-items:center;justify-content:center;line-height:1.7;">${text || "对比内容"}</section>`;
    }

    const beforeHtml = buildPanel(beforeImg, beforeText, String(beforeColor), beforeTextColor);
    const afterHtml = buildPanel(afterImg, afterText, String(afterColor), afterTextColor);

    return `<section contenteditable="false" style="margin:16px 0;position:relative;">
<style>
  #ba${id}:checked ~ .ba-wrap${id} .ba-after${id} { opacity:1; }
  #ba${id}:checked ~ .ba-wrap${id} .ba-before${id} { opacity:0; }
  #ba${id}:checked ~ .ba-btn${id} { background:#3d3730; }
  .ba-before${id}, .ba-after${id} { transition:opacity 0.5s ease; }
  .ba-after${id} { opacity:0; position:absolute; top:0; left:0; width:100%; height:100%; }
</style>
<input type="checkbox" id="ba${id}" style="display:none;" />
<section class="ba-wrap${id}" style="position:relative;overflow:hidden;border-radius:8px;">
  <section class="ba-before${id}">${beforeHtml}</section>
  <section class="ba-after${id}" style="display:flex;align-items:center;justify-content:center;">${afterHtml}</section>
</section>
<label for="ba${id}" class="ba-btn${id}" style="display:block;margin-top:8px;padding:10px 0;text-align:center;background:#c4a76c;color:#fff;font-size:13px;font-weight:500;border-radius:8px;cursor:pointer;transition:background 0.3s;letter-spacing:1px;">${btnText}</label>
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
    return `<section contenteditable="false" style="margin:16px auto;perspective:800px;width:${w}px;max-width:100%;">
<style>
  #flip${id}:checked ~ .flip-inner${id} { transform:rotateY(180deg); }
  .flip-inner${id} { position:relative;width:100%;height:${h}px;transition:transform 0.6s;transform-style:preserve-3d;cursor:pointer; }
  .flip-front${id}, .flip-back${id} { position:absolute;width:100%;height:100%;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:16px;line-height:1.6;padding:16px;box-sizing:border-box;text-align:center;color:#fff; }
  .flip-back${id} { transform:rotateY(180deg); }
</style>
<input type="checkbox" id="flip${id}" style="display:none;" />
<label for="flip${id}" style="display:block;position:absolute;width:100%;height:${h}px;cursor:pointer;z-index:2;"></label>
<section class="flip-inner${id}">
  <section class="flip-front${id}" style="background:${frontBg};">${frontText}</section>
  <section class="flip-back${id}" style="background:${backBg};">${backText}</section>
</section>
</section>`;
  },
};

const carousel: SvgTemplate = {
  id: "carousel",
  name: "多图轮播",
  description: "通过点击指示器切换多张卡片",
  category: "slide",
  fields: [
    { key: "text1", label: "卡片1文字", type: "text", default: "第一页：欢迎使用" },
    { key: "text2", label: "卡片2文字", type: "text", default: "第二页：功能介绍" },
    { key: "text3", label: "卡片3文字", type: "text", default: "第三页：开始体验" },
    { key: "color1", label: "卡片1颜色", type: "color", default: "#e8784a" },
    { key: "color2", label: "卡片2颜色", type: "color", default: "#2c3e50" },
    { key: "color3", label: "卡片3颜色", type: "color", default: "#27ae60" },
    { key: "indicatorColor", label: "指示器颜色", type: "color", default: "#e8784a" },
  ],
  render(config) {
    const id = uid();
    const text1 = config.text1 || "第一页";
    const text2 = config.text2 || "第二页";
    const text3 = config.text3 || "第三页";
    const c1 = config.color1 || "#e8784a";
    const c2 = config.color2 || "#2c3e50";
    const c3 = config.color3 || "#27ae60";
    const ic = config.indicatorColor || "#e8784a";
    const slideStyle = "padding:40px 24px;text-align:center;font-size:20px;font-weight:bold;color:#fff;min-height:140px;display:flex;align-items:center;justify-content:center;scroll-snap-align:start;flex-shrink:0;width:100%;box-sizing:border-box;";
    return `<section contenteditable="false" style="margin:16px 0;border-radius:8px;overflow:hidden;">
<style>
  .car-track${id} {
    display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
    scrollbar-width:none;scroll-behavior:smooth;
  }
  .car-track${id}::-webkit-scrollbar { display:none; }
  .car-dots${id} label {
    display:inline-block;width:10px;height:10px;border-radius:50%;background:#ccc;margin:0 4px;cursor:pointer;transition:background 0.3s;
  }
  #car1${id}:checked ~ .car-dots${id} label[for="car1${id}"],
  #car2${id}:checked ~ .car-dots${id} label[for="car2${id}"],
  #car3${id}:checked ~ .car-dots${id} label[for="car3${id}"] { background:${ic}; }
</style>
<input type="radio" name="car${id}" id="car1${id}" checked style="display:none;" />
<input type="radio" name="car${id}" id="car2${id}" style="display:none;" />
<input type="radio" name="car${id}" id="car3${id}" style="display:none;" />
<section class="car-track${id}" id="carTrack${id}">
  <section id="carSlide1${id}" style="${slideStyle}background:${c1};">${text1}</section>
  <section id="carSlide2${id}" style="${slideStyle}background:${c2};">${text2}</section>
  <section id="carSlide3${id}" style="${slideStyle}background:${c3};">${text3}</section>
</section>
<section class="car-dots${id}" style="text-align:center;padding:10px 0;">
  <label for="car1${id}" onclick="document.getElementById('carSlide1${id}').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
  <label for="car2${id}" onclick="document.getElementById('carSlide2${id}').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
  <label for="car3${id}" onclick="document.getElementById('carSlide3${id}').scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})"></label>
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
    return `<section contenteditable="false" style="margin:16px 0;" id="fiWrap${id}">
<style>
  @keyframes fadeIn${id} { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  .fi-line${id} { opacity:0; font-size:18px; line-height:2; color:${color}; }
  .fi-line${id}.fi-visible${id} { animation:fadeIn${id} 0.6s ease forwards; }
</style>
<section class="fi-line${id}" style="animation-delay:${delay * 0}s;">${line1}</section>
<section class="fi-line${id}" style="animation-delay:${delay * 1}s;">${line2}</section>
<section class="fi-line${id}" style="animation-delay:${delay * 2}s;">${line3}</section>
<script>
(function(){
  var wrap=document.getElementById('fiWrap${id}');
  if(!wrap)return;
  var lines=wrap.querySelectorAll('.fi-line${id}');
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          lines.forEach(function(l){l.classList.add('fi-visible${id}');});
          obs.disconnect();
        }
      });
    },{threshold:0.2});
    obs.observe(wrap);
  } else {
    lines.forEach(function(l){l.classList.add('fi-visible${id}');});
  }
})();
<\/script>
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
    return `<section contenteditable="false" style="margin:16px 0;">
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
