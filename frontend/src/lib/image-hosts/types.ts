export type ImageHostId = "default" | "github" | "aliyun" | "tencent-cos" | "cloudflare-r2";

export interface UploadResult {
  url: string;
  pathname?: string;
}

export interface ImageHostEngine<Config = unknown> {
  id: ImageHostId;
  label: string;
  isConfigured: (config: Config | undefined) => boolean;
  upload: (file: File, config: Config) => Promise<UploadResult>;
}

export interface GithubConfig {
  repo: string;
  branch: string;
  accessToken: string;
  useCDN: boolean;
}

export interface AliyunConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  customDomain?: string;
}

export interface TencentCosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  customDomain?: string;
}

export interface CloudflareR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicDomain: string;
}

export interface ImageHostConfigs {
  default?: Record<string, never>;
  github?: GithubConfig;
  aliyun?: AliyunConfig;
  "tencent-cos"?: TencentCosConfig;
  "cloudflare-r2"?: CloudflareR2Config;
}
