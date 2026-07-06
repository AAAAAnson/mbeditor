// ChatPanel 组件:消息流渲染 / 流式态 / 工具活动条目 / 轮次卡 restore /
// 本轮改动汇总 / error 重发 / 输入禁用态 / 快捷胶囊 / 移动底抽屉。
// 注入 fake AgentChatApi(照批5 注入替身模式),不触真流。
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/revisionsApi", () => ({
  listRevisions: vi.fn().mockResolvedValue([]),
  getRevision: vi.fn().mockResolvedValue({ rev_id: "r", html: "<p>x</p>" }),
  postRevision: vi.fn().mockResolvedValue("rb"),
}));

import { getRevision, listRevisions, postRevision } from "@/lib/revisionsApi";
import type { AgentChatApi, ChatEntry } from "./useAgentChat";
import ChatPanel from "./ChatPanel";

const mockedList = listRevisions as unknown as ReturnType<typeof vi.fn>;
const mockedGet = getRevision as unknown as ReturnType<typeof vi.fn>;
const mockedPost = postRevision as unknown as ReturnType<typeof vi.fn>;

function makeChat(overrides: Partial<AgentChatApi> = {}): AgentChatApi {
  return {
    status: "idle",
    entries: [],
    errorMessage: null,
    lastRevId: null,
    send: vi.fn(),
    abort: vi.fn(),
    restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
    listRevisions: vi.fn().mockResolvedValue([]),
    mediaWarning: null,
    dismissMediaWarning: vi.fn(),
    ...overrides,
  };
}

function renderPanel(chat: AgentChatApi, overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  return render(
    <ChatPanel
      articleId="art1"
      hasContent
      isMobile={false}
      chat={chat}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatPanel — 消息流渲染", () => {
  it("user / assistant / system 条目按序可见", () => {
    const entries: ChatEntry[] = [
      { id: "e1", kind: "user", text: "把标题改得更抓人" },
      { id: "e2", kind: "assistant", text: "好的,已经改好了" },
      { id: "e3", kind: "system", text: "已中断本轮 AI 修改" },
    ];
    renderPanel(makeChat({ entries }));

    expect(screen.getByText("把标题改得更抓人")).toBeInTheDocument();
    expect(screen.getByText("好的,已经改好了")).toBeInTheDocument();
    expect(screen.getByText("已中断本轮 AI 修改")).toBeInTheDocument();
  });

  it("assistant 气泡文本剥离 markdown 记号:含 **x**/## 渲染后无星号井号", () => {
    const entries: ChatEntry[] = [
      { id: "e1", kind: "assistant", text: "## 计划\n先把**标题**改抓人" },
    ];
    const { container } = renderPanel(makeChat({ entries }));
    const bubble = container.querySelector(".chat-bubble-assistant") as HTMLElement;
    expect(bubble).not.toBeNull();
    expect(bubble.textContent).not.toContain("*");
    expect(bubble.textContent).not.toContain("#");
    expect(bubble.textContent).toContain("标题");
    expect(bubble.textContent).toContain("计划");
  });

  it("工具活动条目:中文动词化 + violations fix_hint 摘要", () => {
    const entries: ChatEntry[] = [
      { id: "t1", kind: "tool", callId: "c1", name: "read_article", status: "running" },
      { id: "t2", kind: "tool", callId: "c2", name: "replace_block", status: "ok", args: { block_id: "b3" } },
      {
        id: "t3",
        kind: "tool",
        callId: "c3",
        name: "apply_block_style",
        status: "ok",
        args: { block_id: "b5" },
        summary: {
          applied: true,
          repairs: ["剥离 fixed", "行内化"],
          violations: [{ block_id: "b5", fix_hint: "改用纯色背景" }],
        },
      },
      { id: "t4", kind: "tool", callId: "c4", name: "edit_structure", status: "failed" },
    ];
    renderPanel(makeChat({ entries }));

    expect(screen.getByText("正在读取文章结构")).toBeInTheDocument();
    expect(screen.getByText("改写 第 3 块 完成")).toBeInTheDocument();
    expect(screen.getByText(/2 处兼容修补/)).toBeInTheDocument();
    expect(screen.getByText(/改用纯色背景/)).toBeInTheDocument();
    expect(screen.getByText("调整文章结构 失败")).toBeInTheDocument();
  });

  it("轮次卡:user 条目带 revId 出「回到此轮之前」,点击调 restoreCheckpoint", () => {
    const chat = makeChat({
      entries: [{ id: "e1", kind: "user", text: "改活泼点", revId: "rev_1" }],
    });
    renderPanel(chat);

    const btn = screen.getByRole("button", { name: "回到此轮之前" });
    fireEvent.click(btn);
    expect(chat.restoreCheckpoint).toHaveBeenCalledWith("rev_1");
  });

  it("streaming 中轮次卡禁用", () => {
    const chat = makeChat({
      status: "streaming",
      entries: [{ id: "e1", kind: "user", text: "改活泼点", revId: "rev_1" }],
    });
    renderPanel(chat);
    expect(screen.getByRole("button", { name: "回到此轮之前" })).toBeDisabled();
  });

  it("本轮改动汇总:块数量 + 每块 kind/文本摘要", () => {
    const chat = makeChat({
      entries: [
        {
          id: "e1",
          kind: "assistant",
          text: "改好了",
          changedBlockIds: ["b1", "b2"],
          blockCount: 3,
          changedBlocks: [
            { id: "b1", kind: "heading", text: "新标题", index: 0 },
            { id: "b2", kind: "text", text: "新正文摘要", index: 1 },
          ],
        },
      ],
    });
    renderPanel(chat);

    expect(screen.getByText(/本轮改动汇总/)).toBeInTheDocument();
    expect(screen.getByText(/2 个块/)).toBeInTheDocument();
    expect(screen.getByText(/新标题/)).toBeInTheDocument();
    expect(screen.getByText(/新正文摘要/)).toBeInTheDocument();
    expect(screen.getByText(/标题块/)).toBeInTheDocument();
  });
});

