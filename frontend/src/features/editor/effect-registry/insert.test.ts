import { describe, it, expect } from "vitest";
import { computeInsertOffset, insertAtOffset, insertEffectIntoHtml } from "./insert";

describe("computeInsertOffset", () => {
  const outline = [
    { id: "a", sourceOffset: 0 },
    { id: "b", sourceOffset: 50 },
    { id: "c", sourceOffset: 120 },
  ];

  it("inserts after selected block = next block offset", () => {
    expect(computeInsertOffset("x".repeat(200), outline, "a")).toBe(50);
    expect(computeInsertOffset("x".repeat(200), outline, "b")).toBe(120);
  });

  it("appends to end when selected is last block", () => {
    expect(computeInsertOffset("x".repeat(200), outline, "c")).toBe(200);
  });

  it("appends to end when selectedId missing or outline empty", () => {
    expect(computeInsertOffset("x".repeat(200), outline, "zzz")).toBe(200);
    expect(computeInsertOffset("x".repeat(200), [], "a")).toBe(200);
  });

  it("clamps next offset to html length", () => {
    // next offset 120 > html length 30 -> clamp to 30
    expect(computeInsertOffset("x".repeat(30), outline, "b")).toBe(30);
  });
});

describe("insertAtOffset", () => {
  it("inserts at offset with newline separators", () => {
    const out = insertAtOffset("AB", 1, "X");
    expect(out).toBe("A\nX\nB");
  });

  it("does not double newlines when already separated", () => {
    const out = insertAtOffset("A\n\nB", 2, "X");
    // before ends with \n, after starts with \n -> no extra sep added
    expect(out).toBe("A\nX\nB");
  });

  it("clamps out-of-range offsets", () => {
    expect(insertAtOffset("AB", 999, "X")).toBe("AB\nX");
    expect(insertAtOffset("AB", -5, "X")).toBe("X\nAB");
  });
});

describe("insertEffectIntoHtml", () => {
  it("does NOT overwrite existing html (length grows)", () => {
    const html = "<p>A</p>\n<p>B</p>";
    const out = insertEffectIntoHtml(
      html,
      [
        { id: "a", sourceOffset: 0 },
        { id: "b", sourceOffset: 9 },
      ],
      "a",
      "<svg/>",
    );
    expect(out).toContain("<p>A</p>");
    expect(out).toContain("<p>B</p>");
    expect(out).toContain("<svg/>");
    expect(out.length).toBeGreaterThan(html.length);
  });

  it("appends when last block selected", () => {
    const html = "<p>A</p>";
    const out = insertEffectIntoHtml(html, [{ id: "a", sourceOffset: 0 }], "a", "<svg/>");
    expect(out.endsWith("<svg/>")).toBe(true);
  });

  it("inserts effect between two blocks at next block offset", () => {
    const html = "<p>A</p>\n<p>B</p>";
    const out = insertEffectIntoHtml(
      html,
      [
        { id: "a", sourceOffset: 0 },
        { id: "b", sourceOffset: 9 },
      ],
      "a",
      "<svg/>",
    );
    // <svg/> must appear before <p>B</p> (= after block A)
    expect(out.indexOf("<svg/>")).toBeLessThan(out.indexOf("<p>B</p>"));
    expect(out.indexOf("<p>A</p>")).toBeLessThan(out.indexOf("<svg/>"));
  });
});
