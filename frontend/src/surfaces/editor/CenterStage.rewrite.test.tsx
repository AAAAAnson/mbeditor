// CenterStage × 选中即改 集成(P2 收编后):门控(公众号效果可编辑才挂)、raw 不挂、
// 点预设即把预设指令交给 onAgentInstruct(统一 Agent 对话);不再有块级 contentEditable 锁。
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import CenterStage from "./CenterStage";
import { useUIStore } from "@/stores/uiStore";

const DRAFT = {
  title: "测试稿件",
  mode: "html" as const,
  html: "<p>Hello preview</p>",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

function renderStage(overrides: Partial<Parameters<typeof CenterStage>[0]> = {}) {
  return render(
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
      previewHtml="<p>Hello preview</p>"
      previewLoading={false}
      previewError={null}
      publishing={false}
      copying={false}
      previewMode="wechat"
      onPreviewModeChange={vi.fn()}
      onBackToList={vi.fn()}
      onFieldChange={vi.fn()}
      onRefreshPreview={vi.fn()}
      onCopyRichText={vi.fn()}
      onPublish={vi.fn()}
      {...overrides}
    />,
  );
}

function selectInsidePreview() {
  const content = screen.getByTestId("preview-editable-content");
  const p = content.querySelector("p")!;
  vi.spyOn(document, "getSelection").mockReturnValue({
    anchorNode: p.firstChild,
  } as unknown as Selection);
  fireEvent(document, new Event("selectionchange"));
}

describe("CenterStage — 选中即改集成", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("simple 模式(公众号效果)选中段落即出 AI 工具条 —— 不看 uiMode", () => {
    renderStage({ showProChrome: false });
    selectInsidePreview();
    expect(screen.getByTestId("rewrite-toolbar")).toBeInTheDocument();
  });

  it("交互预览(raw)不挂工具条", () => {
    renderStage({ previewMode: "raw" });
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
    expect(screen.queryByTestId("raw-preview-iframe")).toBeInTheDocument();
  });

  it("预览报错时(不可编辑)不出工具条", () => {
    renderStage({ previewError: "boom", previewHtml: "" });
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
  });

  it("点预设即把预设指令交给 onAgentInstruct(收编统一对话);预览不再被锁", () => {
    const onAgentInstruct = vi.fn();
    renderStage({ onAgentInstruct });
    selectInsidePreview();
    fireEvent.click(screen.getByRole("button", { name: "润色" }));

    expect(onAgentInstruct).toHaveBeenCalledTimes(1);
    expect(onAgentInstruct.mock.calls[0][0]).toContain("把这一段润色");
    // 收编后无块级 contentEditable 锁:预览仍可编辑
    const content = screen.getByTestId("preview-editable-content");
    expect(content.getAttribute("contenteditable")).toBe("true");
  });
});
