import { useCallback, useEffect, useState } from "react";
import type { ArticleFull, EditorDraft, EditorField, ArticleMode } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useUIStore } from "@/stores/uiStore";
import {
  readStoredDraft,
  writeStoredDraft,
  clearStoredDraft,
  normalizeArticle,
  isDirty,
} from "../services/draftStorage";
import { compileMarkdown } from "../utils/markdown";

const EMPTY_DRAFT: EditorDraft = {
  title: "",
  mode: "html",
  html: "",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

export function useEditorDraft(articleId: string | undefined) {
  const fetchArticle = useArticlesStore((state) => state.fetchArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);

  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = isDirty(article as unknown as Record<string, unknown> | null, draft);

  // Load article on mount
  useEffect(() => {
    let cancelled = false;

    if (!articleId || articleId === "new") {
      setCurrentArticle(null);
      setArticle(null);
      setDraft(EMPTY_DRAFT);
      setLoading(false);
      setError(articleId === "new" ? "请先从列表创建一篇文章。" : null);
      return () => { cancelled = true; };
    }

    setCurrentArticle(articleId);
    setLoading(true);
    setError(null);

    void fetchArticle(articleId)
      .then((nextArticle) => {
        if (cancelled) return;
        setArticle(nextArticle);
        const restoredDraft = readStoredDraft(articleId);
        setDraft(restoredDraft ?? normalizeArticle(nextArticle));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载失败");
        setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [articleId, fetchArticle, setCurrentArticle]);

  // Persist draft to sessionStorage
  useEffect(() => {
    if (!articleId || !article) return;
    writeStoredDraft(articleId, draft);
  }, [article, articleId, draft]);

  const handleFieldChange = useCallback((field: EditorField, value: string) => {
    setDraft((current) => {
      if (field === "mode") {
        const nextMode = value as ArticleMode;
        return {
          ...current,
          mode: nextMode,
          html: nextMode === "markdown" ? current.html : current.html || compileMarkdown(current.markdown),
        };
      }
      if (field === "markdown") {
        return { ...current, markdown: value, html: compileMarkdown(value) };
      }
      return { ...current, [field]: value };
    });
  }, []);

  const clearDraft = useCallback(() => {
    if (articleId) clearStoredDraft(articleId);
  }, [articleId]);

  return {
    article,
    setArticle,
    draft,
    setDraft,
    loading,
    error,
    dirty,
    handleFieldChange,
    clearDraft,
  };
}
