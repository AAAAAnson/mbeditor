import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "@/types";
import {
  buildArticleUpdatePayload,
  buildHtmlDocument,
  copyArticleRichText,
} from "../DocumentActionService";

const { mockPost, mockWriteHtmlToClipboard } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockWriteHtmlToClipboard: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    post: mockPost,
  },
}));

vi.mock("@/hooks/useClipboard", () => ({
  writeHtmlToClipboard: mockWriteHtmlToClipboard,
}));

const article: Article = {
  id: "article-1",
  title: "Original Title",
  mode: "html",
  html: "<p>Hello</p>",
  css: "p { color: red; }",
  js: "",
  markdown: "",
  cover: "/cover.png",
  author: "Original Author",
  digest: "Original Digest",
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
};

describe("DocumentActionService", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockWriteHtmlToClipboard.mockReset();
  });

  it("builds an article update payload by merging metadata overrides", () => {
    expect(
      buildArticleUpdatePayload(article, {
        title: "Updated Title",
        author: "Updated Author",
        digest: "Updated Digest",
      }),
    ).toEqual({
      html: "<p>Hello</p>",
      css: "p { color: red; }",
      js: "",
      markdown: "",
      title: "Updated Title",
      mode: "html",
      cover: "/cover.png",
      author: "Updated Author",
      digest: "Updated Digest",
    });
  });

  it("wraps processed HTML in a complete export document", () => {
    expect(buildHtmlDocument("Sample", "<section>Body</section>")).toContain(
      "<title>Sample</title></head><body><section>Body</section></body></html>",
    );
  });

  it("falls back to preview HTML when process-for-copy returns config missing", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        code: 400,
        message: "wechat config missing",
      },
    });
    mockWriteHtmlToClipboard.mockResolvedValueOnce(true);

    await expect(
      copyArticleRichText(article, "<p>Processed</p>"),
    ).resolves.toMatchObject({
      kind: "warn",
      copied: true,
      html: "<p>Processed</p>",
    });

    expect(mockWriteHtmlToClipboard).toHaveBeenCalledWith("<p>Processed</p>");
  });
});
