import { describe, it, expect } from "vitest";
import { sanitizePastedHtml, escapeHtml } from "./htmlSanitize";

describe("sanitizePastedHtml", () => {
  it("removes Word conditional comments", () => {
    const input = '<!--[if gte mso 9]><xml>test</xml><![endif]--><p>hello</p>';
    expect(sanitizePastedHtml(input)).not.toContain("<!--[if");
    expect(sanitizePastedHtml(input)).toContain("hello");
  });

  it("removes Office namespace tags", () => {
    const input = '<p>text</p><o:p>office</o:p><v:shape>vml</v:shape><w:word>word</w:word>';
    const result = sanitizePastedHtml(input);
    expect(result).not.toContain("<o:");
    expect(result).not.toContain("<v:");
    expect(result).not.toContain("<w:");
    expect(result).toContain("text");
  });

  it("removes script tags", () => {
    const input = '<p>safe</p><script>alert("xss")</script>';
    const result = sanitizePastedHtml(input);
    expect(result).not.toContain("<script>");
    expect(result).toContain("safe");
  });

  it("removes event handler attributes", () => {
    const input = '<p onclick="alert(1)">text</p>';
    const result = sanitizePastedHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("removes javascript: href", () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    const result = sanitizePastedHtml(input);
    expect(result).not.toContain("javascript:");
    expect(result).toContain("link");
  });

  it("removes contenteditable attribute", () => {
    const input = '<div contenteditable="true">text</div>';
    const result = sanitizePastedHtml(input);
    expect(result).not.toContain("contenteditable");
    expect(result).toContain("text");
  });

  it("strips unsafe unicode before processing", () => {
    const input = '<p>\x00text\x01</p>';
    const result = sanitizePastedHtml(input);
    expect(result).toContain("text");
    expect(result).not.toContain("\x00");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes multiple entities", () => {
    expect(escapeHtml('<a href="x&y">')).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;");
  });
});
