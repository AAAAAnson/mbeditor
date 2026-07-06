// isChatEvent 运行时 guard:逐 kind 正反例(SSE 契约的运行时防线,批5)。
import { describe, expect, it } from "vitest";

import { isChatEvent } from "./agentChat";

// 每 kind 一份合法样本(与后端 chat_orchestrator 产出的帧逐字段对齐)。
const VALID: Record<string, Record<string, unknown>> = {
  checkpoint: {
    type: "checkpoint",
    rev_id: "rev_1",
    shell_open: "<section>",
    shell_close: "</section>",
    order: ["b1", "b2"],
    blocks: [
      { id: "b1", kind: "text", html: "<p>一</p>" },
      { id: "b2", kind: "text", html: "<p>二</p>" },
    ],
  },
  chat_token: { type: "chat_token", text: "好" },
  tool_call: { type: "tool_call", id: "c1", name: "read_article", arguments: {} },
  tool_result: { type: "tool_result", id: "c1", name: "read_article", ok: true, summary: { stats: {} } },
  block_update: {
    type: "block_update",
    changed_blocks: [{ id: "b1", kind: "text", html: "<p>新</p>" }],
    deleted_ids: [],
    order: ["b1"],
  },
  turn_done: { type: "turn_done", changed_block_ids: ["b1"], summary: "改好了", html: "<section></section>" },
  error: { type: "error", code: "llm_timeout", message: "AI 生成超时" },
};

describe("isChatEvent — 合法帧", () => {
  it.each(Object.keys(VALID))("接受合法 %s 帧", (kind) => {
    expect(isChatEvent(VALID[kind])).toBe(true);
  });

  it("block_update 可带 design_tokens(对象)", () => {
    expect(isChatEvent({ ...VALID.block_update, design_tokens: { primary_color: "#b45309" } })).toBe(true);
  });

  it("tool_result 的 summary 允许任意 JSON 值(含 false/字符串)", () => {
    expect(isChatEvent({ ...VALID.tool_result, summary: "截断摘要" })).toBe(true);
    expect(isChatEvent({ ...VALID.tool_result, ok: false, summary: { error: "找不到" } })).toBe(true);
  });
});

// 每 kind 缺一个必备字段 → 拒绝。
const MISSING: Array<[string, string]> = [
  ["checkpoint", "rev_id"],
  ["checkpoint", "shell_open"],
  ["checkpoint", "shell_close"],
  ["checkpoint", "order"],
  ["checkpoint", "blocks"],
  ["chat_token", "text"],
  ["tool_call", "id"],
  ["tool_call", "name"],
  ["tool_call", "arguments"],
  ["tool_result", "ok"],
  ["tool_result", "summary"],
  ["block_update", "changed_blocks"],
  ["block_update", "deleted_ids"],
  ["block_update", "order"],
  ["turn_done", "changed_block_ids"],
  ["turn_done", "summary"],
  ["turn_done", "html"],
  ["error", "code"],
  ["error", "message"],
];

describe("isChatEvent — 非法帧一律拒绝", () => {
  it.each(MISSING)("%s 缺 %s → false", (kind, field) => {
    const bad = { ...VALID[kind] };
    delete bad[field];
    expect(isChatEvent(bad)).toBe(false);
  });

  it("未知 kind → false", () => {
    expect(isChatEvent({ type: "totally_unknown", text: "x" })).toBe(false);
  });

  it("字段类型不对 → false", () => {
    expect(isChatEvent({ ...VALID.chat_token, text: 42 })).toBe(false);
    expect(isChatEvent({ ...VALID.tool_result, ok: "yes" })).toBe(false);
    expect(isChatEvent({ ...VALID.checkpoint, order: ["b1", 2] })).toBe(false);
    expect(isChatEvent({ ...VALID.checkpoint, blocks: [{ id: "b1", kind: "text" }] })).toBe(false);
    expect(isChatEvent({ ...VALID.block_update, design_tokens: "红色" })).toBe(false);
  });

  it("非对象 → false", () => {
    expect(isChatEvent(null)).toBe(false);
    expect(isChatEvent(undefined)).toBe(false);
    expect(isChatEvent("checkpoint")).toBe(false);
    expect(isChatEvent(42)).toBe(false);
    expect(isChatEvent([VALID.chat_token])).toBe(false);
  });
});
