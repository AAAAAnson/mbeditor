import { afterEach, describe, expect, it, vi } from "vitest";
import { agentStream } from "./agentStream";
import type { AgentEvent } from "@/types/agent";

const encoder = new TextEncoder();

/** 把若干字符串块做成一个 ReadableStream<Uint8Array>,模拟分片到达的 SSE 响应体。 */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

/** 用给定的响应体顺序伪造 fetch。每次调用弹出队首;遇 "network-error" / 队空则抛网络错误。 */
function mockFetchSequence(bodies: Array<ReadableStream<Uint8Array> | "network-error">): void {
  const queue = [...bodies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const next = queue.shift();
      if (next === undefined || next === "network-error") {
        throw new TypeError("Failed to fetch");
      }
      return new Response(next, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
}

/** 收齐 onEvent / onError / onClose,done|error|close 后 resolve。 */
function collect(): {
  handlers: Parameters<typeof agentStream>[2];
  done: Promise<{ events: AgentEvent[]; errors: string[]; closed: boolean }>;
} {
  const events: AgentEvent[] = [];
  const errors: string[] = [];
  let resolveFn!: (v: { events: AgentEvent[]; errors: string[]; closed: boolean }) => void;
  const done = new Promise<{ events: AgentEvent[]; errors: string[]; closed: boolean }>((res) => {
    resolveFn = res;
  });
  const handlers = {
    onEvent: (e: AgentEvent) => {
      events.push(e);
      if (e.type === "done" || e.type === "error") {
        resolveFn({ events, errors, closed: false });
      }
    },
    onError: (message: string) => {
      errors.push(message);
      resolveFn({ events, errors, closed: false });
    },
    onClose: () => {
      resolveFn({ events, errors, closed: true });
    },
  };
  return { handlers, done };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("agentStream — frame parsing", () => {
  it("parses each data: frame into one onEvent", async () => {
    mockFetchSequence([
      streamFromChunks([
        frame({ type: "stage", stage: "立意", status: "active", desc: "" }),
        frame({ type: "title", text: "标题" }),
        frame({ type: "token", text: "你" }),
        frame({ type: "token", text: "好" }),
        frame({
          type: "done",
          html: "<p>h</p>",
          markdown: "h",
          report: { issues: [], warnings: [], stats: {} },
          aigc: false,
        }),
      ]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", { intent: "x" }, handlers);
    const { events, errors } = await done;
    expect(errors).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["stage", "title", "token", "token", "done"]);
    expect(events[1]).toMatchObject({ type: "title", text: "标题" });
  });

  it("reassembles a frame split across two chunks", async () => {
    const full = frame({ type: "token", text: "拼接" });
    const cut = Math.floor(full.length / 2);
    mockFetchSequence([
      streamFromChunks([
        full.slice(0, cut),
        full.slice(cut) +
          frame({
            type: "done",
            html: "",
            markdown: "",
            report: { issues: [], warnings: [], stats: {} },
            aigc: false,
          }),
      ]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", {}, handlers);
    const { events } = await done;
    expect(events[0]).toMatchObject({ type: "token", text: "拼接" });
    expect(events[1].type).toBe("done");
  });

  it("ignores blank lines and non-data lines", async () => {
    mockFetchSequence([
      streamFromChunks([
        ": comment ping\n\n",
        frame({ type: "token", text: "a" }),
        frame({
          type: "done",
          html: "",
          markdown: "",
          report: { issues: [], warnings: [], stats: {} },
          aigc: false,
        }),
      ]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", {}, handlers);
    const { events } = await done;
    expect(events.map((e) => e.type)).toEqual(["token", "done"]);
  });
});

describe("agentStream — reconnect & terminal", () => {
  it("reconnects exactly once after a mid-stream network drop, then errors", async () => {
    // 第一条响应体读到一半就网络错误(stream 内 error),第二次 fetch 直接网络错误。
    const flaky = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: "));
        controller.error(new TypeError("network dropped"));
      },
    });
    mockFetchSequence([flaky, "network-error"]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", {}, handlers);
    const { errors } = await done;
    expect(errors.length).toBe(1); // 重连 1 次后仍失败 → 恰一次 onError
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("reconnect succeeds and yields done on the second attempt", async () => {
    const flaky = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError("network dropped"));
      },
    });
    const good = streamFromChunks([
      frame({
        type: "done",
        html: "ok",
        markdown: "ok",
        report: { issues: [], warnings: [], stats: {} },
        aigc: false,
      }),
    ]);
    mockFetchSequence([flaky, good]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", {}, handlers);
    const { events, errors } = await done;
    expect(errors).toEqual([]);
    expect(events.at(-1)?.type).toBe("done");
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("does NOT reconnect after a business error event", async () => {
    mockFetchSequence([
      streamFromChunks([
        frame({ type: "error", code: "no_provider", message: "还没配置模型 key" }),
      ]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/write", {}, handlers);
    const { events, errors } = await done;
    expect(errors).toEqual([]); // 业务 error 走 onEvent,不走 onError
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "no_provider" });
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("abort() suppresses onError after a drop", async () => {
    const never = new ReadableStream<Uint8Array>({
      start() {
        // 永不入队、永不关闭:reader.read() 挂起,直到 abort
      },
    });
    mockFetchSequence([never]);
    const onError = vi.fn();
    const onClose = vi.fn();
    const handle = agentStream(
      "/api/v1/agent/write",
      {},
      { onEvent: () => {}, onError, onClose },
    );
    handle.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("agentStream — rewrite_done 终态(/agent/rewrite)", () => {
  it("treats rewrite_done as terminal: closes without retry", async () => {
    mockFetchSequence([
      streamFromChunks([
        frame({ type: "token", text: "新" }),
        frame({ type: "rewrite_done", text: "新文案", variants: [] }),
      ]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/rewrite", { scope: "block" }, handlers);
    const { events, errors, closed } = await done;
    expect(errors).toEqual([]);
    expect(closed).toBe(true); // 未收到 done/error 但 rewrite_done 即终态 -> onClose
    expect(events.map((e) => e.type)).toEqual(["token", "rewrite_done"]);
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("parses rewrite_done variants payload", async () => {
    mockFetchSequence([
      streamFromChunks([frame({ type: "rewrite_done", text: "", variants: ["甲", "乙", "丙"] })]),
    ]);
    const { handlers, done } = collect();
    agentStream("/api/v1/agent/rewrite", { scope: "title" }, handlers);
    const { events } = await done;
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "rewrite_done", variants: ["甲", "乙", "丙"] });
  });
});
