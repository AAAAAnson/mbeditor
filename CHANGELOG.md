# Changelog

All notable changes to MBEditor will be documented in this file.

## [6.1.0] - 2026-07-07

### Added — 文章背景色（可控、会随复制保留）
- 编辑器预览工具栏新增「背景」控件:一键设置整篇文章的背景色(铺满全篇),或清空回透明。设置后背景会随「复制到公众号」一起带过去。
- AI 对话也能改背景:对 Agent 说「把背景换成淡米色」即可,走 `set_design_tokens` 的 `background_color`。
- 背景是文章自身的显式属性(存在最外层 `<section>` 上),而非编辑器外观——所见即所得:编辑器里显示什么颜色,复制到公众号就是什么颜色。

### Changed — 编辑器画布改为纯白
- 预览画布底色从暖米色改为纯白,模拟公众号的白色页面。文章默认无背景(透明),复制到公众号即呈现公众号自身的白底;只有显式设置背景色后,文章才带上背景。
- 深色版式(如霓虹科技)的深色底作为该版式自带的背景保留,浅色文字照常可读。

## [6.0.0] - 2026-07-06

> 从「交互式 SVG 编辑器」升级为「一句话 → AI 出整篇好看推文」的 open-core 创作工具：自带模型 key（BYOK），AI 流式生成、对话式改稿、预览即所得、一键存草稿。

### Added — 一句话 AI 写作（Compose，BYOK）
- 输入一个主题，AI 流式生成整篇排版好的公众号推文，预览即所得，一键存草稿。模型自带（BYOK，如 DeepSeek），API key 只存本地/后端具名卷、不入仓库。
- 按「调子」分派 4 套结构性不同的版式（literary / minimal / vibrant / magazine），非只换配色。

### Added — AI 改稿闭环
- 选中即改：在预览里选中段落 → 润色 / 缩短 / 换个说法 / 自由指令，流式替换，采用 / 再来一版 / 还原。
- 文档栏「AI 改稿」：标题重拟三候选、摘要重写、整体换调子、缩到指定长度。

### Added — Agent 对话式编辑
- 统一的 AI 对话面板，用自然语言指挥修改文档；原生 function calling、块级增量更新。
- 媒体守恒硬保护：AI 改写不会丢失文中的图片 / SVG（写工具让全文媒体标签总数变少即拒绝并回退）。

### Added — 内容安全：文章存储 + 版本历史 + 回收站
- 文章存储迁到后端（云端持久化 + 离线缓存 + 重连补同步），不再只存浏览器 localStorage。
- 版本历史与一键恢复；AI 破坏性改写前自动落版本快照。
- 软删除回收站，可恢复或彻底删除。

### Added — 产品化改造：小白即用
- 「起稿台 / 设置」两栏导航 + 暖橙 cozy 主题 + 品牌 logo；简单 / 专业双模式（专业模式解锁代码抽屉、Lint、结构面板）。
- 移动端 390px 响应式（底部导航 / 单列 / 手风琴设置）；右侧代码抽屉可拖拽调宽；手机预览。
- AI 连接图文向导、公众号绑定向导、复制优先发布。

### Added — 发布增强
- SVG-SMIL 动画发布前预警；「复制富文本」与「发到草稿箱」双路径，背景 / 格式完整。

### Added — 公众号 AppSecret 服务端持久化（2026-06-14）
- AppSecret 从"前端会话内存"迁到后端具名卷:新增 `app/services/credentials.py`（按 appid 存 `credentials.json`,明文 + chmod 600,原子写）+ `/api/v1/settings/credentials` GET/PUT（GET 只回已配置 appid 列表、绝不回密钥;PUT `""`=清、`null`=保持、非空=存,存/清后清该 appid 的 token 缓存）。
- `wechat_service.get_access_token` 加单点回退:**请求带的 appsecret > 后端存储 > 400**,发布/上传/测试全链路生效;发布路径前端零改动（已转发会话内 appsecret,刷新后为空→后端回退）。
- 前端「设置 → 公众号」:保存账号即上传密钥、显示「🔒 密钥已保存」、刷新免重输、删除清服务端密钥、测试守卫对已保存号放行。
- 复用既有 `mbeditor-data` 卷（不新增卷),护栏 `test_compose_has_no_user_content_volume` 不变;请求携带 appsecret 仍向后兼容。后端 701 passed,前端 7 passed + tsc 通过。

