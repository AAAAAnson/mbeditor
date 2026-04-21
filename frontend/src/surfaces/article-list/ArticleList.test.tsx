import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleList } from "./ArticleList";
import { useArticlesStore } from "@/stores/articlesStore";

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
});

describe("ArticleList", () => {
  it("renders articles from the local store", async () => {
    await useArticlesStore.getState().createArticle("Local Title", "html");
    render(<ArticleList />);
    expect(await screen.findByText("Local Title")).toBeInTheDocument();
  });

  it("does not call /api/v1/articles", async () => {
    const spy = vi.spyOn(globalThis, "fetch" as any);
    render(<ArticleList />);
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining("/api/v1/articles"), expect.anything());
    spy.mockRestore();
  });
});
