---
name: wechat-svg-design
description: "微信公众号 SVG 交互与排版的工程约束层：20 个白名单属性、五大核心模式、HTML/CSS 禁用清单、文案风格、发布前自检、跨平台差异。任何涉及公众号推文、SVG 交互、HtmlBlock 手写代码、iSVG、推文排版的创作与评审都应参考本 skill。"
user-invocable: true
metadata:
  openclaw:
    emoji: "🎨"
---

# 微信公众号 SVG 交互设计与排版规范

这份 skill 规范的是**技术可行性和平台合规**，不限制视觉/叙事/交互创意。面向 MBEditor 中 `HtmlBlock` 的手写代码和 AI 生成内容。

## 触发时机

- 写/改 `HtmlBlock` 内容，尤其涉及 `<svg>`、`<animate>`、交互动画
- 评审公众号推文技术可行性
- Agent 生成面向公众号的 HTML/SVG 代码
- 遇到"浏览器里好好的，发到公众号就坏了"的排查需求

## 先守边界，再做创意

在动笔前确认三件事：

1. 要用的动画属性在 **20 个白名单** 内吗？ → 查 `docs/wechat-svg/whitelist.md`
2. 要用的 HTML/CSS 特性不在禁用列表里吗？ → 查 `docs/wechat-svg/html-css-restrictions.md`
3. 跨平台发布(微博、头条)有无差异？ → 查 `docs/wechat-svg/multi-platform.md`

违反子集边界的代码在微信编辑器保存时会被**静默剥离**——线上看到的是"效果没出来"而不是报错。

## 五大核心交互模式

| 模式 | 用途 |
|---|---|
| 伸长动画 | 点击展开/收起内容块 |
| 穿透触发 | 图层间响应关系控制 |
| 双层触发 | touchstart/click 300ms 时间差实现多步交互 |
| 零高结构 | height:0 + overflow:visible，几乎所有定制交互的底层 |
| 白名单动画 | 20 个 attributeName 的原生 SVG 动画 |

代码样板见 `docs/wechat-svg/five-patterns.md`，实现交互前**必读**。

## 项目内校验资源

| 入口 | 用途 |
|---|---|
| `docs/wechat-svg/` | 规范文档，agent 可直接 Read |
| `scripts/validate_wechat_svg.py` | 静态 CLI 校验器，退出码 0/1 |
| `backend/app/services/svg_validator.py` | 运行时校验服务，返回结构化 JSON |
| `POST /api/v1/wechat/validate` | 前端和 agent 的校验端点 |

## Agent 操作闭环

Agent 生成 `HtmlBlock` 时的推荐流程：

1. 生成前 Read `docs/wechat-svg/whitelist.md` 和 `docs/wechat-svg/html-css-restrictions.md`
2. 生成后调 `POST /api/v1/wechat/validate { html }` 自检
3. 根据返回 `issues` / `warnings` 修正
4. 通过后再推送 `POST /api/v1/wechat/draft`

## 创意自由度

规范的是**技术可行性**，不限制：

- 视觉风格、品牌色、字体、插画风格、版式节奏
- 叙事结构、开门见山 / 悬念铺垫 / 对比反差
- 交互创意：只要在白名单内，怎么组合都可以
- 排版节奏、图文比例、段落长度

## 一条原则收尾

不要用对抗性技术绕限制（iframe、硬塞 JS），微信会封号级处理。行业里漂亮的 SVG 作品都是在规范内做出来的。