### Added — 微信网关网页可配置 + 可插拔传输（2026-06-14）
- 网关从"纯后端 env"演进为**网页可配置**：新增 `app/services/gateway.py` 可插拔传输（`direct` / `https-gateway`，`ssh-socks` 留待后续），`wechat_service.py` 调用时经 `resolve()` 选路，优先级 **stored 配置 > env(`WECHAT_API_BASE`) > 直连**。
- 新增 `/api/v1/settings/gateway` GET/PUT/test：GET 脱敏（只回 `tokenConfigured`/证书指纹，绝不回令牌或 PEM 原文），PUT 留空=保持，test 探测可达性/TLS/取 token。前端「设置 → 发布服务器」分区配置开关/地址/令牌/证书，令牌与证书**只写不回显**。
- 配置存后端 Docker 具名卷 `mbeditor-data:/app/data/gateway.json`（仓库树外、扛 `up -d --build`、不入仓库）；env 方式向后兼容。后端"零数据卷"护栏测试收窄为"零*用户数据*卷"（`test_compose_has_no_user_content_volume`）。
- 脱敏：`.gitignore` 增 `data/gateway.json`；`save_stored` 卷不可写时转可读错误。后端 684 passed，前端构建通过。

### Fixed — 草稿「content size out of limit」+ 图床字段名（2026-06-14）
- 图文多/大时推草稿报微信 `content size out of limit`(正文超 ~1MB)。根因:base64 截图内联,且草稿路径的图床卸载因 multipart 字段名错配(代码用 `file`+Bearer,doocs-md 图床要 `image`+表单 `token`,即 `.env` 早声明却没被读的 `LOCAL_IMGBED_UPLOAD_FIELD`/`LOCAL_IMGBED_TOKEN_FIELD`)全部失败 → base64 留正文 → 超限。
- A:`local_imgbed_service` 改读那俩 env(默认 `file`+Bearer 向后兼容)。
- B:`publish_draft_sync` 图片改走 `wechat_service.process_html_images`(微信 mmbiz `media/uploadimg`,经网关白名单)→ 正文缩到 URL + 图片微信内可见(LAN imgbed URL 微信服务器抓不到)。后端 704 passed,已部署生产并实证一篇 1.19MB 文章推草稿成功。

### Fixed — gallery 模板真机交互 + 背景存活（2026-06-13）
- 5 个 template-gallery 模板（dual-touch-cta / whitelist-hero / zero-height-stack / stretch-accordion / passthrough-hotspot）：跨元素 `begin="xxx.click"` 改同元素自触发覆盖揭示、SVG 渐变 `url(#)` 降纯色、`<a>` 改引导按钮，消除 `id-stripped-dangling-ref` / `anchor-restricted` 告警；整页背景从 `<article>` 改 `<section>`（语义标签被微信解包丢 style 的根因）。

### Changed — 草稿箱改为主推路径，微信 API 经固定 IP 网关中转（2026-06-14）
- 「复制富文本」在内网 HTTP（非安全上下文）下 `navigator.clipboard` 被浏览器禁用 → 粘到微信只剩纯文字；>~400KB 大文件还会触发微信 UEditor 体积降级。改为**主推「发到草稿箱」**（`add_draft`，绕开剪贴板），背景/格式完整，`draft/get` 回读确认 `<section>` 背景色 + 渐变存活。
- `wechat_service.py` 撤 `WECHAT_API_PROXY` 正向代理，改 `WECHAT_API_BASE` + `WECHAT_PROXY_TOKEN`（Bearer）+ `WECHAT_PROXY_CA`（自签证书）走固定 IP 网关中转，满足公众号 IP 白名单；仅微信 API 走网关，图片下载直连。网关地址/令牌/证书属部署 `.env`，不入仓库。

## [5.6.1] - 2026-06-13

> 真机真值表驱动的交互修复：让交互效果在编辑器里点得动、在微信真机上（id 被剥后）也点得动。

