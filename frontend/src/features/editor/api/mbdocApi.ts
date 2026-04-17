import api from "@/lib/api";
import type { ApiResponse } from "@/types";
import type { MBDocSnapshot } from "@/features/editor/types";
import type { Article } from "@/types";


export async function projectArticleToMBDoc(
  articleId: string,
  persist = false,
): Promise<MBDocSnapshot> {
  const response = await api.post<ApiResponse<MBDocSnapshot>>(
    `/mbdoc/project/article/${articleId}?persist=${String(persist)}`,
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "投影文章到 MBDoc 失败。");
  }
  return response.data.data;
}


export async function renderProjectedArticleAsMBDoc(
  sourceArticle: Pick<
    Article,
    | "id"
    | "title"
    | "mode"
    | "html"
    | "css"
    | "js"
    | "markdown"
    | "cover"
    | "author"
    | "digest"
    | "created_at"
    | "updated_at"
  >,
  uploadImages = false,
): Promise<string> {
  const response = await api.post<ApiResponse<{ html: string }>>(
    `/mbdoc/project/render?upload_images=${String(uploadImages)}`,
    sourceArticle,
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "Bridge MBDoc 渲染失败。");
  }
  return response.data.data.html;
}


export async function publishProjectedArticleAsMBDoc(
  sourceArticle: Pick<
    Article,
    | "id"
    | "title"
    | "mode"
    | "html"
    | "css"
    | "js"
    | "markdown"
    | "cover"
    | "author"
    | "digest"
    | "created_at"
    | "updated_at"
  >,
  timeoutMs = 300000,
): Promise<{ media_id?: string }> {
  const response = await api.post<ApiResponse<{ media_id?: string }>>(
    "/mbdoc/project/publish",
    sourceArticle,
    { timeout: timeoutMs },
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "Bridge MBDoc 发布失败。");
  }
  return response.data.data;
}