describe("ChatPanel — 流式态与输入区", () => {
  it("streaming:assistant 尾部有流式光标,发送按钮变「停止」→ abort", () => {
    const chat = makeChat({
      status: "streaming",
      entries: [
        { id: "e1", kind: "user", text: "改一下" },
        { id: "e2", kind: "assistant", text: "正在想" },
      ],
    });
    renderPanel(chat);

    expect(screen.getByTestId("chat-streaming-cursor")).toBeInTheDocument();
    const stop = screen.getByRole("button", { name: "停止" });
    fireEvent.click(stop);
    expect(chat.abort).toHaveBeenCalled();
    expect(chat.send).not.toHaveBeenCalled();
  });

  it("输入 + 点发送:send(text) 且输入框清空;空输入发送钮禁用", () => {
    const chat = makeChat();
    renderPanel(chat);

    const input = screen.getByRole("textbox", { name: "AI 对话输入" });
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "标题再短一点" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(chat.send).toHaveBeenCalledWith("标题再短一点");
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  it("Enter 发送,Shift+Enter 换行不发送", () => {
    const chat = makeChat();
    renderPanel(chat);
    const input = screen.getByRole("textbox", { name: "AI 对话输入" });

    fireEvent.change(input, { target: { value: "第一句" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(chat.send).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(chat.send).toHaveBeenCalledWith("第一句");
  });

  it("error 态:中文横幅 + 「重发」重发最后一条 user 消息", () => {
    const chat = makeChat({
      status: "error",
      errorMessage: "AI 生成超时",
      entries: [{ id: "e1", kind: "user", text: "整体换个暖色调" }],
    });
    renderPanel(chat);

    expect(screen.getByText("AI 生成超时")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重发" }));
    expect(chat.send).toHaveBeenCalledWith("整体换个暖色调");
  });
});

describe("ChatPanel — 媒体守恒警告", () => {
  it("mediaWarning 非空:出警告条,「回到本轮之前」调 restoreCheckpoint(lastRevId)", () => {
    const chat = makeChat({ mediaWarning: { removed: 2 }, lastRevId: "rev_1" });
    renderPanel(chat);

    expect(screen.getByTestId("chat-media-warning")).toBeInTheDocument();
    expect(screen.getByText(/移除了 2 张图片/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /回到本轮之前/ }));
    expect(chat.restoreCheckpoint).toHaveBeenCalledWith("rev_1");
    expect(chat.dismissMediaWarning).toHaveBeenCalled();
  });

  it("mediaWarning 为 null:不出警告条", () => {
    renderPanel(makeChat({ mediaWarning: null }));
    expect(screen.queryByTestId("chat-media-warning")).toBeNull();
  });

  it("「知道了」调 dismissMediaWarning", () => {
    const chat = makeChat({ mediaWarning: { removed: 1 }, lastRevId: "rev_1" });
    renderPanel(chat);
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(chat.dismissMediaWarning).toHaveBeenCalled();
  });
});

describe("ChatPanel — 空态与快捷起手", () => {
  it("无 articleId:空态引导,输入禁用", () => {
    const chat = makeChat();
    renderPanel(chat, { articleId: undefined });

    expect(screen.getByText(/先打开一篇文章/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AI 对话输入" })).toBeDisabled();
  });

  it("空文章(无正文):引导先写内容,输入禁用", () => {
    const chat = makeChat();
    renderPanel(chat, { hasContent: false });

    expect(screen.getByText(/还没有内容/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AI 对话输入" })).toBeDisabled();
  });

  it("快捷起手胶囊:点击即发送", () => {
    const chat = makeChat();
    renderPanel(chat);

    const chip = screen.getByRole("button", { name: "帮我把标题改得更抓人" });
    fireEvent.click(chip);
    expect(chat.send).toHaveBeenCalledWith("帮我把标题改得更抓人");
  });

  it("已有消息后不再显示快捷胶囊", () => {
    const chat = makeChat({ entries: [{ id: "e1", kind: "user", text: "改一下" }] });
    renderPanel(chat);
    expect(screen.queryByRole("button", { name: "帮我把标题改得更抓人" })).toBeNull();
  });
});

// 历史版本列表/恢复逻辑已收敛到共享 RevisionHistory(经 @/lib/revisionsApi;
// 深度行为见 history/RevisionHistory.test.tsx)。ChatPanel 侧只验开合 + 集成:
// 打开即经共享组件拉列表并渲染中文标签,恢复走注入的 onHtmlChange。
describe("ChatPanel — 历史版本", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedGet.mockReset().mockResolvedValue({ rev_id: "r", html: "<p>x</p>" });
    mockedPost.mockReset().mockResolvedValue("rb");
  });

  it("点「历史版本」打开共享列表,渲染 reason 中文化 + 时间", async () => {
    mockedList.mockResolvedValue([
      { rev_id: "rev_3", ts: 1720080000, reason: "chat_turn" },
      { rev_id: "rev_2", ts: 1720075000, reason: "ai_adopt" },
      { rev_id: "rev_1", ts: 1720070000, reason: "manual" },
    ]);
    renderPanel(makeChat());

    fireEvent.click(screen.getByRole("button", { name: "历史版本" }));
    expect(mockedList).toHaveBeenCalledWith("art1");
    expect(await screen.findByText("对话修改前")).toBeInTheDocument();
    expect(screen.getByText("AI 改稿前")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0);
  });

  it("点某项 → restore_backup 先落 + getRevision + onHtmlChange 回灌并关闭列表", async () => {
    mockedList.mockResolvedValue([{ rev_id: "rev_9", ts: 1720080000, reason: "chat_turn" }]);
    mockedGet.mockResolvedValue({ rev_id: "rev_9", html: "<p>目标版</p>" });
    const onHtmlChange = vi.fn();
    renderPanel(makeChat(), { getHtml: () => "<p>当前</p>", onHtmlChange });

    fireEvent.click(screen.getByRole("button", { name: "历史版本" }));
    const item = await screen.findByText("对话修改前");
    fireEvent.click(item);

    await waitFor(() => expect(onHtmlChange).toHaveBeenCalledWith("<p>目标版</p>"));
    expect(mockedPost).toHaveBeenCalledWith("art1", "<p>当前</p>", "restore_backup");
    expect(mockedGet).toHaveBeenCalledWith("art1", "rev_9");
    await waitFor(() => expect(screen.queryByText("对话修改前")).toBeNull());
  });

  it("streaming 中「历史版本」按钮禁用", () => {
    const chat = makeChat({ status: "streaming" });
    renderPanel(chat);
    expect(screen.getByRole("button", { name: "历史版本" })).toBeDisabled();
  });

  it("加载失败 → 列表层内出错误文案(面板不关闭)", async () => {
    mockedList.mockRejectedValue(new Error("快照列表读取失败,请稍后重试"));
    renderPanel(makeChat());

    fireEvent.click(screen.getByRole("button", { name: "历史版本" }));
    expect(await screen.findByText("快照列表读取失败,请稍后重试")).toBeInTheDocument();
    expect(screen.getByTestId("chat-history")).toBeInTheDocument();
  });
});

describe("ChatPanel — 桌面/移动形态", () => {
  it("桌面:侧栏形态,收起按钮触发 onClose", () => {
    const onClose = vi.fn();
    renderPanel(makeChat(), { onClose });

    const panel = screen.getByTestId("chat-panel");
    expect(panel.getAttribute("data-variant")).toBe("sidebar");
    fireEvent.click(screen.getByRole("button", { name: "收起 AI 对话" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("移动:底部抽屉形态(fixed),收起按钮同样可关", () => {
    const onClose = vi.fn();
    renderPanel(makeChat(), { isMobile: true, onClose });

    const panel = screen.getByTestId("chat-panel");
    expect(panel.getAttribute("data-variant")).toBe("drawer");
    expect(panel.style.position).toBe("fixed");
    fireEvent.click(screen.getByRole("button", { name: "收起 AI 对话" }));
    expect(onClose).toHaveBeenCalled();
  });
});