### Fixed — tab-panel 点击展开无反应
- tab-panel 的标签 `<text>` 盖在按钮 `<rect>` 上且为其兄弟节点，点击文字时事件不经过触发元素，`begin="tabNbtn.click"` 收不到（真实浏览器复现）。改为 `<g id>` 包裹 rect+label，对齐其余效果的结构。
- 预览面新增上下文提示：检测到可交互 SVG 且处于「公众号效果」预览时，提示切到「交互预览」点击测试（不影响编辑内容）。

### Changed — 交互效果改造为微信自触发（无跨元素 id 依赖）
- 真机真值表确认微信剥光所有 `id=` 但保留 `begin="id.click"` 引用 → 跨元素触发在公众号真机悬空失效。将全部交互效果改为同元素 `begin="click"/"touchstart"` 自触发 + 覆盖揭示。
- smil-carousel / mask-reveal：直接改自触发，语义完整保留。
- flip-card：覆盖揭示重设计（背面常驻下层、正面点击淡出），降级为单向翻面。
- longpress-ring：充环 + 延时盖板淡出均自触发；进度环加 fill、图标 `pointer-events:none` 使圆心可命中。
- tab-panel / multi-choice：真跨元素互斥无 id 无法实现，诚实判定「微信真机受限」并降级（手风琴独立展开 / 选项自高亮+解析常驻），description 与模板注释标注。
- 全部 6 个交互效果经「微信实际存储 HTML + 真实 Chromium 点击」验证：剥 id 后交互均存活。

### Tests
- 新增参数化断言：渲染通过、begin/end 无跨元素 id 引用、模拟剥 id 后存活、不触发 `id-stripped-dangling-ref`。
- 后端 620 → **648 passed / 15 skipped**，前端 369（无回归）。

## [5.6.0] - 2026-06-13

> 微信 SVG 能力路线图 P0→P1→P2 全部落地：从"自家管线先把 SVG 打坏"到"AI 填槽即产出过校验的合法交互 SVG"，并以真机真值表校准了规则边界。后端测试 250→619、前端 282→369。

### Added — 交互效果引擎（P1-1）
- `effect_registry`：8 个 opensvg 派生的插槽化交互配方，覆盖六大分类学（展开 / 轮播 / 滑动 / 长按 / 答题 / 翻卡），每效果定义文本槽 / 图片槽 / 颜色槽 + 时序参数，填槽渲染后强制过 `svg_validator` 才返回。
- 新端点 `GET /api/v1/agent/effects`、`POST /api/v1/agent/effects/{id}/render`。
- 前端 `EffectGallery`：效果卡片 + 槽位表单，生成结果**区块级插入**到选中块之后（不再整篇覆盖），保留原整篇模板。

### Added — 真后端 LLM 生成（P1-4）
- `agent_svg_prompt` 接入 Claude API（`claude-opus-4-8`，adaptive thinking，结构化输出）。LLM **只产 DSL（effect_id + 槽值），绝不直接写 SVG**，经 `effect_registry` 确定性渲染——注入面与校验面全部收敛在已审计的 registry 内。
- 无 `ANTHROPIC_API_KEY` 时优雅降级回关键词 stub；超时 / 限流 / refusal / schema 不匹配五类错误结构化处理，HTTP 永远 200。

### Added — 编辑器内交互预览（P1-3）
- 预览面新增模式切换：「公众号效果」(sanitize 后，默认) vs 「交互预览」(原始 SVG，sandboxed iframe，SMIL 点击可真实验证)。复制/发布的 sanitize 硬门禁不受影响。

### Added — 反向导入 + 多平台渲染 profile（P2-4）
- `article_to_mbdoc` 以 BeautifulSoup 重写，把微信文章 / 通用 HTML 反向解析为 mbdoc（SVG 子树逐字保真），新增 `POST /api/v1/publish/import-html`。
- `render_profiles`：`wechat`（与旧行为字节等价）+ `generic`（更宽松，保留更多原始结构），preview/copy/publish 链路可选 profile，默认 wechat。

### Added — 编辑体验（P2-1/2/3）
- SVG 可视化编辑面板（颜色选择器 / 热区坐标 / SMIL begin·dur）替代纯 textarea。
- 模板卡片视觉缩略图 + 插入前参数化配色 / 文案。
- StructurePanel 解析 SVG 内部交互结构（手风琴 section / SMIL 时间轴节点）并支持点击定位。

