---
name: mbeditor
description: "MBEditor 编辑器架构、发布流水线、Article↔MBDoc 迁移、块渲染器、CLI 相关任务的入口。"
user-invocable: true
metadata:
  openclaw:
    emoji: "📝"
    requires:
      bins: ["curl"]
---

# MBEditor 助手技能

## 范围边界

本 skill 只讲三件事：编辑器架构、发布流水线、`Article` ↔ `MBDoc` 迁移。

- 需要产出微信公众号安全的交互式 SVG 块？读 `skill/wechat-svg-author.skill.md`。
- 需要把已写好的 HTML/SVG 过一遍发布前校验？读 `skill/wechat-svg-validate.skill.md`。

上层心智模型和路由分流见项目根目录 `AGENTS.md`。

## 当前事实

同时持有以下四个事实：

1. 在线产品仍跑在旧的 `Article` 模型上。
2. 目标架构是块式 `MBDoc`，后端纵向已完整（schema、存储、registry、渲染入口、
   `/mbdocs` CRUD 路由、`/publish/mbdoc/*` 发布端点、Article→MBDoc 迁移脚本，
   2026-06-12 合入 main）。
3. 预览、复制、发布都已经依赖后端处理。
4. 迁移未完成：前端主编辑 UI 仍是 Article-first，`mbdocStore` 已接后端 API 但
   不是主路径。不要假设前端已经 `MBDoc`-native。

先读 `docs/architecture/SESSION_ONRAMP.md`、`docs/architecture/PROJECT_MAP.md`、`docs/agent/AGENT_WORKFLOWS.md`、`docs/agent/RENDER_DECISIONS.md`。

## 路径判断

动手之前先分类：

- Lane A：改现网产品行为。从 `Article`、`/publish` 出发。
- Lane B：推进迁移架构。从 `MBDoc`、块渲染器、渲染收敛出发。
- Lane C：桥接。先显式定义 `Article` 与 `MBDoc` 的兼容边界再动代码。

跳过这步，改动会在两套体系之间漂移。

## 入口顺序

看代码按这个顺序切入：

1. `backend/app/api/v1/publish.py`
2. `backend/app/api/v1/wechat_stateless.py`
3. `backend/app/api/v1/validate.py`
4. `backend/app/services/publish_adapter.py`
5. `backend/app/services/legacy_render_pipeline.py`
6. `backend/app/services/render_for_wechat.py`
7. `backend/app/services/block_registry.py`
8. `backend/app/models/mbdoc.py`
9. `frontend/src/surfaces/editor/EditorSurface.tsx`
10. `frontend/src/surfaces/editor/CenterStage.tsx`
11. `frontend/src/surfaces/editor/StructurePanel.tsx`
12. `frontend/src/surfaces/editor/AgentCopilot.tsx`

## CLI 优先规则

MBEditor 在向 agent-first 的 `mbeditor` CLI 过渡。

按下列优先级：

- 若 `mbeditor --help` 在当前 checkout 可跑，优先 CLI。
- 若 `mbeditor` 未安装但后端依赖可用，从 `backend/` 试 `python -m app.cli --help`。
- 两者都跑不起来，就回退到直接打 HTTP API。
- 不要承诺当前工作区里不存在的 CLI 命令。

CLI 设计文档：`docs/cli/CLI_OVERVIEW.md`、`docs/cli/CLI_ANYTHING_NOTES.md`、`docs/cli/COMMAND_REFERENCE.md`。

## 当前接口

运行时入口：

- Web UI：`http://localhost:7073`
- API base：`http://localhost:7072/api/v1`

当前已实现的后端路由：

- `/publish/preview`、`/publish/process-for-copy` — legacy Article HTML 的预览 / 复制净化（净化 + data-URI 图片 + SVG 栅格化）
- `/publish/mbdoc/preview`、`/publish/mbdoc/process-for-copy` — MBDoc 同款两端点
- `/mbdocs` — MBDoc CRUD（GET 列表 / GET / POST / PUT / DELETE）
- `/wechat/test-connection`、`/wechat/upload-image`、`/wechat/draft` — 公众号操作
- `/wechat/validate` — 发布前兼容性校验（`svg_validator`）
- `/agent/generate-svg` — Agent 产出微信安全 SVG
- `/version`、`/version/check`

注意：legacy `Article` 的 CRUD 不暴露为路由（前端本地 store + 发布端点）；`MBDoc` 自 2026-06-12 起有独立 CRUD 路由。

## 文档模型规则

按任务选 source of truth：

- 动现网已上线行为：`Article` 是权威。
- 写迁移桥接层：允许 `Article` 投影到 `MBDoc`。
- 面向未来的块编辑：`MBDoc` 应成为权威。

不要把 `Article` 和 `MBDoc` 当平级双写。

## 渲染真相规则

没有明确理由，预览、复制/导出、发布/草稿这三条路径不能发散。长期目标：三者消费同一份渲染结果。现状：仍在收敛中。

## 高风险文件

改动以下文件要当作架构缝线，不是普通叶子节点：

- `backend/app/api/v1/publish.py`
- `backend/app/services/publish_adapter.py`
- `backend/app/services/legacy_render_pipeline.py`
- `backend/app/services/wechat_service.py`
- `backend/app/services/wechat_sanitize.py`
- `backend/app/services/render_for_wechat.py`
- `backend/app/services/block_registry.py`
- `frontend/src/surfaces/editor/EditorSurface.tsx`
- `frontend/src/surfaces/editor/CenterStage.tsx`
- `frontend/src/surfaces/editor/AgentCopilot.tsx`

## 工作规则

- 不要先重写 UI 外壳。
- 不要提前移除 `Article` 旧路径。
- 不要让预览迁到 `MBDoc` 而复制/发布仍走旧路径。
- 不要继续往 `publish.py` 塞东西；要瘦身、要下沉到 `services/`。
- 不要把研究文档当作对当前 runtime 的精确描述。
- 技能文档保持短；细节压进 `docs/`。

## 升级触发

遇到以下情况停下来找用户澄清：

- 任务同时混合了旧路径修复和 `MBDoc` 迁移，且没有声明边界。
- 用户要求对发布链路做 parity-critical 改动，但没有基线验证。
- 变更需要在渲染器覆盖完成前就删除兼容层。

## 深文档指引

不要在本 skill 里堆内容，按需读：

- `docs/architecture/SESSION_ONRAMP.md`、`docs/architecture/PROJECT_MAP.md`
- `docs/agent/AGENT_WORKFLOWS.md`、`docs/agent/RENDER_DECISIONS.md`
- `docs/cli/CLI_OVERVIEW.md`、`docs/cli/CLI_ANYTHING_NOTES.md`、`docs/cli/COMMAND_REFERENCE.md`
