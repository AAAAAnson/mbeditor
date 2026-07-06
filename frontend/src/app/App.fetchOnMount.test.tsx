import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 与 App.firstvisit.test 同款:防 compose 支路真发请求。
vi.mock("@/lib/agentStream", () => ({
  agentStream: () => ({ abort: () => {} }),
}));

import App from "./App";
import { useArticlesStore } from "@/stores/articlesStore";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  useArticlesStore.setState({
    articles: [],
    currentArticleId: null,
    loading: false,
    firstVisit: false,
    pendingSync: [],
  });
});

describe("App 启动接线:fetchArticles", () => {
  it("挂载后调一次 fetchArticles,重渲染不重复拉", async () => {
    const spy = vi.fn(async () => {});
    useArticlesStore.setState({ fetchArticles: spy });

    const { rerender } = render(<App />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender(<App />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
