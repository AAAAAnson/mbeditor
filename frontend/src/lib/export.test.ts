import { describe, it, expect } from "vitest";
import { exportToJson, parseImportJson, importFromJson } from "./export";
import type { ArticleFull } from "@/types";

const mockArticle: ArticleFull = {
  id: "test-123",
  title: "Test Article",
  mode: "html",
  cover: "",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  html: "<p>Hello</p>",
  css: "",
  js: "",
  markdown: "",
  author: "Test Author",
  digest: "Test digest",
};

describe("exportToJson", () => {
  it("creates valid JSON with correct structure", () => {
    const json = exportToJson([mockArticle]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.articles[0].id).toBe("test-123");
    expect(parsed.exported_at).toBeDefined();
  });

  it("handles empty articles array", () => {
    const json = exportToJson([]);
    const parsed = JSON.parse(json);
    expect(parsed.articles).toHaveLength(0);
  });
});

describe("parseImportJson", () => {
  it("parses valid export JSON", () => {
    const json = exportToJson([mockArticle]);
    const bundle = parseImportJson(json);
    expect(bundle.version).toBe(1);
    expect(bundle.articles).toHaveLength(1);
  });

  it("throws on invalid version", () => {
    const json = JSON.stringify({ version: 999, articles: [] });
    expect(() => parseImportJson(json)).toThrow("Unsupported export version");
  });

  it("throws on missing articles array", () => {
    const json = JSON.stringify({ version: 1 });
    expect(() => parseImportJson(json)).toThrow("missing articles array");
  });
});

describe("importFromJson", () => {
  it("adds new articles to existing ones", () => {
    const existing: ArticleFull[] = [{ ...mockArticle, id: "existing-1" }];
    const json = exportToJson([{ ...mockArticle, id: "new-1" }]);
    const result = importFromJson(json, existing);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("existing-1");
    expect(result[1].id).toBe("new-1");
  });

  it("skips duplicate articles", () => {
    const existing: ArticleFull[] = [mockArticle];
    const json = exportToJson([mockArticle]);
    const result = importFromJson(json, existing);
    expect(result).toHaveLength(1);
  });
});