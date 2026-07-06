# 微信 SVG 能力真相表（add_draft 真机回读）

运行日期：2026-06-13

| 探针 | 断言 | 标记 | 提交时 | 回读后 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `svg-id-retention` | §2.2 id 被全量剥离（confirmed）——验证 <svg> 子树内的 id 是否被微信剥除 | SVG 内 rect 的专属 id=probe-svgid-9f2 是否存活 | ✅ | ❌ | stripped |
| `html-id-retention` | §2.2 id 剥离是否同样作用于普通 HTML 元素（对照组） | HTML span 的专属 id=probe-htmlid-4c8 是否存活 | ✅ | ❌ | stripped |
| `linear-gradient-fill-url` | §2.3 SVG 渐变须 id 引用——id 被剥则 fill=url(#) 悬空失效 | linearGradient 定义（含专属 id）是否存活 | ✅ | ❌ | stripped |
|  |  | fill=url(#probe-grad-7a3) 引用是否存活 | ✅ | ✅ | allowed |
| `filter-url-reference` | §2.3 SVG 滤镜须 id 引用——id 被剥则 filter=url(#) 失效 | <filter> 定义（含专属 id）是否存活 | ✅ | ❌ | stripped |
|  |  | filter=url(#probe-filter-2b9) 引用是否存活 | ✅ | ✅ | allowed |
|  |  | feGaussianBlur 专属 stdDeviation=2.7 是否存活 | ✅ | ✅ | allowed |
| `clip-path-reference` | §2.2/2.3 clip-path 须 id 引用；FORBIDDEN_CSS_PROPERTIES 含 clip-path | <clipPath> 定义（含专属 id）是否存活 | ✅ | ❌ | stripped |
|  |  | clip-path=url(#probe-clip-5d1) 引用是否存活 | ✅ | ✅ | allowed |
| `mask-reference` | §2.3 mask 须 id 引用；FORBIDDEN_CSS_PROPERTIES 含 mask | <mask> 定义（含专属 id）是否存活 | ✅ | ❌ | stripped |
|  |  | mask=url(#probe-mask-8e4) 引用是否存活 | ✅ | ✅ | allowed |
| `use-href-reference` | §2.3 <use> 须 id 引用——id 被剥则 <use> 失效 | 被复用元素的专属 id=probe-use-3f7 是否存活 | ✅ | ❌ | stripped |
|  |  | <use href=#probe-use-3f7> 引用是否存活 | ✅ | ✅ | allowed |
| `animate-element` | §2.2 SMIL animate 保留——SMIL 是唯一动画通道 | <animate> 标签（须排除 animateTransform/Motion）是否存活 | ✅ | ✅ | allowed |
|  |  | animate 的专属 dur=1.7s 是否存活（确认非空壳） | ✅ | ✅ | allowed |
|  |  | attributeName=opacity（注意微信可能小写化）是否存活 | ✅ | ✅ | allowed |
| `animate-transform-element` | §2.2 SMIL animateTransform 保留（白名单 attributeName=transform） | <animateTransform> 标签（微信可能小写化）是否存活 | ✅ | ✅ | allowed |
|  |  | animateTransform 专属 dur=2.3s 是否存活 | ✅ | ✅ | allowed |
|  |  | type=rotate 是否存活 | ✅ | ✅ | allowed |
| `animate-motion-inline-path` | §2.2 animateMotion 须用 path 内联（id 被剥则 mpath 不可用，推断） | <animateMotion> 标签（微信可能小写化）是否存活 | ✅ | ✅ | allowed |
|  |  | 内联 path 专属路径数据 M13,17 Q100,71 是否存活 | ✅ | ✅ | allowed |
| `mpath-reference` | §2.2 mpath 引用 id——id 被剥则 mpath 失效（推断为不可用） | 被引用 path 的专属 id=probe-mpath-6a2 是否存活 | ✅ | ❌ | stripped |
|  |  | <mpath href=#probe-mpath-6a2> 引用是否存活 | ✅ | ✅ | allowed |
| `set-element` | §2.2 SMIL set 保留（白名单 attributeName=visibility） | <set attributeName=visibility> 标签是否存活 | ✅ | ✅ | allowed |
|  |  | set 专属 begin=1.3s 是否存活 | ✅ | ✅ | allowed |
|  |  | attributeName=visibility（微信可能小写化）是否存活 | ✅ | ✅ | allowed |
| `begin-click` | §2.2 begin=click 点击触发在 2024-2026 仍有效（uncertain） | begin=click 触发声明是否存活 | ✅ | ✅ | allowed |
|  |  | 承载 click 的 animate 专属 dur=4.1s 是否存活 | ✅ | ✅ | allowed |
| `begin-click-offset` | §2.2 begin=click+偏移 复合触发是否存活（uncertain，格式细节敏感） | begin=click+2s 复合触发是否完整存活 | ✅ | ✅ | allowed |
|  |  | 承载偏移触发的 animate 专属 dur=4.3s 是否存活 | ✅ | ✅ | allowed |
| `begin-id-click` | §2.2 begin=id.click 跨元素触发——依赖 id，id 被剥则失效 | 触发源元素的专属 id=probe-trigger-9c3 是否存活 | ✅ | ❌ | stripped |
|  |  | begin=probe-trigger-9c3.click 跨元素引用是否存活 | ✅ | ✅ | allowed |
| `pointer-events-none-style` | §2.3 pointer-events 穿透热区——style 白名单不含则被剥（uncertain 真机） | style 内 pointer-events:none 是否存活 | ✅ | ✅ | allowed |
|  |  | 承载该样式的专属 fill=#e1f2a3 是否存活（定位元素） | ✅ | ✅ | allowed |
| `stroke-dasharray-attr` | §2.2 stroke-dasharray 被多源实测保存时被剥——应降级 warning | stroke-dasharray=7 13 专属值是否存活（预期被微信剥离） | ✅ | ✅ | allowed |
|  |  | 承载 dasharray 的 line（专属 stroke=#f2a3b4）是否存活 | ✅ | ✅ | allowed |
| `style-fill-stroke-transform` | §2.2/2.3 style 里 fill/stroke/transform 被白名单剥除（站内）/真机存疑 | style 内 fill:#a3b4c5 是否存活 | ✅ | ✅ | allowed |
|  |  | style 内 stroke:#b4c5d6 是否存活 | ✅ | ✅ | allowed |
|  |  | style 内 transform:translate(17px,7px) 是否存活 | ✅ | ✅ | allowed |
| `background-url-quoted` | §2.1 background:url() 加引号→整条样式被过滤（confirmed，反例对照） | 带引号 background:url(...probe_q9z7...) 是否存活（预期被剥） | ✅ | ✅ | allowed |
|  |  | 独立锚点段落 color:#c5d6e7 是否存活（证明探针整体回读成功） | ✅ | ✅ | allowed |
| `background-url-unquoted` | §2.1 background:url() 无引号→保留（confirmed，正例对照） | 无引号 background:url(...probe_u4w8...) 是否存活 | ✅ | ✅ | allowed |
| `style-block` | §2.1 <style> 被整体剥离（confirmed）——CSS animation 不可用 | <style> 块内专属选择器 .probe-style-z3k7 是否存活（预期被剥） | ✅ | ❌ | stripped |
|  |  | @keyframes probeSpin 是否存活（预期被剥） | ✅ | ❌ | stripped |
|  |  | 独立锚点段落 color:#3b9c7a 是否存活（区分被剥 vs 整篇被拒） | ✅ | ✅ | allowed |
| `height-percent` | §2.2 百分比单位在 height 失效，须 px/vw/vh（uncertain） | height:43% 百分比专属值是否存活（预期失效/被改写） | ✅ | ✅ | allowed |
|  |  | 同声明 background:#f8a9ba 是否存活（定位元素仍在） | ✅ | ✅ | allowed |
| `svg-width-100` | §2.2 svg 自身 width:100% 自适应可用（uncertain，证据最弱） | svg style 内 width:100% 是否存活 | ✅ | ✅ | allowed |
|  |  | 承载该样式的 svg 专属 fill=#a9bacb 是否存活 | ✅ | ✅ | allowed |
| `external-image` | §2.2 <image> 须 mmbiz 链接 + 显式 width/height（uncertain，证据停在 2020） | <image> 标签是否存活 | ✅ | ✅ | allowed |
|  |  | image 专属外链 probe_img_k7m2 是否存活 | ✅ | ✅ | allowed |
|  |  | image 显式 width=83（专属值）是否存活 | ✅ | ✅ | allowed |
| `nested-svg` | §2.2 SVG 不可嵌套 SVG（uncertain，证据停在 2020） | 内层嵌套 svg 的专属 fill=#cbdced 是否存活（预期内层被剥/扁平化） | ✅ | ✅ | allowed |
|  |  | 外层 svg 专属 fill=#bacbdc 是否存活（外层应保留） | ✅ | ✅ | allowed |
| `opacity-zero-start-style` | §P0-4 sanitize 的 opacity:0→1 改写毁掉淡入初始态——验证 opacity:0 起手是否保留 | style 内 opacity:0 起手态是否被保留（未被改写为 1） | ✅ | ✅ | allowed |
|  |  | 承载淡入的 animate 专属 dur=5.9s 是否存活 | ✅ | ✅ | allowed |
| `animate-restart-never` | §2.2 iOS：restart=never 无效——回读检测该属性是否在服务端被保留（前置条件） | restart=never 属性是否存活到回读 HTML（iOS 行为另需真机核验） | ✅ | ✅ | allowed |
|  |  | 承载该属性的 animate 专属 dur=6.1s 是否存活（确认非空壳） | ✅ | ✅ | allowed |
| `g-style-transform-origin` | §2.2 iOS：<g> 的 style 失效须改 transform 属性 / transform-origin 异常——回读检测 <g> 的 style 与 transform-origin 是否被服务端剥离/改写（前置条件） | <g> 的 style 内 transform:translate(13px,9px) 是否存活 | ✅ | ✅ | allowed |
|  |  | <g> 的 style 内 transform-origin:23px 17px 是否存活（iOS 上异常须真机核验） | ✅ | ✅ | allowed |
|  |  | 承载样式的 <g> 内 rect 专属 fill=#9c5ad3 是否存活（定位分组未被整体剥） | ✅ | ✅ | allowed |
| `animate-values-keytimes-semicolon` | §2.2 分号等格式细节致 animate 失效——尾随分号致 values/keyTimes 长度错配；回读检测尾随分号是否被服务端保留（保留=跨端解析 bug 的诱因仍在） | values 串带尾随分号 0;0.5;1; 是否被原样保留（保留则解析 bug 诱因仍在） | ✅ | ✅ | allowed |
|  |  | keyTimes 串带尾随分号 0;0.5;1; 是否被原样保留 | ✅ | ✅ | allowed |
|  |  | 承载属性的 animate 专属 dur=6.7s 是否存活 | ✅ | ✅ | allowed |
| `stroke-rx-ry-attrs` | §2.2 stroke/rx/ry 被白名单误杀需复核（报告第43行，对照 T/CASME 1609—2024）——回读检测三者作为独立 SVG 属性在微信侧是否保留（区分站内 validator 误杀 vs 微信剥除） | stroke 独立属性 stroke=#7a5ad3 是否存活（区分站内误杀 vs 微信剥除） | ✅ | ✅ | allowed |
|  |  | rx=9 圆角属性是否存活 | ✅ | ✅ | allowed |
|  |  | ry=7 圆角属性是否存活 | ✅ | ✅ | allowed |
| `position-and-transform-percent` | §2.2 position 删除 / transform 位移须 px 而非百分比（uncertain，同组遗漏两条）——回读检测 position:absolute 是否被删、transform:translate(百分比) 是否被剥/改写 | position:absolute 声明是否存活（预期被微信删除） | ✅ | ✅ | allowed |
|  |  | transform:translate(37%,19%) 百分比位移是否存活（预期失效/被剥改写） | ✅ | ✅ | allowed |
|  |  | 独立锚点 background:#d35a7a 是否存活（证明元素整体留存，剥离判定有效） | ✅ | ✅ | allowed |

---

> 说明：`allowed` 表示该能力在微信服务端清洗后仍保留于存储 HTML；`stripped` 表示被微信剥离；`error` 表示该探针 API 调用失败、无法判定。

> **本表仅验证服务端 sanitizer（即 `draft/get` 回读到的存储 HTML），渲染层（iOS / Android 真机）的实际显示效果另需人工核验。**
