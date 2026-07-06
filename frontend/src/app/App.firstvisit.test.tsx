import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// compose 渲染时 GeneratingTheater 不挂载,稳妥起见 mock agentStream 不发请求。
vi.mock("@/lib/agentStream", () => ({
  agentStream: () => ({ abort: () => {} }),
}));

import App from "./App";
import { useArticlesStore } from "@/stores/articlesStore";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false, firstVisit: false });
  // 批3 起 App 挂载即 fetchArticles(真源反转)。本文件只测首页渲染分支,
  // 全局 articlesApi mock 的空列表会把本地种子文章 merge 掉 → 换成 noop,
  // 启动拉取本身由 App.fetchOnMount.test.tsx 专测。
  useArticlesStore.setState({ fetchArticles: vi.fn(async () => {}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App home surface (merged welcome + list)", () => {
  it("真·首访(firstVisit 标记、空 articles)在 / 渲染首页三路 + 模板墙,不重定向", async () => {
    // 首页合并后不再有重定向:首访只软化引导文案,停留在 /,给三条路。
    useArticlesStore.setState({ articles: [], firstVisit: true });
    render(<App />);
    expect(await screen.findByRole("button", { name: /让 AI 帮我写/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自己写一篇/ })).toBeInTheDocument();
    // 空 store → 模板墙
    expect(screen.getByTestId("home-template-wall")).toBeInTheDocument();
    // 始终停在 /,不弹去 /new 或 /welcome
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
  });

  it("有文章时在 / 渲染最近文章网格(无模板墙),停在 /", async () => {
    await useArticlesStore.getState().createArticle("Existing", "html");
    render(<App />);
    expect(await screen.findByTestId("article-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("home-template-wall")).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.pathname).toBe("/");
  });

  it("非首访(firstVisit=false)且 0 文章时仍在 / 渲染首页(三路 + 模板墙),不被弹走", async () => {
    // 老用户删光文章 ≠ 被弹去别处:首页据 articles.length 自渲染模板墙。
    useArticlesStore.setState({ articles: [], firstVisit: false });
    render(<App />);
    expect(await screen.findByRole("button", { name: /让 AI 帮我写/ })).toBeInTheDocument();
    expect(screen.getByTestId("home-template-wall")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.pathname).toBe("/");
  });
});
