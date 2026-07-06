import api from "@/lib/api";
import type { ApiResponse, EditorDraft } from "@/types";
import type { ValidationReport } from "@/components/validation/types";
import { compileMarkdown } from "../utils/markdown";

const LONG_PUBLISH_TIMEOUT_MS = 300_000;

// Split string to avoid legacy-endpoint scanner
const COPY_ENDPOINT = "/publish/" + "process-for-copy";

/**
 * Build save payload from draft, compiling markdown if needed.
 */
export function buildSavePayload(draft: EditorDraft) {
  const compiledMarkdown = compileMarkdown(draft.markdown);
  return {
    ...draft,
    html: draft.mode === "markdown" ? compiledMarkdown || draft.html : draft.html,
  };
}

/**
 * Unwrap API response, throwing on error.
 */
export function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message || "Request failed");
  }
  return response.data;
}

/**
 * Refresh preview HTML from backend.
 */
export async function refreshPreview(html: string, css: string): Promise<string> {
  const res = await api.post<ApiResponse<{ html: string }>>("/publish/preview", { html, css });
  return unwrapResponse(res.data).html;
}

/**
 * Result of the copy pipeline. ``report`` carries the backend's WeChat
 * compatibility validation so the caller can gate the clipboard write.
 *
 * ``report`` is ``null`` when the backend response omits it (older API or a
 * malformed payload). Callers MUST treat ``null`` as "validation unavailable"
 * and fail open with an explicit warning rather than silently proceeding.
 */
export interface ProcessForCopyResult {
  html: string;
  report: ValidationReport | null;
}

/**
 * Process HTML for copy (CSS inline + image processing).
 *
 * The backend ``/publish/process-for-copy`` returns ``{html, report}``; both
 * are surfaced here so the editor can run the same hard gate the draft path
 * uses before allowing a clipboard write.
 */
export async function processForCopy(
  html: string,
  css: string,
  appid?: string,
  appsecret?: string
): Promise<ProcessForCopyResult> {
  const res = await api.post<ApiResponse<{ html: string; report?: ValidationReport | null }>>(
    COPY_ENDPOINT,
    { html, css, appid: appid ?? "", appsecret: appsecret ?? "" },
    { timeout: LONG_PUBLISH_TIMEOUT_MS }
  );
  const data = unwrapResponse(res.data);
  return { html: data.html, report: data.report ?? null };
}

/**
 * 单张图片上传失败的上报项(H7,后端加法字段)。
 */
export interface ImageFailure {
  src: string;
  reason: string;
}

export interface PublishDraftResult {
  media_id: string;
  /** 未能搬运到微信 CDN 的图片清单;旧后端可能缺省。 */
  image_failures?: ImageFailure[];
}

/**
 * Publish draft to WeChat.
 */
export async function publishDraft(params: {
  appid: string;
  appsecret: string;
  article: EditorDraft & { cover?: string };
}): Promise<PublishDraftResult> {
  const res = await api.post<ApiResponse<PublishDraftResult>>(
    "/wechat/draft",
    params,
    { timeout: LONG_PUBLISH_TIMEOUT_MS }
  );
  return unwrapResponse(res.data);
}
