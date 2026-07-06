import { describe, it, expect } from "vitest";

describe("cloudflareR2Engine.isConfigured", () => {
  it("requires all five fields", async () => {
    const { cloudflareR2Engine } = await import("../cloudflare-r2");
    expect(cloudflareR2Engine.isConfigured(undefined)).toBe(false);
    expect(cloudflareR2Engine.isConfigured({
      accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b", publicDomain: "https://cdn.x",
    })).toBe(true);
  });
});

import { vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function S3Client(opts) {
    return { __opts: opts, send: (...a: unknown[]) => sendMock(...a) };
  }),
  PutObjectCommand: vi.fn(function PutObjectCommand(input) {
    return { __input: input };
  }),
}));

describe("cloudflareR2Engine.upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
    sendMock.mockResolvedValue({});
  });
  afterEach(() => { vi.useRealTimers(); sendMock.mockReset(); });

  it("configures S3Client with R2 endpoint and sends PutObjectCommand", async () => {
    const s3 = await import("@aws-sdk/client-s3");
    const { cloudflareR2Engine } = await import("../cloudflare-r2");
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const res = await cloudflareR2Engine.upload(file, {
      accountId: "acc", accessKeyId: "k", secretAccessKey: "s", bucket: "b",
      publicDomain: "https://cdn.example.com",
    });
    const s3Opts = (s3.S3Client as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as any;
    expect(s3Opts.region).toBe("auto");
    expect(s3Opts.endpoint).toBe("https://acc.r2.cloudflarestorage.com");
    expect(s3Opts.credentials.accessKeyId).toBe("k");
    const cmdInput = (s3.PutObjectCommand as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as any;
    expect(cmdInput.Bucket).toBe("b");
    expect(cmdInput.Key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
    expect(cmdInput.ContentType).toBe("image/png");
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
  });
});
