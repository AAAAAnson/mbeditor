# MBEditor 微信 SVG 能力深度研究报告

> 撰写：首席产品架构师 · 日期：2026-06-13
> 范围：站内能力审计（复制管线 / 校验层 / 模板与编辑）× 外部竞品与开源调研 × 微信 SVG 能力边界 12 条断言
> 评估立场：站在用户视角理性评估「优美的、可交互的微信 SVG 图文」这一目标距离 MBEditor 现状有多远。

---

## 0. 一句话结论

MBEditor 拥有**全行业唯一的「开源 + AI/CLI 原生 + SVG 交互模板」组合**，模板原语扎实（五大交互模式都已源码化），但**复制/发布管线在到达微信之前就先把自家 SVG 打坏了**——`wechat_sanitize.py:445` 全局剥 id 使 5 个生产模板中 4 个的核心交互「出厂即坏」，校验闭环又因跑在 sanitize 之后且大小写敏感而**零检出**。也就是说：**当前最大的对手不是微信的过滤器，而是 MBEditor 自己的过滤器。** 这是一个「先止血、再补刀」的局面——P0 不是加功能，而是停止自我破坏。

---

## 1. 现状评分：MBEditor 对微信 SVG 上限的利用率

满分 10 分，分维度评估。

| 维度 | 评分 | 核心理由 |
|---|---|---|
| **编辑体验** | 3.0 / 10 | SVG 只能在无高亮的 textarea 改源码（`CenterStage.tsx`）；预览 contentEditable 仅文字级回写，无属性面板/颜色选择器/动画时间轴/拖拽热区；大纲（`StructurePanel.tsx`）只把前 2 个 SVG 当「图片」识别，看不到手风琴 10 张卡的内部结构。距竞品「换图换字即生成」差一整代。 |
| **美化（模板/排版）** | 5.5 / 10 | `template-gallery` 5 个 2000+ 字生产级模板质量高，seeds 6 套排版也含静态 SVG 装饰；但模板**只能整篇覆盖插入**、无区块级混搭、无视觉缩略图、无参数化配色文案，且 seeds 的静态装饰与 template-gallery 的动效完全脱节。 |
| **交互** | 2.5 / 10 | 五大交互模式（伸长/零高堆叠/双触发/穿透热区/白名单入场）**模板层面齐全且符合白名单**，这是加分项；但因 sanitize 剥 id + 剥 pointer-events，**4/5 模板的点击/长按交互在复制产物里实际失效**，只有纯时间驱动的 whitelist-hero 幸存。能写≠能用。 |
| **动效** | 4.0 / 10 | SMIL 入场动画（opacity/transform/r/stroke-dashoffset/width，begin=0s..2.5s + fill=freeze）是当前唯一可靠路径且确实可用；但 style 里的 fill/stroke/transform 被白名单剥除、`opacity:0→1` 改写毁掉淡入初始态、premailer/lxml 把 attributeName 小写化埋下服务端隐患。 |
| **复制保真** | 1.5 / 10 | **全报告最低分。** 致命链条：①`wechat_sanitize.py:445` 全文正则剥 id → 渐变 `fill=url(#)`、滤镜、`<use>`、clip-path、mask、`begin="id.click"` 全部悬空；②style 白名单不豁免 SVG 子树 → fill/stroke/transform 蒸发；③`opacity:0→1` 改写；④校验跑在 sanitize 之后 + 大小写敏感 → 零检出且前端 `editorApi.ts:53` 直接丢弃 report 不阻断；⑤`splitHtmlIntoChunks` 无 SVG 原子性，>250KB 切成残片。**没有一条 SVG 复制管线测试。** |

**加权总评：约 3.3 / 10。** 模板原语是亮点，但被自家管线系统性破坏，用户「预览正常、粘贴后动画/渐变/交互全没」的体验落差极大，且校验报告还显示"兼容"——这是最伤信任的失败模式。

---

## 2. 微信 SVG 真实上限（只采信 confirmed，uncertain 标注存疑）

### 2.1 已被 confirmed 的硬边界（可放心作为产品契约）

