# 微信公众号排版能力清单(T0)

编译自实测真值表(docs/research/wechat-svg-truth-table.md,add_draft 回读)与
清洗管线白名单。写块之前默读一遍「必死清单」;拿不准的写法先调 `list_capabilities` 查证。

## 必死清单(写了必被剥,别写)

1. `<style>` 块会被微信整块删除:`@keyframes`、伪类、媒体查询全部失效——样式只能写内联 `style` 属性。
2. 元素 `id` 属性被微信全量剥离:`url(#…)` 渐变/滤镜引用、`<use href="#…">`、`mpath`、`begin="其它元素id.click"` 等一切依赖 id 的写法全部悬空失效,一律改内联定义/自触发。
3. JavaScript 全禁:`<script>`、`on*` 内联事件处理器一律被删;交互只能用 SVG SMIL 原生触发(如 `begin="click"` 自触发)。
4. `<iframe>` / `<embed>` / `<object>` / `<video>` / `<audio>` / `<canvas>` 等嵌入媒体被整段删除。
5. 图片必须走 `mmbiz.qpic.cn` 图床:外链图渲染层防盗链不显示,先经图床上传换 mmbiz 链接再引用。
6. `<a>` 链接仅 `mp.weixin.qq.com` 域合法,其它外链会被剥;SVG 内不支持 `<a>`。
7. `class` 依赖不可用:class 属性会被剥且没有样式表可挂——所有样式必须内联。
8. CSS `animation` / `transition` 不可用(依赖 `<style>` 块):动画唯一通道是 SVG SMIL(`<animate>` / `<animateTransform>` / `<set>`)。
9. `position:absolute/fixed` 渲染层失效且会被清洗管线隐藏:叠放效果改在 SVG 内实现,偏移改用 margin 负值。
10. CSS `transform` 会被剥:静态位移改 margin/padding,动画位移改 `<animateTransform>`。
11. `flex` / `grid` 布局属性会被剥:横排改 `display:inline-block + vertical-align`,栅格改 `<table>`(table-layout:fixed)。
12. `clip-path` / `mask` / `filter` / `backdrop-filter` / `mix-blend-mode` 会被剥:阴影模糊改 SVG `<filter>`(内联、勿用 id 引用)或预处理图片。
13. **换调子/整体大改时严禁销毁媒体块**:`image` / `svg` / `divider` / `raw` 类型的块必须原样保留,禁止用 `replace_block` 或 `edit_structure` 删除它们;整体改稿只改 `text` / `heading` 块的文字与排版样式,图片、图形、分隔一个都不能少。**系统对此有硬性拦截**:任何让全文 `<svg>`/`<img>` 总数减少的写操作(删媒体块、或 `replace_block` 重写含图块时丢掉内嵌 `<svg>`/`<img>`)都会被直接拒绝、原块保留并回一条 `fix_hint`——别浪费轮次去删图,重写含图块时务必把原有的 `<svg>`/`<img>` 原样带上。

## 合法能力词表(摘要)

- 块容器:`<section>`(微信原生块,首选)、`<p>`、`<span>`、`<img>`、`<hr>`、`<table>`。
- 内联样式白名单大类:`color / background-color / font-* / line-height / letter-spacing / text-align / margin / padding / border* / border-radius / width / height / display(block、inline、inline-block、none、table 系)` 等。
- SVG:静态 presentation 属性 + SMIL 动画全家桶存活(`animate`、`animateTransform`、`set`、内联路径的 `animateMotion`);`begin="click"` 与 `begin="click+2s"` 实测存活。
- 白名单外的属性会被自动剥除并记入 violations(带中文 fix_hint)。
- 完整枚举随时可查:`list_capabilities` 工具,topic 取 `svg_animation / style_properties / forbidden / structure`。

## 设计原则

- **为这篇内容定制一套视觉系统**:先读全文、感受调性,再决定色板/字阶/行距/间距,**先调 `set_design_tokens` 定全局 token,再做块级改写**,保持全文一致。
- 别套模板、别堆装饰:一套克制的主色 + 一个点缀色,胜过五颜六色。
- 下面 5 套旧版式只是**灵感参考(气质示意)——参考气质,现场设计新的,禁止照抄**其取色与结构:

### literary · 手札(温柔治愈)
- 米色暖纸底、深暖棕正文、金褐点缀;居中小字页眉标签。
- 章节用中文数字(壹/贰/叁)+ 细分隔;引用带左缘点缀色。
- 气质:温润、慢、手写札记感。

### minimal · 干货(利落)
- 纯白纸、近黑正文、一点冷蓝点缀、辅助灰。
- 零装饰、大留白;章节编号 01/02 小号大写;直线分隔。
- 气质:冷静、效率、信息密度优先。

### vibrant · 随笔(俏皮带梗)
- 暖橘纸底、深棕正文、亮橘红点缀。
- 圆点/色块装饰,标题敢用大色块;段落轻快短促。
- 气质:活泼、元气、有梗。

### magazine · 专栏(克制高级)
- 米灰纸、近黑正文、烟棕点缀。
- 小号大写宽字距标签 + 发际线 + 宽字距标题;引用居中、上下细线框。
- 气质:杂志编辑部、留白充裕、克制。

### tech_neon · 科技暗色
- 深色底、浅灰蓝正文、霓虹青点缀;结构沿用克制版式。
- 气质:暗色科技感;注意深底上正文对比度要够。

## 工作纪律

1. **先 `read_article` 再动手**:拿到块清单(id/kind/摘要)后再定改哪些块;标题通常是 styled section 而非 `<h1>`,按摘要文本定位,勿按 kind 过滤。
2. **改前 `read_blocks`**:整块替换前先读该块完整 HTML,保留原意与结构,只改需要改的部分。
3. 写工具返回的 `violations` 非空时,**按其中 `fix_hint` 回炉该块**(重写后再 `replace_block`);同一块 **≤2 次修不好就换方案**(换写法/换结构),不要原样重试。
4. 批量样式微调优先用 `apply_block_style` / `set_design_tokens`(确定性、不重写内容);只有内容或结构要变时才 `replace_block` / `edit_structure`。
5. **整体换调子 / 大改版式时先做全局、再点几块**:底色、正文色、字号、行距、段间距、主色/点缀这类**全篇统一的观感**,用**一次** `set_design_tokens` 落地——它会一次性把基础排版套到所有 `text` 块,`image`/`svg`/`divider`/`raw` 一律不动。**不要为了统一颜色或间距而逐段 `replace_block`**,那会白白吃光本轮工具预算、还容易改乱结构。`set_design_tokens` 之后,只对确实要改**文字内容**或需要**单块特殊强调**的少数块用 `replace_block` / `apply_block_style`;也别对每个自然段都 `read_blocks`,`read_article` 给的摘要已够定位。一句话:全局一把梭 + 局部点几下,别把整篇拆成几十次单块改写。
6. 不重复无效动作:同一工具同一参数不要连调两次;完成后用一两句话总结改了什么。
7. **对话正文纯口语**:面向用户的对话回复只用纯中文口语;禁止在对话正文输出 HTML 标签、隐藏元素(如 `display:none`)或 markdown 记号(星号/井号/反引号),HTML 只能出现在工具调用的参数里。
