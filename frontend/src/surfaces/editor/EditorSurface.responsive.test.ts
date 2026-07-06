import { describe, it, expect } from "vitest";
import { chromeForUi, applyMobileChrome } from "./EditorSurface";

describe("applyMobileChrome", () => {
  it("isMobile 时强制 showProChrome=false、showStructurePanel=false", () => {
    const pro = chromeForUi("pro", "triptych"); // pro+三栏:两者本应 true
    expect(pro.showProChrome).toBe(true);
    expect(pro.showStructurePanel).toBe(true);
    const m = applyMobileChrome(pro, true);
    expect(m.showProChrome).toBe(false);
    expect(m.showStructurePanel).toBe(false);
  });

  it("非 isMobile 原样返回", () => {
    const pro = chromeForUi("pro", "triptych");
    expect(applyMobileChrome(pro, false)).toEqual(pro);
  });

  it("保留 defaultView 不变", () => {
    const pro = chromeForUi("pro", "triptych");
    expect(applyMobileChrome(pro, true).defaultView).toBe(pro.defaultView);
  });
});
