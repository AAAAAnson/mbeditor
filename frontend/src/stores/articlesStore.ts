import { create } from "zustand";
import api from "@/lib/api";
import type { ApiResponse, ArticleFull, ArticleMode, ArticleSummary } from "@/types";

type ArticleUpdateData = Partial<Omit<ArticleFull, "id" | "created_at" | "updated_at">>;

function unwrapResponse<T>(response: ApiResponse<T>) {
  if (response.code !== 0) {
    throw new Error(response.message || "Request failed");
  }
  return response.data;
}

function upsertArticle(list: (ArticleSummary | ArticleFull)[], article: ArticleFull) {
  const existing = list.some((item) => item.id === article.id);
  if (!existing) return [article, ...list];
  return list.map((item) => (item.id === article.id ? article : item));
}

interface ArticlesState {
  /** Article list (summaries from the list endpoint, or full articles after fetch) */
  articles: (ArticleSummary | ArticleFull)[];
  currentArticleId: string | null;
  loading: boolean;

  fetchArticles: () => Promise<void>;
  fetchArticle: (id: string) => Promise<ArticleFull>;
  createArticle: (title: string, mode: ArticleMode) => Promise<ArticleFull>;
  updateArticle: (id: string, data: ArticleUpdateData) => Promise<ArticleFull>;
  deleteArticle: (id: string) => Promise<void>;
  setCurrentArticle: (id: string | null) => void;
}

export const useArticlesStore = create<ArticlesState>()((set, get) => ({
  articles: [],
  currentArticleId: null,
  loading: false,

  fetchArticles: async () => {
    set({ loading: true });
    try {
      const res = await api.get<ApiResponse<ArticleSummary[]>>("/articles");
      set({ articles: unwrapResponse(res.data) });
    } finally {
      set({ loading: false });
    }
  },

  fetchArticle: async (id: string) => {
    set({ loading: true });
    try {
      const res = await api.get<ApiResponse<ArticleFull>>(`/articles/${id}`);
      const article = unwrapResponse(res.data);
      set((state) => ({
        articles: upsertArticle(state.articles, article),
        currentArticleId: article.id,
      }));
      return article;
    } finally {
      set({ loading: false });
    }
  },

  createArticle: async (title: string, mode: ArticleMode) => {
    const res = await api.post<ApiResponse<ArticleFull>>("/articles", { title, mode });
    const article = unwrapResponse(res.data);
    set((state) => ({
      articles: upsertArticle(state.articles, article),
      currentArticleId: article.id,
    }));
    return article;
  },

  updateArticle: async (id: string, data) => {
    const res = await api.put<ApiResponse<ArticleFull>>(`/articles/${id}`, data);
    const updated = unwrapResponse(res.data);
    set((state) => ({
      articles: upsertArticle(state.articles, updated),
      currentArticleId: updated.id,
    }));
    return updated;
  },

  deleteArticle: async (id: string) => {
    const res = await api.delete<ApiResponse<null>>(`/articles/${id}`);
    unwrapResponse(res.data);
    set((state) => ({
      articles: state.articles.filter((a) => a.id !== id),
      currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
    }));
  },

  setCurrentArticle: (id: string | null) => {
    set({ currentArticleId: id });
  },
}));
