# 微信公众号 SVG 白名单属性详表

这份文件是**写动画前的查表**。任何 `animate`、`set`、`animateTransform`、`animateMotion` 元素的 `attributeName` 值,必须在这 20 个里。不在白名单的属性在微信编辑器保存时会被**静默剥离**——线上看到的就是"动画没了",不会报错。

**历史背景**:2016 年复旦大学计育韬和厦门嘉庚学院林喆联合微信团队测试出初始 27 项,迭代至今仍保留 20 项。该规范也被收录于《融媒体SVG交互设计技术规范》T/CASME 1609—2024。

## 快速索引

| # | 元素 | attributeName | 作用 |
|---|---|---|---|
| 1 | animate | x | 控制元素 x 轴方向位移 |
| 2 | animate | y | 控制元素 y 轴方向位移 |
| 3 | animate | width | 控制元素宽度动画(含伸长动画基础) |
| 4 | animate | height | 控制元素高度动画(含伸长动画基础) |
| 5 | animate | opacity | 控制元素透明度,从 0 到 1 或反向 |
| 6 | animate | d | 控制 path 路径形变 |
| 7 | animate | points | 控制 polygon/polyline 顶点动画 |
| 8 | animate | cx | 控制圆心 x 坐标(circle/ellipse) |
| 9 | animate | cy | 控制圆心 y 坐标(circle/ellipse) |
| 10 | animate | r | 控制圆半径(circle) |
| 11 | animate | stroke-width | 控制描边宽度动画 |
| 12 | animate | stroke-dasharray | 控制虚线样式,绘制线条效果 |
| 13 | animate | stroke-dashoffset | 控制虚线偏移,配合 dasharray 做描边动画 |
| 14 | animate | fill | 控制填充色过渡 |
| 15 | set | visibility | 控制显示/隐藏切换(visible/hidden/collapse) |
| 16 | animateTransform | translate | 平移变换 |
| 17 | animateTransform | scale | 缩放变换 |
| 18 | animateTransform | rotate | 旋转变换 |
| 19 | animateTransform | skewX | X 方向倾斜变换 |
| 20 | animateTransform | skewY | Y 方向倾斜变换 |

`animateMotion` 元素(沿路径运动)是通过 `<mpath>` 子元素或 `path` 属性驱动的,不通过 `attributeName`,但它也在允许范围内。

## 常用动画写法示范

### 淡入动画(最基础)

```xml
<rect x="0" y="0" width="100" height="100" fill="#FF6B35">
  <animate attributeName="opacity"
           from="0" to="1"
           dur="0.8s"
           begin="0s"
           fill="freeze" />
</rect>
```

### 点击触发的高度伸长(伸长动画核心)

```xml
<rect id="panel" x="0" y="0" width="300" height="0" fill="#ffffff">
  <animate attributeName="height"
           from="0" to="200"
           dur="0.5s"
           begin="trigger.click"
           fill="freeze" />
</rect>
```

配合一个 `id="trigger"` 的元素作为点击源。

### 描边绘制效果

```xml
<path d="M10,50 Q50,0 100,50 T200,50"
      stroke="#000" stroke-width="2" fill="none"
      stroke-dasharray="300" stroke-dashoffset="300">
  <animate attributeName="stroke-dashoffset"
           from="300" to="0"
           dur="2s"
           fill="freeze" />
</path>
```

### 组合变换(旋转 + 缩放)

```xml
<g>
  <rect x="-50" y="-50" width="100" height="100" fill="#4A90E2" />
  <animateTransform attributeName="transform"
                    type="rotate"
                    from="0" to="360"
                    dur="2s"
                    repeatCount="indefinite" />
</g>
```

## 重要陷阱

### `repeatCount` 在 `height`/`width` 动画上表现异常

微信对循环的 `height`/`width` 动画支持不完整。**避免使用 `repeatCount="indefinite"`**,改用具体数值(如 `repeatCount="3"`)或改用 `opacity`/`transform` 做循环动效。

### `indefinite` 值在 `begin` 属性里是允许的(不同含义)

```xml
<animate begin="indefinite" />
```
这表示"等待外部触发",配合 JavaScript 的 `.beginElement()` 调用——但因为微信禁用 JS,所以实际使用场景是通过其他元素的 `begin="someId.click"` 触发。

### `fill="freeze"` vs `fill="remove"`

- `fill="freeze"`:动画结束后停留在终态(常用)
- `fill="remove"`(默认):动画结束后回到初始态

大部分情况要显式写 `fill="freeze"`,否则你精心做的动画一结束就"弹回去"了。

### 不在白名单但经常被误用的属性

下面这些**在标准 W3C SVG 里可以动画,但微信会剥离**:

- `color`(用 `fill` 代替)
- `font-size`(用 `transform: scale` 代替)
- `transform`(不要直接动画 transform 属性,用 `animateTransform` 元素)
- `viewBox`(整个 SVG 的 viewBox 不能动画)
- `offset-path` / `offset-distance`(现代 CSS 特性,微信不支持)
- 任何 CSS 变量(`--var-name`)的动画

## 检查清单

写完动画后自查:

- [ ] 所有 `attributeName` 都在上述 20 个之内
- [ ] 没有 `repeatCount="indefinite"` 在 `height`/`width` 上
- [ ] 需要停留终态的动画加了 `fill="freeze"`
- [ ] 触发关系用 `begin="elementId.click"` 而不是 JS
- [ ] `animateTransform` 的 `type` 属性值正确(translate/scale/rotate/skewX/skewY)
