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

function renderStage() {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome
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

describe("CenterStage 手机预览开关", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({
      editorPreviewWidth: 420,
      editorPreviewHeight: 760,
      editorPreviewScale: 1,
      phonePreviewMode: false,
      codeDrawerOpen: false,
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("提供「手机预览」开关", () => {
    renderStage();
    expect(screen.getByRole("button", { name: /手机预览/ })).toBeInTheDocument();
  });

  it("开手机预览:预览锁定手机宽度,隐藏缩放滑块与全部还原裸控件", () => {
    renderStage();
    // 默认:裸控件可见
    expect(screen.getByRole("slider", { name: "调整预览缩放" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /手机预览/ }));

    // 锁定手机宽度
    const frame = screen.getByTestId("preview-frame");
    expect(frame.style.width).toBe("390px");
    // 缩放/还原裸控件隐藏
    expect(screen.queryByRole("slider", { name: "调整预览缩放" })).toBeNull();
    expect(screen.queryByRole("button", { name: "全部还原" })).toBeNull();
    // 拖拽把手也隐藏
    expect(screen.queryByTestId("preview-resize-corner")).toBeNull();
  });

  it("开手机预览:预览框圆角手机化(一眼读得出是手机)", () => {
    renderStage();
    // 普通预览:小圆角(走主题变量,非手机大圆角)
    expect(screen.getByTestId("preview-frame").style.borderRadius).not.toBe("28px");

    fireEvent.click(screen.getByRole("button", { name: /手机预览/ }));

    expect(screen.getByTestId("preview-frame").style.borderRadius).toBe("28px");
  });
});
