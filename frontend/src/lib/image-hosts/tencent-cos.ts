import COS from "cos-js-sdk-v5";
import type { ImageHostEngine, TencentCosConfig, UploadResult } from "./types";
import { buildObjectKey } from "./filename";

export const tencentCosEngine: ImageHostEngine<TencentCosConfig> = {
  id: "tencent-cos",
  label: "腾讯云 COS",
  isConfigured: (c) => Boolean(c && c.secretId && c.secretKey && c.bucket && c.region),
  async upload(file: File, config: TencentCosConfig): Promise<UploadResult> {
    const key = buildObjectKey(file);
    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    const location = await new Promise<string>((resolve, reject) => {
      cos.putObject(
        {
          Bucket: config.bucket,
          Region: config.region,
          Key: key,
          Body: file,
        },
        (err, data) => {
          if (err) return reject(err);
          resolve(data.Location);
        }
      );
    });
    const url = config.customDomain
      ? `${config.customDomain.replace(/\/+$/, "")}/${key}`
      : `https://${location}`;
    return { url, pathname: key };
  },
};
