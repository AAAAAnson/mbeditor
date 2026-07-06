---
name: wechat-svg-validate
description: "微信公众号交互 SVG 发布前/入库前的校验门禁：CLI/Python/HTTP 三入口，区分 issues（必修）与 warnings（人工复核），给 agent 一个可自检的静态规则把关。"
user-invocable: true
metadata:
  openclaw:
    emoji: "🛡️"
---

# 微信 SVG 校验门禁 Skill

Agent 写完 block 准备入库或发布前，**必走**的静态校验门禁。把微信『静默失败』前置到写代码阶段。

## 触发时机

- 写完 `SvgInteractiveBlock` / `HtmlBlock` 准备入库或提交
- 准备调 `POST /api/v1/wechat/draft` 推草稿前
- 手写/外部粘入 HTML 后不确定是否踩线
- 用户反馈『发到公众号效果没出来』排障时（先过一遍校验排除低级错误）

## 为什么必走校验门禁

微信图文编辑器在保存时会**静默剥离**不支持的 SVG 属性、HTML 标签、CSS 特性——**不报错**，线上表现就是"效果没出来"。本地浏览器预览完全看不出来，只有 publish 之后才暴露。校验器的价值就是把这种静默失败拉到 agent 写代码的时间点，修复成本接近零。

## 三个等价入口

同一个校验内核（`backend/app/services/svg_validator.py::validate_html`）包三层壳，任选其一：

- **CLI**：`python scripts/validate_wechat_svg.py <file.html>`
  - exit 0 = 无 issues，可放行
  - exit 1 = 有 issues，必修
  - warnings 不阻断 exit code
- **Python**：`from app.services.svg_validator import validate_html` → `validate_html(html_str)` 返回 `{"issues": [...], "warnings": [...], "stats": {...}}`
- **HTTP**：`POST /api/v1/wechat/validate`，body `{"html": "..."}`，返回同形状 JSON

## issues vs warnings

清楚区分两类发现：

- **`issues` = 必修**。都是微信保存时会静默剥离的内容（白名单外的 `attributeName`、禁用 CSS 属性、`<script>`/`onclick`、禁用标签等）。留着就是发布后效果丢失。
- **`warnings` = 人工复核**。不一定错，但值得看一眼（`xmlns` 缺失、使用了 CSS 变量、`margin` 负值偏大、深色模式兜底缺失等）。不阻断 exit code，但 agent 应主动把 warnings 向用户摘要，由用户决定。

## 常见 issue 和定位

| 报告关键词 | 真实含义 | 去哪查修法 |
|---|---|---|
| `attributeName not in whitelist` | 用了 20 项白名单外的动画属性 | `docs/wechat-svg/whitelist.md` |
| `forbidden CSS property (clip-path/mask/filter/backdrop-filter/mix-blend-mode)` | 微信禁用的装饰类 CSS | `docs/wechat-svg/html-css-restrictions.md` |
| `position: absolute/fixed` | 微信禁用定位 | 用零高结构 + 负 margin 替代，见 `docs/wechat-svg/five-patterns.md` |
| `onclick / onload / on* handler found` | 行内事件处理器 | 删掉，改用 `begin="id.click"` 跨 SVG 触发 |
| `forbidden tag (script/iframe/embed/object/form)` | 禁用标签 | 删掉；`<form>` 改外链问卷 |
| `@keyframes found` | CSS 关键帧动画 | 改成 SVG `<animate>` / `<animateTransform>` |
| `invalid animateTransform type` | type 不是 translate/scale/rotate/skewX/skewY | 改成合法五选一 |
| `semantic-wrapper-tag`（warning） | 带样式的 `<article>`/`<main>`/`<header>` 等语义包裹——微信解包这些标签并丢弃其 style，页面背景会消失 | 包裹改用 `<section>`；sanitizer 复制时会自动改名，但源头就该写对，见 `docs/wechat-svg/html-css-restrictions.md` 第 6 节 |

## 校验失败的标准修复回路

1. **读报告** → 定位 issue 的行号与原因
2. **查对应深度文档** → 找替代方案（上表每一行都指了路）
3. **修一个改动 → 重跑校验** → 直到 exit 0（warnings 可保留但要摘要给用户）

一次只改一处。批量改然后重跑会让你搞不清哪个改动修好了、哪个反而引入了新 issue。

## 校验通过 ≠ 可以发布

校验器只查**静态规则**：属性名、禁用标签、事件处理器、xmlns、CSS 字面量。它**查不出**：

- 动画触发关系写错（`begin="id.click"` 引用的 id 不存在/不唯一）
- 交互体验问题（热区太小、反馈缺失、死链）
- 文案风格问题（AI 味、感叹号过载）
- 深色模式下的视觉崩塌
- iOS/Android 真机差异

真正的发布前完整检查在 `docs/wechat-svg/pre-publish-checklist.md`，**必读**。校验通过只是通过了技术底线，不是质量终点。

## 离开本 skill 的出口

- **校验通过** → 回到调用方（`skill/wechat-svg-author.skill.md` 继续创作循环，或 `skill/mbeditor.skill.md` 走发布管线）
- **某条规则不确定含义** → `docs/wechat-svg/` 对应深度文档直接查表
- **pre-publish 清单**（真机/iOS/Android/文案/品牌） → `docs/wechat-svg/pre-publish-checklist.md`
