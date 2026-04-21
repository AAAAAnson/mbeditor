// frontend/src/stores/articlesStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useArticlesStore } from "./articlesStore";

describe("articlesStore (local)", () => {
  beforeEach(() => {
    localStorage.clear();
    useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  });

  it("createArticle returns a new article with a generated id", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    expect(article.id).toMatch(/^[a-z0-9]{12}$/);
    expect(article.title).toBe("Hello");
    expect(useArticlesStore.getState().articles).toHaveLength(1);
  });

  it("updateArticle merges fields and updates updated_at", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    const before = article.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await useArticlesStore.getState().updateArticle(article.id, { html: "<p>hi</p>" });
    expect(updated.html).toBe("<p>hi</p>");
    expect(updated.updated_at).not.toBe(before);
  });

  it("deleteArticle removes from store", async () => {
    const a = await useArticlesStore.getState().createArticle("A", "html");
    await useArticlesStore.getState().deleteArticle(a.id);
    expect(useArticlesStore.getState().articles).toHaveLength(0);
  });

  it("persists to localStorage under mbeditor.articles", async () => {
    await useArticlesStore.getState().createArticle("Persist", "html");
    const raw = localStorage.getItem("mbeditor.articles");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.articles[0].title).toBe("Persist");
  });

  it("fetchArticles is a no-op that returns from store", async () => {
    await useArticlesStore.getState().createArticle("A", "html");
    await useArticlesStore.getState().fetchArticles();
    expect(useArticlesStore.getState().articles).toHaveLength(1);
  });
});
