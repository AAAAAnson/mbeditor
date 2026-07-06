import { describe, expect, it } from "vitest";
import type {
  AgentEvent,
  AgentStageEvent,
  AgentDoneEvent,
  AgentErrorEvent,
  AgentErrorCode,
  ValidationReport,
} from "./agent";

describe("agent SSE types", () => {
  it("discriminates on `type`", () => {
    const ev: AgentEvent = { type: "token", text: "上" };
    expect(ev.type).toBe("token");
  });

  it("stage event carries the five 工序 names + status", () => {
    const stages: AgentStageEvent["stage"][] = ["立意", "行文", "制版", "自检", "核验"];
    const statuses: AgentStageEvent["status"][] = ["active", "done"];
    expect(stages).toHaveLength(5);
    expect(statuses).toEqual(["active", "done"]);
  });

  it("done event nests a ValidationReport and an aigc flag", () => {
    const report: ValidationReport = { issues: [], warnings: [], stats: {} };
    const done: AgentDoneEvent = {
      type: "done",
      html: "<section></section>",
      markdown: "# t",
      report,
      aigc: false,
    };
    expect(done.report.issues).toEqual([]);
    expect(done.aigc).toBe(false);
  });

  it("error code is the seven-member closed set", () => {
    const codes: AgentErrorCode[] = [
      "no_provider",
      "llm_timeout",
      "llm_rate_limit",
      "llm_refusal",
      "safety_block",
      "stream_error",
      "validate_failed",
    ];
    const err: AgentErrorEvent = { type: "error", code: codes[0], message: "x" };
    expect(codes).toHaveLength(7);
    expect(err.code).toBe("no_provider");
  });
});
