import api from "@/lib/api";
import type { ApiResponse } from "@/types";

interface PreviewResponse {
  html: string;
}

export async function previewWechatHtml(html: string, css: string): Promise<string> {
  const response = await api.post<ApiResponse<PreviewResponse>>("/publish/preview", { html, css });
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "Failed to preview article");
  }
  return response.data.data.html;
}
