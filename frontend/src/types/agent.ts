// frontend/src/types/agent.ts
// SSE 事件:5 型判别联合,判别键 = `type`。与后端 app/services/sse_events.py 逐字对齐。
// 任何字段名变更必须同步改后端,否则前端解析静默丢事件。

/** 五工序之一的状态变更。stage 取值固定为这 5 个中文工序名。 */
export interface AgentStageEvent {
  type: "stage";
  stage: "立意" | "行文" | "制版" | "自检" | "核验";
  status: "active" | "done";
  desc: string; // 例:"约 820 字";可为空串
}

/** 标题先于正文 token 下发一次(GeneratingTheater 用它点亮手稿标题)。 */
export interface AgentTitleEvent {
  type: "title";
  text: string;
}

/** 正文逐字流式,一个 token 一条。 */
export interface AgentTokenEvent {
  type: "token";
  text: string;
}

/** 成稿。html 必过 svg_validator;markdown 是行文原文;report 是 validator 报告。 */
export interface AgentDoneEvent {
  type: "done";
  html: string;
  markdown: string;
  report: ValidationReport;
  aigc: boolean; // AIGC_LABEL_ENABLED 时为 true
}

/** 错误。code 取值见错误码 enum;message 是中文可直接展示。 */
export interface AgentErrorEvent {
  type: "error";
  code: AgentErrorCode;
  message: string;
}

/** 局部改写终态(/agent/rewrite 的 block/digest/title)。text 是权威全文
 *  (token 帧只作流式显示);variants 仅 title scope 非空(候选标题)。
 *  article scope 不用本帧——复用 done。收到即终态,agentStream 不再重连。 */
export interface AgentRewriteDoneEvent {
  type: "rewrite_done";
  text: string;
  variants: string[];
}

export type AgentEvent =
  | AgentStageEvent
  | AgentTitleEvent
  | AgentTokenEvent
  | AgentDoneEvent
  | AgentErrorEvent
  | AgentRewriteDoneEvent;

/** validator 报告(镜像后端 svg_validator.ValidationReport)。 */
export interface ValidationFinding {
  line: number;
  rule: string;
  message: string;
  suggestion: string;
}
export interface ValidationReport {
  issues: ValidationFinding[];
  warnings: ValidationFinding[];
  stats: Record<string, number>;
}

export type AgentErrorCode =
  | "no_provider"
  | "llm_timeout"
  | "llm_rate_limit"
  | "llm_refusal"
  | "safety_block"
  | "stream_error"
  | "validate_failed";
