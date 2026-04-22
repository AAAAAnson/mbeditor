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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
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
});
