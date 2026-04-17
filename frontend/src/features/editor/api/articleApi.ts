import api from "@/lib/api";
import type { Article, ApiResponse } from "@/types";
import type { ArticleUpdatePayload } from "@/features/editor/types";

export async function fetchArticle(articleId: string): Promise<Article> {
  const response = await api.get<ApiResponse<Article>>(`/articles/${articleId}`);
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "Failed to load article");
  }
  return response.data.data;
}

export async function saveArticle(articleId: string, payload: ArticleUpdatePayload): Promise<void> {
  await api.put(`/articles/${articleId}`, payload);
}
