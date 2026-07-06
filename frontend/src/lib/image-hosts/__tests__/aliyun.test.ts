import { describe, it, expect } from "vitest";

describe("aliyunEngine.isConfigured", () => {
  it("requires all fields", async () => {
    const { aliyunEngine } = await import("../aliyun");
    expect(aliyunEngine.isConfigured(undefined)).toBe(false);
    expect(aliyunEngine.isConfigured({
      accessKeyId: "", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
    })).toBe(false);
    expect(aliyunEngine.isConfigured({
      accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
    })).toBe(true);
  });
});

import { vi, beforeEach, afterEach } from "vitest";

const putMock = vi.hoisted(() => vi.fn());
vi.mock("ali-oss", () => ({
  default: vi.fn(function OSS() {
    return { put: (...a: unknown[]) => putMock(...a) };
  }),
}));

describe("aliyunEngine.upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
    putMock.mockResolvedValue({ url: "https://b.oss-cn-hangzhou.aliyuncs.com/2026/04/x.png", name: "2026/04/x.png" });
  });
  afterEach(() => { vi.useRealTimers(); putMock.mockReset(); });

  it("calls client.put(key, file) and returns url", async () => {
    const { aliyunEngine } = await import("../aliyun");
    const file = new File(["x"], "x.png", { type: "image/png" });
    const res = await aliyunEngine.upload(file, {
      accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
    });
    const [key, arg] = putMock.mock.calls[0];
    expect(key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
    expect(arg).toBe(file);
    expect(res.url).toBe("https://b.oss-cn-hangzhou.aliyuncs.com/2026/04/x.png");
  });

  it("prefers customDomain when provided", async () => {
    const { aliyunEngine } = await import("../aliyun");
    const file = new File(["x"], "x.png", { type: "image/png" });
    const res = await aliyunEngine.upload(file, {
      accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
      customDomain: "https://cdn.example.com",
    });
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
  });
});
