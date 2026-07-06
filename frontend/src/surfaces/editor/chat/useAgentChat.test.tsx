// useAgentChat 状态机:注入 fake chatStream 手工驱动帧;revisions 走 mock api。
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { streamChatTurn, ChatStreamOptions } from "@/lib/chatStream";

import { useAgentChat } from "./useAgentChat";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

import api from "@/lib/api";

const apiGet = vi.mocked(api.get);

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

const HTML = "<section><p>一</p><p>二</p></section>";

const CHECKPOINT = {
  type: "checkpoint" as const,
  rev_id: "rev_1",
  shell_open: "<section>",
  shell_close: "</section>",
  order: ["b1", "b2"],
  blocks: [
    { id: "b1", kind: "text", html: "<p>一</p>" },
    { id: "b2", kind: "text", html: "<p>二</p>" },
  ],
};

function setup() {
  const onHtmlChange = vi.fn();
  const { fake, calls } = makeFakeStream();
  const hook = renderHook(() =>
    useAgentChat({
      articleId: "art1",
      getHtml: () => HTML,
      onHtmlChange,
      stream: fake,
    }),
  );
  return { hook, calls, onHtmlChange };
}

/** 快捷:发起一轮并回放 checkpoint。 */
function startTurn(s: ReturnType<typeof setup>, text = "改活泼点") {
  act(() => s.hook.result.current.send(text));
  act(() => s.calls[s.calls.length - 1].opts.onEvent(CHECKPOINT));
}

beforeEach(() => {
  apiGet.mockReset();
});

describe("useAgentChat — send 与流中状态", () => {
  it("send:登记 user 条目,携带 html+历史消息开流,状态 streaming", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改活泼点"));

    expect(s.hook.result.current.status).toBe("streaming");
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].opts.articleId).toBe("art1");
    expect(s.calls[0].opts.html).toBe(HTML);
    expect(s.calls[0].opts.messages).toEqual([{ role: "user", content: "改活泼点" }]);
    const entries = s.hook.result.current.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "user", text: "改活泼点" });
  });

  it("空白输入与 streaming 中重复 send 都被拒绝(并发防护)", () => {
    const s = setup();
    act(() => s.hook.result.current.send("   "));
    expect(s.calls).toHaveLength(0);

    act(() => s.hook.result.current.send("第一句"));
    act(() => s.hook.result.current.send("第二句"));
    expect(s.calls).toHaveLength(1);
    expect(s.hook.result.current.entries.filter((e) => e.kind === "user")).toHaveLength(1);
  });

  it("checkpoint:记录本轮 rev_id", () => {
    const s = setup();
    startTurn(s);
    expect(s.hook.result.current.lastRevId).toBe("rev_1");
  });

  it("chat_token:增量拼进同一条 assistant 条目", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({ type: "chat_token", text: "好" }));
    act(() => s.calls[0].opts.onEvent({ type: "chat_token", text: "的" }));

    const assistants = s.hook.result.current.entries.filter((e) => e.kind === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]).toMatchObject({ text: "好的" });
  });

  it("tool_call/tool_result:工具活动条目 running → ok/failed", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({ type: "tool_call", id: "c1", name: "read_article", arguments: {} }));
    let tool = s.hook.result.current.entries.find((e) => e.kind === "tool");
    expect(tool).toMatchObject({ name: "read_article", status: "running" });

    act(() => s.calls[0].opts.onEvent({ type: "tool_result", id: "c1", name: "read_article", ok: true, summary: {} }));
    tool = s.hook.result.current.entries.find((e) => e.kind === "tool");
    expect(tool).toMatchObject({ status: "ok" });

    act(() => s.calls[0].opts.onEvent({ type: "tool_call", id: "c2", name: "replace_block", arguments: {} }));
    act(() => s.calls[0].opts.onEvent({ type: "tool_result", id: "c2", name: "replace_block", ok: false, summary: { error: "找不到" } }));
    const tools = s.hook.result.current.entries.filter((e) => e.kind === "tool");
    expect(tools[1]).toMatchObject({ name: "replace_block", status: "failed" });
  });
});

