import type { Route } from "@/types";

// Length of the article-id suffix appended to URL slugs. 4 base-36 chars =
// 36^4 ≈ 1.7M combinations, more than enough to disambiguate same-title
// articles for a personal-use store. If two articles ever collide on this
// prefix we fall back to "first match" — acceptable for local-only data.
export const ID_SUFFIX_LEN = 4;

export interface PathState {
  route: Route;
  params: Record<string, string>;
}

/**
 * Parse a path into a navigation state.
 *
 * Accepts an optional query string (e.g. `/settings?section=aiengine`); the
 * query is split off and only consulted where it carries routing params (the
 * settings deep-link `section`). Callers may pass a bare pathname or
 * `pathname + search` interchangeably.
 */
export function parsePath(path: string): PathState {
  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const search = qIndex === -1 ? "" : path.slice(qIndex + 1);

  if (!pathname || pathname === "/") return { route: "list", params: {} };
  if (pathname === "/settings") {
    const section = new URLSearchParams(search).get("section");
    return { route: "settings", params: section ? { section } : {} };
  }
  // /welcome is retired: redirect old bookmarks to the home (list) surface so
  // they don't dead-end. The `welcome` Route literal is kept for one compat
  // release but we no longer route to it.
  if (pathname === "/welcome") return { route: "list", params: {} };
  if (pathname === "/new") return { route: "compose", params: {} };
  const m = pathname.match(/^\/a\/(.+)$/);
  if (m) return { route: "editor", params: { articleSlug: m[1] } };
  return { route: "list", params: {} };
}

/** Build the URL path for a navigation state. */
export function pathForRoute(route: Route, params: Record<string, string>): string {
  switch (route) {
    case "list":
      return "/";
    case "settings":
      return params.section ? `/settings?section=${encodeURIComponent(params.section)}` : "/settings";
    case "compose":
      return "/new";
    // welcome is retired: never emit /welcome. The literal lingers in the
    // Route union for one compat release; fall it through to the home surface.
    case "welcome":
      return "/";
    case "editor":
      if (params.articleSlug) return `/a/${params.articleSlug}`;
      // Editor without a slug — shouldn't normally happen but fall back to
      // list rather than producing an invalid /a/ path.
      return "/";
    default:
      return "/";
  }
}

/**
 * Build the `/a/...` slug for an article.
 *
 * Format: `<encodeURIComponent(title)>-<first ID_SUFFIX_LEN chars of id>`.
 * The fixed-length suffix lets us split on the last `-` even when the title
 * itself contains hyphens.
 */
export function buildArticleSlug(title: string, id: string): string {
  const safeTitle = title.trim() || "untitled";
  const encoded = encodeURIComponent(safeTitle);
  const suffix = idSuffix(id);
  return `${encoded}-${suffix}`;
}

/** Extract the trailing ID suffix from a slug, or null if the slug isn't valid. */
export function parseArticleSlugSuffix(slug: string): string | null {
  if (slug.length < ID_SUFFIX_LEN + 1) return null;
  const sep = slug[slug.length - ID_SUFFIX_LEN - 1];
  if (sep !== "-") return null;
  return slug.slice(-ID_SUFFIX_LEN);
}

/** Return the id-derived suffix used in slugs. */
export function idSuffix(id: string): string {
  return (id.slice(0, ID_SUFFIX_LEN) || "0000").padEnd(ID_SUFFIX_LEN, "0");
}

/** Find the article whose id starts with the given slug suffix. */
export function findArticleBySlugSuffix<T extends { id: string }>(articles: T[], suffix: string): T | null {
  if (!suffix) return null;
  return articles.find((a) => idSuffix(a.id) === suffix) ?? null;
}

// ── Editor intent (intent=publish 自动复制流)三兜底 ────────────────────────
//
// intent 不进 URL 路径(pathForRoute 的 editor 只生成 /a/<slug>),所以它只活在
// pushState 携带的 history.state 里。对一次正常 F5 刷新,浏览器会保留该 entry 的
// history.state,intent 还在;但若用户手敲/分享 /a/slug(history.state 为 null)、
// 或某些环境刷新后 state 丢失,intent 就没了,自动复制流不会恢复。为此把 intent
// 额外按 articleId 写一份到 sessionStorage,刷新后能从三处任一恢复:
//   ① 当前导航 params(最权威,刚 pushState 进来时有)
//   ② history.state.params.intent(同一 entry 刷新后浏览器保留)
//   ③ sessionStorage(key 绑 articleId,兜 ①② 都丢的场景)
// autoPublishedRef 守卫在 EditorSurface 内不变 —— 这里只负责把 intent 找回来,
// 「整个挂载只触发一次」仍由那颗 ref 保证,恢复后不会反复弹复制框。

const INTENT_STORAGE_PREFIX = "mbeditor.editor.intent.";

function intentStorageKey(articleId: string): string {
  return `${INTENT_STORAGE_PREFIX}${articleId}`;
}

/** Persist an editor intent so a reload of /a/slug can recover the auto-copy flow. */
export function persistEditorIntent(articleId: string, intent: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(intentStorageKey(articleId), intent);
  } catch {
    // sessionStorage may be unavailable (private mode / quota) — degrade silently.
  }
}

/** Read a previously persisted editor intent for this article, if any. */
export function readPersistedEditorIntent(articleId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage.getItem(intentStorageKey(articleId)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Drop the persisted intent once the auto-flow has consumed it, so re-entering
 * the same article later (via the list, no intent param) doesn't re-trigger the
 * auto-copy on a fresh mount.
 */
export function clearPersistedEditorIntent(articleId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(intentStorageKey(articleId));
  } catch {
    // ignore
  }
}

/** Read intent off the current history.state.params (survives same-entry reload). */
export function readIntentFromHistoryState(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  const params = (state as { params?: unknown }).params;
  if (!params || typeof params !== "object") return undefined;
  const intent = (params as { intent?: unknown }).intent;
  return typeof intent === "string" && intent ? intent : undefined;
}

/**
 * Resolve the effective editor intent for an article from the three fallbacks
 * (params → history.state → sessionStorage). Pure read — never mutates storage,
 * so it's safe to call inline during render. Persistence is a separate, one-shot
 * concern (see persistEditorIntent / clearPersistedEditorIntent) so resolving on
 * every re-render can't re-seed a stale intent after it's been consumed.
 * Returns undefined when no intent is in play.
 */
export function resolveEditorIntent(
  articleId: string | undefined,
  paramIntent: string | undefined,
): string | undefined {
  const liveParam = paramIntent && paramIntent.length > 0 ? paramIntent : undefined;
  if (!articleId) return liveParam;

  return liveParam ?? readIntentFromHistoryState() ?? readPersistedEditorIntent(articleId);
}
