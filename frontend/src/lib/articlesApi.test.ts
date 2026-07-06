// frontend/src/lib/articlesApi.test.ts
// 测真实 articlesApi 实现(test-setup 里全局 mock 了本模块,这里 unmock 还原),
// 底下的 axios 实例(@/lib/api)换成 mock,断言 URL/body/信封解包契约。
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/lib/articlesApi");
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import api from "@/lib/api";
import type { ArticleFull } from "@/types";
import {
  ArticlesApiError,
  deleteArticle,
  getArticle,
  listArticles,
  purgeArticle,
  putArticle,
  restoreArticle,
} from "@/lib/articlesApi";

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function envelope<T>(data: T, code = 0, message = "") {
  return { data: { code, message, data } };
}

function fullArticle(id: string): ArticleFull {
  return {
    id,
    title: "标题",
    mode: "html",
    cover: "",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    html: "<p>正文</p>",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("articlesApi", () => {
  it("listArticles 默认 include_deleted=true 并解 success 信封", async () => {
    const rows = [{ id: "a1", title: "t", mode: "html", cover: "", created_at: "", updated_at: "", deleted_at: null }];
    mockedApi.get.mockResolvedValue(envelope({ articles: rows }));
    const result = await listArticles();
    expect(mockedApi.get).toHaveBeenCalledWith("/articles", {
      params: { include_deleted: true },
    });
    expect(result).toEqual(rows);
  });

  it("listArticles(false) 透传 include_deleted=false", async () => {
    mockedApi.get.mockResolvedValue(envelope({ articles: [] }));
    await listArticles(false);
    expect(mockedApi.get).toHaveBeenCalledWith("/articles", {
      params: { include_deleted: false },
    });
  });

  it("getArticle 解出 data.article", async () => {
    const article = fullArticle("a1");
    mockedApi.get.mockResolvedValue(envelope({ article }));
    const result = await getArticle("a1");
    expect(mockedApi.get).toHaveBeenCalledWith("/articles/a1");
    expect(result).toEqual(article);
  });

  it("信封 code!=0 时抛 ArticlesApiError 并带 code", async () => {
    mockedApi.get.mockResolvedValue(envelope(null, 404, "文章不存在"));
    await expect(getArticle("gone")).rejects.toMatchObject({
      name: "ArticlesApiError",
      code: 404,
      message: "文章不存在",
    });
    await expect(getArticle("gone")).rejects.toBeInstanceOf(ArticlesApiError);
  });

  it("putArticle:body 带 base_updated_at、不带 id/deleted_at,返回 {article, conflict_rev_id}", async () => {
    const article = fullArticle("a1");
    const saved = { ...article, deleted_at: null };
    mockedApi.put.mockResolvedValue(envelope({ article: saved, conflict_rev_id: "rev9" }));
    const result = await putArticle(article, "2026-07-01T12:00:00.000Z");
    expect(mockedApi.put).toHaveBeenCalledTimes(1);
    const [url, body] = mockedApi.put.mock.calls[0];
    expect(url).toBe("/articles/a1");
    expect(body.base_updated_at).toBe("2026-07-01T12:00:00.000Z");
    expect(body.title).toBe("标题");
    expect(body.html).toBe("<p>正文</p>");
    expect("id" in body).toBe(false);
    expect("deleted_at" in body).toBe(false);
    expect(result).toEqual({ article: saved, conflict_rev_id: "rev9" });
  });

  it("putArticle:conflict_rev_id 缺失时归一为 null,base 可为 null", async () => {
    const article = fullArticle("a2");
    mockedApi.put.mockResolvedValue(envelope({ article }));
    const result = await putArticle(article, null);
    const [, body] = mockedApi.put.mock.calls[0];
    expect(body.base_updated_at).toBeNull();
    expect(result.conflict_rev_id).toBeNull();
  });

  it("deleteArticle 走 DELETE /articles/{id}(软删,无 purge 参数)", async () => {
    mockedApi.delete.mockResolvedValue(envelope({ article: { id: "a1" } }));
    await deleteArticle("a1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/articles/a1");
  });

  it("purgeArticle 走 DELETE /articles/{id}?purge=true", async () => {
    mockedApi.delete.mockResolvedValue(envelope({ purged: true, id: "a1" }));
    await purgeArticle("a1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/articles/a1", {
      params: { purge: true },
    });
  });

  it("restoreArticle 走 POST /articles/{id}/restore 并解出 article", async () => {
    const article = { ...fullArticle("a1"), deleted_at: null };
    mockedApi.post.mockResolvedValue(envelope({ article }));
    const result = await restoreArticle("a1");
    expect(mockedApi.post).toHaveBeenCalledWith("/articles/a1/restore");
    expect(result).toEqual(article);
  });
});
