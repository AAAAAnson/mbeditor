---
name: mbeditor-agents
description: "根路由文件：MBEditor 是微信交互式 SVG 文档编辑器；按触发场景分派到 skill/mbeditor、skill/wechat-svg-author、skill/wechat-svg-validate 与 docs/wechat-svg/。"
---

# MBEditor · Agent 入口

## 产品心智模型

- MBEditor 是**微信交互式 SVG 文档编辑器**，不是通用 Markdown 工具。
- 文档由三层叠加：HTML（文字/版式）+ SVG（矢量与交互）+ Raster（只在前两层无法表达时）。
- 微信 = W3C SVG 的**严格子集**：动画属性仅 ~20 个白名单，HTML/CSS 有禁用清单。

## 分派到哪个 skill

| 触发 | Skill |
|---|---|
| 架构 / 发布管线 / Lane A-B-C / publish.py | `skill/mbeditor.skill.md` |
| 写或改 HtmlBlock、SVG 交互、五大模式 | `skill/wechat-svg-author.skill.md` |
| 校验、发布前闸口、CI 中 gate | `skill/wechat-svg-validate.skill.md` |

## Agent 循环

1. Read 匹配的 skill。
2. Read skill 内指向的 `docs/wechat-svg/*` 参考文件。
3. 按模式写 HTML/SVG。
4. 过 `scripts/validate_wechat_svg.py` 或 `POST /api/v1/wechat/validate`。
5. 通过后再 commit / 推草稿。

## 硬规则

- 不绕开校验器交付 SVG 产物。
- 不在 HtmlBlock 注入 `<script>` 或 `on*` 事件处理器。
- 不用 `@keyframes` / `transition` / `animation`；动画走 SMIL 白名单属性。
- `<animate>` / `<set>` / `<animateTransform>` 的 `attributeName` 必须在 20 个白名单内。
- 不一次性重写前端 UI shell；不扩张 `backend/app/api/v1/publish.py`（只能缩减/隔离）。
- Lane 未定前，不混合 legacy `Article` 与 `MBDoc` 的修改。

## 运维 / 部署

- **"部署/重新部署" = 远端 NAS 上的 docker compose**，不是本机 Docker Desktop，
  也不是 GitHub Actions。SSH 主机、compose 路径、挂载路径和一键命令属于操作者私有
  runbook / `.env`，不要写入公开仓库。
- 前端 build 有 Vite 缓存，backend 改 Python 通常立即生效但最好 `docker-compose up
  -d --build`。容器重建后必须 `docker exec mbeditor_backend_1 env` 核对 env 实际
  注入——`docker-compose.yml` 改了不 rebuild 不会生效。

## 踩过的坑（历史伤疤，别重蹈）

### 1. "复制富文本到微信"图片链路——走 data URI，不走图床 URL

- **错误路径**：把 `<img src>` 改写成外部图床 URL（公网或 LAN），指望
  mp.weixin.qq.com 的粘贴处理器帮忙转存到 mmbiz。症状：微信后台弹"来源链接
  https://… 拉取图片数据失败 重试"。
- **根因**：WeChat 的 paste rehost 不信任任意第三方公网域名（已经收紧），LAN URL
  又只在浏览器和 imgbed 同网段时才可达；两种 URL 都会间歇失败。
- **正确答案**：`backend/app/services/wechat_copy_images.py::inline_images_as_data_uris`
  把所有外链图下载内联成 `data:image/...;base64,...`。WeChat 粘贴处理器对 data
  URI 是浏览器端直接上传 mmbiz，不走 URL 抓取，所有第三方域名问题一次性消失。
  `publish_adapter.process_html_for_copy` 必须调这个，**不要**调
  `local_imgbed_service.process_html_images_via_imgbed`。
- `local_imgbed_service.py`（LAN 图床卸载，已修字段名 bug 见坑 #2）**现已不接入任何发布
  路径**：草稿路径 2026-06-14 改走微信 mmbiz（`wechat_service.process_html_images`，正文
  不超限 + 图片微信内可见，见坑 #3）；模块保留为可选卸载器,别误以为它还在草稿链路上。
- 单张图封顶 `_MAX_INLINE_BYTES = 6 MB`，超了保留原 src+warning。

### 2. local-imgbed 端点只走环境变量

- 不同部署环境可能使用不同的 `local-imgbed` 实例、鉴权方式和返回 URL 类型。
- `docker-compose.yml` 只读取 `LOCAL_IMGBED_UPLOAD_URL` /
  `LOCAL_IMGBED_UPLOAD_TOKEN`；具体 NAS/LAN/VPS 地址、端口和 token 只放在部署环境
  `.env` 或私有 runbook，不提交到公开仓库。
- 上传的 **multipart 字段名可配**：`LOCAL_IMGBED_UPLOAD_FIELD`(默认 `file`)、
  `LOCAL_IMGBED_TOKEN_FIELD`(设了则 token 走表单字段,否则 Bearer 头)。doocs-md 图床
  (:9697) 要 `image`+表单 `token`;字段名错配会让图床回 `没有选择上传的文件`、上传静默失败。
- `LOCAL_IMGBED_UPLOAD_URL` 想往哪打就写哪套环境的上传端点，不会自动切换。

