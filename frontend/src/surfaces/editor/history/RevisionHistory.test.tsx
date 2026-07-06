// RevisionHistory 共享组件:列表加载 / reason 中文化+时间 / 恢复序
// (restore_backup 先落 → getRevision → onRestore)/ 快照失败不阻断 / 空态 / 错误态。
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { toast } from "@/stores/toastStore";

vi.mock("@/lib/revisionsApi", () => ({
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
  postRevision: vi.fn(),
}));

import { getRevision, listRevisions, postRevision } from "@/lib/revisionsApi";
import RevisionHistory from "./RevisionHistory";

const mockedList = listRevisions as unknown as ReturnType<typeof vi.fn>;
const mockedGet = getRevision as unknown as ReturnType<typeof vi.fn>;
const mockedPost = postRevision as unknown as ReturnType<typeof vi.fn>;

function renderHistory(overrides: Partial<Parameters<typeof RevisionHistory>[0]> = {}) {
  const onRestore = vi.fn();
  const getCurrentHtml = vi.fn(() => "<p>当前</p>");
  render(
    <RevisionHistory
      articleId="art1"
      getCurrentHtml={getCurrentHtml}
      onRestore={onRestore}
      {...overrides}
    />,
  );
  return { onRestore, getCurrentHtml };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RevisionHistory — 列表", () => {
  it("挂载即拉列表,reason 中文化 + 时间可见", async () => {
    mockedList.mockResolvedValue([
      { rev_id: "r3", ts: 1720080000, reason: "chat_turn" },
      { rev_id: "r2", ts: 1720075000, reason: "ai_adopt" },
      { rev_id: "r1", ts: 1720070000, reason: "conflict" },
      { rev_id: "r0", ts: 1720065000, reason: "manual" },
    ]);
    renderHistory();

    expect(mockedList).toHaveBeenCalledWith("art1");
    expect(await screen.findByText("对话修改前")).toBeInTheDocument();
    expect(screen.getByText("AI 改稿前")).toBeInTheDocument();
    expect(screen.getByText("多端覆盖备份")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0);
  });

  it("空列表出引导文案", async () => {
    mockedList.mockResolvedValue([]);
    renderHistory();
    expect(await screen.findByText(/还没有历史版本/)).toBeInTheDocument();
  });

  it("加载失败出错误文案(不崩)", async () => {
    mockedList.mockRejectedValue(new Error("历史版本读取失败,请稍后重试"));
    renderHistory();
    expect(await screen.findByText("历史版本读取失败,请稍后重试")).toBeInTheDocument();
  });
});

describe("RevisionHistory — 恢复序", () => {
  it("点条目:restore_backup 先落 → getRevision → onRestore(html)", async () => {
    const order: string[] = [];
    mockedList.mockResolvedValue([{ rev_id: "r9", ts: 1720080000, reason: "ai_adopt" }]);
    mockedPost.mockImplementation(async () => {
      order.push("backup");
      return "rev_backup";
    });
    mockedGet.mockImplementation(async () => {
      order.push("get");
      return { rev_id: "r9", html: "<p>旧版</p>" };
    });
    const { onRestore, getCurrentHtml } = renderHistory();

    fireEvent.click(await screen.findByText("AI 改稿前"));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("<p>旧版</p>"));
    expect(getCurrentHtml).toHaveBeenCalled();
    expect(mockedPost).toHaveBeenCalledWith("art1", "<p>当前</p>", "restore_backup");
    expect(order).toEqual(["backup", "get"]);
    order.push("restore");
    // onRestore 发生在 get 之后
    expect(mockedGet).toHaveBeenCalledWith("art1", "r9");
  });

  it("restore_backup 失败仍继续恢复(不阻断)", async () => {
    mockedList.mockResolvedValue([{ rev_id: "r9", ts: 1, reason: "ai_adopt" }]);
    mockedPost.mockRejectedValue(new Error("boom"));
    mockedGet.mockResolvedValue({ rev_id: "r9", html: "<p>目标</p>" });
    const { onRestore } = renderHistory();

    fireEvent.click(await screen.findByText("AI 改稿前"));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("<p>目标</p>"));
  });

  it("getRevision 失败 → toast 错误,不回写", async () => {
    const errSpy = vi.spyOn(toast, "error");
    mockedList.mockResolvedValue([{ rev_id: "r9", ts: 1, reason: "ai_adopt" }]);
    mockedPost.mockResolvedValue("rb");
    mockedGet.mockRejectedValue(new Error("快照恢复失败,请稍后重试"));
    const { onRestore } = renderHistory();

    fireEvent.click(await screen.findByText("AI 改稿前"));
    await waitFor(() => expect(errSpy).toHaveBeenCalledWith("快照恢复失败,请稍后重试"));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("disabled 时条目按钮禁用,不触发恢复", async () => {
    mockedList.mockResolvedValue([{ rev_id: "r9", ts: 1, reason: "ai_adopt" }]);
    const { onRestore } = renderHistory({ disabled: true });
    const btn = await screen.findByText("AI 改稿前");
    expect(btn.closest("button")).toBeDisabled();
    fireEvent.click(btn);
    expect(mockedPost).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });
});
