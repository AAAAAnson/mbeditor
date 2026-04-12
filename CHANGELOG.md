# Changelog

All notable changes to MBEditor will be documented in this file.

## [4.0.0] - 2026-04-12

### Added — WeChat publish pipeline hardening
在 MB 科技测试公众号端到端验证了一篇 600 行的复杂动画 HTML（`printmaster_wechat_animated.html`，含 hero、SVG 插画、grid 布局、scroll-reveal 动画、CTA 按钮），草稿高度还原度达 **0.37%**。修复了四个会让复杂 HTML 在微信草稿视图悄悄破坏的 pre-publish 陷阱：

- **`opacity:0` → `opacity:1` 重写**。依赖 JS `IntersectionObserver` 的 `.reveal` / scroll-reveal 模式默认隐藏所有内容。微信禁 JS，这些元素会永远看不见。
- **`transform:translate*(...)` → `transform:none` 重写**。同 scroll-reveal 模式用 translateY 把内容推到下方等 JS 拉回来。没 JS 就是永远偏移。
- **`transition*` / `animation*` 属性全 strip**（CSS 规则 + inline style 双通道）。微信草稿是静态快照，保留这些只会让合成层 sub-pixel 漂移。
- **`position:absolute|fixed` → `display:none`**。微信 MP 后端 ingest 时**全删 `position` 属性**（亲测验证）。装饰性 absolute 元素（例如 hero 里的浮动圆球）会变成 static block 撑高父容器。直接隐藏更干净。
- **`<a>` → `<section>` 改写**。微信从正文 strip 所有 `<a>` 标签（只允许小程序 / 阅读原文 / 同号文章）。视觉按钮样式保留，href 丢掉。
- **`content_source_url` 自动抽取**：第一个外部 `<a href="...">` 的 URL 自动设为草稿的"阅读原文"链接（公众号文章**唯一**能点的外链入口）。

### Added — 校准基础设施
- `backend/tests/visual/dump_wechat_computed_styles.py`：推草稿 → 登录打开 draft 编辑页 → dump `.rich_media_content` / h1-h6 / p / ProseMirror 父元素的全部 computed style 到 JSON。视觉一致性校准的 ground truth。
- `scripts/test_publish_html.py`：跑 `/publish/preview` + `/publish/draft` + 截 WeChat 草稿的一条龙 smoke test。
- `scripts/test_publish_direct.py`：绕过 API 直接 import `_process_for_wechat` + `wechat_service.create_draft`。当 uvicorn 进程持有旧字节码时用它。
- `scripts/compare_source_vs_draft.py`：headless chromium 渲染 source HTML @ width=586，与 WeChat 草稿截图做 side-by-side 四象限对比图。

### Fixed — 视觉一致性基线 20.96% → 1.47%
在 H1-H6 + 段落基线 doc 上从 20.96% 像素差降到 1.47%。剩余 1.47% 是单行段落的 sub-pixel 字符漂移，不改源文本无法消除。完整校准过程见 `docs/research/RESEARCH_CORRECTIONS.md`。

- `backend/tests/visual/infrastructure.py:_BODY_STYLE_FLUSH` 完整镜像微信 `.rich_media_content` 容器：`letter-spacing:0.578px`、`padding:0 4px`、`box-sizing:border-box`、`font-family` 完整栈匹配、`display:flow-root` 建立 BFC、`border-top:1px solid transparent` 阻止首 heading marginTop 折叠，以及 `contenteditable="true"` 启用 `line-break:after-white-space`。
- `_HEADING_STYLES` / `_PARAGRAPH_STYLE` 改用**整数 px line-height**（h1=36、h2=31、h3=27、h4=24、h5=22、h6=21、p=29）取代 1.4 / 1.8 倍率。小数 line-box 的累积 round 在 editor / draft 双 renderer 上会分歧。
- 标题和段落渲染器把文本内容用 `<span leaf=""></span>` 包裹，镜像微信 ProseMirror contenteditable ingest 时自动加的 leaf 标记。span 建立内 inline box，影响 `text-align:justify` 的字符空间分布。

### Documentation
- `docs/research/RESEARCH_CORRECTIONS.md` 新增 2026-04-11 校准完整过程 + 2026-04-12 publish pipeline 陷阱 writeup，含微信草稿容器 CSS 参考表，未来校准会话可作为单一事实源。
- `skill/mbeditor.skill.md` 新增 "Publish Pipeline 已知陷阱"章节，其他 Agent 可直接查表避坑。

### Known Issues
- **Host-port shadowing**：如果有 stale 本地 Python 进程绑定 docker-compose backend 同端口（比如 7072），docker publish 会被僵尸 listener shadow。症状：API 返回旧版本号但镜像内 config 是新的。排查：`Get-NetTCPConnection -LocalPort 7072 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }`，kill 掉非 `com.docker.backend` 的监听者。
- **uvicorn 无 `--reload` 时缓存旧字节码**：生产部署 docker 没问题；本地开发务必加 `--reload`，否则改 `publish.py` 后 API 仍跑旧代码。

## [3.1] - 2026-04-09

### Fixed
- **预览所见即所得** — 预览框改为显示后端处理后的内联化 HTML，复制到微信后台的效果与预览完全一致
- 移除 base CSS 中 section 全局 margin/padding 重置，防止覆盖文章自定义样式
- 复制时直接使用预处理好的 HTML，避免重复 API 调用

## [3.0] - 2026-04-09

### Changed
- 下架 SVG 交互模板功能（不稳定，代码保留待优化）
- 排版组件全面转向纯 inline style HTML（标签徽章、渐变卡片、数据看板、时间线、引用样式、对比表格）
- 复制/发布流程注入 base styles，实现所见即所得
- 示例文章重新设计

### Added
- Docker 启动自动创建 data 目录（无需手动 mkdir）
- 首页 Header 设置页面入口
- README 升级指南

### Fixed
- 复制富文本 / 推送草稿箱与预览样式不一致的问题

## [2.0] - 2026-04-06

### Added
- SVG + foreignObject 交互组件（6 种纯 CSS 模板）
- 发布弹窗微信配置连接测试
- 5 种排版设计模板

## [1.0] - 2026-04-03

### Added
- 初始版本
- HTML / Markdown / 可视化三种编辑模式
- Monaco Editor 代码编辑
- 微信公众号草稿箱推送
- 图片上传管理
- CSS 自动内联
- Docker 一键部署
- AI Agent Skill 文件
