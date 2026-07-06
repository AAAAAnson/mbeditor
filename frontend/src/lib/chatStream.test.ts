// streamChatTurn:SSE 解析 + 运行时 guard 丢帧计数 + 传输层错误中文映射 + abort。
// mock 全局 fetch(test-setup 已有 ReadableStream polyfill)。
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatEvent } from "@/types/agentChat";

import { streamChatTurn, type ChatStreamOptions } from "./chatStream";

const enc = new TextEncoder();

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function okResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(text));
        c.close();
      },
    }),
  } as unknown as Response;
}

function collect(overrides: Partial<ChatStreamOptions> = {}) {
  const events: ChatEvent[] = [];
  const onError = vi.fn();
  const onClose = vi.fn();
  const handle = streamChatTurn({
    articleId: "art1",
    html: "<section><p>原文</p></section>",
    messages: [{ role: "user", content: "改活泼点" }],
    onEvent: (e) => events.push(e),
    onError,
    onClose,
    ...overrides,
  });
  return { events, onError, onClose, handle };
}

const CHECKPOINT = {
  type: "checkpoint",
  rev_id: "rev_1",
  shell_open: "<section>",
  shell_close: "</section>",
  order: ["b1"],
  blocks: [{ id: "b1", kind: "text", html: "<p>原文</p>" }],
};
const TURN_DONE = {
  type: "turn_done",
  changed_block_ids: [],
  summary: "不用改",
  html: "<section><p>原文</p></section>",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChatTurn", () => {
  it("POST /agent/chat 正确 body,按序解析全部帧,turn_done 终态 onClose", async () => {
    const frames =
      frame(CHECKPOINT) +
      frame({ type: "chat_token", text: "好" }) +
      frame({ type: "tool_call", id: "c1", name: "read_article", arguments: {} }) +
      frame({ type: "tool_result", id: "c1", name: "read_article", ok: true, summary: {} }) +
      frame({ type: "block_update", changed_blocks: [], deleted_ids: ["b1"], order: [] }) +
      frame(TURN_DONE);
    const fetchMock = vi.fn(async () => okResponse(frames));
    vi.stubGlobal("fetch", fetchMock);

    const { events, onError, onClose } = collect();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(events.map((e) => e.type)).toEqual([
      "checkpoint", "chat_token", "tool_call", "tool_result", "block_update", "turn_done",
    ]);
    expect(onError).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/agent/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      article_id: "art1",
      html: "<section><p>原文</p></section>",
      messages: [{ role: "user", content: "改活泼点" }],
    });
  });

  it("非法帧(坏 json/未知 kind/缺字段)丢弃并计数,合法帧照常送达", async () => {
    const frames =
      "data: {oops 坏json\n\n" +
      frame({ type: "totally_unknown", text: "x" }) +
      frame({ type: "chat_token" }) + // 缺 text
      frame({ type: "chat_token", text: "好" }) +
      frame(TURN_DONE);
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(frames)));

    const { events, onError, onClose, handle } = collect();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(events.map((e) => e.type)).toEqual(["chat_token", "turn_done"]);
    expect(handle.droppedFrames()).toBe(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it("跨 chunk 半帧由缓冲兜住,不计丢帧", async () => {
    const whole = frame({ type: "chat_token", text: "跨块" }) + frame(TURN_DONE);
    const cut = 12; // 切在第一帧 json 中间
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(whole.slice(0, cut)));
          c.enqueue(enc.encode(whole.slice(cut)));
          c.close();
        },
      }),
    }) as unknown as Response));

    const { events, onClose, handle } = collect();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(events.map((e) => e.type)).toEqual(["chat_token", "turn_done"]);
    expect(handle.droppedFrames()).toBe(0);
  });

  it("HTTP 非 200 → onError 中文,绝不重试(chat turn 有状态,重放会重复执行工具)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, body: null }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { onError, onClose } = collect();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(String(onError.mock.calls[0][0])).toContain("服务器");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("网络失败 → onError 中文映射,只调一次 fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onError } = collect();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(String(onError.mock.calls[0][0])).toContain("网络连接失败");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("流自然结束但没收到终态帧 → onError 提示中断(不自动重连)", async () => {
    const fetchMock = vi.fn(async () => okResponse(frame({ type: "chat_token", text: "半" })));
    vi.stubGlobal("fetch", fetchMock);

    const { events, onError } = collect();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(String(onError.mock.calls[0][0])).toContain("中断");
    expect(events.map((e) => e.type)).toEqual(["chat_token"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("abort:不触发 onError", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    ));

    const { onError, handle } = collect();
    handle.abort();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });

  it("外部 signal 中止同样静默取消", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    ));

    const controller = new AbortController();
    const { onError } = collect({ signal: controller.signal });
    controller.abort();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });

  it("error 帧是终态:onClose 收尾,不当传输层错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse(frame({ type: "error", code: "llm_timeout", message: "AI 生成超时" })),
    ));

    const { events, onError, onClose } = collect();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(events.map((e) => e.type)).toEqual(["error"]);
    expect(onError).not.toHaveBeenCalled();
  });
});
