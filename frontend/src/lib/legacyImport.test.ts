// frontend/src/lib/legacyImport.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { applyLegacyBundle, parseLegacyBundle, readLegacyBundle } from "./legacyImport";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore } from "@/stores/mbdocStore";

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useMBDocStore.setState({ docs: [] });
});

describe("legacyImport", () => {
  const sampleBundle = {
    version: 1,
    exported_at: "2025-01-01T00:00:00Z",
    articles: [{
      id: "a1", title: "T", mode: "html", html: "<p>x</p>", css: "", js: "",
      markdown: "", cover: "", author: "", digest: "",
      created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
    }],
    mbdocs: [{ id: "d1", title: "Doc", data: { id: "d1", blocks: [] } }],
  };

  it("parseLegacyBundle accepts a valid bundle", () => {
    const parsed = parseLegacyBundle(JSON.stringify(sampleBundle));
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.mbdocs).toHaveLength(1);
  });

  it("parseLegacyBundle rejects wrong version", () => {
    expect(() => parseLegacyBundle(JSON.stringify({ ...sampleBundle, version: 2 }))).toThrow();
  });

  it("applyLegacyBundle populates both stores", () => {
    applyLegacyBundle(sampleBundle as any);
    expect(useArticlesStore.getState().articles).toHaveLength(1);
    expect(useMBDocStore.getState().docs).toHaveLength(1);
  });

  it("readLegacyBundle parses a File", async () => {
    const blob = new Blob([JSON.stringify(sampleBundle)], { type: "application/json" });
    const file = new File([blob], "bundle.json");
    const bundle = await readLegacyBundle(file);
    expect(bundle.articles).toHaveLength(1);
  });
});
