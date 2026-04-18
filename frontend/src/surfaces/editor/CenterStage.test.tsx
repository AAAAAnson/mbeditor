import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("CenterStage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760 });
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
        previewHtml="<p>Hello preview</p>"
        previewLoading={false}
        previewError={null}
        publishing={false}
        onBack={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
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
        previewHtml=""
        previewLoading={false}
        previewError={null}
        publishing={false}
        onBack={onBack}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "返回上一页" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