- **正文内完全无法用 CSS animation**：`<style>` 被整体剥离，@keyframes/@media/伪类全失效，**动画只能走 SMIL**。跨 2019–2025 七个独立来源一致，含 2025-03 最新分析。[axtonliu.ai 2025-03](https://www.axtonliu.ai/newsletters/ai-2/posts/wechat-article-html-css-support)、[掘金 2019](https://juejin.cn/post/6844903896071012366) → 对 MBEditor：**前端死依赖 juice/dompurify 与「复用 Web CSS 动画」的幻想可彻底放弃，SMIL 是唯一通道。**
- **行内 style 里 `background:url()` 加任何引号 → 整条样式被过滤**（单双引号都不行）。2019–2026 多源一致，最新 [CSDN 2026-04](https://blog.csdn.net/SiShen654/article/details/134956473) 仍重申 → 生成器必须输出无引号 url()。
- **官方后台可视化编辑器第二次保存会洗掉 SVG 代码；经 add_draft 接口直推草稿箱可保留 SVG，但推送后不要在后台二次编辑或在编辑页触发交互**。多个微信开放社区一手帖 + 135/秀米官方文档一致。[微信社区 2024-09](https://developers.weixin.qq.com/community/develop/doc/00020abb8507b0db1a12c08386bc00)、[微信社区 2024-06](https://developers.weixin.qq.com/community/develop/doc/000e08e18dc7000995a19c17961000) → **MBEditor 走 add_draft 是正确路线，应在产品中明确警告用户「推送后勿在 mp 后台二次编辑」。**

### 2.2 高可信但 uncertain（产品可用，文档需标「存疑/建议真机复测」）

- **SMIL 四件套保留 + begin="click"/touchstart 在 2024–2026 仍有效**：判 uncertain，因无任何来源经 add_draft API 实测验证（均为前端注入），且存在「某些父标签内 animate 被清除」的上下文依赖反例。整个 SVG 编辑器行业靠它存活是最强活证据，但不是 API 路径证据。[zer0n.cn](https://www.zer0n.cn/archives/wechatsvg)、[epub360 2025](https://www.epub360.com/blogs/article/686628af053629002d8079da/) → **行动项：MBEditor 应自建一套 add_draft 真机回归，把这条从 uncertain 升到 confirmed，这是别人都没做的事。**
  > 【真值表 2026-06-13】confirmed（仅服务端确认渲染层待核） — `animate-element`、`animate-transform-element`、`animate-motion-inline-path`、`set-element` 四个探针均为 allowed；`begin-click`（begin=click）与 `begin-click-offset`（begin=click+偏移）两个探针均为 allowed，证明 add_draft 服务端不剥离 SMIL 四件套及 click 触发声明。渲染层（iOS/Android）实际点击是否生效仍须真机核验。
- **id 被全量剥离 → `begin="x.end"` 同步、`url(#id)` 引用、mpath 引用不可用，animateMotion 须用 path 内联**：id 剥离本身 confirmed（2021–2026 多源）；mpath/animateMotion 内联为推断。[CSDN](https://blog.csdn.net/SiShen654/article/details/134956473) → 与站内 `wechat_sanitize.py:445` 行为方向一致，但**微信剥 id 不代表 MBEditor 必须在到达微信前就剥**（见下）。
  > 【真值表 2026-06-13】confirmed — `svg-id-retention` 探针：SVG 内 rect 的专属 id 被 stripped；`linear-gradient-fill-url` 探针：linearGradient 定义（含 id）被 stripped，fill=url(#) 引用属性本身 allowed 但目标已消失导致悬空；`mpath-reference` 探针：被引用 path 的专属 id 被 stripped，mpath 引用属性 allowed 但悬空失效；`begin-id-click` 探针：触发源 id 被 stripped，跨元素 begin=id.click 引用字符串 allowed 但目标不存在——以上四个探针共同确认「id 剥离 → 引用悬空」机制成立，animateMotion 须内联 path 的推断亦被 `animate-motion-inline-path`（内联路径 allowed）间接支持。
- **白名单 attributeName**：与 2024-08 发布的《融媒体SVG交互设计技术规范》T/CASME 1609—2024（计育韬/复旦）高度吻合（x/y/width/height/cx/cy/opacity/d/points/stroke-width/stroke-linecap/stroke-dashoffset/fill；transform: translate/scale/rotate/skewX/skewY；set: visibility）。但**两处与站内白名单冲突**：① `r` 状态存疑（规范列 cx/cy 未单列 r）；② `stroke-dasharray` 被多个独立来源实测「保存时被剥」，与站内放行矛盾。[fudan.design](https://www.fudan.design/svg.html) → **站内 `svg_validator.py:28` 的 stroke-dasharray 应降级 warning；stroke/rx/ry 被误杀需复核。**
  > 【真值表 2026-06-13】stroke-dasharray：refuted（旧说「被剥」）— `stroke-dasharray-attr` 探针：stroke-dasharray=7 13 专属值为 allowed，服务端并未剥离，与「多源实测被剥」的旧说相反；旧说可能源于前端注入路径而非 add_draft 路径，或已被微信修复。站内 `svg_validator.py:28` 的降级 warning 仍建议保留（渲染层兼容性未知），但「微信服务端剥离」结论需撤销。stroke/rx/ry：refuted（旧说「被误杀」）— `stroke-rx-ry-attrs` 探针：stroke=#7a5ad3、rx=9、ry=7 三个独立 SVG 属性均为 allowed，服务端保留，站内 validator 误杀是独立 bug，与微信侧无关。
- **position 删除 / 百分比单位在 height、transform 位移失效（须 px/vw/vh）/ svg 自身 width:100% 自适应可用**：整体 uncertain（来源互相引用、最新仅到 2025-03，width:100% 证据最弱且有反例）。
  > 【真值表 2026-06-13】仅服务端确认渲染层待核 — `height-percent` 探针：height:43% 百分比值为 allowed，服务端未剥离或改写；`position-and-transform-percent` 探针：position:absolute 声明为 allowed（服务端未删），transform:translate(37%,19%) 百分比位移为 allowed（服务端未改写）；`svg-width-100` 探针：svg style 内 width:100% 为 allowed。三条「失效」断言均指渲染层行为，服务端实际上原样保留这些声明——渲染层（iOS/Android）是否按预期渲染仍须真机核验，不能仅凭服务端 allowed 判定「可用」。
- **iOS 端差**：restart="never" 无效、g 标签 style 失效须改 transform 属性、transform-origin 异常、深色模式注入 transform、SVG 无缝图阻断长按识别二维码——均 uncertain（多源自同一篇 2020 博客转载，缺 2024 后独立复现）→ **作为「真机预览提示」呈现，不作硬规则。**
  > 【真值表 2026-06-13】仅服务端确认渲染层待核 — `animate-restart-never` 探针：restart=never 属性为 allowed（服务端保留），iOS 上是否真的无效仍须真机核验，服务端层面无法判定；`g-style-transform-origin` 探针：`<g>` 的 style 内 transform:translate(13px,9px) 为 allowed，style 内 transform-origin:23px 17px 为 allowed，服务端均未剥离——iOS g 标签 style 失效是纯渲染层问题，服务端不干预，结论维持 uncertain，须真机核验。
- **`<image>` 须 mmbiz 链接 + 显式 width/height、SVG 不可嵌套 SVG**：uncertain（证据停在 2020）→ 发布管线把图片占位上传微信素材库换 mmbiz URL 是必要基建，但 `publish_adapter.py:23` 当前把图片内联为 data URI，对 SVG `<image>` 是死路，需改造。
  > 【真值表 2026-06-13】外链 image：仅服务端确认渲染层待核 — `external-image` 探针：`<image>` 标签本身为 allowed，外链专属 URL（probe_img_k7m2）为 allowed，显式 width=83 为 allowed；服务端不剥离 `<image>` 元素及其外链 href 属性。「须 mmbiz 链接」的限制属于渲染层行为（非 mmbiz 链接在 iOS/Android 中可能被拒绝加载），服务端层面无法验证，须真机核验。nested-svg：refuted（旧说「不可嵌套」）— `nested-svg` 探针：内层嵌套 svg 的专属 fill=#cbdced 为 allowed，外层 svg 专属 fill=#bacbdc 为 allowed，服务端并未剥除内层 svg；旧「不可嵌套」断言在服务端层面不成立，渲染层兼容性仍待真机核验。
- **分号等格式细节致 animate 失效**：uncertain——分号问题真实（[微信社区专文](https://developers.weixin.qq.com/community/develop/article/doc/000c8e19ab04902d2f9e8372251c13)），但机制是跨端 SMIL 解析 bug（values/keyTimes 长度错配）而非 sanitizer 整段过滤 → 生成器应规范化属性串、不留尾随分号。
  > 【真值表 2026-06-13】仅服务端确认渲染层待核 — `animate-values-keytimes-semicolon` 探针：values 串带尾随分号 `0;0.5;1;` 为 allowed，keyTimes 串带尾随分号 `0;0.5;1;` 为 allowed，服务端原样保留（未清除尾随分号）。这证实了「失效机制是渲染层 SMIL 解析 bug 而非 sanitizer 过滤」的判断；服务端层面尾随分号不被干预，bug 诱因由渲染引擎保留，生成器规范化尾随分号的建议仍成立。

### 2.3 「微信允许、MBEditor 还没做」的能力清单

| 能力 | 微信侧证据等级 | MBEditor 现状 | 缺口 |
|---|---|---|---|
| SVG 渐变 / 滤镜 / clip-path / mask / `<use>` | 行业普遍使用 | **自家 `:445` 剥 id 杀死** | 让 SVG 子树豁免 id 剥离 |
| `begin="id.click"` 跨元素触发 | 行业核心玩法 | 自家剥 id 杀死（讽刺：validator 还教用户这么写） | 同上 |
| pointer-events 穿透热区 | confirmed 可用 | style 白名单不含 → 被剥 | 白名单加 SVG 豁免 |
| 长按 / 滑动 / 轮播 / 答题 / 弹幕 / 涂色翻卡 | 135/秀米成品化 | 仅 5 大底层原型，无高阶成品 | 建 effect registry |
| 区块级 / 参数化模板插入（换图换字即生成） | 小墨鹰/135 已平民化 | 只能整篇覆盖 | 插槽化模板 |
| 反向导入已发布文章二次创作 | wechat-article-exporter 11.4k star 验证需求 | 无 | 新链路 |
| 小绿书（图片消息）发布 | wenyan-core 支持 | 无 | 发布类型扩展 |

---

## 3. 竞品对比表

| 维度 | MBEditor | 135编辑器 | 秀米 | i排版(iPaiban) | 小墨鹰 |
|---|---|---|---|---|---|
| **形态** | 开源 + AI/CLI/API 原生 | 商业闭源 Web + 浏览器插件 | 商业闭源 Web，图文/H5 双线 | 商业闭源，产品矩阵+案例库 | 商业闭源 Web |
| **SVG 组件库规模** | 5 模板 + 6 seeds | 数百级（组件 ID 编号 960+） | 弹幕/快闪/答题/歌词等成品布局 | 2000+ 组件 / 8万可还原案例 / 7万模板 | 3000+ SVG 动效组件 |
| **可视化编辑** | 无（纯源码 textarea） | 拖拽热区+参数面板（方向/时长） | SVG 布局积木+穿透/滑动属性面板 | 案例一键还原+参数化 | 弹窗式换图换字，系统生成代码 |
| **交互类型** | 5 大原型 | 点击/滑动(7+)/长按/无缝/轮播(3D/折叠/相册)/媒体嵌入 | 弹幕/快闪/答题/点击显示/展开+滑动 | 17行业/200+节日分类成品 | 点击展开/滑动轮播/翻页/动态标题 |
| **AI 生成** | 定位最强（Markdown进/HTML出/Agent接入），但后端 llm_available=False 为关键词 stub | 多模型问答，与排版未融合 | 无 | 多模型聚合问答，与排版未融合 | AI 30秒自动排版+Markdown一键转SVG（最同构对标） |
| **复制/交付保真** | 剪贴板路线，且**自家管线先破坏 SVG** | 授权 API 同步（唯一官方推荐）+插件+F12 | 授权 API 同步+插件 | 接口同步 | 后台 API 同步 |
| **微信兼容校验门禁** | 有（20属性白名单实时校验+硬阻断），但跑在 sanitize 后、零检出 | 隐式（同步即保真） | 隐式 | 隐式 | 隐式 |

**洞察**：所有商业竞品的共识是**「放弃剪贴板、走授权 add_draft API 同步」才能保真交互 SVG**——这条 MBEditor 已走对（`publish.py` 走 add_draft），但**复制富文本路径却仍是主入口且会破坏 SVG**。MBEditor 的差异化护城河应是「开源 + 对 Agent 降门槛（结构化 DSL→合法 SVG）+ add_draft 真机验证过的能力边界」，而非再造一个可视化画布。

---

## 4. 开源借鉴（具体到落地点）

| 项目 | star | 可抄的具体实现 | 落地到 MBEditor |
|---|---|---|---|
| **cailven/opensvg** | 27（唯一开源微信SVG交互块编辑器） | 8 种 block 是 hack 标准配方源码化：`ClickSwitchBlock` 用「零高 section + opacity:0 svg + `<animate attributeName=opacity begin=click dur=1000s fill=freeze keyTimes=0;0.0000000000001;1 calcMode=discrete>`」实现点击永久切态；图片一律用 svg `style` 的 `background-image` 显示而非 `<image>`；`ScrollBlock` 用 `overflow-x:auto + scroll-snap` 横滑 | 直接移植为 `template-gallery` 的 effect registry，与现有 inline section+SVG 体系同构。**最高价值单仓库。** |
| **doocs/md** | 12.8k | `processClipboardContent()` 清单逐条对照查漏：移除 `a[href^="#"]` 锚点 href、**首尾插 font-size:0 空白节点兼容 SVG 复制**、img width/height 属性转 style、CSS 变量落地为具体色值 | 对照 `frontend/src/utils/clipboard.ts`：补「首尾空白节点」「锚点 href 移除」两项；`splitHtmlIntoChunks:95-148` 增加 `<svg>` 原子性保护 |
| **caol64/wenyan-core** | 1.2k(mcp) | `wechatPostRender.ts`：MathJax svg 的 width/height 属性转 style、暗黑模式强制 `color:rgb(0,0,0)` 固色、嵌套列表 flatten；草稿箱流水线自动上传图片换 media_url + 封面自动回退；**小绿书发布** | `backend/app/services/wechat_sanitize.py` 补暗黑固色；发布管线补封面回退 + 小绿书类型；图片上传换 mmbiz URL（替代 `publish_adapter.py:23` 的 data URI 内联，修复 SVG `<image>` 死路） |
| **netpi/wechat-layout** | 106(停更) | checklist 素材：Android 点击运动元素出怪异边框，须在 `<g>` 设 `style="outline:none"` | 预置进所有交互模板的 `<g>` |
| **wechat-article-exporter** | 11.4k | 能力方向：反向导入已发布文章（资源内嵌、消除外链） | 规划「写→发」之外的反向导入链路 |

---

## 5. 优化路线图（P0/P1/P2）

### P0 — 复制保真零出错（先止血：停止自我破坏）

1. **SVG 子树豁免全局 id 剥离** — 落地 `backend/app/services/wechat_sanitize.py:445`：把 `re.sub(r'\s+id="[^"]*"', '', html)` 改为「仅剥 HTML 上下文 id，保留 `<svg>...</svg>` 内部 id」。
   验收：含 `<linearGradient id=g1>+fill=url(#g1)`、`begin="hero.click"` 的模板复制后 id 仍在；5 个模板交互全部恢复。
   *注：微信侧自己也剥 id（uncertain），所以此项只是「不替微信提前破坏」，最终是否生效以 add_draft 真机为准——这正是下一条。*
2. **add_draft 真机回归套件** — 新建测试：把 5 模板经 add_draft 推草稿箱，用 iOS+Android 真机验证渐变/滤镜/begin=click/pointer-events 实际存活情况，把 §2.2 的 uncertain 升/降级。
   验收：产出一份「经 API 实测的微信 SVG 能力真值表」，覆盖 12 条断言。
   ✅ 套件已落地：backend/tests/regression/（运行方式见其 README）
3. **style 白名单豁免 SVG 着色/几何属性** — `wechat_sanitize.py:29-59`：对 SVG 子树放行 fill/stroke/stroke-width/stop-color/transform/pointer-events/cursor。
   验收：穿透热区、CSS 着色模板复制后视觉无退化。
4. **停止 `opacity:0→1` 改写在 SVG 内的作用** — `wechat_sanitize.py:361`：SVG 子树跳过该改写。
   验收：style/属性 opacity:0 起手的淡入动画初始态保留。
5. **校验闭环修复** — ①validator 改为跑在 sanitize **之前**或对原始 SVG 跑；②`svg_validator.py:80` attributeName 正则改大小写不敏感或先归一化；③前端 `editorApi.ts:53` 不再丢弃 report，`EditorSurface.tsx:237` copy 路径接回硬门禁。
   验收：小写化/越界属性能被检出并阻断；fail-open 时给明确告警。
6. **复制分块 SVG 原子性** — `clipboard.ts:95-148`：`splitElement` 遇 `<svg>` 不切分（整体移到下一块或单独成块）。
   验收：>250KB 大 SVG 不再被切成残片；补 `clipboard.test.ts` 的 SVG 用例。

### P1 — 交互动效上限（在止血后补刀）

1. **effect registry（插槽化模板）** — 移植 opensvg 8 block，建立交互效果分类学（展开/轮播/滑动/长按/答题/翻卡），每效果定义文本槽+图片槽+时序参数，支持光标位置/区块级插入（替代 `TemplateGallery.tsx` 整篇覆盖）。
   验收：AI/CLI 填槽即产出过校验的合法 SVG；可单区块插入。
2. **stroke-dasharray 降级 + 白名单校准** — `svg_validator.py:28`：stroke-dasharray 降 warning；放开 stroke/rx/ry 误杀（对照 T/CASME 1609—2024）；补 `<style>/@keyframes` 整块会被删、SVG 内 `<a>`、外链/base64 `<image>` 的告警。
   验收：误杀 0；漏拦的「预览正常粘贴后消失」类问题有预警。
3. **编辑器内交互预览** — 当前 `/publish/preview` 与复制共用 sanitize 导致预览即坏。提供「原始 SVG 交互预览模式」（不走 sanitize、可点击）。
   验收：用户插入模板后能在编辑器内验证「点击展开」是否生效。
4. **真后端 LLM 生成** — `agent_svg_prompt.py` 接真 LLM，输出结构化 DSL→SVG，而非关键词 stub。

### P2 — 编辑体验

1. SVG 属性/动画可视化面板（颜色选择器、热区拖拽、SMIL 时间轴），替代纯 textarea。
2. 模板卡片视觉缩略图 + 参数化配色/文案。
3. `StructurePanel.tsx` 大纲解析 SVG 内部交互结构（手风琴卡、时间轴节点可定位）。
4. 反向导入链路（借鉴 wechat-article-exporter）；多平台渲染 profile（公众号/知乎/掘金）。

---

## 6. 风险与文档勘误

- `StructurePanel.tsx:56-58` 注释称「publish pipeline 会把内联 SVG 栅格化为 PNG」**已过时**——`raster_inline_svgs.py` 标记 deprecated(2026.04) 且已断线，复制路径无光栅化兜底，注释须更正。
- `svg_validator.py:216` 建议用户改用 `begin="id.click"` 与 `:445` 全局剥 id **自相矛盾**，须同步修复。
- 前端 `package.json` 的 dompurify@3.4.2 / juice@11.0.0 为**死依赖**（src 零引用），可清理。

---

## 附：核心来源索引
- 微信能力边界：[axtonliu.ai 2025-03](https://www.axtonliu.ai/newsletters/ai-2/posts/wechat-article-html-css-support)、[zer0n.cn](https://www.zer0n.cn/archives/wechatsvg)、[CSDN SiShen654 2026-04](https://blog.csdn.net/SiShen654/article/details/134956473)、[掘金 2019](https://juejin.cn/post/6844903896071012366)、[博客园 haqiao 2020](https://www.cnblogs.com/haqiao/p/13438686.html)、[T/CASME 1609—2024 fudan.design](https://www.fudan.design/svg.html)
- 后台保存/草稿箱：[微信社区 2024-09](https://developers.weixin.qq.com/community/develop/doc/00020abb8507b0db1a12c08386bc00)、[微信社区 2024-06](https://developers.weixin.qq.com/community/develop/doc/000e08e18dc7000995a19c17961000)、[add_draft 文档](https://developers.weixin.qq.com/doc/service/api/draftbox/draftmanage/api_draft_add.html)
- 竞品：[135 SVG编辑器](https://www.135editor.com/svgeditor/)、[135 保存同步](https://www.135editor.com/essences/4732.html)、[秀米](https://www.sohu.com/a/406438514_330573)、[i排版](https://ipaiban.com/)、[小墨鹰](https://www.novatools.cn/tools/xmyeditor)、[epub360 微排版 2025](https://www.epub360.com/blogs/article/686628af053629002d8079da/)
- 开源：[doocs/md](https://github.com/doocs/md)、[cailven/opensvg](https://github.com/cailven/opensvg)、[caol64/wenyan-core](https://github.com/caol64/wenyan-core)、[wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter)
