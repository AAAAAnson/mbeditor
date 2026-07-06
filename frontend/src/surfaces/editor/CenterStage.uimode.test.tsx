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

function renderStage(showProChrome: boolean, view: string) {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome={showProChrome}
      canGoBack
      draft={DRAFT}
      view={view}
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

describe("CenterStage uiMode gating", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("both modes use 复制到公众号 as the primary CTA; 发到草稿箱 is demoted to 更多方式", () => {
    renderStage(false, "preview");
    expect(screen.getByRole("button", { name: /复制到公众号/ })).toBeInTheDocument();
    // 发到草稿箱 is hidden behind the 更多方式 disclosure now, not in the main row.
    expect(screen.queryByRole("button", { name: /发到草稿箱/ })).toBeNull();
  });

  it("pro mode also surfaces 复制到公众号 as the primary CTA", () => {
    renderStage(true, "preview");
    expect(screen.getByRole("button", { name: /复制到公众号/ })).toBeInTheDocument();
  });

  it("simple mode hides the IDE status bar (行/UTF-8 footer)", () => {
    renderStage(false, "preview");
    expect(screen.queryByTestId("editor-status-bar")).toBeNull();
  });

  it("pro mode shows the IDE status bar", () => {
    renderStage(true, "split");
    expect(screen.getByTestId("editor-status-bar")).toBeInTheDocument();
  });

  it("simple mode hides the code tab row even in split view", () => {
    renderStage(false, "split");
    expect(screen.queryByTestId("editor-code-tabs")).toBeNull();
  });

  it("pro mode shows the code tab row in split view", () => {
    renderStage(true, "split");
    expect(screen.getByTestId("editor-code-tabs")).toBeInTheDocument();
  });

  it("default (simple) mode hides the 编辑/分栏/预览 tri-state switch and shows editable preview", () => {
    renderStage(false, "preview");
    expect(screen.queryByRole("button", { name: "分栏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
    expect(screen.getByTestId("preview-editable-content")).toBeInTheDocument();
  });

  it("pro mode keeps the 编辑/分栏/预览 tri-state switch", () => {
    renderStage(true, "preview");
    expect(screen.getByRole("button", { name: "分栏" })).toBeInTheDocument();
  });

  it("simple mode does not render the 代码 toggle button", () => {
    renderStage(false, "preview");
    expect(screen.queryByRole("button", { name: /代码/ })).toBeNull();
  });

  it("pro mode renders the 代码 toggle button", () => {
    renderStage(true, "preview");
    expect(screen.getByRole("button", { name: /代码/ })).toBeInTheDocument();
  });

  it("simple mode never mounts the CodeDrawer even when codeDrawerOpen leaked true in the store", () => {
    // codeDrawerOpen is persisted and may carry over from a prior pro session.
    // In simple mode the full Monaco IDE must stay sealed — surfacing it would
    // dump the whole code/SVG surface on a 小白 who only wants 所见即所得.
    useUIStore.setState({ codeDrawerOpen: true });
    renderStage(false, "preview");
    expect(screen.queryByTestId("code-drawer")).toBeNull();
    expect(screen.queryByTestId("code-monaco")).toBeNull();
  });

  it("simple mode never mounts the CodeDrawer even in split view", () => {
    // Pro's auto-open of the drawer in code/split views must not apply once
    // chrome is gated off, otherwise a stale view='split' would leak the IDE.
    useUIStore.setState({ codeDrawerOpen: false });
    renderStage(false, "split");
    expect(screen.queryByTestId("code-drawer")).toBeNull();
  });

  it("pro mode mounts the CodeDrawer when codeDrawerOpen is true", () => {
    useUIStore.setState({ codeDrawerOpen: true });
    renderStage(true, "preview");
    expect(screen.getByTestId("code-drawer")).toBeInTheDocument();
  });

  it("pro mode auto-opens the CodeDrawer in split view", () => {
    useUIStore.setState({ codeDrawerOpen: false });
    renderStage(true, "split");
    expect(screen.getByTestId("code-drawer")).toBeInTheDocument();
  });
});
