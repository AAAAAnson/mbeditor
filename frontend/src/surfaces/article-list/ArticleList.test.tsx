import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleList } from "./ArticleList";
import { useArticlesStore } from "@/stores/articlesStore";
import { draftKey } from "@/lib/draftKey";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.confirm = vi.fn(() => true);
  useArticlesStore.setState({
    articles: [],
    currentArticleId: null,
    loading: false,
    pendingSync: [],
    lastSyncedAt: {},
  });
});

function makeTrashed(id: string, title: string) {
  const ts = "2026-07-01T00:00:00.000Z";
  return {
    id,
    title,
    mode: "html" as const,
    cover: "",
    created_at: ts,
    updated_at: ts,
    deleted_at: ts,
    html: "",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

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

  it("首页不出现 CLI/Agent 开发者招牌", () => {
    render(<ArticleList go={() => {}} />);
    expect(screen.queryByText(/CLI操作|CODEX|OPENCLAW/)).toBeNull();
  });

  it("空状态提供「从漂亮模板开始」入口,点了留在起稿台", () => {
    const go = vi.fn();
    render(<ArticleList go={go} />);
    const templateCta = screen.getByRole("button", { name: /从漂亮模板开始/ });
    fireEvent.click(templateCta);
    expect(go).toHaveBeenCalledWith("list");
  });

  it("删除文章后清掉该 id 残留的 sessionStorage 草稿(不留孤儿)", async () => {
    const created = await useArticlesStore.getState().createArticle("有草稿待删", "html");
    sessionStorage.setItem(draftKey(created.id), JSON.stringify({ title: "脏草稿" }));
    expect(sessionStorage.getItem(draftKey(created.id))).not.toBeNull();

    render(<ArticleList />);
    fireEvent.click(await screen.findByTestId(`delete-article-${created.id}`));

    await vi.waitFor(() => {
      expect(sessionStorage.getItem(draftKey(created.id))).toBeNull();
    });
  });

  it("工具条 flexWrap 允许换行(窄屏不横溢)", () => {
    const { container } = render(<ArticleList go={() => {}} />);
    const toolbar = container.querySelector(
      '[data-testid="article-list-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.style.flexWrap).toBe("wrap");
  });

  it("列表页标题用 clamp 字号", () => {
    render(<ArticleList go={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).style.fontSize).toContain("clamp");
  });

  it("工具条有「回收站」入口;无已删文章时不显示计数", () => {
    render(<ArticleList go={() => {}} />);
    expect(screen.getByTestId("trash-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("trash-count")).toBeNull();
  });

  it("有已删文章时回收站入口显示计数", () => {
    useArticlesStore.setState({
      articles: [makeTrashed("t1", "已删一"), makeTrashed("t2", "已删二")],
    });
    render(<ArticleList go={() => {}} />);
    expect(screen.getByTestId("trash-count")).toHaveTextContent("2");
  });

  it("点回收站入口开合面板", () => {
    useArticlesStore.setState({ articles: [makeTrashed("t1", "已删一")] });
    render(<ArticleList go={() => {}} />);
    expect(screen.queryByTestId("trash-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("trash-toggle"));
    expect(screen.getByTestId("trash-panel")).toBeInTheDocument();
    expect(screen.getByText("已删一")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("trash-toggle"));
    expect(screen.queryByTestId("trash-panel")).toBeNull();
  });

  it("已删文章不出现在正常列表网格里", () => {
    useArticlesStore.setState({ articles: [makeTrashed("t1", "被删走的")] });
    render(<ArticleList go={() => {}} />);
    expect(screen.queryByTestId("article-card-t1")).toBeNull();
  });

  it("条目命中 pendingSync 显示「未同步」徽标,带自动同步提示", () => {
    const article = { ...makeTrashed("p1", "本地写的"), deleted_at: null };
    useArticlesStore.setState({ articles: [article], pendingSync: ["p1"] });
    render(<ArticleList go={() => {}} />);
    const badge = screen.getByTestId("unsynced-badge-p1");
    expect(badge).toHaveTextContent("未同步");
    expect(badge).toHaveAttribute("title", "将在连接恢复后自动同步");
  });

  it("pendingSync 未命中时不显示未同步徽标", () => {
    const article = { ...makeTrashed("p1", "已同步的"), deleted_at: null };
    useArticlesStore.setState({ articles: [article], pendingSync: [] });
    render(<ArticleList go={() => {}} />);
    expect(screen.queryByTestId("unsynced-badge-p1")).toBeNull();
  });
});
