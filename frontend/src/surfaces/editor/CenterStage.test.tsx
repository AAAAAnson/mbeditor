import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const PROCESSED_PREVIEW_HTML = [
  '<section style="font-size:16px; line-height:1.8; color:#333;">',
  '<p style="margin:0; color:#333;">Hello preview</p>',
  "</section>",
].join("");

describe("CenterStage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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
        previewMode="wechat"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
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
        previewMode="wechat"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
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

  it("自动播放 SMIL(无 begin=click)时 previewHint 提示发公众号会变静态", () => {
    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{ ...DRAFT, html: '<svg><animateTransform type="rotate"/></svg>' }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml="<p>x</p>"
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
      />
    );

    expect(screen.getByText(/会变静态|不会动/)).toBeInTheDocument();
  });

  it("draft.js 非空时 previewHint 明确 JS 不进任何预览(与刷新机制对齐)", () => {
    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{ ...DRAFT, js: "console.log(1)" }}
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
      />
    );

    expect(screen.getByText(/不会执行/)).toBeInTheDocument();
  });

  it("renders a unified 返回起稿台 back button that routes to the list", () => {
    const onBackToList = vi.fn();

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
        onBackToList={onBackToList}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    // 返回统一:无「返回上一页/返回稿库」二元歧义,一律「返回起稿台」。
    expect(screen.queryByRole("button", { name: "返回上一页" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回起稿台" }));

    expect(onBackToList).toHaveBeenCalledTimes(1);
  });

  it("routes back to 起稿台 even when canGoBack is false (no history.back ambiguity)", () => {
    const onBackToList = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack={false}
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
        onBackToList={onBackToList}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    // 深链 /a/slug 直进(canGoBack=false)也直达起稿台,不再显示「返回稿库」。
    expect(screen.queryByRole("button", { name: "返回稿库" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回起稿台" }));
    expect(onBackToList).toHaveBeenCalledTimes(1);
  });

  it("opens the code drawer with the source editor when in code view", () => {
    // Caret/selection navigation is now Monaco's own concern (the code area moved
    // into the right-side drawer). Assert the drawer + its source editor mount in
    // code view instead of poking textarea selection on the (mocked) Monaco shim.
    render(
      <CenterStage
        articleId="draft-1"
        showProChrome
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
        previewMode="wechat"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByTestId("code-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("code-monaco")).toHaveValue(
      "<h1>总标题</h1>\n<p>导语</p>\n<h2>第一部分</h2>\n<p>正文</p>",
    );
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
        previewMode="wechat"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("lets users edit preview content and sync it back to html source", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    const { rerender } = render(
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
        previewHtml={PROCESSED_PREVIEW_HTML}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    expect(editable).toHaveAttribute("contenteditable", "true");

    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      '<p style="margin:0; color:#333;">Edited preview</p>',
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalledWith("html", "<p>Edited preview</p>");
    expect(editable.innerHTML).toContain("Edited preview");

    rerender(
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
        previewHtml={[
          '<section style="font-size:16px; line-height:1.8; color:#333;">',
          '<p style="margin:0; color:#333;">Edited preview</p>',
          "</section>",
        ].join("")}
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
      />
    );

    expect(screen.getByTestId("preview-editable-content").innerHTML).toContain("Edited preview");
  });

  it("lets markdown preview edits sync back into markdown source", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          mode: "markdown",
          html: "<h1>Hello preview</h1><p>正文</p>",
          markdown: "# Hello preview\n\n正文",
        }}
        view="preview"
        setView={vi.fn()}
        tab="markdown"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml="<h1>Hello preview</h1>"
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    expect(editable).toHaveAttribute("contenteditable", "true");

    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      "<h1>Hello preview</h1>",
      '<p style="margin:0; color:#333;">已更新正文</p>',
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalledWith("markdown", "# Hello preview\n\n已更新正文");
  });

  it("preserves markdown hard breaks during preview round-trips", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          mode: "markdown",
          html: "<p>第一行<br>第二行</p>",
          markdown: "第一行  \n第二行",
        }}
        view="preview"
        setView={vi.fn()}
        tab="markdown"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={[
          '<section style="font-size:16px; line-height:1.8; color:#333;">',
          '<p style="margin:0; color:#333;">第一行<br>第二行</p>',
          "</section>",
        ].join("")}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let target: Text | null = null;
    while (walker.nextNode()) {
      if ((walker.currentNode as Text).textContent?.includes("第二行")) {
        target = walker.currentNode as Text;
        break;
      }
    }
    expect(target).not.toBeNull();
    target!.textContent = "第二行已改";
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalledWith("markdown", "第一行  \n第二行已改");
  });

  it("keeps inline styles when a structural edit adds a new paragraph", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          html: "<h2>H</h2><p>P</p>",
        }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={[
          '<section style="font-size:16px; line-height:1.8; color:#333;">',
          "<h2>H</h2>",
          '<p style="margin:0; color:#333;">P</p>',
          "</section>",
        ].join("")}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      "<h2>H</h2>",
      '<p style="margin:0; color:#333;">P</p>',
      '<p style="margin:0; color:#333;">NEXT</p>',
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Cosmetic publish-pipeline wrapper peeled, but sibling inline styles
    // ride along so the new paragraph lands in the same visual family as
    // the ones that shipped with the source.
    expect(onFieldChange).toHaveBeenCalledWith(
      "html",
      '<h2>H</h2><p style="margin:0; color:#333;">P</p><p style="margin:0; color:#333;">NEXT</p>',
    );
  });

  it("keeps structural edits clean when markdown preview adds a new paragraph", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          mode: "markdown",
          html: "<h1>标题</h1><p>正文第一段。</p>",
          markdown: "# 标题\n\n正文第一段。",
        }}
        view="preview"
        setView={vi.fn()}
        tab="markdown"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={[
          '<section style="font-size:16px; line-height:1.8; color:#333;">',
          "<h1>标题</h1>",
          '<p style="margin:0; color:#333;">正文第一段。</p>',
          "</section>",
        ].join("")}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      "<h1>标题</h1>",
      '<p style="margin:0; color:#333;">正文第一段。</p>',
      '<p style="margin:0; color:#333;">新增一段。</p>',
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalledWith("markdown", "# 标题\n\n正文第一段。\n\n新增一段。");
  });

  it("preserves inline styles on the source html when a text-only preview edit lands inside the cosmetic wrapper", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    const styledSource = [
      '<section style="padding:0;background:#FAF6EB;">',
      '<section style="background-color:#0f172a;padding:52px;"><section style="color:#fff;font-size:28px;">2026 年第一季度</section></section>',
      '<section style="padding:28px 22px;">',
      '<section style="font-size:13px;color:#64748b;letter-spacing:3px;">导读</section>',
      '</section>',
      '</section>',
    ].join("");

    // Mirror what POST /publish/preview returns: the styled source wrapped in the
    // publish pipeline's cosmetic <section> envelope.
    const processedPreview = [
      '<section style="font-size:16px; line-height:1.8; color:#333; word-wrap:break-word; word-break:break-all">',
      styledSource,
      "</section>",
    ].join("");

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{ ...DRAFT, html: styledSource }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={processedPreview}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let target: Text | null = null;
    while (walker.nextNode()) {
      if ((walker.currentNode as Text).textContent?.trim() === "导读") {
        target = walker.currentNode as Text;
        break;
      }
    }
    expect(target).not.toBeNull();
    target!.textContent = "导读 · 回归";
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalled();
    const [[field, nextHtml]] = onFieldChange.mock.calls;
    expect(field).toBe("html");
    // Must preserve every inline style attr from the original source …
    expect(nextHtml).toContain('background:#FAF6EB');
    expect(nextHtml).toContain('background-color:#0f172a');
    expect(nextHtml).toContain('letter-spacing:3px');
    // … while routing the text edit to the 导读 node.
    expect(nextHtml).toContain('导读 · 回归');
    // The cosmetic publish-pipeline envelope must not leak back into the source.
    expect(nextHtml).not.toContain('word-wrap:break-word');
  });

  it.each([
    {
      label: "ul roots",
      sourceHtml: '<section style="padding:0;background:#fff;"><ul style="padding-left:20px;color:#111;"><li>Alpha</li></ul></section>',
      targetText: "Alpha",
      nextText: "Beta",
      preserved: ['<ul', 'padding-left:20px', '<li>Beta</li>'],
    },
    {
      label: "anchor roots",
      sourceHtml: '<section style="padding:0;background:#fff;"><p><a href="https://example.com" style="color:#0f172a;">Read more</a></p></section>',
      targetText: "Read more",
      nextText: "Read next",
      preserved: ['href="https://example.com"', 'color:#0f172a', 'Read next'],
    },
    {
      label: "svg roots",
      sourceHtml: '<section style="padding:0;background:#fff;"><svg width="100" height="20" viewBox="0 0 100 20"><text x="0" y="15" fill="#111">Badge</text></svg></section>',
      targetText: "Badge",
      nextText: "Badge 2",
      preserved: ["<svg", 'fill="#111"', "Badge 2"],
    },
  ])("preserves same-shape %s edits inside the cosmetic wrapper", ({ sourceHtml, targetText, nextText, preserved }) => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{ ...DRAFT, html: sourceHtml }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={[
          '<section style="font-size:16px; line-height:1.8; color:#333; word-wrap:break-word; word-break:break-all">',
          sourceHtml,
          "</section>",
        ].join("")}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let target: Text | null = null;
    while (walker.nextNode()) {
      if ((walker.currentNode as Text).textContent?.trim() === targetText) {
        target = walker.currentNode as Text;
        break;
      }
    }
    expect(target).not.toBeNull();
    target!.textContent = nextText;
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalled();
    const [[field, nextHtml]] = onFieldChange.mock.calls;
    expect(field).toBe("html");
    preserved.forEach((snippet) => {
      expect(nextHtml).toContain(snippet);
    });
    expect(nextHtml).not.toContain("word-wrap:break-word");
  });

  it("strips script tags and event handlers when a structural edit falls through the sanitizer", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

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
        previewHtml={PROCESSED_PREVIEW_HTML}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      "<p>safe paragraph</p>",
      '<p>boom <img src="x" onerror="alert(1)"></p>',
      '<p>link <a href="javascript:alert(2)">click</a></p>',
      '<script>alert(3)</script>',
      '<iframe src="https://evil.example.com"></iframe>',
      "<p>tail</p>",
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalled();
    const [[, merged]] = onFieldChange.mock.calls;

    // Dangerous tags removed outright.
    expect(merged).not.toContain("<script");
    expect(merged).not.toContain("<iframe");
    // Inline event handlers stripped, but the carrier element survives.
    expect(merged).toContain("<img");
    expect(merged).not.toContain("onerror");
    // javascript: URL scrubbed off the anchor.
    expect(merged).not.toContain("javascript:");
    // The safe text around the malicious payload makes it through.
    expect(merged).toContain("safe paragraph");
    expect(merged).toContain("tail");
  });

  it("skips innerHTML rewrite when server echoes back only a cosmetic wrapper", () => {
    // Guards against preview flicker + caret jump + Ctrl+Z history wipe that
    // happens when we blindly reassign innerHTML after every /publish/preview
    // round-trip, even when the round-trip only re-wrapped the DOM that's
    // already on screen in the cosmetic <section> envelope.
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    const initialPreview = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      '<p style="margin:0; color:#333;">Edited preview</p>',
      "</section>",
    ].join("");

    const { rerender } = render(
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
        previewHtml={initialPreview}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content") as HTMLDivElement;
    // Tag the element and a child text node so we can detect an innerHTML
    // rewrite: the DOM identity would change if innerHTML were reassigned.
    (editable as unknown as { __probe: string }).__probe = "initial";
    const probeChild = editable.querySelector("p");
    expect(probeChild).not.toBeNull();
    (probeChild as unknown as { __probe: string }).__probe = "alive";

    // The server round-trip returns the exact same preview body we already
    // see on screen — typical when the backend re-inlines the user's edit
    // and lands on identical output.
    rerender(
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
        previewHtml={initialPreview}
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
      />
    );

    const probedAfterEcho = screen.getByTestId("preview-editable-content") as HTMLDivElement;
    expect((probedAfterEcho as unknown as { __probe: string }).__probe).toBe("initial");
    const probedChildAfterEcho = probedAfterEcho.querySelector("p");
    expect((probedChildAfterEcho as unknown as { __probe: string }).__probe).toBe("alive");

    // Now simulate the real-world case: user edited the text in the DOM,
    // server wrapped the edited content in the cosmetic <section class="wechat-root">,
    // and React pushes that wrapped form down as previewBody. The DOM already
    // has the edited text without the cosmetic wrapper — rewriting would
    // flicker + wipe undo stack. We must leave the DOM alone.
    probedAfterEcho.innerHTML = '<p style="margin:0; color:#333;">Edited preview after typing</p>';
    const afterTypingChild = probedAfterEcho.querySelector("p");
    (afterTypingChild as unknown as { __probe: string }).__probe = "typed";

    const wrappedEchoOfEdit = [
      '<section class="wechat-root" style="font-size:16px; line-height:1.8; color:#333;">',
      '<p style="margin:0; color:#333;">Edited preview after typing</p>',
      "</section>",
    ].join("");

    rerender(
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
        previewHtml={wrappedEchoOfEdit}
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
      />
    );

    const typedChildAfterEcho = (screen.getByTestId("preview-editable-content") as HTMLDivElement).querySelector("p");
    // If innerHTML had been rewritten, the probe on the old element would
    // be gone. Surviving probe proves the DOM node is untouched.
    expect((typedChildAfterEcho as unknown as { __probe: string }).__probe).toBe("typed");
    expect(typedChildAfterEcho?.textContent).toBe("Edited preview after typing");
  });

  it("preserves inline styles when source uses head/style rules and preview is inlined", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

    // Source: user pasted a full HTML document whose layout depends on
    // a <head><style> sheet with class selectors. After the publish
    // pipeline runs premailer, every element carries the resolved inline
    // style — but draft.html still holds the raw head/style form, so the
    // source↔preview shape check on a text edit cannot match.
    const rawSource = [
      "<!DOCTYPE html><html><head>",
      "<style>.eyebrow{color:#F65545;background:#FFEBE8;padding:4px 12px;border-radius:12px;}",
      ".rule-item{background:#FAFAFA;border-left:3px solid #F65545;padding:14px 16px;}</style>",
      "</head><body>",
      '<span class="eyebrow">AI 选型</span>',
      '<div class="rule-item">任务类型决定模型</div>',
      "</body></html>",
    ].join("");

    const inlinedPreview = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      '<span class="eyebrow" style="color:#F65545;background:#FFEBE8;padding:4px 12px;border-radius:12px;">AI 选型</span>',
      '<section class="rule-item" style="background:#FAFAFA;border-left:3px solid #F65545;padding:14px 16px;">任务类型决定模型</section>',
      "</section>",
    ].join("");

    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{ ...DRAFT, html: rawSource }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml={inlinedPreview}
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
      />
    );

    const editable = screen.getByTestId("preview-editable-content");
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let target: Text | null = null;
    while (walker.nextNode()) {
      if ((walker.currentNode as Text).textContent?.includes("任务类型")) {
        target = walker.currentNode as Text;
        break;
      }
    }
    expect(target).not.toBeNull();
    target!.textContent = "任务类型决定模型选型";
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalled();
    const [[field, nextHtml]] = onFieldChange.mock.calls;
    expect(field).toBe("html");
    // Every inline style from the inlined preview must survive the
    // fallback — that's the whole fix.
    expect(nextHtml).toContain("color:#F65545");
    expect(nextHtml).toContain("background:#FFEBE8");
    expect(nextHtml).toContain("border-left:3px solid #F65545");
    expect(nextHtml).toContain("padding:14px 16px");
    // Class attributes also survive (publish pipeline relies on them for
    // a second inline pass if styles ever regenerate).
    expect(nextHtml).toContain('class="eyebrow"');
    expect(nextHtml).toContain('class="rule-item"');
    // The edited text lands in the output.
    expect(nextHtml).toContain("任务类型决定模型选型");
    // The cosmetic publish-pipeline envelope doesn't leak back into source.
    expect(nextHtml).not.toContain("font-size:16px; line-height:1.8; color:#333");
  });

  it("strips lone surrogates and C0 control chars when pasting into the HTML source textarea", () => {
    // The textarea also feeds draft.html. Rich-text pastes from Word /
    // the open web can drop invalid Unicode there, which then reaches
    // /publish/preview and 422s. Guard at the onChange boundary.
    const onFieldChange = vi.fn();

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
        previewHtml={PROCESSED_PREVIEW_HTML}
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
      />
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: "<p>clean \uD83D bad surrogate \u0008 and ctrl\nlinebreak\tkept</p>",
      },
    });

    expect(onFieldChange).toHaveBeenCalled();
    const lastCall = onFieldChange.mock.calls[onFieldChange.mock.calls.length - 1];
    const [field, value] = lastCall;
    expect(field).toBe("html");
    expect(value).not.toMatch(/[\uD800-\uDFFF]/);
    expect(value).not.toContain("\u0008");
    expect(value).toContain("clean");
    expect(value).toContain("linebreak"); // \n preserved
    expect(value).toContain("kept"); // \t preserved
  });

  it("strips lone surrogates and C0 control chars from committed preview edits", () => {
    vi.useFakeTimers();
    const onFieldChange = vi.fn();

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
        previewHtml={PROCESSED_PREVIEW_HTML}
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
      />
    );

    // Simulate a Word rich-text paste that leaves a lone high surrogate
    // (U+D83D without its low pair) and a U+0008 control char in the DOM.
    // Without the sanitizer these bytes reach /publish/preview and
    // Pydantic v2 returns 422 Unprocessable Entity.
    const editable = screen.getByTestId("preview-editable-content");
    (editable as HTMLDivElement).innerHTML = [
      '<section style="font-size:16px; line-height:1.8; color:#333;">',
      "<p>clean text \uD83D bad surrogate \u0008 and ctrl</p>",
      "</section>",
    ].join("");
    fireEvent.input(editable);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onFieldChange).toHaveBeenCalled();
    const [[, committed]] = onFieldChange.mock.calls;
    expect(committed).not.toMatch(/[\uD800-\uDFFF]/);
    expect(committed).not.toContain("\u0008");
    expect(committed).toContain("clean text");
    expect(committed).toContain("and ctrl");
  });

  it("renders a raw interactive iframe (not the contentEditable face) in raw mode", () => {
    render(
      <CenterStage
        articleId="draft-1"
        canGoBack
        draft={{
          ...DRAFT,
          html: '<svg><rect id="r" width="10" height="10"><animate attributeName="width" begin="r.click" to="50"/></rect></svg>',
          css: ".x{color:red}",
        }}
        view="preview"
        setView={vi.fn()}
        tab="html"
        setTab={vi.fn()}
        saveState="saved"
        selected="body"
        navigationRequest={null}
        previewHtml="<p>processed</p>"
        previewLoading={false}
        previewError={null}
        publishing={false}
        copying={false}
        previewMode="raw"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    const iframe = screen.getByTestId("raw-preview-iframe") as HTMLIFrameElement;
    // Security contract: opaque origin (no allow-same-origin) + no allow-scripts.
    expect(iframe.getAttribute("sandbox")).toBe("allow-popups");
    const srcdoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("r.click");
    expect(srcdoc).toContain(".x{color:red}");
    // Acceptance contract (P1-3): the raw face must forward SVG/SMIL *verbatim*
    // with no sanitize pass. SMIL attribute names are case-sensitive, so a
    // silent lowercasing (attributeName -> attributename) would make the click
    // trigger inert. Assert the canonical case survives and the folded form
    // never appears — this is what proves the interaction can actually fire.
    expect(srcdoc).toContain("attributeName=");
    expect(srcdoc).not.toContain("attributename=");
    // The WeChat contentEditable face must not be mounted in raw mode.
    expect(screen.queryByTestId("preview-editable-content")).toBeNull();
  });

  it("keeps the contentEditable face and hides the iframe in wechat mode", () => {
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
        previewMode="wechat"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByTestId("preview-editable-content")).toBeInTheDocument();
    expect(screen.queryByTestId("raw-preview-iframe")).toBeNull();
  });

  it("emits onPreviewModeChange when the preview mode segment is toggled", () => {
    const onPreviewModeChange = vi.fn();
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
        previewMode="wechat"
        onPreviewModeChange={onPreviewModeChange}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={vi.fn()}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "交互预览" }));
    expect(onPreviewModeChange).toHaveBeenCalledWith("raw");
  });

  it("does not call onRefreshPreview when 更新预览 is pressed in raw mode", () => {
    const onRefreshPreview = vi.fn();
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
        previewMode="raw"
        onPreviewModeChange={vi.fn()}
        onBackToList={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshPreview={onRefreshPreview}
        onCopyRichText={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    // The iframe still shows the draft content (does not go blank) after the
    // click, and no backend refresh is requested in raw mode.
    fireEvent.click(screen.getByRole("button", { name: /更新预览/ }));
    expect(onRefreshPreview).not.toHaveBeenCalled();
    const iframe = screen.getByTestId("raw-preview-iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc") ?? "").toContain(DRAFT.html);
  });

  it("re-renders the raw srcdoc live when draft.html/css change (no backend round-trip)", () => {
    const baseProps = {
      articleId: "draft-1",
      canGoBack: true,
      view: "preview" as const,
      setView: vi.fn(),
      tab: "html",
      setTab: vi.fn(),
      saveState: "saved" as const,
      selected: "body",
      navigationRequest: null,
      previewHtml: "<p>Hello preview</p>",
      previewLoading: false,
      previewError: null,
      publishing: false,
      copying: false,
      previewMode: "raw" as const,
      onPreviewModeChange: vi.fn(),
      onBackToList: vi.fn(),
      onFieldChange: vi.fn(),
      onRefreshPreview: vi.fn(),
      onCopyRichText: vi.fn(),
      onPublish: vi.fn(),
    };

    const { rerender } = render(
      <CenterStage {...baseProps} draft={{ ...DRAFT, html: "<p>v1</p>", css: ".a{color:blue}" }} />
    );
    const before = screen.getByTestId("raw-preview-iframe").getAttribute("srcdoc") ?? "";
    expect(before).toContain("<p>v1</p>");
    expect(before).toContain(".a{color:blue}");

    // Changing draft.html AND draft.css must flow through the useMemo into a new
    // srcdoc with no onRefreshPreview call. A missing dep (e.g. draft.css) would
    // leave the stale css behind and fail this assertion.
    rerender(
      <CenterStage {...baseProps} draft={{ ...DRAFT, html: "<p>v2</p>", css: ".b{color:green}" }} />
    );
    const after = screen.getByTestId("raw-preview-iframe").getAttribute("srcdoc") ?? "";
    expect(after).toContain("<p>v2</p>");
    expect(after).toContain(".b{color:green}");
    expect(after).not.toContain("<p>v1</p>");
    expect(after).not.toContain(".a{color:blue}");
    expect(baseProps.onRefreshPreview).not.toHaveBeenCalled();
  });
});
