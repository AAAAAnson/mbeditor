// 文章主存储 API 封装(/api/v1/articles,批2 前端后端化)。
// 统一解 success 信封 {code, message, data};code!=0 抛 ArticlesApiError(带 code,
// 供上层区分 404 等业务分支)。HTTP 层错误(网络/5xx)由 @/lib/api 的 response
// interceptor 改写为中文 message 后原样 reject,这里不再包装。
import api from "@/lib/api";
import type { ApiResponse, ArticleFull, ArticleSummary } from "@/types";

export class ArticlesApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "ArticlesApiError";
    this.code = code;
  }
}

export interface PutArticleResult {
  article: ArticleFull;
  conflict_rev_id: string | null;
}

function unwrap<T>(payload: ApiResponse<T>): T {
  if (!payload || typeof payload.code !== "number") {
    throw new ArticlesApiError("响应格式不正确", -1);
  }
  if (payload.code !== 0) {
    throw new ArticlesApiError(payload.message || "请求失败", payload.code);
  }
  return payload.data;
}

/** 摘要列表(不含 html/css/js/markdown)。默认带上软删的(回收站要用)。 */
export async function listArticles(includeDeleted = true): Promise<ArticleSummary[]> {
  const res = await api.get("/articles", { params: { include_deleted: includeDeleted } });
  const data = unwrap<{ articles: ArticleSummary[] }>(res.data);
  return Array.isArray(data?.articles) ? data.articles : [];
}

/** 全文;不存在时后端 code=404 → ArticlesApiError(404)。 */
export async function getArticle(id: string): Promise<ArticleFull> {
  const res = await api.get(`/articles/${encodeURIComponent(id)}`);
  return unwrap<{ article: ArticleFull }>(res.data).article;
}

/**
 * 全量 upsert。body = ArticleFull 字段 + base_updated_at(id 走路径;deleted_at
 * 不进 body——软删态由服务端保留,PUT 不冲掉)。LWW 冲突时响应带 conflict_rev_id。
 */
export async function putArticle(
  article: ArticleFull,
  baseUpdatedAt: string | null,
): Promise<PutArticleResult> {
  const { id, deleted_at: _deleted, ...fields } = article;
  const res = await api.put(`/articles/${encodeURIComponent(id)}`, {
    ...fields,
    base_updated_at: baseUpdatedAt,
  });
  const data = unwrap<{ article: ArticleFull; conflict_rev_id?: string | null }>(res.data);
  return { article: data.article, conflict_rev_id: data.conflict_rev_id ?? null };
}

/** 软删(标 deleted_at);不存在 → ArticlesApiError(404)。 */
export async function deleteArticle(id: string): Promise<void> {
  const res = await api.delete(`/articles/${encodeURIComponent(id)}`);
  unwrap(res.data);
}

/** 从回收站恢复(清 deleted_at)。 */
export async function restoreArticle(id: string): Promise<ArticleFull> {
  const res = await api.post(`/articles/${encodeURIComponent(id)}/restore`);
  return unwrap<{ article: ArticleFull }>(res.data).article;
}

/** 真删文件 + 连删该篇 revisions。 */
export async function purgeArticle(id: string): Promise<void> {
  const res = await api.delete(`/articles/${encodeURIComponent(id)}`, { params: { purge: true } });
  unwrap(res.data);
}
