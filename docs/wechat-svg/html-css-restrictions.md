# 微信图文编辑器 HTML/CSS 限制性规则

这份文件回答:"为什么我在浏览器里好好的效果,粘到微信编辑器就坏了?"

微信图文编辑器在保存时会**静默剥离**不支持的 HTML/CSS 特性。没有报错,只有"线上看效果没了"。了解这个禁用清单,在写代码时主动规避。

## 核心原则

微信使用的是 **XML 体系下的 CSS 描述**,不是标准 HTML5 环境。这意味着:

1. 父子节点必须声明 XML 命名空间:`xmlns="http://www.w3.org/1999/xhtml"`
2. 任何"CSS 只在 HTML5 里才稳定"的特性(flex 某些值、现代选择器等)都可能被剥离
3. JavaScript 在公众号图文中几乎完全禁用

## 禁用清单

### 1. 动画/循环相关

| 禁用 | 替代方案 |
|---|---|
| `repeatCount="indefinite"` 在 `height`/`width` 动画 | 用具体次数(`repeatCount="3"`),或改用 `opacity`/`transform` 循环 |
| CSS `@keyframes` 动画 | 用 SVG `<animate>` 元素 |
| `transition` 属性 | 用 SVG `<animate>` 元素 |
| `animation-delay` CSS 属性 | 用 SVG 动画的 `begin` 属性 |

### 2. 装饰/视觉特效

| 禁用 | 替代方案 |
|---|---|
| `clip-path` | 用 SVG 原生 `<clipPath>` 元素(仅在 SVG 内部有效),或用图片本身做蒙版 |
| `mask` | 同上 |
| `filter`(CSS)如 blur/drop-shadow | 用 SVG `<filter>` 元素(在 SVG 内部),或预先在图片里做好效果 |
| `backdrop-filter` | 没有替代,重新设计视觉方案 |
| `mix-blend-mode` | 没有替代,用不透明度叠加或重新设计 |
| `box-shadow`(复杂值) | 简单阴影勉强可用,复杂多层阴影用图片实现 |

**2021 年 6 月之后**,`clip-path`、`mask`、`filter` 包括通过 `embed` 嵌入方式都被**完全禁用**。别尝试绕。

### 3. 布局/定位

| 禁用 | 替代方案 |
|---|---|
| `position: absolute` / `fixed` | 用零高结构 + `margin-top:-Npx` 做"浮层"效果 |
| `position: relative` 配合 `z-index` | 用 flex 布局的 `order` 属性,或调整 DOM 顺序 |
| `margin-left: -100%` 等大负值 | 小范围负 margin 可用,但数值限制严格。试过 `-Npx`,`N` 大于容器宽度时会被抹除 |
| CSS Grid | 用 table 或 flex 布局 |
| `aspect-ratio` CSS 属性 | 用 SVG 的 viewBox + preserveAspectRatio |

### 4. DOM/脚本相关

| 禁用 | 替代方案 |
|---|---|
| `<script>` 标签 | 用 SVG 动画的 `begin="id.click"` 跨元素触发 |
| `onclick` 等事件处理器 | 用 `<a>` 标签做链接,用 SVG 动画做交互 |
| JavaScript 任何形式 | 同上 |
| CSS `id` 选择器的传参(如 `#id1:hover #id2`) | 不依赖 CSS 选择器做联动,用 SVG `begin="id1.click"` 做触发 |
| 自定义 data-* 属性传参 | 静态 SVG 配合动画即可 |

### 5. 容器/模块相关

| 禁用 | 替代方案 |
|---|---|
| `<iframe>` | 不要嵌入,把内容直接写入文章 |
| `<embed>` / `<object>` | 同上 |
| `<form>` 表单 | 用跳转链接 + 外部表单页(比如腾讯问卷) |
| 深色模式适配 | 微信深色模式下 SVG 模块直接不渲染。要么牺牲深色模式下的效果,要么用 CSS 变量手动适配 |

## 必写项

### xmlns 声明

所有 SVG 必须写:
```xml
<svg xmlns="http://www.w3.org/2000/svg" ...>
```

需要内嵌 HTML(通过 `<foreignObject>`)时,foreignObject 内部必须声明 XHTML 命名空间:
```xml
<foreignObject x="0" y="0" width="300" height="100">
  <div xmlns="http://www.w3.org/1999/xhtml">
    HTML 内容
  </div>
</foreignObject>
```

不写 xmlns 会在 iOS/Android 某一端失效。

### display:block

SVG 标签默认是 inline 元素,会带来意外的行高间隙。写成 block:
```xml
<svg style="display:block; width:100%;" ...>
```

### width:100%

响应式必须。公众号文章在不同设备上宽度不同,用 100% 自适应容器。

## CSS 里的"可用/不可用"坑表

### flex 布局(部分可用)

基本 flex 可用,但不要用:
- `gap` 属性(兼容性差,用 margin 替代)
- `flex-basis` 复杂值
- 嵌套超过 3 层的 flex

### 字体

- 自定义字体(`@font-face`)可用,但需要 https 链接
- 系统字体推荐:`-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`
- emoji 字体在部分 Android 机型上渲染不一致

### 颜色

- 十六进制 / RGB / RGBA 均可用
- `hsl()` / `hsla()` 可用
- CSS 变量(`var(--xxx)`)**在图文编辑器中常被剥离**,避免使用。颜色直接写死。

### 单位

- `px`、`%`、`em`、`rem` 可用
- `vw`、`vh` 可用但部分旧 Android 浏览器不支持,谨慎使用
- `calc()` 可用

## 排查流程

发布后效果异常时,按这个顺序查:

1. **动画没了** → 查 `attributeName` 是否在白名单
2. **元素消失了** → 查是否用了 `position: absolute` / `fixed`
3. **布局错乱** → 查 `margin` 负值是否过大、是否用了 Grid
4. **视觉效果丢失** → 查是否用了 `filter`、`clip-path`、`mask`
5. **iOS 正常,Android 异常(或反之)** → 查 `xmlns` 是否声明、字体是否有兜底
6. **整个 SVG 不渲染** → 查是否在深色模式下,或 SVG 内部有语法错误

## 违规的代价

微信对"对抗性开发"(比如用 iframe 绕限制、用 JS 注入)有**整体封禁**机制。发现一次可能整个公众号被限制 SVG 功能。不要铤而走险——所有行业内的漂亮案例都是在规范内做出来的。
