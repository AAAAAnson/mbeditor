import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TrashPanel } from "./TrashPanel";
import { useArticlesStore } from "@/stores/articlesStore";
import { mockMatchMedia } from "@/test-helpers/matchMedia";
import type { ArticleFull } from "@/types";

function makeArticle(id: string, title: string, deleted: boolean): ArticleFull {
  const ts = "2026-07-01T00:00:00.000Z";
  return {
    id,
    title,
    mode: "html",
    cover: "",
    created_at: ts,
    updated_at: ts,
    deleted_at: deleted ? ts : null,
    html: "<p>x</p>",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useArticlesStore.setState({
    articles: [],
    currentArticleId: null,
    loading: false,
    pendingSync: [],
    lastSyncedAt: {},
  });
});

describe("TrashPanel", () => {
  it("空态展示中文文案", () => {
    render(<TrashPanel />);
    expect(screen.getByTestId("trash-empty")).toHaveTextContent("回收站是空的");
  });

  it("只列出已删文章,不含活文章", () => {
    useArticlesStore.setState({
      articles: [makeArticle("live1", "活着的", false), makeArticle("gone1", "已删的", true)],
    });
    render(<TrashPanel />);
    expect(screen.getByText("已删的")).toBeInTheDocument();
    expect(screen.queryByText("活着的")).toBeNull();
  });

  it("点「恢复」把文章从回收站还原", async () => {
    useArticlesStore.setState({ articles: [makeArticle("gone1", "待恢复", true)] });
    render(<TrashPanel />);
    fireEvent.click(screen.getByTestId("trash-restore-gone1"));
    await waitFor(() => {
      const article = useArticlesStore.getState().articles.find((a) => a.id === "gone1");
      expect(article?.deleted_at).toBeFalsy();
    });
  });

  it("彻底删除需要二次确认,确认文案明示历史版本一并删除", async () => {
    useArticlesStore.setState({ articles: [makeArticle("gone1", "待清除", true)] });
    render(<TrashPanel />);
    fireEvent.click(screen.getByTestId("trash-purge-gone1"));
    // 确认弹窗出现,文案含红线提示
    expect(screen.getByRole("dialog")).toHaveTextContent("历史版本也将一并删除");
    fireEvent.click(screen.getByTestId("trash-purge-confirm"));
    await waitFor(() => {
      expect(useArticlesStore.getState().articles.some((a) => a.id === "gone1")).toBe(false);
    });
  });

  it("二次确认可取消,文章保留在回收站", () => {
    useArticlesStore.setState({ articles: [makeArticle("gone1", "别删我", true)] });
    render(<TrashPanel />);
    fireEvent.click(screen.getByTestId("trash-purge-gone1"));
    fireEvent.click(screen.getByTestId("trash-purge-cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useArticlesStore.getState().articles.some((a) => a.id === "gone1")).toBe(true);
  });

  it("移动 390:条目转纵向单列", () => {
    mockMatchMedia(true);
    useArticlesStore.setState({ articles: [makeArticle("gone1", "窄屏文章", true)] });
    render(<TrashPanel />);
    const row = screen.getByTestId("trash-row-gone1");
    expect(row.style.flexDirection).toBe("column");
  });
});
