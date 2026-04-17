import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "@/types";
import {
  buildArticleUpdatePayload,
  buildHtmlDocument,
  copyArticleRichText,
  copyProjectedArticleRichText,
} from "../DocumentActionService";

const {
  mockPost,
  mockWriteHtmlToClipboard,
  mockRenderProjectedArticleAsMBDoc,
} = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockWriteHtmlToClipboard: vi.fn(),
  mockRenderProjectedArticleAsMBDoc: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    post: mockPost,
  },
}));

vi.mock("@/hooks/useClipboard", () => ({
  writeHtmlToClipboard: mockWriteHtmlToClipboard,
}));

vi.mock("@/features/editor/api/mbdocApi", () => ({
  renderProjectedArticleAsMBDoc: mockRenderProjectedArticleAsMBDoc,
  publishProjectedArticleAsMBDoc: vi.fn(),
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
    mockRenderProjectedArticleAsMBDoc.mockReset();
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
      message: "已复制，但微信配置缺失，图片可能无法显示。",
    });

    expect(mockWriteHtmlToClipboard).toHaveBeenCalledWith("<p>Processed</p>");
  });

  it("shows a clear Chinese fallback message when Bridge MBDoc is not configured", async () => {
    mockRenderProjectedArticleAsMBDoc.mockRejectedValueOnce(
      new Error("WeChat AppID/AppSecret not configured"),
    );
    mockWriteHtmlToClipboard.mockResolvedValueOnce(true);

    await expect(
      copyProjectedArticleRichText(article, "<p>Processed Bridge</p>"),
    ).resolves.toMatchObject({
      kind: "warn",
      copied: true,
      html: "<p>Processed Bridge</p>",
      message: "已复制，但未配置微信公众号，Bridge MBDoc 已回退到本地 HTML。",
    });
  });

  it("keeps the generic Bridge fallback message for non-config upload failures", async () => {
    mockRenderProjectedArticleAsMBDoc.mockRejectedValueOnce(
      new Error("WeChat upload error: timeout"),
    );
    mockWriteHtmlToClipboard.mockResolvedValueOnce(true);

    await expect(
      copyProjectedArticleRichText(article, "<p>Processed Bridge</p>"),
    ).resolves.toMatchObject({
      kind: "warn",
      copied: true,
      html: "<p>Processed Bridge</p>",
      message: "已复制，但 Bridge MBDoc 上传失败，已回退到本地 HTML。",
    });
  });
});
