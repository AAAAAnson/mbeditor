import { useImageHostStore } from "@/stores/imageHostStore";
import { getEngine } from "./registry";
import type { ImageHostEngine, UploadResult } from "./types";

export function getActiveEngine(): ImageHostEngine<any> {
  const { activeHostId } = useImageHostStore.getState();
  return getEngine(activeHostId);
}

export async function uploadWithActive(file: File): Promise<UploadResult> {
  const engine = getActiveEngine();
  const config = useImageHostStore.getState().configs[engine.id];
  if (!engine.isConfigured(config as any)) {
    throw new Error(`图床未配置: ${engine.label}`);
  }
  return engine.upload(file, config);
}
