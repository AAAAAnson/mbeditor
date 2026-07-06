import { describe, it, expect } from "vitest";
import type { ImageHostEngine, ImageHostId, UploadResult } from "../types";

describe("image-host types", () => {
  it("exposes the five engine ids", () => {
    const ids: ImageHostId[] = ["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"];
    expect(ids).toHaveLength(5);
  });

  it("engine interface is structurally typed", () => {
    const fake: ImageHostEngine<{ token: string }> = {
      id: "github",
      label: "GitHub",
      isConfigured: (c) => Boolean(c?.token),
      upload: async () => ({ url: "https://x" } satisfies UploadResult),
    };
    expect(fake.isConfigured({ token: "t" })).toBe(true);
  });
});
