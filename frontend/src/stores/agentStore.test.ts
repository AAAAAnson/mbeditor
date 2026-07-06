import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "./agentStore";

beforeEach(() => {
  useAgentStore.setState({ messages: [], status: "idle" });
});

describe("agentStore — no fake stream", () => {
  it("send appends only the user message and does not fabricate a reply", async () => {
    await useAgentStore.getState().send("把开头改文艺点");
    const { messages } = useAgentStore.getState();
    // 旧实现会塞 user+think+tool+assistant 共 4 条假消息;新实现只留 user。
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "user", text: "把开头改文艺点" });
    expect(messages.some((m) => m.kind === "think" || m.kind === "tool")).toBe(false);
  });

  it("send does not rely on timers (no fake setTimeout stream)", async () => {
    vi.useFakeTimers();
    const p = useAgentStore.getState().send("test");
    // 不推进定时器也应直接 resolve —— 证明已无 setTimeout 假流。
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("clearMessages empties the stream and resets status", () => {
    useAgentStore.setState({
      messages: [{ t: "x", kind: "user", text: "hi" }],
      status: "thinking",
    });
    useAgentStore.getState().clearMessages();
    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().status).toBe("idle");
  });
});
