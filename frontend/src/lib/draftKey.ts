/**
 * Shared draft sessionStorage key rule.
 *
 * The editor persists in-progress drafts under `mbeditor.editorDraft.<articleId>`.
 * This module is the single source of truth for that key so two unrelated layers
 * can agree on it *without* depending on each other:
 *   - the editor's `services/draftStorage.ts` (read/write/clear during editing), and
 *   - the article-list UI delete handlers (clear the orphaned draft after a delete).
 *
 * Keeping the rule here lets the store/UI clear a stale draft without importing the
 * editor service (avoids a store → editor-service back-edge).
 */

const DRAFT_STORAGE_PREFIX = "mbeditor.editorDraft.";

/** sessionStorage key for an article's in-progress editor draft. */
export function draftKey(articleId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${articleId}`;
}

/** Remove the stored draft for an article id (no-op outside the browser). */
export function clearStoredDraft(articleId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(draftKey(articleId));
}
