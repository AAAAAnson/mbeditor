import { describe, expect, it } from "vitest";
import type { WeChatAccount, LegacyExportBundle, Route } from "./index";

describe("types", () => {
  it("WeChatAccount has the expected shape", () => {
    const a: WeChatAccount = { id: "x", name: "n", appid: "wxA", appsecret: "s" };
    expect(a.appid).toBe("wxA");
  });

  it("LegacyExportBundle has articles and mbdocs arrays", () => {
    const b: LegacyExportBundle = { version: 1, exported_at: "now", articles: [], mbdocs: [] };
    expect(b.articles).toEqual([]);
    expect(b.mbdocs).toEqual([]);
  });
});

describe("Route union", () => {
  it("includes the compose route", () => {
    const r: Route = "compose";
    expect(r).toBe("compose");
  });

  it("still includes the existing routes", () => {
    const routes: Route[] = ["list", "editor", "settings", "compose"];
    expect(routes).toHaveLength(4);
  });
});
