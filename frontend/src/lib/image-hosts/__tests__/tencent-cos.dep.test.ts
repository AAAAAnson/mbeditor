import { describe, it, expect } from "vitest";
describe("cos-js-sdk-v5 dep", () => {
  it("is installed", async () => {
    const mod = await import("cos-js-sdk-v5");
    expect(mod.default).toBeTypeOf("function");
  });
});
