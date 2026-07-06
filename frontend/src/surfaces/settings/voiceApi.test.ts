import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from "@/lib/api";
import { getVoice, learnVoice, clearVoice } from "./voiceApi";

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = api.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = api.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("voiceApi", () => {
  it("getVoice unwraps a stored BrandVoice", async () => {
    mockGet.mockResolvedValue({
      data: {
        code: 0, message: "ok",
        data: { updated_at: "2026-06-15T10:00:00Z", source_excerpt: "上周末带娃…", traits: { tone: "温柔治愈", signatures: ["晚安"], cadence: "短句多", banned_words: ["最"] } },
      },
    });
    const voice = await getVoice();
    expect(api.get).toHaveBeenCalledWith("/settings/voice");
    expect(voice?.traits.tone).toBe("温柔治愈");
    expect(voice?.traits.signatures).toEqual(["晚安"]);
  });

  it("getVoice returns null when no profile (any error)", async () => {
    mockGet.mockRejectedValue(new Error("404"));
    expect(await getVoice()).toBeNull();
  });

  it("getVoice returns null on the success-but-empty envelope (configured:false / traits:null)", async () => {
    // 后端未学过音色时回 code:0 + {configured:false, traits:null}(真实 prod 返回)。
    // 旧实现只看 code===0 原样返回这个 truthy 对象 → 下游 voice.traits.tone 解引用 null
    // 黑屏。getVoice 必须把它当「无档案」映射成 null。
    mockGet.mockResolvedValue({
      data: {
        code: 0,
        message: "success",
        data: { configured: false, traits: null, updated_at: "", source_excerpt: "" },
      },
    });
    expect(await getVoice()).toBeNull();
  });

  it("learnVoice posts voice_sample and unwraps the learned BrandVoice", async () => {
    mockPut.mockResolvedValue({
      data: { code: 0, message: "ok", data: { updated_at: "x", source_excerpt: "片段", traits: { tone: "干货利落", signatures: [], cadence: "", banned_words: [] } } },
    });
    const voice = await learnVoice("贴的旧文全文");
    expect(api.put).toHaveBeenCalledWith("/settings/voice", { voice_sample: "贴的旧文全文" });
    expect(voice.traits.tone).toBe("干货利落");
  });

  it("clearVoice calls DELETE", async () => {
    mockDelete.mockResolvedValue({ data: { code: 0, message: "ok", data: null } });
    await clearVoice();
    expect(api.delete).toHaveBeenCalledWith("/settings/voice");
  });
});
