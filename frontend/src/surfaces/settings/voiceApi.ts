import api from "@/lib/api";
import type { ApiResponse } from "@/types";

/** 音色要点。镜像后端 brand_voice_store.VoiceTraits。 */
export interface VoiceTraits {
  tone: string;
  signatures: string[];
  cadence: string;
  banned_words: string[];
}

/** 音色档案(单档案、无账号)。镜像后端 brand_voice_store.BrandVoice。 */
export interface BrandVoice {
  updated_at: string;
  source_excerpt: string;
  traits: VoiceTraits;
}

/**
 * 后端 GET /settings/voice 的真实返回:未学过音色时回 code:0 +
 * {configured:false, traits:null}(成功但空),学过则 traits 有值。traits 可空,
 * 故单独建模——直接套 BrandVoice(traits 非空)会让下游误信 traits 一定在。
 */
interface VoiceResponse {
  configured?: boolean;
  updated_at: string;
  source_excerpt: string;
  traits: VoiceTraits | null;
}

function unwrap<T>(payload: ApiResponse<T>): T {
  if (payload.code !== 0) {
    throw new Error(payload.message || "请求失败");
  }
  return payload.data;
}

/** 读音色档案;未学过 / 任何错误 -> null(展示空态,不报错)。 */
export async function getVoice(): Promise<BrandVoice | null> {
  try {
    const res = await api.get<ApiResponse<VoiceResponse>>("/settings/voice");
    const data = unwrap(res.data);
    // 成功但空(configured:false / traits:null)当作「无档案」——否则下游
    // voice.traits.tone 会解引用 null 把整页打黑屏。
    if (!data || data.traits == null) return null;
    return { updated_at: data.updated_at, source_excerpt: data.source_excerpt, traits: data.traits };
  } catch {
    return null;
  }
}

/** 贴旧文学一次:后端抽 traits 落盘,回新的 BrandVoice。失败抛出由调用方提示。 */
export async function learnVoice(voiceSample: string): Promise<BrandVoice> {
  const res = await api.put<ApiResponse<BrandVoice>>("/settings/voice", { voice_sample: voiceSample });
  return unwrap(res.data);
}

/** 清空音色档案(幂等)。 */
export async function clearVoice(): Promise<void> {
  await api.delete<ApiResponse<unknown>>("/settings/voice");
}
