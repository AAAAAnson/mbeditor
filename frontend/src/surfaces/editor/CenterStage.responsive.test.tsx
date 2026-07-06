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

function renderStage(opts: { isMobile?: boolean } = {}) {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome
      isMobile={opts.isMobile}
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

describe("CenterStage 移动适配(isMobile)", () => {
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

  it("isMobile 时即使 phonePreviewMode=true,预览框不锁 390px(运行时旁路)", () => {
    useUIStore.setState({ phonePreviewMode: true });
    renderStage({ isMobile: true });
    const frame = screen.getByTestId("preview-frame") as HTMLElement;
    expect(frame.style.width).not.toBe("390px");
  });

  it("isMobile 时预览框流式占满容器宽(width 100%,不横溢)", () => {
    // 桌面默认 editorPreviewWidth=420 的固定框在 <420 视口会横溢右缘;
    // 移动端应改为流式占满容器(shell + frame 同走 100%)。
    renderStage({ isMobile: true });
    const frame = screen.getByTestId("preview-frame") as HTMLElement;
    expect(frame.style.width).toBe("100%");
    expect(frame.style.maxWidth).toBe("100%");
    const shell = screen.getByTestId("preview-frame-shell") as HTMLElement;
    expect(shell.style.width).toBe("100%");
  });

  it("isMobile 时隐藏「手机预览」按钮", () => {
    renderStage({ isMobile: true });
    expect(screen.queryByRole("button", { name: /手机预览/ })).toBeNull();
  });

  it("非 isMobile + phonePreviewMode=true 仍锁 390px(桌面手动模拟不回归)", () => {
    useUIStore.setState({ phonePreviewMode: true });
    renderStage({ isMobile: false });
    expect((screen.getByTestId("preview-frame") as HTMLElement).style.width).toBe("390px");
  });

  it("isMobile 隐藏预览缩放/还原/拖拽控件(手机上无意义)", () => {
    renderStage({ isMobile: true });
    expect(screen.queryByRole("slider", { name: "调整预览缩放" })).toBeNull();
    expect(screen.queryByRole("button", { name: "全部还原" })).toBeNull();
    expect(screen.queryByTestId("preview-resize-corner")).toBeNull();
  });

  it("编辑器工具栏 flexWrap 防窄屏按钮溢出", () => {
    const { container } = renderStage({ isMobile: true });
    const toolbar = container.querySelector('[data-testid="editor-toolbar"]') as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.style.flexWrap).toBe("wrap");
  });

  it("Warm editor docbar keeps wrapped 44px controls on mobile", () => {
    renderStage({ isMobile: true });
    const toolbar = screen.getByTestId("editor-toolbar");
    expect(toolbar).toHaveStyle({
      flexWrap: "wrap",
      background: "var(--surface)",
    });
    // 「编辑中」状态文案已收归全局 TopBar(去重),docbar 改保留只读保存态状态标。
    // saveState="saved" → 状态标显示「已保存」,断言 docbar 仍渲染保存态指示。
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回起稿台" })).toHaveStyle({
      minHeight: "44px",
    });
  });

  it("非 isMobile 仍显示预览缩放滑块(桌面不回归)", () => {
    renderStage({ isMobile: false });
    expect(screen.getByRole("slider", { name: "调整预览缩放" })).toBeInTheDocument();
  });
});
