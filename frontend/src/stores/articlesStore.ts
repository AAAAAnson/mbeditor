import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleFull, ArticleMode, ArticleSummary } from "@/types";

type ArticleUpdateData = Partial<Omit<ArticleFull, "id" | "created_at" | "updated_at">>;

function generateId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyArticle(id: string, title: string, mode: ArticleMode): ArticleFull {
  const ts = nowIso();
  return {
    id,
    title,
    mode,
    cover: "",
    created_at: ts,
    updated_at: ts,
    html: "",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

interface ArticlesState {
  articles: (ArticleSummary | ArticleFull)[];
  currentArticleId: string | null;
  loading: boolean;

  fetchArticles: () => Promise<void>;
  fetchArticle: (id: string) => Promise<ArticleFull>;
  createArticle: (title: string, mode: ArticleMode) => Promise<ArticleFull>;
  updateArticle: (id: string, data: ArticleUpdateData) => Promise<ArticleFull>;
  deleteArticle: (id: string) => Promise<void>;
  setCurrentArticle: (id: string | null) => void;
  replaceAll: (articles: ArticleFull[]) => void;
}

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => ({
      articles: [],
      currentArticleId: null,
      loading: false,

      fetchArticles: async () => {
        // Local-only; nothing to fetch.
      },

      fetchArticle: async (id) => {
        const found = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!found) {
          throw new Error(`Article ${id} not found`);
        }
        set({ currentArticleId: id });
        return found;
      },

      createArticle: async (title, mode) => {
        const article = emptyArticle(generateId(), title, mode);
        set((state) => ({
          articles: [article, ...state.articles],
          currentArticleId: article.id,
        }));
        return article;
      },

      updateArticle: async (id, data) => {
        const existing = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!existing) {
          throw new Error(`Article ${id} not found`);
        }
        const merged: ArticleFull = {
          ...existing,
          ...data,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: nowIso(),
        };
        set((state) => ({
          articles: state.articles.map((a) => (a.id === id ? merged : a)),
          currentArticleId: id,
        }));
        return merged;
      },

      deleteArticle: async (id) => {
        set((state) => ({
          articles: state.articles.filter((a) => a.id !== id),
          currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
        }));
      },

      setCurrentArticle: (id) => set({ currentArticleId: id }),

      replaceAll: (articles) => set({ articles, currentArticleId: null }),
    }),
    {
      name: "mbeditor.articles",
      partialize: (state) => ({ articles: state.articles }),
    }
  )
);
