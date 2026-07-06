import api from "@/lib/api";
import type { ImageHostEngine, UploadResult } from "./types";

export const defaultEngine: ImageHostEngine<Record<string, never>> = {
  id: "default",
  label: "公众号素材库",
  isConfigured: () => true,
  async upload(file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await api.post("/wechat/upload-image", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const body = res.data as { code?: number; message?: string; data?: { url: string } };
    if (typeof body.code === "number" && body.code !== 0) {
      throw new Error(body.message || "上传失败");
    }
    const url = body.data?.url;
    if (!url) throw new Error("上传失败：无返回地址");
    return { url };
  },
};
