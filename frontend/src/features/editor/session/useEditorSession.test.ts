import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorSession } from "@/features/editor/session/useEditorSession";
import type { Article } from "@/types";

const {
  mockFetchArticle,
  mockSaveArticle,
  mockProjectArticleToMBDoc,
  mockProcessBridgePreview,
  mockCopyArticleRichText,
  mockCopyProjectedArticleRichText,
  mockExportArticleHtml,
  mockPublishArticleDraft,
  mockSaveArticleDraft,
} = vi.hoisted(() => ({
  mockFetchArticle: vi.fn(),
  mockSaveArticle: vi.fn(),
  mockProjectArticleToMBDoc: vi.fn(),
  mockProcessBridgePreview: vi.fn(),
  mockCopyArticleRichText: vi.fn(),
  mockCopyProjectedArticleRichText: vi.fn(),
  mockExportArticleHtml: vi.fn(),
  mockPublishArticleDraft: vi.fn(),
  mockSaveArticleDraft: vi.fn(),
}));

vi.mock("@/features/editor/api/articleApi", () => ({
  fetchArticle: mockFetchArticle,
  saveArticle: mockSaveArticle,
}));

vi.mock("@/features/editor/api/mbdocApi", () => ({
  projectArticleToMBDoc: mockProjectArticleToMBDoc,
}));

vi.mock("@/features/editor/services/RenderService", () => ({
  createRawRender: vi.fn((doc) => ({
    html: doc.legacyFields.html,
    css: doc.legacyFields.css,
    js: doc.legacyFields.js,
    sourceKind: doc.metadata.mode,
  })),
  processBridgePreview: mockProcessBridgePreview,
}));

vi.mock("@/features/editor/services/DocumentActionService", () => ({
  copyArticleRichText: mockCopyArticleRichText,
  copyProjectedArticleRichText: mockCopyProjectedArticleRichText,
  exportArticleHtml: mockExportArticleHtml,
  publishArticleDraft: mockPublishArticleDraft,
  saveArticleDraft: mockSaveArticleDraft,
}));

const article: Article = {
  id: "article-1",
  title: "Bridge Article",
  mode: "markdown",
  html: "",
  css: "",
  js: "",
  markdown: "# Old",
  cover: "",
  author: "",
  digest: "",
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
};

const projected = {
  id: "article-1",
  version: "1",
  meta: { title: "Bridge Article", author: "", digest: "", cover: "" },
  blocks: [{ id: "content_markdown", type: "markdown", source: "# Old" }],
  projection: {
    editability: "reversible" as const,
    reason: "Single markdown block is reversible.",
    editableBlockIds: ["content_markdown"],
  },
};

describe("useEditorSession", () => {
  beforeEach(() => {
    mockFetchArticle.mockReset();
    mockSaveArticle.mockReset();
    mockProjectArticleToMBDoc.mockReset();
    mockProcessBridgePreview.mockReset();
    mockCopyArticleRichText.mockReset();
    mockCopyProjectedArticleRichText.mockReset();
    mockExportArticleHtml.mockReset();
    mockPublishArticleDraft.mockReset();
    mockSaveArticleDraft.mockReset();

    mockFetchArticle.mockResolvedValue(article);
    mockProjectArticleToMBDoc.mockResolvedValue(projected);
    mockProcessBridgePreview.mockResolvedValue("<p>processed</p>");
    mockSaveArticle.mockResolvedValue(undefined);
  });

  it("hydrates bridge state with selected reversible projected block", async () => {
    const { result } = renderHook(() =>
      useEditorSession({ articleId: "article-1", markdownTheme: "default" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedBlockId).toBe("content_markdown");
    expect(result.current.blockEditorMode).toBe("projected-block");
    expect(result.current.projectionFreshness).toBe("ready");
    expect(result.current.canEditSelectedBlock).toBe(true);
  }, 15000);

  it("marks projection stale after editing a reversible projected block", async () => {
    const { result } = renderHook(() =>
      useEditorSession({ articleId: "article-1", markdownTheme: "default" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateSelectedBlock({ source: "# New" });
    });

    expect(result.current.article?.markdown).toBe("# New");
    expect(result.current.projectionFreshness).toBe("stale");
    expect(result.current.saved).toBe(false);
  }, 15000);

  it("uses projected bridge actions for copy and publish when bridge data exists", async () => {
    mockCopyProjectedArticleRichText.mockResolvedValue({
      kind: "success",
      copied: true,
      message: "ok",
      html: "<p>ok</p>",
      stage: "upload",
    });
    mockPublishArticleDraft.mockResolvedValue({ message: "published" });

    const { result } = renderHook(() =>
      useEditorSession({ articleId: "article-1", markdownTheme: "default" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.copyRichText()).resolves.toMatchObject({
        kind: "success",
      });
    });
    await act(async () => {
      await expect(result.current.publishDraft()).resolves.toMatchObject({
        message: "published",
      });
    });

    expect(mockCopyProjectedArticleRichText).toHaveBeenCalled();
    expect(mockPublishArticleDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: "article-1",
        publishAsMBDoc: true,
      }),
    );
  }, 15000);
});
