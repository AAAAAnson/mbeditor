// 工具活动条目的中文动词化 + 写工具反馈(repairs/violations)解析纯函数。
import { describe, expect, it } from "vitest";

import { blockRefFromArgs, parseWriteToolFeedback, toolActivityLabel } from "./chatPresent";

describe("toolActivityLabel — 中文动词化", () => {
  it("running:正在 + 动词短语", () => {
    expect(toolActivityLabel("read_article", "running")).toBe("正在读取文章结构");
    expect(toolActivityLabel("set_design_tokens", "running")).toBe("正在应用整体设计");
  });

  it("ok/failed:动词短语 + 完成/失败,带块号", () => {
    expect(toolActivityLabel("replace_block", "ok", { block_id: "b3" })).toBe("改写 第 3 块 完成");
    expect(toolActivityLabel("replace_block", "failed", { block_id: "b3" })).toBe("改写 第 3 块 失败");
    expect(toolActivityLabel("apply_block_style", "ok", { block_ids: ["b1", "b2"] })).toBe(
      "调整块样式 第 1 块、第 2 块 完成",
    );
    // 非 b\d+ 形状的 id 不猜,原样展示
    expect(toolActivityLabel("replace_block", "ok", { block_id: "blk-x" })).toBe("改写 blk-x 完成");
  });

  it("未知工具名兜底(后端演进不至于渲染空白)", () => {
    expect(toolActivityLabel("future_tool", "running")).toBe("正在调用 future_tool");
  });
});

describe("blockRefFromArgs", () => {
  it("识别 block_id / id / block_ids / ids,类型不符返回空串", () => {
    expect(blockRefFromArgs({ block_id: "b7" })).toBe("第 7 块");
    expect(blockRefFromArgs({ id: "b1" })).toBe("第 1 块");
    expect(blockRefFromArgs({ block_ids: ["b1", "b2"] })).toBe("第 1 块、第 2 块");
    expect(blockRefFromArgs({ block_id: 42 })).toBe("");
    expect(blockRefFromArgs(undefined)).toBe("");
  });
});

describe("parseWriteToolFeedback — 写工具返回值解析", () => {
  it("repairs 数量 + violations 的 block_id/fix_hint", () => {
    const fb = parseWriteToolFeedback({
      applied: true,
      repairs: ["剥离 fixed", "行内化"],
      violations: [{ block_id: "b5", intent: "gradient", rule: "no-gradient", fix_hint: "改用纯色背景" }],
    });
    expect(fb).toEqual({
      repairs: 2,
      violations: [{ blockId: "b5", fixHint: "改用纯色背景" }],
    });
  });

  it("缺 fix_hint 时退回 rule;非对象/无修补项返回 null", () => {
    const fb = parseWriteToolFeedback({ repairs: [], violations: [{ block_id: "b1", rule: "no-svg-filter" }] });
    expect(fb).toEqual({ repairs: 0, violations: [{ blockId: "b1", fixHint: "no-svg-filter" }] });

    expect(parseWriteToolFeedback(null)).toBeNull();
    expect(parseWriteToolFeedback("字符串摘要")).toBeNull();
    expect(parseWriteToolFeedback({ applied: true, repairs: [], violations: [] })).toBeNull();
  });
});
