// 批6 对 useAgentChat 的 UI 富化(全部为**新增可选字段**,批5 契约零改):
//   - checkpoint → 本轮 user 条目挂 revId(ChatPanel 轮次卡「回到此轮之前」用)
//   - tool_call 存 args、tool_result 存 summary(工具活动条目中文动词化 + violations 摘要用)
//   - turn_done → assistant 条目挂 changedBlocks(kind/文本摘要/序号)+ blockCount(高亮定位用)
//   - articleId 变化 → 内部重置会话(中止流 + 清空条目,防跨文章串味)
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { streamChatTurn, ChatStreamOptions } from "@/lib/chatStream";

import { useAgentChat } from "./useAgentChat";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

type StreamCall = {
  opts: ChatStreamOptions;
  abort: ReturnType<typeof vi.fn>;
};

function makeFakeStream() {
  const calls: StreamCall[] = [];
  const fake = ((opts: ChatStreamOptions) => {
    const abort = vi.fn();
    calls.push({ opts, abort });
    return { abort, droppedFrames: () => 0 };
  }) as unknown as typeof streamChatTurn;
  return { fake, calls };
}

const HTML = "<section><h2>标题</h2><p>正文一段</p></section>";

const CHECKPOINT = {
  type: "checkpoint" as const,
  rev_id: "rev_9",
  shell_open: "<section>",
  shell_close: "</section>",
  order: ["b1", "b2"],
  blocks: [
    { id: "b1", kind: "heading", html: "<h2>标题</h2>" },
    { id: "b2", kind: "text", html: "<p>正文一段</p>" },
  ],
};

function setup(articleId = "art1") {
  const onHtmlChange = vi.fn();
  const { fake, calls } = makeFakeStream();
  const hook = renderHook(
    (props: { articleId: string }) =>
      useAgentChat({
        articleId: props.articleId,
        getHtml: () => HTML,
        onHtmlChange,
        stream: fake,
      }),
    { initialProps: { articleId } },
  );
  return { hook, calls, onHtmlChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAgentChat — 批6 UI 富化字段", () => {
  it("checkpoint:本轮 user 条目挂上 revId(轮次卡锚点)", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改标题"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT));

    const user = s.hook.result.current.entries.find((e) => e.kind === "user");
    expect(user).toMatchObject({ text: "改标题", revId: "rev_9" });
  });

  it("tool_call 存 args,tool_result 存 summary(violations 摘要数据源)", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改一下"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT));
    act(() =>
      s.calls[0].opts.onEvent({
        type: "tool_call",
        id: "c1",
        name: "replace_block",
        arguments: { block_id: "b2" },
      }),
    );
    let tool = s.hook.result.current.entries.find((e) => e.kind === "tool");
    expect(tool).toMatchObject({ name: "replace_block", args: { block_id: "b2" } });

    const summary = {
      applied: true,
      repairs: ["剥离 position:fixed", "行内化 class"],
      violations: [{ block_id: "b2", intent: "gradient", rule: "no-gradient", fix_hint: "改用纯色背景" }],
    };
    act(() =>
      s.calls[0].opts.onEvent({ type: "tool_result", id: "c1", name: "replace_block", ok: true, summary }),
    );
    tool = s.hook.result.current.entries.find((e) => e.kind === "tool");
    expect(tool).toMatchObject({ status: "ok", summary });
  });

  it("turn_done:assistant 条目挂 changedBlocks(kind/文本摘要/order 序号)+ blockCount", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改正文"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT));
    act(() =>
      s.calls[0].opts.onEvent({
        type: "block_update",
        changed_blocks: [{ id: "b2", kind: "text", html: "<p>改写后的正文</p>" }],
        deleted_ids: [],
        order: ["b1", "b2"],
      }),
    );
    act(() =>
      s.calls[0].opts.onEvent({
        type: "turn_done",
        changed_block_ids: ["b2"],
        summary: "已把正文改得更活泼",
        html: "<section><h2>标题</h2><p>改写后的正文</p></section>",
      }),
    );

    const assistant = s.hook.result.current.entries.filter((e) => e.kind === "assistant").pop();
    expect(assistant).toMatchObject({
      changedBlockIds: ["b2"],
      blockCount: 2,
      changedBlocks: [{ id: "b2", kind: "text", text: "改写后的正文", index: 1 }],
    });
  });

  it("articleId 变化:中止流并清空会话(条目/错误/revId 归零)", () => {
    const s = setup("art1");
    act(() => s.hook.result.current.send("改一下"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT));
    expect(s.hook.result.current.entries.length).toBeGreaterThan(0);
    expect(s.hook.result.current.lastRevId).toBe("rev_9");

    s.hook.rerender({ articleId: "art2" });

    expect(s.calls[0].abort).toHaveBeenCalled();
    expect(s.hook.result.current.entries).toHaveLength(0);
    expect(s.hook.result.current.status).toBe("idle");
    expect(s.hook.result.current.errorMessage).toBeNull();
    expect(s.hook.result.current.lastRevId).toBeNull();
  });
});