### Changed — 白名单按 T/CASME 1609—2024 + 真机真值表校准（P1-2）
- `stroke` / `rx` / `ry` 放行（真机确认 allowed），`stroke-dasharray` 静态属性不再误杀。
- 新增三类告警：`<style>` 整块被剥、SVG 内 `<a>`、`<image>` 外链 / base64。
- 事件处理器拦截从枚举列表改为通配 `on[a-z]+=`（`onerror`/`onpointerdown` 等不再漏网）。

### Added — 微信 SVG 真机真值表（P0-2 / 真值表）
- `backend/tests/regression`：31 探针经 `add_draft` 真推草稿箱 + `draft/get` 回读，产出 `docs/research/wechat-svg-truth-table.md`。
- **关键真机发现**：微信剥除 `id=` 定义但保留 `url(#id)` / `href=#id` / `begin=id.click` 引用 → 一切依赖 id 的渐变 / 滤镜 / clipPath / mask / use / 跨元素 SMIL 在真机悬空失效；仅 `begin=click` 同元素自触发可用。已转化为 `svg_validator` 的 `id-stripped-dangling-ref` 告警，从生成阶段拦截。

### Security
- LLM 输出、反向导入的外部 HTML、模板槽值全部视为不可信输入，经净化 + `svg_validator` 双重门禁；对抗式审查修复了跨类槽位二次替换、`url(javascript:)` 样式注入、`<image>` 危险 scheme 等多条注入路径。安全底线（`on*` 通配 / `<script>` / `javascript:` / `vbscript:` / `data:`）未回退。

### Tests
- 后端 250 → **619 passed / 15 skipped**，前端 282 → **369 passed / 51 files**。

## [5.5.0] - 2026-06-12

### Fixed — 页面级背景在微信后台消失（重点修复）
- **根因**：微信粘贴处理器会"解包" HTML5 语义标签（`<article>` `<main>` `<header>` `<footer>` 等）——子内容保留，但标签连同其 `style` 属性一起丢弃。写在 `<article style>` 上的页面渐变/底色粘贴后直接变白。Sanitizer 现把语义包裹标签统一改名为 `<section>`（微信完整保留），并移除 `xmlns` 属性（`wechat_sanitize.py`）。
- 校验器新增 `semantic-wrapper-tag` 警告：再写带样式的语义标签会在复制前提示（`svg_validator.py`）。

### Fixed — 完整 HTML 文档进入复制管线
- 带 `<!DOCTYPE>` 的完整文档曾让 premailer 抛异常导致 CSS 完全不内联；`<head>` 里的 `<title>/<meta>/<link>` 文本泄漏进正文；`<body>` 上的 style/bgcolor 被丢弃。`css_inline.py` 现在先提取 body 内容、把 body 背景搬到 `section.wechat-root` 包裹上，并把针对 `body` 的 CSS 规则重定向到该包裹。
- 嵌套 `@media` 用括号计数扫描器整块剥除——旧的单层正则会让媒体查询内的 `display:none` 泄漏成全局规则，所有端都隐藏内容。
- 伪类剥离只删伪类选择器，保留同条规则里的普通选择器（`a, a:hover {...}` 不再整条消失）。
- 单引号 style 内含双引号（如 `font-family:"PingFang SC"`）不再被截断。

### Fixed — 校验器与图片内联
- 禁用 CSS 扫描锚定到 style 属性/style 块内的属性名——正文里出现 "mask" 等英文单词不再误拦截复制。
- 图片 data-URI 内联只改写 `<img>` 标签内的 src，教程正文/`<video>`/`<iframe>` 不再被误改写；拉取失败的 URL 负缓存，不再每次重复等 20s 超时。

### Fixed — 前端剪贴板
- 分段复制遍历 `childNodes`：直接写在标签之间的裸文本节点在切分时不再被静默删除（`clipboard.ts`）。
- swiss 主题下不再误剥作者写的 `#000000`/`#222222` 等常见深色背景（深色 hero、代码块幸存）。
- `text/plain` 兜底按块级边界插入换行，全文不再挤成一行。

