import api from "@/lib/api";
import { writeHtmlToClipboard } from "@/hooks/useClipboard";
import { saveArticle } from "@/features/editor/api/articleApi";
import {
  publishProjectedArticleAsMBDoc,
  renderProjectedArticleAsMBDoc,
} from "@/features/editor/api/mbdocApi";
import { previewWechatHtml } from "@/features/editor/api/publishApi";
import type { Article, ApiResponse } from "@/types";
import type {
  ArticleUpdatePayload,
  PublishMetadataDraft,
} from "@/features/editor/types";

type ArticleMetadataOverrides = Partial<
  Pick<Article, "title" | "mode" | "cover" | "author" | "digest">
>;

interface CopyResponse {
  html: string;
}

interface ConfigResponse {
  appid?: string;
  appsecret?: string;
  configured?: boolean;
  account_name?: string;
}

interface TestConfigResponse {
  valid?: boolean;
  account_name?: string;
}

export interface WechatConfigInput {
  appid: string;
  appsecret: string;
}

export interface WechatConfigState extends WechatConfigInput {
  configured: boolean;
  accountName: string;
}

export interface CopyArticleResult {
  kind: "success" | "warn" | "error";
  copied: boolean;
  message: string;
  html: string;
  stage: "upload" | "fallback";
}

export interface PublishArticleOptions {
  articleId: string;
  sourceArticle?: Article;
  publishAsMBDoc?: boolean;
  metadata?: ArticleMetadataOverrides;
  config?: WechatConfigInput;
  persistConfig?: boolean;
  timeoutMs?: number;
}

export interface PublishArticleResult {
  message: string;
}

function isWechatConfigMissingMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("wechat appid/appsecret not configured") ||
    normalized.includes("appid/appsecret not configured") ||
    normalized.includes("not configured")
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError.response?.data?.message || fallback;
}

export function buildArticleUpdatePayload(
  article: Article,
  overrides: ArticleMetadataOverrides = {},
): ArticleUpdatePayload {
  return {
    html: article.html,
    css: article.css,
    js: article.js || "",
    markdown: article.markdown,
    title: overrides.title ?? article.title,
    mode: overrides.mode ?? article.mode,
    cover: overrides.cover ?? article.cover,
    author: overrides.author ?? article.author,
    digest: overrides.digest ?? article.digest,
  };
}

