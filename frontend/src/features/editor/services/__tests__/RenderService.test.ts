import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeDoc } from "@/features/editor/types";
import {
  createRawRender,
  processBridgePreview,
  processRenderPreview,
} from "@/features/editor/services/RenderService";

const { mockPreviewWechatHtml, mockRenderProjectedArticleAsMBDoc } = vi.hoisted(() => ({
  mockPreviewWechatHtml: vi.fn(),
  mockRenderProjectedArticleAsMBDoc: vi.fn(),
}));

vi.mock("@/features/editor/api/publishApi", () => ({
  previewWechatHtml: mockPreviewWechatHtml,
}));

vi.mock("@/features/editor/api/mbdocApi", () => ({
  renderProjectedArticleAsMBDoc: mockRenderProjectedArticleAsMBDoc,
}));

function makeBridgeDoc(): BridgeDoc {
  return {
    metadata: {
      id: "article-1",
      title: "Bridge Article",
      mode: "html",
      cover: "",
      author: "",
      digest: "",
      createdAt: "2026-04-17T00:00:00Z",
      updatedAt: "2026-04-17T00:00:00Z",
    },
    legacyFields: {
      html: "<section><p>Hello</p></section>",
      css: "p{color:red;}",
      js: "",
      markdown: "",
    },
    mbdoc: null,
    capabilities: ["legacy-only"],
    derived: {
      dirty: false,
      render: {
        rawHtml: "",
        processedHtml: "",
        css: "",
        js: "",
        sourceKind: "html",
        warnings: [],
      },
    },
  };
}

describe("RenderService", () => {
  beforeEach(() => {
    mockPreviewWechatHtml.mockReset();
    mockRenderProjectedArticleAsMBDoc.mockReset();
  });

  it("creates raw render output from legacy html mode", () => {
    const render = createRawRender(makeBridgeDoc(), "default");
    expect(render).toMatchObject({
      html: "<section><p>Hello</p></section>",
      css: "p{color:red;}",
      sourceKind: "html",
    });
  });

  it("uses legacy preview path when bridge projection is unavailable", async () => {
    mockPreviewWechatHtml.mockResolvedValueOnce("<p>processed</p>");
    const doc = makeBridgeDoc();

    await expect(
      processBridgePreview(doc, {
        html: "<p>Hello</p>",
        css: "p{color:red;}",
        js: "",
        sourceKind: "html",
      }),
    ).resolves.toBe("<p>processed</p>");

    expect(mockPreviewWechatHtml).toHaveBeenCalledWith("<p>Hello</p>", "p{color:red;}");
    expect(mockRenderProjectedArticleAsMBDoc).not.toHaveBeenCalled();
  });

  it("uses projected bridge preview path when projection is available", async () => {
    mockRenderProjectedArticleAsMBDoc.mockResolvedValueOnce("<p>projected</p>");
    const doc = makeBridgeDoc();
    doc.capabilities = ["legacy-only", "bridge"];
    doc.mbdoc = {
      id: "doc-1",
      version: "1",
      meta: { title: "", author: "", digest: "", cover: "" },
      blocks: [{ id: "html1", type: "html", source: "<p>Hello</p>", css: "" }],
      projection: {
        editability: "reversible",
        reason: "Single html block is reversible.",
        editableBlockIds: ["html1"],
      },
    };

    await expect(
      processBridgePreview(doc, {
        html: "<p>Hello</p>",
        css: "p{color:red;}",
        js: "",
        sourceKind: "html",
      }),
    ).resolves.toBe("<p>projected</p>");

    expect(mockRenderProjectedArticleAsMBDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "article-1",
        html: "<section><p>Hello</p></section>",
        css: "p{color:red;}",
      }),
      false,
    );
  });

  it("skips preview requests for empty html", async () => {
    await expect(
      processRenderPreview({ html: "   ", css: "", js: "", sourceKind: "html" }),
    ).resolves.toBe("");
    expect(mockPreviewWechatHtml).not.toHaveBeenCalled();
  });
});