### Added — MBDoc 后端 API（合并 NAS 开发线）
- MBDoc CRUD API（`/api/v1/mbdocs`）+ 发布端点，前端 `mbdocStore` 接后端（保留 `*Local` 本地缓存层）。
- Article → MBDoc 转换器与迁移脚本（`scripts/migrate_articles_to_mbdoc.py`）。
- EditorSurface/publish_adapter 重构：抽出 `useEditorDraft` hook、编辑器 API service、草稿存储 service、图片处理 service。
- 后端 API 测试基础设施 + publish 集成测试；文章列表新增 JSON 导出/导入备份。

### Tests
- 新增全文档管线回归套件（`test_wechat_full_document_pipeline.py`）：以用户实测推文结构断言背景存活、head 不泄漏、CSS 真正内联。
- 后端 250 通过，前端 282 通过。

## [5.4.0] - 2026-05-17

### Added — 长文一键复制
- "复制富文本"对话框新增长文模式：HTML > 400KB 时弹"分段复制 / 改用草稿箱"选择面板（`CopyReadyDialog.tsx`）。分段路径按 body 顶层 block 边界递归切到 ~250KB 一段，每段都是自洽的富文本片段，引导用户逐段粘到公众号后台末尾。
- 切分算法 `splitHtmlIntoChunks`（`frontend/src/utils/clipboard.ts`）递归下钻：遇到超预算的元素就钻到它的子级，每一层切完都用本层的开/闭标签把内容重新包起来，保证嵌套结构里的标题/卡片/章节等外层样式在每段粘贴时都还在。
- 草稿箱兜底：未绑定公众号 appid+appsecret 时按钮灰掉并提示，绑了就一键跳 `/wechat/draft` 完全跳过剪贴板。

### Added — 文章 URL 与标题对应
- 路由从"`/` 一招走天下"换成 `/a/<encodeURIComponent(title)>-<4位ID>` 的标题型 URL（`Shell.tsx` + `lib/route.ts`）。浏览器地址栏现在能看出打开的是哪篇文章，可收藏可分享。
- 标题改名时通过 `replaceParams` 原地同步 URL，不污染后退栈。
- nginx 已有 `try_files $uri $uri/ /index.html`，刷新 `/a/<slug>` 直接命中 SPA fallback，无需服务端配置改动。

### Fixed — 微信粘贴布局
- Sanitizer 注入 `table-layout:fixed`（`wechat_sanitize.py`）：当 `<table>` 里至少一个直接子 `<td>` 写了 `width:Xpx`，就给该表加 `table-layout:fixed`，让作者的列宽真正生效。默认 `table-layout:auto` 会让浏览器把窄列压到 single-character min-content，正是"01""02"等数字徽章被分裂到两行的根因。
- 同步规则：表本身没设 width/max-width/min-width 也没 `width=` HTML 属性的，自动补 `width:100%`——HTML5 规范里 fixed-layout 在无宽度表上等于 auto，必须给一个宽度才能生效。
- `table-layout` 加进 sanitizer allowlist，值限定 `{fixed, auto}`。

## [5.3.0] - 2026-04-24

### Added — 微信公众号 SVG 兼容
- 新增 `wechat-svg-author` / `wechat-svg-validate` 两支 skill，覆盖编辑期到发布前的 SVG 兼容性约束（白名单 hero、双触点 CTA、零高栈、伸缩手风琴、穿透 hotspot 五类合规模板存放在 `docs/wechat-svg/templates/`）。
- 后端新增 `/wechat/validate` 路由，引入 `svg_validator`：编辑器实时弹兼容性 badge，发布前阻断不合规 SVG。
- 后端新增 `/agent/generate` 路由 + `agent_svg_prompt`：可由 Agent 直接产出符合 WeChat 兼容白名单的 SVG。
- 后端新增 `raster_inline_svgs` + `wechat_copy_images` 服务：复制富文本时把内联 SVG 栅格化、把所有图片中转上传到本地 imgbed，确保粘到公众号后台后图片 URL 全部走 `mmbiz.qpic.cn` 重新拉取。

