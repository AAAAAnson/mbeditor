import { describe, it, expect } from "vitest";
import { getHomeTemplates } from "./seedTemplates";
import { REQUIRED_SEED_IDS } from "./index";

describe("getHomeTemplates", () => {
  it("excludes REQUIRED_SEED_IDS (the cdrive-cleanup demo)", () => {
    const ids = getHomeTemplates().map((t) => t.id);
    for (const req of REQUIRED_SEED_IDS) {
      expect(ids).not.toContain(req);
    }
  });

  it("returns 5 templates, each with non-empty title and html", () => {
    const tpls = getHomeTemplates();
    expect(tpls).toHaveLength(5);
    for (const t of tpls) {
      expect(t.title).toBeTruthy();
      expect(t.html).toBeTruthy();
    }
  });

  it("the first template is not the cdrive-cleanup demo article", () => {
    expect(getHomeTemplates()[0].id).not.toBe("cdrive-cleanup");
  });
});
