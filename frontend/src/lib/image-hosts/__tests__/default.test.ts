import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const postMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post: (...a: unknown[]) => postMock(...a) } }));

describe("default (WeChat) engine", () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    vi.resetModules();
    postMock.mockResolvedValue({ data: { code: 0, data: { url: "https://mmbiz.qpic.cn/x.png" } } });
  });

  it("isConfigured always true (server-side auth)", async () => {
    const { defaultEngine } = await import("../default");
    expect(defaultEngine.isConfigured({})).toBe(true);
  });

  it("POSTs multipart to /wechat/upload-image and returns url", async () => {
    const { defaultEngine } = await import("../default");
    const file = new File(["x"], "a.png", { type: "image/png" });
    const res = await defaultEngine.upload(file, {});
    expect(postMock).toHaveBeenCalledWith(
      "/wechat/upload-image",
      expect.any(FormData),
      expect.objectContaining({ headers: { "Content-Type": "multipart/form-data" } })
    );
    expect(res.url).toBe("https://mmbiz.qpic.cn/x.png");
  });

  it("throws when envelope code !== 0", async () => {
    postMock.mockResolvedValueOnce({ data: { code: 40001, message: "invalid token" } });
    const { defaultEngine } = await import("../default");
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(defaultEngine.upload(file, {})).rejects.toThrow(/invalid token/);
  });
});