### Added — Local imgbed
- 后端新增 `local_imgbed_service`，直连 NAS 局域网内的 `local-imgbed`（端口 9697），复制富文本时自动上图。`docker-compose.yml` 通过 `LOCAL_IMGBED_UPLOAD_URL` 注入，公网走 VPS 域名时不可用（微信粘贴拒绝第三方公网图片）。

### Added — 复制富文本流程
- 校验前置（`CenterStage.handleCopyWithValidation`）：复制按钮先跑 wechat 校验器；阻断级问题弹 `ValidationBlockDialog`，警告级仅 toast，强制复制走 `forceCopyIgnoringIssues`。
- 复制完成弹 `CopyReadyDialog`，承担"用户手势已过期"问题：服务端处理后由用户在弹窗里再点一次完成 `clipboard.write`。

### Added — 编辑器
- LintSidebar：发布前可视化展示 wechat 校验器报的所有 issue（位置、级别、修复建议）。
- AgentCopilot：接 `/agent/generate`，可让 Agent 产出 SVG 直接插入文档；带 SVG 生成测试覆盖。
- TemplateGallery：5 套合规 SVG 模板内置，一键插入。
- C 盘清理范例文章 `tpl_cdrive_cleanup.json` 加入 seed 列表，作为 `REQUIRED_SEED_IDS` 强制同步示例。

### Changed — Stateless 架构落地
- 后端彻底去掉 `/articles` / `/mbdocs` / `/images` CRUD 路由，后端只剩 publish / wechat / validate / agent / version。
- 前端文章/草稿/微信账号全部走 zustand persist：`articlesStore`（local-first 持久化）、`mbdocStore`、`wechatStore` 三个 store 写 localStorage。
- 复制富文本与发布草稿都改为前端把账号凭据 + article payload 直接 POST 给后端 stateless 端点。
- 历史用户从老版本迁移：`scripts/export_legacy_data.py` 一次性导出 + `frontend/src/lib/legacyImport.ts` 在 SettingsSurface 里一键导入。

### Changed — Seed
- `articlesStore.onRehydrateStorage` 加入 `SEED_VERSION` + `REQUIRED_SEED_IDS` 机制：版本号在 `frontend/src/seeds/index.ts` 里 bump 后，下次 rehydrate 强制把 `REQUIRED_SEED_IDS` 里的文章覆盖为最新 seed 内容。当前 `SEED_VERSION = 5`，强制同步 `cdrive-cleanup`。

### Fixed — 复制富文本主题色泄漏（v5.3 关键修复）
- 暗色主题下复制富文本到 mp.weixin.qq.com 后，所有 `<p>` 都被微信 paste handler 烙上 `background-color: rgb(20, 16, 19)`（mbeditor walnut 主题的 chrome bg），渲染成黑底文字。
- 根因：微信粘贴处理器对每个元素跑 `getComputedStyle()` 并 inline 全部解析后的属性，包括从祖先继承解析出的 background-color。
- 修复：`frontend/src/utils/clipboard.ts writeHtmlToClipboard` 写剪贴板前调用 `stripThemeChromeBackgrounds`，读取当前主题的 `--bg / --bg-deep / --surface / --surface-3`（跳过 `--surface-2` 因为 paper 主题是 `#FFFFFF` 会误伤），DOMParser 解析后剥掉所有匹配这些值的 `background-color`。
- 边界：作者主动写出与当前主题 chrome 变量完全相同的 hex 会被剥；这种碰撞极小概率发生，换近似色即可规避。

### Fixed — 编辑器
- 预览编辑保留 inline 样式 + 修好 Ctrl+Z。
- 富文本粘贴进 HTML 源码 textarea 时同步走 sanitizer。
- 复制富文本时 null-coerce draft 字符串字段，绕过未绑定公众号场景下的 422。
- 前端 axios 走 `127.0.0.1` 而非 `localhost`，规避 IPv6 first 解析延迟。

### Infrastructure
- 部署 workflow 加 SSH keepalive，长 GHCR 拉取过程中 SSH 不再超时。
- TopBar 增加 GitHub 链接 + 站点 tagline 同步产品定位。

## [5.0.0] - 2026-04-20

