import { describe, it, expect } from "vitest";
import { stripUnsafeUnicode } from "./unicode";

describe("stripUnsafeUnicode", () => {
  it("preserves normal text", () => {
    expect(stripUnsafeUnicode("hello world")).toBe("hello world");
  });

  it("preserves TAB, LF, CR", () => {
    expect(stripUnsafeUnicode("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("strips C0 control chars except TAB/LF/CR", () => {
    expect(stripUnsafeUnicode("a\x00b\x01c")).toBe("abc");
  });

  it("strips lone high surrogate", () => {
    expect(stripUnsafeUnicode("a\uD800b")).toBe("ab");
  });

  it("strips lone low surrogate", () => {
    expect(stripUnsafeUnicode("a\uDC00b")).toBe("ab");
  });

  it("preserves valid surrogate pairs", () => {
    expect(stripUnsafeUnicode("a\uD83D\uDE00b")).toBe("a\uD83D\uDE00b");
  });
});
