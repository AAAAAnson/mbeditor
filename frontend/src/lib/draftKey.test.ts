import { afterEach, describe, expect, it } from "vitest";
import { draftKey, clearStoredDraft } from "./draftKey";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("draftKey", () => {
  it("uses the canonical mbeditor.editorDraft.<id> prefix", () => {
    expect(draftKey("abc")).toBe("mbeditor.editorDraft.abc");
  });

  it("scopes the key per article id", () => {
    expect(draftKey("one")).not.toBe(draftKey("two"));
  });
});

describe("clearStoredDraft", () => {
  it("removes the stored draft for the matching article id", () => {
    window.sessionStorage.setItem(draftKey("keep-me"), "{}");
    window.sessionStorage.setItem(draftKey("drop-me"), "{}");

    clearStoredDraft("drop-me");

    expect(window.sessionStorage.getItem(draftKey("drop-me"))).toBeNull();
    // unrelated drafts are untouched
    expect(window.sessionStorage.getItem(draftKey("keep-me"))).toBe("{}");
  });

  it("is a no-op when there is no stored draft for the id", () => {
    expect(() => clearStoredDraft("never-existed")).not.toThrow();
    expect(window.sessionStorage.getItem(draftKey("never-existed"))).toBeNull();
  });
});
