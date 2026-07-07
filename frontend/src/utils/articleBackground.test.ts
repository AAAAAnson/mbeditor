import { describe, it, expect } from "vitest";
import {
  getArticleBackground,
  setArticleBackground,
  clearArticleBackground,
} from "./articleBackground";

describe("articleBackground", () => {
  it("reads background from outer section", () => {
    expect(
      getArticleBackground('<section style="background-color:#e8f0ff;padding:8px;"><p>x</p></section>'),
    ).toBe("#e8f0ff");
    expect(getArticleBackground('<section style="padding:8px;"><p>x</p></section>')).toBeNull();
  });

  it("sets background on outer section, preserving other decls", () => {
    const out = setArticleBackground('<section style="padding:8px;"><p>x</p></section>', "#123456");
    expect(getArticleBackground(out)).toBe("#123456");
    expect(out).toContain("padding:8px");
    expect(out).toContain("<p>x</p>");
  });

  it("replaces existing background in place", () => {
    const out = setArticleBackground(
      '<section style="background-color:#fff;padding:8px;"><p>x</p></section>',
      "#0f1117",
    );
    expect(getArticleBackground(out)).toBe("#0f1117");
    expect((out.match(/background-color/g) || []).length).toBe(1);
  });

  it("wraps content when no envelope", () => {
    const out = setArticleBackground("<p>裸段落</p>", "#222244");
    expect(out).toBe('<section style="background-color:#222244;"><p>裸段落</p></section>');
  });

  it("clears background but keeps other styles", () => {
    const out = clearArticleBackground(
      '<section style="background-color:#e8f0ff;padding:8px;"><p>x</p></section>',
    );
    expect(getArticleBackground(out)).toBeNull();
    expect(out).toContain("padding:8px");
  });

  it("clear is a no-op when no envelope", () => {
    expect(clearArticleBackground("<p>x</p>")).toBe("<p>x</p>");
  });
});
