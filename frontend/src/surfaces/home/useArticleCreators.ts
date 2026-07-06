import { useState } from "react";
import type { ArticleFull, Route } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useUIStore } from "@/stores/uiStore";
import { toast } from "@/stores/toastStore";
import { buildArticleSlug } from "@/lib/route";

type Go = (route: Route, params?: Record<string, string>) => void;

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "创建失败";
}

/**
 * Shared "three paths" article-creation logic for the home surface.
 *
 * `handleUseTemplate` seeds a *new* article from a template (never mutating the
 * seed) and opens the editor; `handleBlank` creates an empty article and opens
 * the editor. `busy` debounces both so a double-click can't spawn two articles.
 * Extracted as the single source of the home surface's create-article logic.
 */
export function useArticleCreators(go: Go) {
  const createArticle = useArticlesStore((state) => state.createArticle);
  const updateArticle = useArticlesStore((state) => state.updateArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);
  const defaultMode = useUIStore((state) => state.editorDefaultMode);
  const [busy, setBusy] = useState(false);

  const openEditor = (article: { id: string; title: string }) => {
    setCurrentArticle(article.id);
    go("editor", { articleSlug: buildArticleSlug(article.title, article.id) });
  };

  // 套模板:以选中 seed 的内容建一篇新文章(不动 seed 本身),进 editor。
  const handleUseTemplate = async (seed: ArticleFull) => {
    if (busy) return;
    setBusy(true);
    try {
      const article = await createArticle(seed.title, seed.mode);
      const filled = await updateArticle(article.id, {
        title: seed.title,
        mode: seed.mode,
        html: seed.html,
        css: seed.css,
        js: seed.js,
        markdown: seed.markdown,
        cover: seed.cover,
        author: seed.author,
        digest: seed.digest,
      });
      toast.success("已套用模板");
      openEditor(filled);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // 自己写:建一篇空文章直接进 editor。
  const handleBlank = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const article = await createArticle("未命名文章", defaultMode);
      openEditor(article);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return { busy, handleUseTemplate, handleBlank, openEditor };
}