describe("useAgentChat — 块表重建与回写", () => {
  it("block_update:按增量更新块表并实时回写整篇 html", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b1", kind: "text", html: "<p>新一</p>" }],
      deleted_ids: [],
      order: ["b1", "b2"],
    }));
    expect(s.onHtmlChange).toHaveBeenLastCalledWith("<section><p>新一</p><p>二</p></section>");

    // 删除 + 换序
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b3", kind: "text", html: "<p>三</p>" }],
      deleted_ids: ["b2"],
      order: ["b3", "b1"],
    }));
    expect(s.onHtmlChange).toHaveBeenLastCalledWith("<section><p>三</p><p>新一</p></section>");
  });

  it("turn_done:以帧内 html 为准最终回写(权威覆盖增量重建)+ 汇总 changed_block_ids", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b1", kind: "text", html: "<p>新一</p>" }],
      deleted_ids: [],
      order: ["b1", "b2"],
    }));
    act(() => s.calls[0].opts.onEvent({
      type: "turn_done",
      changed_block_ids: ["b1"],
      summary: "改好了",
      html: "<section>权威全文</section>",
    }));

    expect(s.onHtmlChange).toHaveBeenLastCalledWith("<section>权威全文</section>");
    expect(s.hook.result.current.status).toBe("idle");
    const assistant = s.hook.result.current.entries.filter((e) => e.kind === "assistant").pop();
    expect(assistant).toMatchObject({ text: "改好了", changedBlockIds: ["b1"] });
  });

  it("纯问答 turn(零修改):不回写,assistant 文本取 summary", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({
      type: "turn_done",
      changed_block_ids: [],
      summary: "这篇不用改",
      html: HTML,
    }));

    expect(s.onHtmlChange).not.toHaveBeenCalled();
    expect(s.hook.result.current.status).toBe("idle");
    const assistant = s.hook.result.current.entries.filter((e) => e.kind === "assistant").pop();
    expect(assistant).toMatchObject({ text: "这篇不用改" });
  });

  it("下一轮 send 携带上一轮 user/assistant 历史(工具/系统条目不进历史)", () => {
    const s = setup();
    startTurn(s, "第一轮");
    act(() => s.calls[0].opts.onEvent({ type: "chat_token", text: "回答一" }));
    act(() => s.calls[0].opts.onEvent({ type: "turn_done", changed_block_ids: [], summary: "回答一", html: HTML }));

    act(() => s.hook.result.current.send("第二轮"));
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].opts.messages).toEqual([
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "回答一" },
      { role: "user", content: "第二轮" },
    ]);
  });
});

