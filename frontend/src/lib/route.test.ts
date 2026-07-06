import { describe, expect, it } from "vitest";
import {
  buildArticleSlug,
  findArticleBySlugSuffix,
  idSuffix,
  parseArticleSlugSuffix,
  parsePath,
  pathForRoute,
} from "./route";

describe("parsePath", () => {
  it("maps / and empty to list", () => {
    expect(parsePath("/")).toEqual({ route: "list", params: {} });
    expect(parsePath("")).toEqual({ route: "list", params: {} });
  });

  it("maps /settings to settings", () => {
    expect(parsePath("/settings")).toEqual({ route: "settings", params: {} });
  });

  it("parses ?section= on /settings into params.section", () => {
    expect(parsePath("/settings?section=aiengine")).toEqual({
      route: "settings",
      params: { section: "aiengine" },
    });
  });

  it("ignores an empty ?section= and other settings query params", () => {
    expect(parsePath("/settings?section=")).toEqual({ route: "settings", params: {} });
    expect(parsePath("/settings?foo=bar")).toEqual({ route: "settings", params: {} });
  });

  it("maps /welcome to list so old bookmarks don't break", () => {
    expect(parsePath("/welcome")).toEqual({ route: "list", params: {} });
  });

  it("maps /new to compose", () => {
    expect(parsePath("/new")).toEqual({ route: "compose", params: {} });
  });

  it("ignores query strings on non-settings paths", () => {
    expect(parsePath("/new?x=1")).toEqual({ route: "compose", params: {} });
    expect(parsePath("/?x=1")).toEqual({ route: "list", params: {} });
  });

  it("maps /a/<slug> to editor with articleSlug param", () => {
    expect(parsePath("/a/foo-3f2a")).toEqual({
      route: "editor",
      params: { articleSlug: "foo-3f2a" },
    });
  });

  it("preserves percent-encoded titles in the slug", () => {
    const slug = `${encodeURIComponent("我的文章")}-3f2a`;
    expect(parsePath(`/a/${slug}`)).toEqual({ route: "editor", params: { articleSlug: slug } });
  });

  it("falls back to list for unknown paths", () => {
    expect(parsePath("/something/else")).toEqual({ route: "list", params: {} });
  });
});

describe("pathForRoute", () => {
  it("returns / for list", () => {
    expect(pathForRoute("list", {})).toBe("/");
  });

  it("returns /settings for settings", () => {
    expect(pathForRoute("settings", {})).toBe("/settings");
  });

  it("appends ?section= for settings when section param present", () => {
    expect(pathForRoute("settings", { section: "aiengine" })).toBe("/settings?section=aiengine");
  });

  it("omits ?section= for settings when section param is empty", () => {
    expect(pathForRoute("settings", { section: "" })).toBe("/settings");
  });

  it("never produces /welcome for any route", () => {
    // welcome is retired; the literal stays in the Route union for one
    // compat release but pathForRoute must not route to it.
    expect(pathForRoute("welcome", {})).toBe("/");
  });

  it("returns /new for compose", () => {
    expect(pathForRoute("compose", {})).toBe("/new");
  });

  it("returns /a/<slug> for editor when articleSlug present", () => {
    expect(pathForRoute("editor", { articleSlug: "foo-3f2a" })).toBe("/a/foo-3f2a");
  });

  it("falls back to / for editor without a slug", () => {
    expect(pathForRoute("editor", {})).toBe("/");
  });
});

describe("buildArticleSlug + parseArticleSlugSuffix", () => {
  it("encodes Chinese titles and appends a 4-char id suffix", () => {
    const slug = buildArticleSlug("我的文章", "abcdef123456");
    expect(slug).toBe(`${encodeURIComponent("我的文章")}-abcd`);
  });

  it("round-trips: parseArticleSlugSuffix recovers the suffix from buildArticleSlug output", () => {
    const slug = buildArticleSlug("any title", "abcd9999");
    expect(parseArticleSlugSuffix(slug)).toBe("abcd");
  });

  it("substitutes 'untitled' for empty titles to keep the slug well-formed", () => {
    expect(buildArticleSlug("", "abcd1234")).toBe("untitled-abcd");
    expect(buildArticleSlug("   ", "abcd1234")).toBe("untitled-abcd");
  });

  it("pads short ids so the suffix is always 4 chars", () => {
    expect(idSuffix("ab")).toBe("ab00");
    expect(idSuffix("")).toBe("0000");
  });

  it("returns null for malformed slugs", () => {
    expect(parseArticleSlugSuffix("nope")).toBeNull();
    expect(parseArticleSlugSuffix("foo_3f2a")).toBeNull();
  });

  it("handles titles that themselves contain hyphens", () => {
    const slug = buildArticleSlug("foo-bar-baz", "abcd1234");
    expect(slug).toBe("foo-bar-baz-abcd");
    expect(parseArticleSlugSuffix(slug)).toBe("abcd");
  });
});

describe("findArticleBySlugSuffix", () => {
  it("matches an article whose id-derived suffix equals the slug suffix", () => {
    const articles = [
      { id: "aaaa1111", title: "one" },
      { id: "bbbb2222", title: "two" },
    ];
    expect(findArticleBySlugSuffix(articles, "bbbb")).toEqual({ id: "bbbb2222", title: "two" });
  });

  it("returns null for unmatched suffixes", () => {
    expect(findArticleBySlugSuffix([{ id: "aaaa", title: "" }], "zzzz")).toBeNull();
  });

  it("returns null for empty suffix", () => {
    expect(findArticleBySlugSuffix([{ id: "aaaa", title: "" }], "")).toBeNull();
  });
});
