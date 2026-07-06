// 文章快照 API 封装(/api/v1/revisions,批4 C2 AI 改稿接 revisions)。
// 统一解 success 信封 {code, message, data};code!=0 抛 RevisionsApiError。
// useAgentChat 里的内联实现(listRevisions/restoreCheckpoint)是契约红线,不动;
// 本 lib 供新代码(块级 adopt 快照 / RevisionHistory / 整篇 rewrite 快照)复用。
import api from "@/lib/api";

export class RevisionsApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "RevisionsApiError";
    this.code = code;
  }
}

/** 快照元数据(GET 列表项,不含 html)。 */
export interface RevisionMeta {
  rev_id: string;
  ts?: string | number;
  reason?: string;
  [key: string]: unknown;
}

/** 完整快照(含 html)。 */
export interface RevisionFull extends RevisionMeta {
  html: string;
}

interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

function unwrap<T>(payload: Envelope<T> | undefined, fallbackMsg: string): T {
  const env = payload ?? {};
  if (typeof env.code !== "number") {
    throw new RevisionsApiError(fallbackMsg, -1);
  }
  if (env.code !== 0) {
    throw new RevisionsApiError(
      env.message && typeof env.message === "string" ? env.message : fallbackMsg,
      env.code,
    );
  }
  return env.data as T;
}

/** 列出某篇文章的快照元数据(新的在前)。 */
export async function listRevisions(articleId: string): Promise<RevisionMeta[]> {
  const res = await api.get(`/revisions/${encodeURIComponent(articleId)}`);
  const data = unwrap<{ revisions?: RevisionMeta[] }>(res?.data, "历史版本读取失败,请稍后重试");
  return Array.isArray(data?.revisions) ? data.revisions : [];
}

/** 取一份完整快照(含 html)。 */
export async function getRevision(articleId: string, revId: string): Promise<RevisionFull> {
  const res = await api.get(
    `/revisions/${encodeURIComponent(articleId)}/${encodeURIComponent(revId)}`,
  );
  const data = unwrap<RevisionFull>(res?.data, "快照读取失败,请稍后重试");
  if (!data || typeof data.html !== "string") {
    throw new RevisionsApiError("快照读取失败,请稍后重试", -1);
  }
  return data;
}

/** 落一份快照,返回 rev_id。 */
export async function postRevision(
  articleId: string,
  html: string,
  reason: string,
): Promise<string> {
  const res = await api.post(`/revisions/${encodeURIComponent(articleId)}`, { html, reason });
  const data = unwrap<{ rev_id?: unknown }>(res?.data, "快照保存失败,请稍后重试");
  if (!data || typeof data.rev_id !== "string") {
    throw new RevisionsApiError("快照保存失败,请稍后重试", -1);
  }
  return data.rev_id;
}