describe("useAgentChat — 错误与中断", () => {
  it("流内 error 帧:error 态 + 中文消息,已回写内容保留(不回滚)", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b1", kind: "text", html: "<p>半成品</p>" }],
      deleted_ids: [],
      order: ["b1", "b2"],
    }));
    const writes = s.onHtmlChange.mock.calls.length;
    act(() => s.calls[0].opts.onEvent({ type: "error", code: "llm_timeout", message: "AI 生成超时" }));

    expect(s.hook.result.current.status).toBe("error");
    expect(s.hook.result.current.errorMessage).toBe("AI 生成超时");
    expect(s.onHtmlChange).toHaveBeenCalledTimes(writes); // 零额外回写、零回滚
  });

  it("传输层 onError:同样进 error 态;error 态下可重新 send(清空错误)", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改一下"));
    act(() => s.calls[0].opts.onError("网络连接失败,请检查网络后重试"));

    expect(s.hook.result.current.status).toBe("error");
    expect(s.hook.result.current.errorMessage).toContain("网络连接失败");

    act(() => s.hook.result.current.send("再试一次"));
    expect(s.calls).toHaveLength(2);
    expect(s.hook.result.current.status).toBe("streaming");
    expect(s.hook.result.current.errorMessage).toBeNull();
  });

  it("abort:中断流、保留已应用变更、系统条目提示可回到本轮之前", () => {
    const s = setup();
    startTurn(s);
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b1", kind: "text", html: "<p>半成品</p>" }],
      deleted_ids: [],
      order: ["b1", "b2"],
    }));
    const writes = s.onHtmlChange.mock.calls.length;

    act(() => s.hook.result.current.abort());
    expect(s.calls[0].abort).toHaveBeenCalled();
    expect(s.hook.result.current.status).toBe("idle");
    expect(s.onHtmlChange).toHaveBeenCalledTimes(writes); // 不回滚
    const sys = s.hook.result.current.entries.filter((e) => e.kind === "system").pop();
    expect(sys?.text).toContain("回到本轮之前");
  });

  it("idle 时 abort 是 no-op", () => {
    const s = setup();
    act(() => s.hook.result.current.abort());
    expect(s.hook.result.current.entries).toHaveLength(0);
  });

  it("卸载:中止流(不留悬挂请求)", () => {
    const s = setup();
    act(() => s.hook.result.current.send("改一下"));
    s.hook.unmount();
    expect(s.calls[0].abort).toHaveBeenCalled();
  });

  it("reset:清空对话/错误/rev_id/媒体警告并回 idle;后续 send 携带干净历史(docbar 恢复任意旧版后对话须归零)", () => {
    const s = setup();
    // 先积累一轮对话 + rev_id。
    startTurn(s, "换干货利落");
    act(() => s.calls[0].opts.onEvent({ type: "chat_token", text: "已换成干货利落:冷蓝白底" }));
    act(() =>
      s.calls[0].opts.onEvent({ type: "turn_done", html: HTML, changed_block_ids: [], summary: "" }),
    );
    expect(s.hook.result.current.entries.length).toBeGreaterThan(0);
    expect(s.hook.result.current.lastRevId).toBe("rev_1");

    // docbar 恢复任意历史版本后:整段对话不再描述当前文档 → 归零。
    act(() => s.hook.result.current.reset());
    expect(s.hook.result.current.entries).toHaveLength(0);
    expect(s.hook.result.current.lastRevId).toBeNull();
    expect(s.hook.result.current.errorMessage).toBeNull();
    expect(s.hook.result.current.mediaWarning).toBeNull();
    expect(s.hook.result.current.status).toBe("idle");

    // 下一轮:messages 只含新指令,不夹带被恢复覆盖的旧对话。
    act(() => s.hook.result.current.send("换俏皮带梗"));
    const last = s.calls[s.calls.length - 1];
    expect(last.opts.messages).toEqual([{ role: "user", content: "换俏皮带梗" }]);
  });
});

