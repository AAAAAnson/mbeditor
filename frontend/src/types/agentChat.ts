// frontend/src/types/agentChat.ts
// /agent/chat 的 SSE 帧:判别联合 + 运行时 guard(判别键 = `type`)。
// 与后端 app/services/chat_orchestrator.py 的事件 dict 逐字段对齐——改一边必须改另一边。
//
// 运行时防线(批5):SSE 是无 schema 的裸 JSON,后端演进/代理截断都可能产出
// 前端认不得的帧。isChatEvent 逐 kind 校验必备字段,非法帧由 chatStream 丢弃并
// 计数,绝不 `as` 裸断言进状态机。

/** 块快照(checkpoint.blocks / block_update.changed_blocks 共用)。 */
export interface ChatBlockSnapshot {
  id: string;
  kind: string; // "heading" | "text" | "image" | "svg" | "divider" | "raw"(后端启发式,前端不枚举锁死)
  html: string;
}

/** turn 开始:快照已落盘 + 完整块表(前端据此建表做高亮/汇总)。 */
export interface ChatCheckpointEvent {
  type: "checkpoint";
  rev_id: string;
  shell_open: string; // 单根信封开壳(无信封为空串)
  shell_close: string;
  order: string[];
  blocks: ChatBlockSnapshot[];
}

/** assistant 流式正文,一个 token 一条。 */
export interface ChatTokenEvent {
  type: "chat_token";
  text: string;
}

/** 模型发起一次工具调用。 */
export interface ChatToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具结果摘要(完整 html 不进帧,长字符串已被后端截断)。 */
export interface ChatToolResultEvent {
  type: "tool_result";
  id: string;
  name: string;
  ok: boolean;
  summary: unknown;
}

/** 文档增量:变更块 + 删除 id + 最新顺序(前端按块表重建整篇实时回写)。 */
export interface ChatBlockUpdateEvent {
  type: "block_update";
  changed_blocks: ChatBlockSnapshot[];
  deleted_ids: string[];
  order: string[];
  design_tokens?: Record<string, unknown>;
}

/** 正常收束。html 是后端 blocks_to_html 的最终全文——前端正确性锚点,
 *  覆盖流中按块表增量重建的结果;块表只用于高亮/汇总。 */
export interface ChatTurnDoneEvent {
  type: "turn_done";
  changed_block_ids: string[];
  summary: string;
  html: string;
}

/** 异常终止(含请求级校验失败 code="validate_failed")。message 中文可直接展示;
 *  已产生的 checkpoint 与已回写内容仍有效。code 规范集合见 types/agent.AgentErrorCode,
 *  这里放宽为 string:后端新增错误码不至于被 guard 丢帧。 */
export interface ChatErrorEvent {
  type: "error";
  code: string;
  message: string;
}

export type ChatEvent =
  | ChatCheckpointEvent
  | ChatTokenEvent
  | ChatToolCallEvent
  | ChatToolResultEvent
  | ChatBlockUpdateEvent
  | ChatTurnDoneEvent
  | ChatErrorEvent;

// --- 运行时 guard ---------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isStr);
}

function isBlockSnapshot(v: unknown): v is ChatBlockSnapshot {
  return isRecord(v) && isStr(v.id) && isStr(v.kind) && isStr(v.html);
}

function isBlockArray(v: unknown): v is ChatBlockSnapshot[] {
  return Array.isArray(v) && v.every(isBlockSnapshot);
}

/** 逐 kind 校验必备字段的运行时 guard。未知 kind / 缺字段 / 类型不符一律 false。 */
export function isChatEvent(value: unknown): value is ChatEvent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "checkpoint":
      return (
        isStr(value.rev_id) &&
        isStr(value.shell_open) &&
        isStr(value.shell_close) &&
        isStrArray(value.order) &&
        isBlockArray(value.blocks)
      );
    case "chat_token":
      return isStr(value.text);
    case "tool_call":
      return isStr(value.id) && isStr(value.name) && isRecord(value.arguments);
    case "tool_result":
      return isStr(value.id) && isStr(value.name) && typeof value.ok === "boolean" && "summary" in value;
    case "block_update":
      return (
        isBlockArray(value.changed_blocks) &&
        isStrArray(value.deleted_ids) &&
        isStrArray(value.order) &&
        (value.design_tokens === undefined || isRecord(value.design_tokens))
      );
    case "turn_done":
      return isStrArray(value.changed_block_ids) && isStr(value.summary) && isStr(value.html);
    case "error":
      return isStr(value.code) && isStr(value.message);
    default:
      return false;
  }
}
