import api from "@/lib/api";
import type { Effect, RenderEffectPayload, RenderEffectResult } from "./types";

/**
 * 拉取所有交互效果元数据 + 槽 schema。
 * 后端统一响应包装 { code, message, data }，所以 payload 在 resp.data.data。
 * baseURL 已是 /api/v1，路径写 /agent/effects 即可。
 */
export async function fetchEffects(): Promise<Effect[]> {
  const resp = await api.get("/agent/effects");
  return resp.data.data.effects as Effect[];
}

/**
 * 按 id 填槽渲染，返回已过 svg_validator 校验的 SVG html 片段。
 * 任何缺失的槽由后端用 schema default 填充；多余槽名后端忽略。
 */
export async function renderEffect(
  id: string,
  payload: RenderEffectPayload,
): Promise<RenderEffectResult> {
  const resp = await api.post(`/agent/effects/${id}/render`, payload);
  return resp.data.data as RenderEffectResult;
}
