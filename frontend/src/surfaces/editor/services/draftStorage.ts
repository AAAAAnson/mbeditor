import type { EditorDraft } from "@/types";
import { draftKey, clearStoredDraft } from "@/lib/draftKey";

// Re-export so existing editor importers keep a stable path while the key rule
// lives in the shared lib (used by both this service and the UI delete handlers).
export { clearStoredDraft };

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

/**
 * Coerce null/undefined string fields to empty strings.
 * Prevents Pydantic v2 422 errors on API boundaries.
 */
export function coerceDraftStrings<T extends Partial<EditorDraft>>(input: T): T {
  const out = { ...input } as Record<keyof EditorDraft, unknown>;
  (Object.keys(EMPTY_DRAFT) as (keyof EditorDraft)[]).forEach((key) => {
    if (key === "mode") return;
    const value = out[key];
    if (value === null || value === undefined) {
      out[key] = EMPTY_DRAFT[key];
    }
  });
  return out as T;
}

/**
 * Read stored draft from sessionStorage.
 */
export function readStoredDraft(articleId: string): EditorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(articleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    return coerceDraftStrings({ ...EMPTY_DRAFT, ...parsed });
  } catch {
    return null;
  }
}

/**
 * Write draft to sessionStorage.
 */
export function writeStoredDraft(articleId: string, draft: EditorDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(draftKey(articleId), JSON.stringify(draft));
}

/**
 * Normalize article to editor draft format.
 */
export function normalizeArticle(article: {
  title: string;
  mode: string;
  html: string;
  css: string;
  js: string;
  markdown: string;
  author: string;
  digest: string;
}): EditorDraft {
  return coerceDraftStrings({
    title: article.title,
    mode: article.mode as EditorDraft["mode"],
    html: article.html,
    css: article.css,
    js: article.js,
    markdown: article.markdown,
    author: article.author,
    digest: article.digest,
  });
}

/**
 * Check if draft is dirty compared to article.
 */
export function isDirty(article: { [key: string]: unknown } | null, draft: EditorDraft): boolean {
  if (!article) return false;
  return (
    article.title !== draft.title ||
    article.mode !== draft.mode ||
    article.html !== draft.html ||
    article.css !== draft.css ||
    article.js !== draft.js ||
    article.markdown !== draft.markdown ||
    article.author !== draft.author ||
    article.digest !== draft.digest
  );
}
