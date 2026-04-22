# 五大核心交互模式:代码样板与应用指南

任何微信 SVG 交互,拆到底层都是这五个原型的组合。每个模式给出**可直接改造使用的代码**和**真实应用场景**。

---

## 1. 伸长动画(Extension Animation)

**发明者**:吉林大学赵国梁(高度驱动型,2020)、浙江传媒学院杨泽昊(画板比例扩张型,2020)
**核心**:通过 `height` 或 `width` 的从 0 到目标值动画,实现"展开/收起"效果。

### 应用场景
- 产品功能详情展开
- FAQ 折叠面板
- 长内容分段揭示
- 隐藏彩蛋

### 高度驱动型样板

```html
<section style="margin: 0; padding: 0;">
  <!-- 触发按钮 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 50" style="display:block;width:100%;">
    <rect id="trigger-1" x="0" y="0" width="300" height="50" fill="#FF6B35" />
    <text x="150" y="30" text-anchor="middle" fill="#fff" font-size="16">点击展开详情 ▼</text>
  </svg>

  <!-- 被展开的内容面板 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"
       preserveAspectRatio="xMidYMin meet"
       style="display:block;width:100%;height:0;overflow:visible;">
    <rect x="0" y="0" width="300" height="200" fill="#FFF5EE">
      <animate attributeName="height"
               from="0" to="200"
               dur="0.6s"
               begin="trigger-1.click"
               fill="freeze" />
    </rect>
    <text x="20" y="40" fill="#333" font-size="14">这里是展开后显示的详情内容</text>
    <text x="20" y="70" fill="#333" font-size="14">可以放多行文字、图标、说明</text>
  </svg>
</section>
```

**要点**:
- 外层 SVG 容器 `height:0; overflow:visible`——这就是"零高结构"的底层基础
- 内部 rect 的 `height` 从 0 动画到目标值
- `begin="trigger-1.click"` 跨 SVG 引用点击源(同一篇文章内 id 全局有效)

### 画板比例扩张型

当你要展开的内容高度不固定时,用 `viewBox` 和 `preserveAspectRatio` 的比例关系来驱动。这种方式代码稍复杂,但更灵活。核心是让容器的**可视区**跟随动画扩张,而不是固定像素值。

---

## 2. 穿透触发(Pointer-events Passthrough)

**引入者**:计育韬,最早应用于 VOGUE 公众号的"弹出式海报"
**核心**:用 CSS `pointer-events` 属性控制图层的点击响应,实现多层叠加下的精确交互。

### 应用场景
- 透明图层叠加的"热区"点击
- 多图层 SVG 只有部分区域响应
- 让上层动画不阻挡下层元素的点击

### 样板

```html
<div style="position: relative;">
  <!-- 下层:可点击的主内容 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" style="display:block;width:100%;">
    <rect id="base-trigger" x="0" y="0" width="300" height="300" fill="#4A90E2" />
    <text x="150" y="150" text-anchor="middle" fill="#fff" font-size="20">点击我触发主交互</text>
  </svg>

  <!-- 上层:装饰动画,不阻挡点击 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"
       style="display:block;width:100%;height:0;overflow:visible;pointer-events:none;">
    <circle cx="150" cy="150" r="0" fill="rgba(255,255,255,0.3)">
      <animate attributeName="r" from="0" to="150" dur="1s" repeatCount="3" />
    </circle>
  </svg>
</div>
```

**要点**:
- 上层 SVG 的 `pointer-events:none` 让点击事件"穿透"到下层
- 需要上层某些部分可点击时,把具体元素的 `pointer-events` 改回 `auto` 或 `all`
- `pointer-events` 继承规则:父元素设置 `none` 后,子元素显式声明 `all` 可以恢复响应

### 进阶:精确热区

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"
     style="pointer-events: none;">
  <!-- 整个 SVG 不响应点击,除了指定的热区 -->
  <image href="..." width="400" height="400" />

  <!-- 只有这个圆形区域响应点击 -->
  <circle id="hotspot-1" cx="100" cy="100" r="40"
          fill="transparent" style="pointer-events: all; cursor: pointer;" />
  <circle id="hotspot-2" cx="300" cy="300" r="40"
          fill="transparent" style="pointer-events: all; cursor: pointer;" />
</svg>
```

---

## 3. 双层触发(Two-Layer Trigger)

**发明者**:海尔集团姜棋超
**核心**:利用 `touchstart` 和 `click` 事件的 ~300ms 时间差,让上层元素先响应并消失,下层元素接收后续点击,实现多步交互。

### 应用场景
- 确认型 CTA(第一次点显示提示,第二次点真跳转)
- 无限选择器(一个按钮循环切换选项)
- 分步引导

### 样板

```html
<section style="position: relative;">
  <!-- 下层:最终要触发的按钮 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80" style="display:block;width:100%;">
    <a href="https://example.com/download" target="_blank">
      <rect x="0" y="0" width="300" height="80" fill="#FF6B35" />
      <text x="150" y="50" text-anchor="middle" fill="#fff" font-size="20">立即下载</text>
    </a>
  </svg>

  <!-- 上层:首次触摸后消失的遮罩 -->
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"
       style="display:block;width:100%;height:0;overflow:visible;margin-top:-80px;">
    <rect id="top-layer" x="0" y="0" width="300" height="80" fill="#333">
      <set attributeName="visibility"
           to="hidden"
           begin="top-layer.touchstart"
           fill="freeze" />
    </rect>
    <text x="150" y="50" text-anchor="middle" fill="#fff" font-size="18"
          style="pointer-events: none;">点击继续</text>
  </svg>
