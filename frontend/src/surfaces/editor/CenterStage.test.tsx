import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CenterStage from "./CenterStage";
import { useUIStore } from "@/stores/uiStore";
import type { OutlineBlock } from "./StructurePanel";

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

const NAVIGATION_BLOCK: OutlineBlock = {
  id: "html-heading-1",
  type: "section",
  label: "第一部分",
  preview: "第一部分",
  depth: 1,
  sourceOffset: 12,
  sourceLine: 3,
};

describe("CenterStage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("lets the preview panel resize by dragging the bottom-right corner", () => {
    render(
      <CenterStage
        articleId="draft-1"
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
        onBack={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    const resizeCorner = screen.getByRole("button", { name: "拖动调整预览大小" });
    const previewFrameShell = screen.getByTestId("preview-frame-shell");

    expect(previewFrameShell).toHaveStyle({ width: "420px", height: "760px" });

    fireEvent.mouseDown(resizeCorner, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 220, clientY: 180 });
    fireEvent.mouseUp(window);

    expect(previewFrameShell).toHaveStyle({ width: "540px", height: "840px" });
  });

  it("lets the preview panel zoom freely", () => {
    render(
      <CenterStage
        articleId="draft-1"
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
        onBack={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    const previewFrameShell = screen.getByTestId("preview-frame-shell");
    const previewFrame = screen.getByTestId("preview-frame");
    const zoomSlider = screen.getByRole("slider", { name: "调整预览缩放" });

    fireEvent.change(zoomSlider, { target: { value: "150" } });

    expect(previewFrameShell).toHaveStyle({ width: "630px", height: "1140px" });
    expect(previewFrame).toHaveStyle({ transform: "scale(1.5)" });
  });

  it("renders a back button that routes to the previous page", () => {
    const onBack = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={DRAFT}
        view="code"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml=""
        previewLoading={false}
        previewError={null}
        publishing={false}
        copying={false}
        onBack={onBack}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "返回上一页" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("moves the editor caret when an outline navigation request arrives", () => {
    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          html: "<h1>总标题</h1>\n<p>导语</p>\n<h2>第一部分</h2>\n<p>正文</p>",
        }}
        view="code"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected={NAVIGATION_BLOCK.id}
        navigationRequest={{ block: NAVIGATION_BLOCK, seq: 1 }}
        previewHtml=""
        previewLoading={false}
        previewError={null}
        publishing={false}
        copying={false}
        onBack={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveFocus();
    expect((textarea as HTMLTextAreaElement).selectionStart).toBe(NAVIGATION_BLOCK.sourceOffset);
  });

  it("scrolls the preview to the requested outline target", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={DRAFT}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected={NAVIGATION_BLOCK.id}
        navigationRequest={{ block: NAVIGATION_BLOCK, seq: 1 }}
        previewHtml="<section><h1>总标题</h1><h2>第一部分</h2><p>正文</p></section>"
        previewLoading={false}
        previewError={null}
        publishing={false}
        copying={false}
        onBack={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