describe("useAgentChat — revisions client", () => {
  it("restoreCheckpoint:GET 快照 → onHtmlChange + 系统条目", async () => {
    const s = setup();
    apiGet.mockResolvedValueOnce({
      data: { code: 0, message: "", data: { rev_id: "rev_1", html: "<section>旧版</section>" } },
    });

    await act(() => s.hook.result.current.restoreCheckpoint("rev_1"));

    expect(apiGet).toHaveBeenCalledWith("/revisions/art1/rev_1");
    expect(s.onHtmlChange).toHaveBeenCalledWith("<section>旧版</section>");
    const sys = s.hook.result.current.entries.filter((e) => e.kind === "system").pop();
    expect(sys?.text).toContain("已回到");
  });

  it("restoreCheckpoint:业务失败(code≠0)抛中文错误,不回写", async () => {
    const s = setup();
    apiGet.mockResolvedValueOnce({ data: { code: 404, message: "快照不存在", data: null } });

    await expect(s.hook.result.current.restoreCheckpoint("rev_x")).rejects.toThrow("快照不存在");
    expect(s.onHtmlChange).not.toHaveBeenCalled();
  });

  it("restoreCheckpoint:streaming 中拒绝(先中断再恢复)", async () => {
    const s = setup();
    act(() => s.hook.result.current.send("改一下"));
    await expect(s.hook.result.current.restoreCheckpoint("rev_1")).rejects.toThrow("中断");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("restoreCheckpoint:裁剪被撤销 turn 及其后的对话历史(revert 让文档与历史重新同步)", async () => {
    const s = setup();
    // turn 1:checkpoint 把 rev_1 盖在本轮 user 条目上,assistant 声称已改成干货利落。
    startTurn(s, "换干货利落");
    act(() => s.calls[0].opts.onEvent({ type: "chat_token", text: "已换成干货利落:纯白底、冷蓝点缀" }));
    act(() =>
      s.calls[0].opts.onEvent({ type: "turn_done", html: HTML, changed_block_ids: [], summary: "" }),
    );
    // 回到此轮之前:文档还原到 turn 1 之前。
    apiGet.mockResolvedValueOnce({
      data: { code: 0, message: "", data: { rev_id: "rev_1", html: HTML } },
    });
    await act(() => s.hook.result.current.restoreCheckpoint("rev_1"));

    // 被撤销轮的 user/assistant 条目应被裁掉(只留系统提示),否则下一轮会带
    // 陈旧的「已是干货利落」上下文,模型误判当前文档。
    const convo = s.hook.result.current.entries.filter(
      (e) => e.kind === "user" || e.kind === "assistant",
    );
    expect(convo).toHaveLength(0);
    const sys = s.hook.result.current.entries.filter((e) => e.kind === "system").pop();
    expect(sys?.text).toContain("已回到");

    // 下一轮换调子:messages 只含新指令,不夹带被撤销轮的对话。
    act(() => s.hook.result.current.send("换俏皮带梗"));
    const last = s.calls[s.calls.length - 1];
    expect(last.opts.messages).toEqual([{ role: "user", content: "换俏皮带梗" }]);
  });

  it("listRevisions:返回快照元数据列表", async () => {
    const s = setup();
    apiGet.mockResolvedValueOnce({
      data: { code: 0, message: "", data: { revisions: [{ rev_id: "rev_2" }, { rev_id: "rev_1" }] } },
    });

    const revs = await s.hook.result.current.listRevisions();
    expect(apiGet).toHaveBeenCalledWith("/revisions/art1");
    expect(revs.map((r) => r.rev_id)).toEqual(["rev_2", "rev_1"]);
  });
});

describe("useAgentChat — 媒体守恒警告(H1 软加固)", () => {
  const CHECKPOINT_MEDIA = {
    type: "checkpoint" as const,
    rev_id: "rev_m",
    shell_open: "<section>",
    shell_close: "</section>",
    order: ["b1", "b2", "b3", "b4", "b5"],
    blocks: [
      { id: "b1", kind: "text", html: "<p>一</p>" },
      { id: "b2", kind: "image", html: "<img src='a'>" },
      { id: "b3", kind: "image", html: "<img src='b'>" },
      { id: "b4", kind: "svg", html: "<svg></svg>" },
      { id: "b5", kind: "svg", html: "<svg></svg>" },
    ],
  };

  it("checkpoint 4 媒体块、turn_done 后掉 1 → mediaWarning.removed===1", () => {
    const s = setup();
    act(() => s.hook.result.current.send("整体换个暖色调"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT_MEDIA));
    // 删掉一张 svg 块(b5),媒体块 4 → 3
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [],
      deleted_ids: ["b5"],
      order: ["b1", "b2", "b3", "b4"],
    }));
    act(() => s.calls[0].opts.onEvent({
      type: "turn_done",
      changed_block_ids: [],
      summary: "改好了",
      html: "<section>权威</section>",
    }));

    expect(s.hook.result.current.mediaWarning).toEqual({ removed: 1 });
  });

  it("纯文本 turn(媒体块不减)不误报", () => {
    const s = setup();
    act(() => s.hook.result.current.send("把第一段润色"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT_MEDIA));
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [{ id: "b1", kind: "text", html: "<p>新一</p>" }],
      deleted_ids: [],
      order: ["b1", "b2", "b3", "b4", "b5"],
    }));
    act(() => s.calls[0].opts.onEvent({
      type: "turn_done",
      changed_block_ids: ["b1"],
      summary: "改好了",
      html: "<section>权威</section>",
    }));

    expect(s.hook.result.current.mediaWarning).toBeNull();
  });

  it("dismissMediaWarning 清掉警告;新一轮 send 也清", () => {
    const s = setup();
    act(() => s.hook.result.current.send("换调子"));
    act(() => s.calls[0].opts.onEvent(CHECKPOINT_MEDIA));
    act(() => s.calls[0].opts.onEvent({
      type: "block_update",
      changed_blocks: [],
      deleted_ids: ["b2"],
      order: ["b1", "b3", "b4", "b5"],
    }));
    act(() => s.calls[0].opts.onEvent({
      type: "turn_done",
      changed_block_ids: [],
      summary: "改好了",
      html: "<section>x</section>",
    }));
    expect(s.hook.result.current.mediaWarning).toEqual({ removed: 1 });

    act(() => s.hook.result.current.dismissMediaWarning());
    expect(s.hook.result.current.mediaWarning).toBeNull();
  });
});
