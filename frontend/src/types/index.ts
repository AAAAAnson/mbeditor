export type Route = "list" | "editor" | "agent" | "settings";
export type ArticleMode = "html" | "markdown";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** Lightweight article summary returned by GET /api/v1/articles */
export interface ArticleSummary {
  id: string;
  title: string;
  mode: ArticleMode;
  cover: string;
  created_at: string;
  updated_at: string;
}

/** Full article returned by GET /api/v1/articles/{id} */
export interface ArticleFull extends ArticleSummary {
  html: string;
  css: string;
  js: string;
  markdown: string;
  author: string;
  digest: string;
}

export type EditorDraft = Pick<
  ArticleFull,
  "title" | "mode" | "html" | "css" | "js" | "markdown" | "author" | "digest"
>;

export type EditorField = keyof EditorDraft;

/**
 * UI-facing article type used by components.
 * Includes both API fields (optional, populated after fetch) and
 * display-only fields used by mock data.
 */
export interface Article {
  id: string;
  title: string;
  mode: ArticleMode;
  cover: string;
  author: string;
  /** API timestamp fields */
  created_at?: string;
  updated_at?: string;
  /** Content fields (populated after fetching full article) */
  html?: string;
  css?: string;
  js?: string;
  markdown?: string;
  digest?: string;
  /** UI display fields (used by mock data) */
  status: string;
  updated: string;
  words: number;
  stamp: string;
}

export interface AgentMessage {
  id?: string;
  t: string;
  kind: "user" | "assistant" | "think" | "tool" | "diff";
  text?: string;
  method?: string;
  path?: string;
  add?: number;
  remove?: number;
  hint?: string;
}

export interface Mission {
  id: string;
  article: string;
  status: "running" | "success" | "waiting" | "failed";
  step: string;
  pct: number;
  agent: string;
  started: string;
  tools: number;
}

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}
