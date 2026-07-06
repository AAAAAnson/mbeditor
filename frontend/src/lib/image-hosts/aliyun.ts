import OSS from "ali-oss";
import type { AliyunConfig, ImageHostEngine, UploadResult } from "./types";
import { buildObjectKey } from "./filename";

export const aliyunEngine: ImageHostEngine<AliyunConfig> = {
  id: "aliyun",
  label: "阿里云 OSS",
  isConfigured: (c) => Boolean(c && c.accessKeyId && c.accessKeySecret && c.bucket && c.region),
  async upload(file: File, config: AliyunConfig): Promise<UploadResult> {
    const key = buildObjectKey(file);
    const client = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      secure: true,
    });
    const res = await client.put(key, file);
    const resolvedUrl = config.customDomain
      ? `${config.customDomain.replace(/\/+$/, "")}/${key}`
      : (res as { url: string }).url;
    return { url: resolvedUrl, pathname: key };
  },
};
