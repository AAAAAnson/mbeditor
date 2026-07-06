import { describe, it, expect } from "vitest";
describe("@aws-sdk/client-s3 dep", () => {
  it("exports S3Client + PutObjectCommand", async () => {
    const mod = await import("@aws-sdk/client-s3");
    expect(mod.S3Client).toBeTypeOf("function");
    expect(mod.PutObjectCommand).toBeTypeOf("function");
  });
});
