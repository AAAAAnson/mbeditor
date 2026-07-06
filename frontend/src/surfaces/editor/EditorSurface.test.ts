import { describe, expect, it } from "vitest";
import type { EditorDraft } from "@/types";
import type { ValidationReport } from "@/components/validation/types";
import { applyDraftFieldChange, chromeForLayout, chromeForUi, decideCopyGate } from "./EditorSurface";
import { buildSavePayload } from "./services/editorApi";

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

  it("simple uiMode collapses to focus chrome regardless of stored layout", () => {
    expect(chromeForUi("simple", "triptych")).toEqual({
      showStructurePanel: false,
      defaultView: "preview",
      showProChrome: false,
    });
    expect(chromeForUi("simple", "split")).toEqual({
      showStructurePanel: false,
      defaultView: "preview",
      showProChrome: false,
    });
  });

  it("pro uiMode honors the stored layout and exposes pro chrome", () => {
    expect(chromeForUi("pro", "triptych")).toEqual({
      showStructurePanel: true,
      defaultView: "split",
      showProChrome: true,
    });
    expect(chromeForUi("pro", "focus")).toEqual({
      showStructurePanel: false,
      defaultView: "code",
      showProChrome: true,
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

function makeReport(over: Partial<ValidationReport> = {}): ValidationReport {
  return {
    issues: [],
    warnings: [],
    stats: {
      svg_count: 0,
      animate_count: 0,
      animate_transform_count: 0,
      set_count: 0,
      anchor_count: 0,
    },
    ...over,
  };
}

const ISSUE = { line: 1, rule: "svg-animate", message: "违规", suggestion: "修复" };
const WARNING = { line: 2, rule: "css-var", message: "建议", suggestion: "确认" };

describe("decideCopyGate (copy 路径硬门禁)", () => {
  it("blocks the copy when the report carries issues", () => {
    const report = makeReport({ issues: [ISSUE], warnings: [WARNING] });
    const outcome = decideCopyGate(report);

    expect(outcome.kind).toBe("block");
    if (outcome.kind === "block") {
      expect(outcome.report).toBe(report);
    }
  });

  it("does not block on warnings alone — surfaces a non-blocking warn outcome", () => {
    const outcome = decideCopyGate(makeReport({ warnings: [WARNING, WARNING] }));

    expect(outcome.kind).toBe("warn");
    if (outcome.kind === "warn") {
      expect(outcome.warnings).toBe(2);
    }
  });

  it("proceeds silently for a clean report", () => {
    expect(decideCopyGate(makeReport()).kind).toBe("proceed");
  });

  it("fails open with a 'skip' outcome when the report is missing (never silent)", () => {
    expect(decideCopyGate(null).kind).toBe("skip");
  });
});
