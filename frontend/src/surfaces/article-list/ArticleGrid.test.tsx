import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArticleGrid } from "./ArticleGrid";
import { mockMatchMedia } from "@/test-helpers/matchMedia";
import type { ArticleFull } from "@/types";

function makeArticle(overrides: Partial<ArticleFull> = {}): ArticleFull {
  const now = new Date().toISOString();
  return {
    id: "a1",
    title: "胡萝卜排骨汤",
    mode: "html",
    cover: "warm",
    created_at: now,
    updated_at: now,
    html: "<p>鲜掉眉毛</p>",
    css: "",
    js: "",
    markdown: "",
    author: "妈妈",
    digest: "",
    ...overrides,
  };
}

describe("ArticleGrid", () => {
  it("renders a card per article with its title", () => {
    const articles = [
      makeArticle({ id: "a1", title: "胡萝卜排骨汤" }),
      makeArticle({ id: "a2", title: "周末逛菜市场" }),
    ];
    render(<ArticleGrid articles={articles} onOpen={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("胡萝卜排骨汤")).toBeInTheDocument();
    expect(screen.getByText("周末逛菜市场")).toBeInTheDocument();
  });

  it("falls back to 未命名文章 for an empty title", () => {
    render(
      <ArticleGrid articles={[makeArticle({ title: "" })]} onOpen={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText("未命名文章")).toBeInTheDocument();
  });

  it("calls onOpen with the article when a card is clicked", () => {
    const onOpen = vi.fn();
    const article = makeArticle({ id: "a1", title: "胡萝卜排骨汤" });
    render(<ArticleGrid articles={[article]} onOpen={onOpen} onDelete={() => {}} />);
    fireEvent.click(screen.getByText("胡萝卜排骨汤"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(article);
  });

  it("calls onDelete with the article when the delete button is clicked, without opening", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const article = makeArticle({ id: "a1", title: "胡萝卜排骨汤" });
    render(<ArticleGrid articles={[article]} onOpen={onOpen} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId("delete-article-a1"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(article);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("disables the delete button for the article being deleted", () => {
    const article = makeArticle({ id: "a1" });
    render(
      <ArticleGrid
        articles={[article]}
        onOpen={() => {}}
        onDelete={() => {}}
        deletingId="a1"
      />,
    );
    expect(screen.getByTestId("delete-article-a1")).toBeDisabled();
  });

  it("uses an auto-fill grid (not a fixed 7-col pixel ledger)", () => {
    const { container } = render(
      <ArticleGrid articles={[makeArticle()]} onOpen={() => {}} onDelete={() => {}} />,
    );
    const grid = container.querySelector('[data-testid="article-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.style.gridTemplateColumns).toContain("auto-fill");
    expect(grid.style.gridTemplateColumns).toContain("minmax");
  });

  it("supports an optional onRename callback per card", () => {
    const onRename = vi.fn();
    const article = makeArticle({ id: "a1", title: "胡萝卜排骨汤" });
    render(
      <ArticleGrid
        articles={[article]}
        onOpen={() => {}}
        onDelete={() => {}}
        onRename={onRename}
      />,
    );
    const renameBtn = screen.getByTestId("rename-article-a1");
    fireEvent.click(renameBtn);
    expect(onRename).toHaveBeenCalledWith(article);
  });

  it("renders the article mode chip inside the card", () => {
    const article = makeArticle({ id: "a1", mode: "markdown", title: "笔记" });
    render(<ArticleGrid articles={[article]} onOpen={() => {}} onDelete={() => {}} />);
    const card = screen.getByText("笔记").closest('[data-testid="article-card-a1"]') as HTMLElement;
    expect(within(card).getByText("markdown")).toBeInTheDocument();
  });
});

describe("ArticleGrid 响应式列", () => {
  it("窄屏(<600px)强制单列 gridTemplateColumns:1fr", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ArticleGrid articles={[makeArticle()]} onOpen={() => {}} onDelete={() => {}} />,
    );
    const grid = container.querySelector('[data-testid="article-grid"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("1fr");
  });

  it("宽屏(>=600px)保持 auto-fill/minmax 流式", () => {
    mockMatchMedia(false);
    const { container } = render(
      <ArticleGrid articles={[makeArticle()]} onOpen={() => {}} onDelete={() => {}} />,
    );
    const grid = container.querySelector('[data-testid="article-grid"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain("auto-fill");
    expect(grid.style.gridTemplateColumns).toContain("minmax");
  });
});
