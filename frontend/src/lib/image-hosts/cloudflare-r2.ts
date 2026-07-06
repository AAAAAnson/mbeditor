import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CloudflareR2Config, ImageHostEngine, UploadResult } from "./types";
import { buildObjectKey } from "./filename";

export const cloudflareR2Engine: ImageHostEngine<CloudflareR2Config> = {
  id: "cloudflare-r2",
  label: "Cloudflare R2",
  isConfigured: (c) =>
    Boolean(c && c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicDomain),
  async upload(file: File, config: CloudflareR2Config): Promise<UploadResult> {
    const key = buildObjectKey(file);
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    const body = new Uint8Array(await file.arrayBuffer());
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: file.type || "application/octet-stream",
      })
    );
    const url = `${config.publicDomain.replace(/\/+$/, "")}/${key}`;
    return { url, pathname: key };
  },
};
