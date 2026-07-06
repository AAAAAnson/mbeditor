// CenterStage docbar「历史版本」全局入口:开合(portal 弹层)、Esc/点外关闭、
// rewrite/chat streaming 时禁用、恢复回灌 onFieldChange('html')。
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/revisionsApi", () => ({
  listRevisions: vi.fn().mockResolvedValue([]),
  getRevision: vi.fn().mockResolvedValue({ rev_id: "r", html: "<p>目标</p>" }),
  postRevision: vi.fn().mockResolvedValue("rb"),
}));

import { getRevision, listRevisions, postRevision } from "@/lib/revisionsApi";
import CenterStage from "./CenterStage";
import { useUIStore } from "@/stores/uiStore";

const mockedList = listRevisions as unknown as ReturnType<typeof vi.fn>;
const mockedGet = getRevision as unknown as ReturnType<typeof vi.fn>;
const mockedPost = postRevision as unknown as ReturnType<typeof vi.fn>;

const DRAFT = {
  title: "稿",
  mode: "html" as const,
  html: "<p>当前正文</p>",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

function renderStage(overrides: Partial<Parameters<typeof CenterStage>[0]> = {}) {
  const onFieldChange = vi.fn();
  render(
    <CenterStage
      articleId="draft-1"
      showProChrome={false}
      canGoBack
      draft={DRAFT}
      view="preview"
      setView={vi.fn()}
      tab="html"
      setTab={vi.fn()}
      saveState="saved"
      selected="body"
      navigationRequest={null}
      previewHtml="<p>当前正文</p>"
      previewLoading={false}
      previewError={null}
      publishing={false}
      copying={false}
      previewMode="wechat"
      onPreviewModeChange={vi.fn()}
      onBackToList={vi.fn()}
      onFieldChange={onFieldChange}
      onRefreshPreview={vi.fn()}
      onCopyRichText={vi.fn()}
      onPublish={vi.fn()}
      {...overrides}
    />,
  );
  return { onFieldChange };
}

beforeEach(() => {
  window.localStorage.clear();
  useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mockedList.mockReset().mockResolvedValue([{ rev_id: "r9", ts: 1720080000, reason: "ai_adopt" }]);
  mockedGet.mockReset().mockResolvedValue({ rev_id: "r9", html: "<p>目标</p>" });
  mockedPost.mockReset().mockResolvedValue("rb");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CenterStage — docbar 历史版本", () => {
  it("点「历史版本」开 portal 弹层并拉列表;关闭按钮收起", async () => {
    renderStage();
    fireEvent.click(screen.getByTestId("history-button"));
    expect(await screen.findByTestId("history-panel")).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith("draft-1");
    expect(await screen.findByText("AI 改稿前")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭历史版本" }));
    await waitFor(() => expect(screen.queryByTestId("history-panel")).toBeNull());
  });

  it("点 overlay 背板关闭弹层", async () => {
    renderStage();
    fireEvent.click(screen.getByTestId("history-button"));
    await screen.findByTestId("history-panel");
    fireEvent.click(screen.getByTestId("history-overlay"));
    await waitFor(() => expect(screen.queryByTestId("history-panel")).toBeNull());
  });

  it("恢复:restore_backup 先落 + getRevision + onFieldChange('html') 回灌", async () => {
    const { onFieldChange } = renderStage();
    fireEvent.click(screen.getByTestId("history-button"));
    fireEvent.click(await screen.findByText("AI 改稿前"));

    await waitFor(() => expect(onFieldChange).toHaveBeenCalledWith("html", "<p>目标</p>"));
    expect(mockedPost).toHaveBeenCalledWith("draft-1", "<p>当前正文</p>", "restore_backup");
    expect(mockedGet).toHaveBeenCalledWith("draft-1", "r9");
  });

  it("恢复:清空 AI 对话(onChatReset)——恢复后旧对话不再描述当前文档", async () => {
    const onChatReset = vi.fn();
    renderStage({ onChatReset });
    fireEvent.click(screen.getByTestId("history-button"));
    fireEvent.click(await screen.findByText("AI 改稿前"));

    await waitFor(() => expect(onChatReset).toHaveBeenCalledTimes(1));
  });

  it("chat streaming 时按钮禁用", () => {
    renderStage({ chatStreaming: true });
    expect(screen.getByTestId("history-button")).toBeDisabled();
  });
});
