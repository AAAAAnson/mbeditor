# 微信公众号 SVG 模板库

## 目的

这组模板是五大微信 SVG 交互模式的**生产级参考作品**。每个模板都是一篇可直接发布的长文,内容、视觉、交互三个维度都按"真刊发"标准做完 —— 读者进来是在读文章,不是在看 demo。Agent 和用户拿来当改编起点,比从零写省去 3 小时以上的技术决策成本。

跟 `docs/wechat-svg/five-patterns.md` 的代码样板是互补关系: 样板教你**单个模式怎么写**,模板教你**如何把一个模式织进一篇完整文章的叙事节奏里**。

## 使用方式

1. 先读 `docs/wechat-svg/five-patterns.md` 和 `whitelist.md`,理解五个交互原型与 20 属性白名单的边界
2. 从下方表格挑一个模板,选题贴合度不用 100%,交互模式契合就行
3. 文案、配色、数据改成你的,但**交互骨架原样保留**(`begin="id.click"`、`begin="id.touchstart"`、零高容器 `height:0; overflow:visible` 这些不要动)

## 模板索引

| 文件 | 交互模式 | 选题样本 | 字数 | 核心交互元素 |
|---|---|---|---|---|
| `stretch-accordion.html` | 伸长动画 + 零高结构 | 2026 年度 AI 生产力工具精选榜 TOP 10 | ~2040 | 10 张工具卡点击展开详细评测,`height` 从 0 到 260 |
| `passthrough-hotspot.html` | 穿透触发 + 精确热区 + 伸长 | 一张图看懂 2026 新能源汽车产业链 | ~2120 | 产业链图上 6 个 `pointer-events:all` 圆点,点击展开对应环节详情 |
| `dual-touch-cta.html` | 双层触发 (touchstart→click) | 年终行业共鸣投票 · 10 条判断 | ~2170 | 10 张遮罩卡 `touchstart` 时 `visibility=hidden`,露出下层投票结果 |
| `zero-height-stack.html` | 零高结构 · 多 SVG 堆叠 | 国产大模型编年史 2019 — 2026 | ~2030 | 时间轴下方 7 个零高展开条,点击年份独立展开该年三件大事 |
| `whitelist-hero.html` | 白名单动画 · 入场装饰 | 《2026 创业者年度复盘报告》发布 | ~2080 | Hero 区域全白名单入场(opacity / transform / r / stroke-dashoffset / width),配合正文数据条 |

## 改编规则

- **动画属性不能越出白名单** · `animate`/`set`/`animateTransform` 的 `attributeName` 必须在 20 项内(详见 `whitelist.md`);改动画时先查表
- **不要改 begin 触发方式** · `begin="id.click"` 和 `begin="id.touchstart"` 是微信原生支持的,改成 `begin="2s"` 或 JS 驱动都会失效;需要新的触发点,仿着现有结构新增 id
- **颜色可改但别硬写纯深色** · 每个模板都有一个明确的主色 + 辅色 + 强调色,换配色时记得同步改文末的「深色模式提示」;避免用 `var(--xxx)` 传参(微信会剥离)
- **CTA 地址替换时保留 anchor 结构** · `<a href="...">` 外层包 SVG 是可以的,但不要加 `target="_blank"` 以外的属性,也不要把 `href` 换成 JS
- **改完必过 validator** · 不要跳过这一步;任何手动改动都可能引入一个你没意识到的禁用字符串(比如 "mask"、"clip-path"、"position: absolute")

## 验证

```bash
python scripts/validate_wechat_svg.py docs/wechat-svg/templates/<file>.html
```

`exit 0` 才能用。出现 `issues` 必须修到零;`warnings` 看情况处理,不卡发布。