</section>
```

**要点**:
- 上层的 `rect` 在 `touchstart` 时变 hidden,上层消失后用户的手指还没抬起,`click` 事件会落到下层
- 300ms 时间差是 iOS/Android 浏览器的事件模型行为,稳定可依赖
- 如果要"两步确认",上层先变一个"您确定吗"的界面,第二次点击再真正执行

### 无限选择器变体

堆叠 N 层,每层点击后都消失,露出下一层。可以做"刮刮卡"、"多选项循环切换"等效果。

---

## 4. 零高结构/容器(Zero-Height Container)

**发明者**:山东大学沈佳麒
**核心**:`height:0` 但 `overflow:visible`,让元素在文档流中不占空间,但视觉上仍可见。**几乎所有定制级 SVG 交互的底层骨架**。

### 应用场景
- 多个 SVG 叠加(上下层互不推挤)
- 绝对定位效果(但不用 `position: absolute`,因为微信禁用)
- 让装饰动画"浮"在其他元素之上

### 样板

```html
<!-- 主内容,正常占据高度 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" style="display:block;width:100%;">
  <rect width="300" height="400" fill="#F5F5F5" />
  <text x="150" y="200" text-anchor="middle" fill="#333" font-size="20">主内容区</text>
</svg>

<!-- 零高容器,视觉上向上覆盖到主内容上 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"
     preserveAspectRatio="xMidYMin meet"
     style="display:block;width:100%;height:0;overflow:visible;margin-top:-400px;">
  <circle cx="150" cy="200" r="50" fill="rgba(255,107,53,0.8)">
    <animate attributeName="r" from="50" to="80" dur="1s" repeatCount="3" />
  </circle>
</svg>
```

**要点**:
- `height:0` + `overflow:visible` = 容器不占文档高度但子元素可见
- `margin-top: -Npx` 用来让这个零高容器"向上覆盖"到前一个 SVG 上(注意 margin 的限制,见 html-css-restrictions.md)
- `preserveAspectRatio` 控制 SVG 在容器中的对齐方式

### 无限堆叠

多个零高 SVG 可以无限串联,每个都不占文档高度,但都能渲染内容。这是实现复杂图层交互的基础。

---

## 5. 白名单动画(Whitelist Animations)

这不是"模式",而是前 4 个模式的**素材库**。基础动画单元,可以单独使用做装饰,也可以嵌入前面的模式里。

### 基础装饰动画清单

**呼吸光圈**:
```xml
<circle cx="50" cy="50" r="20" fill="none" stroke="#FF6B35" stroke-width="2">
  <animate attributeName="r" from="20" to="30" dur="1.5s" repeatCount="3" />
  <animate attributeName="opacity" from="1" to="0" dur="1.5s" repeatCount="3" />
</circle>
```

**描边绘制**:
```xml
<path d="..." stroke="#000" fill="none"
      stroke-dasharray="500" stroke-dashoffset="500">
  <animate attributeName="stroke-dashoffset" from="500" to="0" dur="2s" fill="freeze" />
</path>
```

**渐显文字**(用 opacity 组合延迟):
```xml
<text x="50" y="50" opacity="0">
  第一行
  <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0s" fill="freeze" />
</text>
<text x="50" y="80" opacity="0">
  第二行
  <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="0.5s" fill="freeze" />
</text>
```

**旋转图标**:
```xml
<g transform="translate(100,100)">
  <path d="M-20,-20 L20,-20 L20,20 L-20,20 Z" fill="#4A90E2" />
  <animateTransform attributeName="transform"
                    type="rotate"
                    from="0" to="360"
                    dur="2s"
                    repeatCount="3" />
</g>
```

---

## 模式组合的典型用法

复杂交互通常是多个模式叠加:

**案例:产品卡片点击展开详情**
= 零高结构(让展开部分不影响文档流)
+ 伸长动画(高度从 0 到目标值)
+ 白名单动画(内部文字渐显)

**案例:品牌 H5 闯关互动**
= 零高结构(多层 SVG 叠加)
+ 双层触发(每关点击后消失,露出下一关)
+ 穿透触发(装饰动画不阻挡答题区点击)

**案例:长图文中的"彩蛋"**
= 零高结构(彩蛋 SVG 不占额外空间)
+ 穿透触发(读者误触不会中断阅读)
+ 白名单动画(彩蛋被主动点击后播放动效)

先画清楚"这个交互由哪几个模式组成",再动手写代码。不要写一半发现基础架构错了要全改。

---

## 调试技巧

- **iSVG / svg.show 的案例库**是最好的学习资源,遇到不确定的交互先去那里找类似案例
- **在浏览器里先调通**再复制到微信编辑器,微信编辑器的预览延迟大、错误提示少
- **一次只改一个变量**:改动画属性、改结构、改触发关系不要混着做
- **遇到"效果没出来"**,第一步看属性是否在白名单、第二步看 xmlns 是否声明、第三步看触发元素的 id 是否唯一
