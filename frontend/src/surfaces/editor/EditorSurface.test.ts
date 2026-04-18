import { describe, expect, it } from "vitest";
import type { EditorDraft } from "@/types";
import { applyDraftFieldChange, buildSavePayload, chromeForLayout } from "./EditorSurface";

const HTML_DRAFT: EditorDraft = {
  title: "测试稿件",
  mode: "html",
  html: "<h1>保留我</h1><p>这里是 HTML 正文</p>",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

describe("EditorSurface draft transitions", () => {
  it("maps layout preferences to the expected chrome", () => {
    expect(chromeForLayout("focus")).toEqual({
      showStructurePanel: false,
      defaultView: "code",
    });
    expect(chromeForLayout("split")).toEqual({
      showStructurePanel: false,
      defaultView: "split",
    });
    expect(chromeForLayout("triptych")).toEqual({
      showStructurePanel: true,
      defaultView: "split",
    });
  });

  it("keeps html source when switching to markdown and back", () => {
    const markdownDraft = applyDraftFieldChange(HTML_DRAFT, "mode", "markdown");
    const htmlDraft = applyDraftFieldChange(markdownDraft, "mode", "html");

    expect(markdownDraft.html).toBe(HTML_DRAFT.html);
    expect(htmlDraft.html).toBe(HTML_DRAFT.html);
  });

  it("does not save blank html when markdown mode is selected but markdown is untouched", () => {
    const markdownDraft = applyDraftFieldChange(HTML_DRAFT, "mode", "markdown");

    expect(buildSavePayload(markdownDraft).html).toBe(HTML_DRAFT.html);
  });

  it("rebuilds html after markdown content is edited", () => {
    const markdownDraft = applyDraftFieldChange(HTML_DRAFT, "mode", "markdown");
    const editedDraft = applyDraftFieldChange(markdownDraft, "markdown", "# 新标题\n\n新正文");
    const payload = buildSavePayload(editedDraft);

    expect(editedDraft.html).toContain("<h1>新标题</h1>");
    expect(payload.html).toContain("<p>新正文</p>");
  });
});
