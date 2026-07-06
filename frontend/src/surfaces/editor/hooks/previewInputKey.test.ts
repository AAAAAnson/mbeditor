import { describe, it, expect } from "vitest";
import type { EditorDraft } from "@/types";
import { previewInputKey } from "./previewInputKey";

const base: EditorDraft = {
  title: "t",
  mode: "html",
  html: "<p>a</p>",
  css: ".x{}",
  js: "alert(1)",
  markdown: "",
  author: "",
  digest: "",
};

describe("previewInputKey", () => {
  it("改 js 不改 key(JS 不进预览)", () => {
    expect(previewInputKey({ ...base, js: "DIFFERENT" })).toBe(previewInputKey(base));
  });

  it("改 title/author/digest 不改 key", () => {
    expect(previewInputKey({ ...base, title: "X", author: "Y", digest: "Z" })).toBe(
      previewInputKey(base),
    );
  });

  it("改 html 改 key", () => {
    expect(previewInputKey({ ...base, html: "<p>b</p>" })).not.toBe(previewInputKey(base));
  });

  it("改 css 改 key", () => {
    expect(previewInputKey({ ...base, css: ".y{}" })).not.toBe(previewInputKey(base));
  });

  it("markdown 模式下改 markdown 改 key(html 由 markdown 派生)", () => {
    const md: EditorDraft = { ...base, mode: "markdown", markdown: "# A" };
    expect(previewInputKey({ ...md, markdown: "# B" })).not.toBe(previewInputKey(md));
  });

  it("html/css 边界无歧义", () => {
    expect(previewInputKey({ ...base, html: "ab", css: "" })).not.toBe(
      previewInputKey({ ...base, html: "a", css: "b" }),
    );
  });
});
