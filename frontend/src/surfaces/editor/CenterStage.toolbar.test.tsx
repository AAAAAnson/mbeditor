import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function renderStage(showProChrome: boolean) {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome={showProChrome}
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
    />,
  );
}

describe("CenterStage 顶部常驻格式工具条", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("可编辑预览上方渲染格式工具条(加粗/标题/图片)", () => {
    renderStage(false);
    expect(screen.getByTestId("rich-editor-toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加粗" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "图片" })).toBeInTheDocument();
    // 工具条作用于既有 contentEditable 写作区(未被 TipTap 取代)
    expect(screen.getByTestId("preview-editable-content")).toBeInTheDocument();
  });
});
