import type { ImageHostEngine, ImageHostId } from "./types";
import { defaultEngine } from "./default";
import { githubEngine } from "./github";
import { aliyunEngine } from "./aliyun";
import { tencentCosEngine } from "./tencent-cos";
import { cloudflareR2Engine } from "./cloudflare-r2";

const ENGINES: Record<ImageHostId, ImageHostEngine<any>> = {
  default: defaultEngine,
  github: githubEngine,
  aliyun: aliyunEngine,
  "tencent-cos": tencentCosEngine,
  "cloudflare-r2": cloudflareR2Engine,
};

const ORDER: ImageHostId[] = ["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"];

export function listEngines(): ImageHostEngine<any>[] {
  return ORDER.map((id) => ENGINES[id]);
}

export function getEngine(id: ImageHostId): ImageHostEngine<any> {
  const engine = ENGINES[id];
  if (!engine) throw new Error(`unknown image host: ${id}`);
  return engine;
}
