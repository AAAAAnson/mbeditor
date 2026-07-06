import api from "@/lib/api";
import type { ApiResponse } from "@/types";

/** Provider 字面量,逐字对齐后端 ModelSpec.provider / settings.LLM_PROVIDER。 */
export type LlmProvider = "openai_compat" | "anthropic";

/** GET /settings/llm 的 redacted 视图(永不含 api_key)。镜像后端 provider_store.redacted()。 */
export interface LlmRedacted {
  provider: LlmProvider | string;
  base_url: string;
  model: string;
  keyConfigured: boolean;
  source: "stored" | "env" | string;
}

/** PUT /settings/llm body。所有字段可选:缺字段=保持不变;api_key="" =清除。 */
export interface LlmConfigPatch {
  provider?: LlmProvider;
  base_url?: string;
  model?: string;
  api_key?: string;
}

/** POST /settings/llm/test 结果。code 是加法字段(H4 真测通):失败时归因,
 *  quota=余额不足 / auth=密钥无效 / network=连不上 / other=其它;成功不带。 */
export interface LlmTestResult {
  ok: boolean;
  detail: string;
  code?: "quota" | "auth" | "network" | "other";
}

function unwrap<T>(payload: ApiResponse<T>): T {
  if (payload.code !== 0) {
    throw new Error(payload.message || "请求失败");
  }
  return payload.data;
}

/** 读 BYOK 配置(redacted)。 */
export async function getLlmConfig(): Promise<LlmRedacted> {
  const res = await api.get<ApiResponse<LlmRedacted>>("/settings/llm");
  return unwrap(res.data);
}

/** 写 BYOK 配置;只发实际填了的字段。返回新的 redacted 视图。 */
export async function putLlmConfig(patch: LlmConfigPatch): Promise<LlmRedacted> {
  const res = await api.put<ApiResponse<LlmRedacted>>("/settings/llm", patch);
  return unwrap(res.data);
}

/** 探活:用「请求带 > 存储 > env」解析出的 spec 试连。 */
export async function testLlmConnection(patch: LlmConfigPatch): Promise<LlmTestResult> {
  const res = await api.post<ApiResponse<LlmTestResult>>("/settings/llm/test", patch);
  return unwrap(res.data);
}