### Added — 编辑器所见即所得
- 预览区现在是可编辑的 `contentEditable` 画布：直接在预览里改文字，500ms 去抖后自动回写到 HTML/Markdown 源码。形状一致时只拷贝文本节点，保留源码结构；形状漂移走 sanitizer 兜底。
- HTML→Markdown 序列化器覆盖标题/段落/嵌套列表/引用/代码块/分隔线/图片/inline 强调/链接，Markdown 模式的预览编辑能无损回写。
- 预览框支持拖拽调整宽/高/右下角，以及 40%–200% 独立缩放滑杆；尺寸和缩放分别持久化到 `uiStore`。

### Added — 五套示例模板 + 一键复制富文本
- 内置 `极简商务 / 科技霓虹 / 活力撞色 / 文艺手札 / 杂志专栏` 五种风格示例文章，全部 100% 微信 sanitizer 白名单内联样式。
- 恢复并增强了一键复制富文本按钮，复制结果与预览完全一致，粘贴到公众号后台 0 样式损失。

### Added — 编辑器导航与结构面板
- 左侧 StructurePanel 列出标题/图片大纲，点击节点自动跳到对应位置并在预览和编辑器中同步高亮。
- 编辑器头部新增「返回上一页 / 返回稿库」回退按钮，保留未保存草稿。

### Changed — UI 与体验大改
- 前端重做：`walnut / paper / swiss` 三主题 + 三种布局（focus / split / triptych）。
- 去掉了产品里暴露的 Agent Console（保留为 marketing 素材，不进打包）。
- 非关键英文 UI 文案改成中文（导航、按钮、状态芯片）。
- 关闭自动保存时保留草稿，切换文章不清空未保存内容。

### Changed — 后端
- 数据目录自动探测：检测到 `docker-compose.yml` 走仓库根 `data/`，否则落 `backend/data/`，写死的 `/app/data` 去掉。
- 启动时统一 `ensure_data_directories()` 创建 images / articles / mbdocs / config.json 父目录。
- `PUT /articles/{id}` 在 `mode=markdown` 且只收到 Markdown 时自动用 markdown renderer 同步 HTML，便于 CLI/API 调用方只传 Markdown。

### Added — 文章列表删除按钮
- 列表每行末尾新增 🗑 按钮，点击触发 `window.confirm` → `DELETE /articles/{id}`；同步清理 `currentArticleId`，删当前编辑中的文章不会留下悬挂引用。

### Added — 首次启动自动 seed 五篇模板
- backend 启动若检测到 `ARTICLES_DIR` 为空，从 `backend/app/seeds/tpl_*.json` 把五套示例模板种进去；已有内容绝不覆盖。模板同时保留在仓库根 `docs/cli/examples/templates/`，便于 dev 模式和 CLI 复用。

### Security — 预览粘贴的 XSS 护栏
- `cleanPreviewFallback` 从「只剥 style/class/contenteditable」升级为完整黑名单：`<script>/<iframe>/<object>/<embed>/<link>/<meta>/<style>/<base>/<frame>/<frameset>` 直接移除；`on*` 内联事件处理器一律 strip；`href/src/xlink:href` 中的 `javascript:` / `vbscript:` / `data:text/html` 协议一律清除。保留父元素文本和安全属性。
- `render_markdown_source` 关闭 markdown-it 的 `html: true`，Markdown 里内嵌的 `<script>` / `<img onerror>` 一律被当作文本转义输出，不会以活 HTML 写入 `article.html`。publish 管道仍会做一遍 sanitize，但现在存储态本身也是安全的。

### Changed — 版本号
- backend `pyproject.toml`、`APP_VERSION`、frontend `package.json`、BrandLogo、README 徽章、Settings 页面全部统一到 `5.0.0`；测试用例改用 `APP_VERSION` 常量而非硬编码字符串。

## [4.0.0] - 2026-04-12

### Added — WeChat publish pipeline hardening
在 WeChat 测试账号端到端验证了一篇 600 行的复杂动画 HTML（`printmaster_wechat_animated.html`，含 hero、SVG 插画、grid 布局、scroll-reveal 动画、CTA 按钮），草稿高度还原度达 **0.37%**。修复了四个会让复杂 HTML 在微信草稿视图悄悄破坏的 pre-publish 陷阱：

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
