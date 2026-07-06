import { describe, it, expect } from "vitest";
describe("ali-oss dep", () => {
  it("is installed", async () => {
    const mod = await import("ali-oss");
    expect(mod.default).toBeTypeOf("function");
  });
});
