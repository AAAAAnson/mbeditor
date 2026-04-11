/**
 * Smoke test for the Vitest setup.
 *
 * Verifies vitest is running, the jsdom environment is active, and the
 * "@/..." path alias resolves via vite config. If this passes, every
 * layer of the test toolchain is wired correctly.
 */
import { describe, it, expect } from "vitest";

describe("vitest toolchain smoke", () => {
  it("runs under the jsdom environment", () => {
    // Under node env, `document` is undefined. Under jsdom, it's an object.
    expect(typeof document).toBe("object");
  });

  it("can import a module via the @ path alias", async () => {
    const mod = await import("@/utils/wordCount");
    expect(typeof mod.getWordCount).toBe("function");
  });
});
