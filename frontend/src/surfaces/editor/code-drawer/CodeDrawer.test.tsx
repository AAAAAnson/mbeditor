import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CenterStage from "../CenterStage";
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

describe("CodeDrawer (右侧代码抽屉)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({
      editorPreviewWidth: 420,
      editorPreviewHeight: 760,
      editorPreviewScale: 1,
      codeDrawerOpen: false,
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("默认不显示代码抽屉;点「代码」才滑出,含 HTML/CSS/JS tab", () => {
    renderStage();
    expect(screen.queryByTestId("code-drawer")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /代码/ }));

    expect(screen.getByTestId("code-drawer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "css" })).toBeInTheDocument();
  });

  it("抽屉内 Monaco 编辑器改动回写 onFieldChange,并 strip 非法 Unicode", () => {
    const onFieldChange = vi.fn();
    render(
      <CenterStage
        articleId="draft-1"
        showProChrome
        canGoBack
        draft={DRAFT}
        view="code"
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
        onFieldChange={onFieldChange}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />,
    );

    // view=code auto-opens the drawer in pro chrome.
    expect(screen.getByTestId("code-drawer")).toBeInTheDocument();
    const editor = screen.getByTestId("code-monaco") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "<p>clean \uD83D bad</p>" } });

    expect(onFieldChange).toHaveBeenCalled();
    const [field, value] = onFieldChange.mock.calls[onFieldChange.mock.calls.length - 1];
    expect(field).toBe("html");
    expect(value).not.toMatch(/[\uD800-\uDFFF]/);
    expect(value).toContain("clean");
  });

  it("抽屉内含 IDE 状态栏(行号/字节/articleId)", () => {
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /代码/ }));
    expect(screen.getByTestId("editor-status-bar")).toBeInTheDocument();
  });

  it("code tabs remain 44px Warm touch targets despite all:unset", () => {
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /代码/ }));

    expect(screen.getByRole("button", { name: "html" })).toHaveStyle({
      display: "inline-flex",
      minHeight: "44px",
    });
  });

  it("Monaco 字号接设置里的「编辑器字号」(uiStore.editorFontSize)", () => {
    useUIStore.setState({ editorFontSize: 17 });
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /代码/ }));
    const editor = screen.getByTestId("code-monaco");
    expect(editor.getAttribute("data-font-size")).toBe("17");
  });

  it("抽屉宽度接 uiStore.codeDrawerWidth(不再死钉 720)", () => {
    useUIStore.setState({ codeDrawerWidth: 900 });
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /代码/ }));
    expect(screen.getByTestId("code-drawer")).toHaveStyle({ width: "900px" });
  });

  it("抽屉左缘有拖拽手柄,拖动改 codeDrawerWidth(向左变宽)", () => {
    useUIStore.setState({ codeDrawerWidth: 720 });
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /代码/ }));

    const handle = screen.getByTestId("code-drawer-resize");
    expect(handle).toBeInTheDocument();
    // 从 x=1000 起,向左拖到 x=880(左移 120)→ 宽度 +120 = 840。
    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 880 });
    fireEvent.mouseUp(window);
    expect(useUIStore.getState().codeDrawerWidth).toBe(840);
  });
});