### 3. `publish_adapter` 两条函数，不要混合

- `process_html_for_copy` = 复制富文本（不需要 appid/appsecret；data URI 路径）。
- `publish_draft_sync` = 直发草稿（需要 appid/appsecret；**现为主推路径**，见坑 #6）。
  两条路径的图片策略不同:复制走 **data URI**(浏览器端转存 mmbiz);草稿走 **微信 mmbiz 上传**
  (`wechat_service.process_html_images` → `media/uploadimg`,2026-06-14 起;此前误用 LAN 图床
  导致正文超 ~1MB 上限 + 图裂)。别图省事共用一个。

### 4. 微信解包 HTML5 语义标签——页面背景消失的根因（2026-06-12）

- **症状**：推文整页渐变/底色粘到公众号后台后变白，内层元素背景却还在。
- **根因**：微信粘贴处理器会解包 `<article>` `<main>` `<header>` `<footer>` `<aside>`
  `<nav>` 等语义标签——子内容保留，但**标签连同它的 style 属性一起被丢弃**。页面级
  背景写在 `<article style>` 上就全没了。
- **修复**：`wechat_sanitize.py` 把语义包裹标签统一改名 `<section>`；
  `svg_validator.py` 对带样式的语义标签报 `semantic-wrapper-tag` 警告。
- **回归**：`backend/tests/test_wechat_full_document_pipeline.py` 全链路断言背景存活。
- 同理，完整 HTML 文档（DOCTYPE + head + body style/bgcolor）由 `css_inline.py`
  归一化：head 元数据不进正文，body 背景搬到 `section.wechat-root` 上。

### 5. 前端 draft.html 缓存

- `draft.html` 存在 `articlesStore` 里的 localStorage。如果老数据里已经是
  外部图床 URL，后端新 pipeline 能把它**再**
  下载回来内联成 data URI（代价是多一次公网抓取），不需要清数据。
- 但前端 JS bundle 走 Vite build + nginx，换了后端行为后如果症状没变，先 Ctrl+
  Shift+R 硬刷再下结论。

### 6. 复制富文本在内网 HTTP 下失效——主推路径改草稿箱（2026-06-14）

- **症状**：内网 HTTP（如 `http://内网IP`，非安全上下文）下「复制富文本」粘到微信只
  剩纯文字、零格式（无论内容大小）。
- **根因**：浏览器在非安全上下文禁用 `navigator.clipboard`，只能走 `execCommand`
  fallback，它在该环境只把 `text/plain` 写进剪贴板（`text/html` 静默失败）；大文件
  （>~400KB）还会触发微信 UEditor "too big → text/plain" 降级。
- **解法**：主推「发到草稿箱」（`publish_draft_sync` → `add_draft`），绕开剪贴板，
  背景/格式完整；`draft/get` 回读确认 `<section>` 的 `background-color` + 渐变存活。
- **草稿箱满足公众号 IP 白名单**：`wechat_service.py` 读 `WECHAT_API_BASE` +
  `WECHAT_PROXY_TOKEN` + `WECHAT_PROXY_CA`，把微信 API 调用经固定 IP 网关中转（仅微信
  API 走网关，图片下载直连）。网关地址/令牌/证书属操作者私有 `.env`，不入公开仓库。
- **网关现已网页可配置（2026-06-14）**：`wechat_service.py` 不再读模块级 env 常量，
  改经 `app/services/gateway.py` 的 `resolve()`（优先级 **网页配置 > env > 直连**）。
  新增 `/api/v1/settings/gateway` GET/PUT/test 与前端「设置 → 发布服务器」分区;令牌/
  证书**只写不回显**、存后端具名卷 `mbeditor-data:/app/data/gateway.json`（树外、不入
  仓库）。env 方式仍向后兼容;Phase 2（SSH 通道）留了同接口未实现。
- **公众号 AppSecret 现可服务端持久化（2026-06-14）**：`app/services/credentials.py` 按
  appid 存 `mbeditor-data:/app/data/credentials.json`（明文 + chmod 600,与网关令牌同款,
  不入仓库）。新增 `/api/v1/settings/credentials` GET/PUT（GET 只回已配置 appid 列表、绝不
  回密钥）。`get_access_token` 取密钥优先级 **请求带的 > 服务端存储 > 400**;前端「设置 →
  公众号」保存即上传、刷新免重输。发布路径前端零改动（已转发会话内 appsecret,空则后端回退）。

## 深度在哪里

- `skill/mbeditor.skill.md` — 架构、Lane 判定、渲染真相、入口文件清单。
- `skill/wechat-svg-author.skill.md` — 如何写一段微信安全的交互式 SVG。
- `skill/wechat-svg-validate.skill.md` — 如何通过校验器作为发布闸。
- `docs/wechat-svg/` — whitelist / five-patterns / html-css-restrictions / copywriting-style / pre-publish-checklist / multi-platform。
- `docs/wechat-svg/templates/` — stretch-accordion / passthrough-hotspot / dual-touch-cta / zero-height-stack / whitelist-hero 五套样板。
- `scripts/validate_wechat_svg.py` · `backend/app/services/svg_validator.py` · `POST /api/v1/wechat/validate`。