export function buildHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${bodyHtml}</body></html>`;
}

async function resolvePreviewHtml(
  article: Pick<Article, "html" | "css">,
  fallbackHtml?: string,
): Promise<string> {
  if (fallbackHtml) {
    return fallbackHtml;
  }
  try {
    return await previewWechatHtml(article.html, article.css);
  } catch {
    return article.html;
  }
}

function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyArticleRichText(
  article: Pick<Article, "html" | "css">,
  processedHtml?: string,
): Promise<CopyArticleResult> {
  try {
    const response = await api.post<ApiResponse<CopyResponse>>(
      "/publish/process-for-copy",
      {
        html: article.html,
        css: article.css,
      },
    );

    if (response.data.code === 0) {
      const html = response.data.data.html;
      const copied = await writeHtmlToClipboard(html);
      return copied
        ? {
            kind: "success",
            copied: true,
            message: "已复制，图片已上传到微信 CDN。",
            html,
            stage: "upload",
          }
        : {
            kind: "error",
            copied: false,
            message: "复制失败。",
            html,
            stage: "upload",
          };
    }

    if (response.data.code === 400) {
      const html = await resolvePreviewHtml(article, processedHtml);
      const copied = await writeHtmlToClipboard(html);
      return copied
        ? {
            kind: "warn",
            copied: true,
            message: "已复制，但微信配置缺失，图片可能无法显示。",
            html,
            stage: "fallback",
          }
        : {
            kind: "error",
            copied: false,
            message: "复制失败。",
            html,
            stage: "fallback",
          };
    }

    return {
      kind: "error",
      copied: false,
      message: response.data.message || "复制失败。",
      html: article.html,
      stage: "upload",
    };
  } catch {
    const html = await resolvePreviewHtml(article, processedHtml);
    const copied = await writeHtmlToClipboard(html);
    return copied
      ? {
          kind: "warn",
          copied: true,
          message: "已复制，图片上传失败，已回退为本地 HTML。",
          html,
          stage: "fallback",
        }
      : {
          kind: "error",
          copied: false,
          message: "复制失败。",
          html,
          stage: "fallback",
        };
  }
}

export async function copyProjectedArticleRichText(
  article: Pick<
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
  fallbackHtml?: string,
): Promise<CopyArticleResult> {
  try {
    const html = await renderProjectedArticleAsMBDoc(article, true);
    const copied = await writeHtmlToClipboard(html);
    return copied
      ? {
          kind: "success",
          copied: true,
          message: "已复制，Bridge MBDoc 渲染结果已完成图片上传。",
          html,
          stage: "upload",
        }
      : {
          kind: "error",
          copied: false,
          message: "复制失败。",
          html,
          stage: "upload",
        };
  } catch (error: unknown) {
    const html = fallbackHtml ?? article.html;
    const copied = await writeHtmlToClipboard(html);
    const errorMessage = getErrorMessage(error, "");
    const fallbackMessage = isWechatConfigMissingMessage(errorMessage)
      ? "已复制，但未配置微信公众号，Bridge MBDoc 已回退到本地 HTML。"
      : "已复制，但 Bridge MBDoc 上传失败，已回退到本地 HTML。";

    return copied
      ? {
          kind: "warn",
          copied: true,
          message: fallbackMessage,
          html,
          stage: "fallback",
        }
      : {
          kind: "error",
          copied: false,
          message: "复制失败。",
          html,
          stage: "fallback",
        };
  }
}

export async function exportArticleHtml(
  article: Pick<Article, "title" | "html" | "css">,
  processedHtml?: string,
): Promise<void> {
  const bodyHtml = await resolvePreviewHtml(article, processedHtml);
  downloadHtml(
    `${article.title || "article"}.html`,
    buildHtmlDocument(article.title, bodyHtml),
  );
}

export async function saveArticleDraft(
  article: Article,
  metadata: ArticleMetadataOverrides = {},
): Promise<void> {
  await saveArticle(article.id, buildArticleUpdatePayload(article, metadata));
}

export async function publishArticleDraft({
  articleId,
  sourceArticle,
  publishAsMBDoc = false,
  metadata = {},
  config,
  persistConfig = false,
  timeoutMs = 300000,
}: PublishArticleOptions): Promise<PublishArticleResult> {
  if (persistConfig && config) {
    await saveWechatConfig(config);
  }

  if (sourceArticle) {
    await saveArticleDraft(sourceArticle, metadata);
  }

  if (publishAsMBDoc && sourceArticle) {
    const projectedArticle = {
      ...sourceArticle,
      title: metadata.title ?? sourceArticle.title,
      mode: metadata.mode ?? sourceArticle.mode,
      cover: metadata.cover ?? sourceArticle.cover,
      author: metadata.author ?? sourceArticle.author,
      digest: metadata.digest ?? sourceArticle.digest,
    };
    const data = await publishProjectedArticleAsMBDoc(projectedArticle, timeoutMs);
    return {
      message: data.media_id
        ? `文章已推送到微信草稿箱。media_id=${data.media_id}`
        : "文章已推送到微信草稿箱。",
    };
  }

  const response = await api.post<ApiResponse<unknown>>(
    "/publish/draft",
    { article_id: articleId },
    { timeout: timeoutMs },
  );

  if (response.data.code !== 0) {
    throw new Error(response.data.message || "推送失败。");
  }

  return {
    message: response.data.message || "文章已推送到微信草稿箱。",
  };
}

export async function loadWechatConfig(): Promise<WechatConfigState> {
  const response = await api.get<ApiResponse<ConfigResponse>>("/config");
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "加载微信配置失败。");
  }
  const data = response.data.data;
  return {
    appid: data.appid || "",
    appsecret: data.appsecret || "",
    configured: Boolean(data.configured ?? (data.appid && data.appsecret)),
    accountName: data.account_name || "",
  };
}

export async function saveWechatConfig(config: WechatConfigInput): Promise<void> {
  const response = await api.put<ApiResponse<unknown>>("/config", config);
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "保存微信配置失败。");
  }
}

export async function testWechatConfig(
  config: WechatConfigInput,
): Promise<WechatConfigState> {
  const response = await api.post<ApiResponse<TestConfigResponse>>(
    "/config/test",
    config,
  );
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "微信连接测试失败。");
  }
  const data = response.data.data;
  return {
    appid: config.appid,
    appsecret: config.appsecret,
    configured: true,
    accountName: data.account_name || "已配置公众号",
  };
}

export { getErrorMessage };
export type { ArticleMetadataOverrides, PublishMetadataDraft };
