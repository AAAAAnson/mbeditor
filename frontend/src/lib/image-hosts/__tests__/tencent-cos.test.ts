import { describe, it, expect } from "vitest";

describe("tencentCosEngine.isConfigured", () => {
  it("requires all fields", async () => {
    const { tencentCosEngine } = await import("../tencent-cos");
    expect(tencentCosEngine.isConfigured(undefined)).toBe(false);
    expect(tencentCosEngine.isConfigured({
      secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
    })).toBe(true);
  });
});

import { vi, beforeEach, afterEach } from "vitest";

const putObjectMock = vi.hoisted(() => vi.fn());
vi.mock("cos-js-sdk-v5", () => ({
  default: vi.fn(function COS() {
    return { putObject: (...a: unknown[]) => putObjectMock(...a) };
  }),
}));

describe("tencentCosEngine.upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
    putObjectMock.mockImplementation((_params, cb) => {
      cb(null, { Location: "b-1234.cos.ap-guangzhou.myqcloud.com/2026/04/x.png" });
    });
  });
  afterEach(() => { vi.useRealTimers(); putObjectMock.mockReset(); });

  it("calls putObject with Bucket/Region/Key and https Location", async () => {
    const { tencentCosEngine } = await import("../tencent-cos");
    const file = new File(["x"], "x.png", { type: "image/png" });
    const res = await tencentCosEngine.upload(file, {
      secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
    });
    const [params] = putObjectMock.mock.calls[0];
    expect(params.Bucket).toBe("b-1234");
    expect(params.Region).toBe("ap-guangzhou");
    expect(params.Key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
    expect(params.Body).toBe(file);
    expect(res.url).toBe("https://b-1234.cos.ap-guangzhou.myqcloud.com/2026/04/x.png");
  });

  it("prefers customDomain", async () => {
    const { tencentCosEngine } = await import("../tencent-cos");
    const file = new File(["x"], "x.png", { type: "image/png" });
    const res = await tencentCosEngine.upload(file, {
      secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
      customDomain: "https://cdn.example.com",
    });
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
  });

  it("rejects on SDK error", async () => {
    putObjectMock.mockImplementationOnce((_p, cb) => cb(new Error("denied"), null));
    const { tencentCosEngine } = await import("../tencent-cos");
    const file = new File(["x"], "x.png", { type: "image/png" });
    await expect(tencentCosEngine.upload(file, {
      secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
    })).rejects.toThrow(/denied/);
  });
});
