import { describe, it, expect } from "vitest";

describe("test-setup matchMedia polyfill", () => {
  it("window.matchMedia 存在且默认 matches:false(桌面态)", () => {
    expect(typeof window.matchMedia).toBe("function");
    const mql = window.matchMedia("(max-width: 600px)");
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe("(max-width: 600px)");
  });

  it("返回的 MediaQueryList 有 add/removeEventListener(订阅不炸)", () => {
    const mql = window.matchMedia("(max-width: 600px)");
    expect(typeof mql.addEventListener).toBe("function");
    expect(typeof mql.removeEventListener).toBe("function");
    expect(() => mql.addEventListener("change", () => {})).not.toThrow();
  });
});
