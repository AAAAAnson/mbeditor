import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

import api from "@/lib/api";
import { getLlmConfig, putLlmConfig, testLlmConnection } from "./llmApi";

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = api.put as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("llmApi", () => {
  it("getLlmConfig unwraps redacted view", async () => {
    mockGet.mockResolvedValue({
      data: {
        code: 0,
        message: "ok",
        data: { provider: "openai_compat", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", keyConfigured: true, source: "stored" },
      },
    });
    const cfg = await getLlmConfig();
    expect(api.get).toHaveBeenCalledWith("/settings/llm");
    expect(cfg).toEqual({
      provider: "openai_compat",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      keyConfigured: true,
      source: "stored",
    });
  });

  it("putLlmConfig posts only provided fields and unwraps redacted view", async () => {
    mockPut.mockResolvedValue({
      data: { code: 0, message: "ok", data: { provider: "anthropic", base_url: "", model: "claude-opus-4-8", keyConfigured: true, source: "stored" } },
    });
    const cfg = await putLlmConfig({ provider: "anthropic", model: "claude-opus-4-8", api_key: "sk-x" });
    expect(api.put).toHaveBeenCalledWith("/settings/llm", { provider: "anthropic", model: "claude-opus-4-8", api_key: "sk-x" });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.keyConfigured).toBe(true);
  });

  it("testLlmConnection returns ok/detail", async () => {
    mockPost.mockResolvedValue({ data: { code: 0, message: "ok", data: { ok: true, detail: "deepseek-chat 可用" } } });
    const res = await testLlmConnection({ base_url: "https://api.deepseek.com/v1" });
    expect(api.post).toHaveBeenCalledWith("/settings/llm/test", { base_url: "https://api.deepseek.com/v1" });
    expect(res).toEqual({ ok: true, detail: "deepseek-chat 可用" });
  });
});
