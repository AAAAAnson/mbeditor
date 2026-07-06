import { describe, it, expect } from "vitest";
import { compileMarkdown, normalizeMarkdownText, escapeMarkdownText } from "./markdown";

describe("compileMarkdown", () => {
  it("compiles basic markdown", () => {
    expect(compileMarkdown("# Hello")).toContain("<h1");
    expect(compileMarkdown("# Hello")).toContain("Hello");
  });

  it("compiles bold text", () => {
    expect(compileMarkdown("**bold**")).toContain("<strong>");
  });

  it("returns empty string for empty input", () => {
    expect(compileMarkdown("")).toBe("");
  });
});

describe("normalizeMarkdownText", () => {
  it("replaces non-breaking spaces", () => {
    expect(normalizeMarkdownText("hello\u00A0world")).toBe("hello world");
  });

  it("normalizes line endings", () => {
    expect(normalizeMarkdownText("a\r\nb")).toBe("a\nb");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeMarkdownText("hello   world")).toBe("hello world");
  });
});

describe("escapeMarkdownText", () => {
  it("escapes special characters", () => {
    expect(escapeMarkdownText("*bold*")).toBe("\\*bold\\*");
  });

  it("escapes headings", () => {
    expect(escapeMarkdownText("# heading")).toBe("\\# heading");
  });
});
