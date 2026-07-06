import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistedEditorIntent,
  persistEditorIntent,
  readPersistedEditorIntent,
  resolveEditorIntent,
} from "./route";

const ARTICLE_ID = "art_abcd1234";

function setHistoryStateIntent(intent: string | undefined) {
  const params = intent ? { articleSlug: "x-abcd", intent } : { articleSlug: "x-abcd" };
  window.history.replaceState({ __mbeditor: true, route: "editor", params, idx: 1 }, "", "/a/x-abcd");
}

beforeEach(() => {
  window.sessionStorage.clear();
  // Reset history.state to a no-intent baseline.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("editor intent persistence helpers", () => {
  it("persist → read round-trips by articleId", () => {
    persistEditorIntent(ARTICLE_ID, "publish");
    expect(readPersistedEditorIntent(ARTICLE_ID)).toBe("publish");
    expect(readPersistedEditorIntent("other")).toBeUndefined();
  });

  it("clear drops the persisted intent", () => {
    persistEditorIntent(ARTICLE_ID, "publish");
    clearPersistedEditorIntent(ARTICLE_ID);
    expect(readPersistedEditorIntent(ARTICLE_ID)).toBeUndefined();
  });
});

describe("resolveEditorIntent — 三兜底", () => {
  it("① live param wins over everything", () => {
    setHistoryStateIntent("stale");
    persistEditorIntent(ARTICLE_ID, "alsostale");
    expect(resolveEditorIntent(ARTICLE_ID, "publish")).toBe("publish");
  });

  it("② recovers from history.state when param is absent (reload of /a/slug)", () => {
    setHistoryStateIntent("publish");
    expect(resolveEditorIntent(ARTICLE_ID, undefined)).toBe("publish");
  });

  it("③ recovers from sessionStorage when both param and history.state are gone", () => {
    // history.state has no intent…
    setHistoryStateIntent(undefined);
    // …but sessionStorage still carries it.
    persistEditorIntent(ARTICLE_ID, "publish");
    expect(resolveEditorIntent(ARTICLE_ID, undefined)).toBe("publish");
  });

  it("returns undefined when no channel carries an intent", () => {
    setHistoryStateIntent(undefined);
    expect(resolveEditorIntent(ARTICLE_ID, undefined)).toBeUndefined();
  });

  it("is a pure read — does NOT re-seed sessionStorage from history.state", () => {
    setHistoryStateIntent("publish");
    expect(readPersistedEditorIntent(ARTICLE_ID)).toBeUndefined();
    resolveEditorIntent(ARTICLE_ID, undefined);
    // Resolving must not write storage; a consumed/cleared intent can't be revived.
    expect(readPersistedEditorIntent(ARTICLE_ID)).toBeUndefined();
  });

  it("without an articleId falls back to the raw param", () => {
    expect(resolveEditorIntent(undefined, "publish")).toBe("publish");
    expect(resolveEditorIntent(undefined, undefined)).toBeUndefined();
  });
});
