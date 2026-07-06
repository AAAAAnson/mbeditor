---
name: wechat-svg-author
description: "Agent 在 MBEditor 中创作或修改微信公众号交互 SVG block（HtmlBlock/SvgInteractiveBlock）的作者指南：五大模式、文案风格、创作闭环，诊断『浏览器好好的、进微信就坏了』。"
user-invocable: true
metadata:
  openclaw:
    emoji: "🎨"
---

# 微信公众号交互 SVG 作者 Skill

面向 agent 在 MBEditor 里**写新 block** 或**改已有 block**。规范的是技术可行性，视觉/叙事/排版自由。

## 触发时机

- 用户让你写/改一段面向公众号的交互 SVG（展开面板、翻卡、抽奖、进度条、CTA 等）
- 用户贴来一段外部 SVG 代码让你塞进编辑器
- 写/改 `HtmlBlock` 或 `SvgInteractiveBlock` 内容
- 排查『本地浏览器预览正常，发到公众号就失效/效果没出来』
- 用户丢来灵感图/参考链接问『能做成 SVG 吗』，你要判断可行性并落地
- Agent 自己生成 SVG 代码准备写入草稿前

## 先守边界，再做创意

动笔前确认三件事，任何一条不满足，微信保存时会**静默剥离**，线上表现为"效果没出来"而不是报错：

1. 要用的动画属性是否在 **20 个白名单**内？→ `docs/wechat-svg/whitelist.md`
2. 要用的 HTML/CSS 特性是否在禁用清单里？→ `docs/wechat-svg/html-css-restrictions.md`
3. 如果要跨平台（微博/头条）发布，规则差异？→ `docs/wechat-svg/multi-platform.md`

## 五大核心交互模式

任何复杂微信 SVG 拆到底层都是这五个原型的组合或单用。先判断归属，再去对应模板起稿。

| 模式 | 用途 | 典型场景 | 模板文件 |
|---|---|---|---|
| 伸长动画 | 点击展开/收起内容块 | FAQ、功能详情、长段分段揭示 | `docs/wechat-svg/templates/stretch-accordion.html` |
| 穿透触发 | 图层间点击响应控制 | 多层叠加、精确热区、装饰层不挡下层 | `docs/wechat-svg/templates/passthrough-hotspot.html` |
| 双层触发 | touchstart/click 300ms 时间差 | 确认型 CTA、无限选择器、分步引导 | `docs/wechat-svg/templates/dual-touch-cta.html` |
| 零高结构 | `height:0 + overflow:visible` 堆叠 | 几乎所有定制交互的底层骨架 | `docs/wechat-svg/templates/zero-height-stack.html` |
| 白名单动画 | 20 个 attributeName 的入场/装饰动画 | 呼吸光圈、描边绘制、渐显文字、旋转图标 | `docs/wechat-svg/templates/whitelist-hero.html` |

实现交互前**必读** `docs/wechat-svg/five-patterns.md`；完整 2000+ 字的设计参考作品见 `docs/wechat-svg/templates/`（每个模板都是生产级样稿，直接改造比从 0 写快得多）。模板索引在 `docs/wechat-svg/templates/README.md`。

## Agent 创作流程

收到写作需求后按顺序走：

1. **拆解用户意图** → 把需求归入五大模式之一（可多个组合）。看不清楚直接问用户，别脑补。
2. **Read 对应模板** → `docs/wechat-svg/templates/<pattern>.html` 作为起点。不要从空白开始。
3. **Read 对应深度文档** → `docs/wechat-svg/five-patterns.md` 的对应段落，确认 `pointer-events` 继承、`begin` 触发、`fill="freeze"` 这类细节。
4. **改写文案与视觉** → 在模板骨架上换文案、配色、viewBox、文字节奏。结构尽量少动。
5. **写完跳转校验门禁** → `skill/wechat-svg-validate.skill.md`，用 CLI/Python/HTTP 三选一跑校验。
6. **校验通过** → 写入编辑器的 `SvgInteractiveBlock` 或 `HtmlBlock`（publish 管线详见 `skill/mbeditor.skill.md`）。

一次只改一个变量：改动画属性、改结构、改触发关系不要混着做，否则排障成本翻倍。

## 文案风格

公众号文案风格指南：`docs/wechat-svg/copywriting-style.md`（必读）。Agent 最容易翻车的三个陷阱：

- **AI 味三段式**（『首先…其次…最后…』/ 『高效便捷智能』这类空话堆叠）——用具体场景、数字、对比替代
- **感叹号过载**（一段三四个『！』）——全文感叹号控制在 3 个以内
- **过于书面**（『综上所述』/ 『值得我们关注』）——读出声来语气不自然就改，公众号是口语化阅读场景

## 什么时候别写 SVG

不是所有东西都要塞进 SVG。**能用 HTML/纯文本表达就别包 SVG**：

- 标题、正文、列表、引用块——用编辑器的 Heading/Paragraph/List block；SVG 里的文字不可选中、不能被搜索、无障碍差
- 静态图片——直接上传图片走 Lane B，别手写 `<svg><image/></svg>`
- 纯装饰渐变背景——用 CSS 背景或 raster 图片

分层原则参考 `docs/agent/RENDER_DECISIONS.md` 的 HTML → SVG → raster 决策树：能上移一层就上移一层。

## 深色模式兜底

微信深色模式下 SVG 模块会被整块降级处理（颜色反转、甚至不渲染）。策略：

- 颜色用写死的十六进制，**不要用 CSS 变量**（`var(--xxx)` 在编辑器里常被剥离）
- 关键对比度要自己兜底：深色文字配深色背景的那类组合，在深色模式下直接看不见
- 必要时在文案层提示『请切换浅色模式查看完整效果』，这是行业通行兜底

## 创意自由度

Skill 规范的是**技术可行性**，以下完全自由：

- 视觉风格、品牌色、字体、插画风格、排版节奏、图文比例
- 叙事结构（开门见山 / 悬念铺垫 / 对比反差 / 场景代入）
- 交互创意——只要底层用五大模式和白名单属性，怎么组合随你

行业共识：**所有漂亮的 SVG 作品都是在规范内做出来的**。不要用 iframe/JS 注入等对抗性技术绕限制，微信会封号级处理。

## 离开本 skill 的出口

- **完稿（或改稿完成）** → `skill/wechat-svg-validate.skill.md` 过校验门禁
- **涉及产品/架构/发布管线/Lane A/B/C** → `skill/mbeditor.skill.md`
- **具体规则细节不确定** → `docs/wechat-svg/` 对应深度文档直接查表
