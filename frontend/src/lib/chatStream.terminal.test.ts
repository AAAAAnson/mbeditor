// 批6 顺手修(批5 遗留 minor):同一 chunk 里终态帧之后的残余帧必须被截断丢弃,
// 不再进状态机 —— 终态(turn_done/error)之后的一切都是噪声(代理粘包/后端多吐)。
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatEvent } from "@/types/agentChat";

import { streamChatTurn } from "./chatStream";

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

const TURN_DONE = {
  type: "turn_done",
  changed_block_ids: [],
  summary: "好了",
  html: "<section><p>原文</p></section>",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChatTurn — 终态帧后截断", () => {
  it("同 chunk 内 turn_done 之后的帧被丢弃,不再派发", async () => {
    const frames =
      frame({ type: "chat_token", text: "好" }) +
      frame(TURN_DONE) +
      frame({ type: "chat_token", text: "多余" }) +
      frame({ type: "block_update", changed_blocks: [], deleted_ids: [], order: [] });
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(frames)));

    const events: ChatEvent[] = [];
    const onClose = vi.fn();
    streamChatTurn({
      articleId: "art1",
      html: "<section><p>原文</p></section>",
      messages: [{ role: "user", content: "改一下" }],
      onEvent: (e) => events.push(e),
      onError: vi.fn(),
      onClose,
    });

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(events.map((e) => e.type)).toEqual(["chat_token", "turn_done"]);
  });

  it("error 终态帧后同样截断", async () => {
    const frames =
      frame({ type: "error", code: "llm_timeout", message: "AI 生成超时" }) +
      frame({ type: "chat_token", text: "残留" });
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(frames)));

    const events: ChatEvent[] = [];
    const onClose = vi.fn();
    streamChatTurn({
      articleId: "art1",
      html: "<p>x</p>",
      messages: [{ role: "user", content: "改" }],
      onEvent: (e) => events.push(e),
      onError: vi.fn(),
      onClose,
    });

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(events.map((e) => e.type)).toEqual(["error"]);
  });
});
