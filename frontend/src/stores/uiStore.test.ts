import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateUiState, useUIStore } from "./uiStore";

describe("uiStore uiMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ uiMode: "simple", layout: "triptych" });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults uiMode to 'simple'", () => {
    expect(useUIStore.getState().uiMode).toBe("simple");
  });

  it("默认主题为暖系 light", () => {
    window.localStorage.clear();
    expect(useUIStore.getInitialState().theme).toBe("light");
  });

  it("setUiMode flips between simple and pro", () => {
    useUIStore.getState().setUiMode("pro");
    expect(useUIStore.getState().uiMode).toBe("pro");
    useUIStore.getState().setUiMode("simple");
    expect(useUIStore.getState().uiMode).toBe("simple");
  });

  it("persists uiMode into the mbeditor.ui storage key", () => {
    useUIStore.getState().setUiMode("pro");
    const raw = window.localStorage.getItem("mbeditor.ui");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.uiMode).toBe("pro");
  });
});

describe("migrateUiState (persist v0→v1 主题收敛)", () => {
  it("旧 cozy/paper → light", () => {
    expect((migrateUiState({ theme: "cozy" }) as { theme?: string }).theme).toBe("light");
    expect((migrateUiState({ theme: "paper" }) as { theme?: string }).theme).toBe("light");
  });

  it("旧 swiss/walnut → dark", () => {
    expect((migrateUiState({ theme: "swiss" }) as { theme?: string }).theme).toBe("dark");
    expect((migrateUiState({ theme: "walnut" }) as { theme?: string }).theme).toBe("dark");
  });

  it("已是 light/dark 保持不变", () => {
    expect((migrateUiState({ theme: "dark" }) as { theme?: string }).theme).toBe("dark");
    expect((migrateUiState({ theme: "light" }) as { theme?: string }).theme).toBe("light");
  });

  it("未知值与缺字段兜底 light", () => {
    expect((migrateUiState({ theme: "neon" }) as { theme?: string }).theme).toBe("light");
    expect((migrateUiState({}) as { theme?: string }).theme).toBe("light");
  });
});

describe("uiStore fontFamily", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ fontFamily: "rounded" });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults fontFamily to 'rounded'", () => {
    window.localStorage.clear();
    expect(useUIStore.getInitialState().fontFamily).toBe("rounded");
  });

  it("setFontFamily switches the font family", () => {
    useUIStore.getState().setFontFamily("serif");
    expect(useUIStore.getState().fontFamily).toBe("serif");
    useUIStore.getState().setFontFamily("system");
    expect(useUIStore.getState().fontFamily).toBe("system");
  });

  it("persists fontFamily into the mbeditor.ui storage key", () => {
    useUIStore.getState().setFontFamily("serif");
    const raw = window.localStorage.getItem("mbeditor.ui");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.fontFamily).toBe("serif");
  });
});

describe("uiStore codeDrawerWidth（代码抽屉可拖拽调宽）", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ codeDrawerWidth: 720 });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("默认 720px", () => {
    window.localStorage.clear();
    expect(useUIStore.getInitialState().codeDrawerWidth).toBe(720);
  });

  it("setCodeDrawerWidth 取整并 clamp 到 360~1400", () => {
    useUIStore.getState().setCodeDrawerWidth(900.6);
    expect(useUIStore.getState().codeDrawerWidth).toBe(901);
    useUIStore.getState().setCodeDrawerWidth(100);
    expect(useUIStore.getState().codeDrawerWidth).toBe(360);
    useUIStore.getState().setCodeDrawerWidth(9999);
    expect(useUIStore.getState().codeDrawerWidth).toBe(1400);
  });

  it("持久化进 mbeditor.ui", () => {
    useUIStore.getState().setCodeDrawerWidth(880);
    const raw = window.localStorage.getItem("mbeditor.ui");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.codeDrawerWidth).toBe(880);
  });
});

describe("uiStore effectiveLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ uiMode: "simple", layout: "triptych" });
  });

  it("forces 'focus' in simple mode regardless of stored layout", () => {
    useUIStore.setState({ uiMode: "simple", layout: "triptych" });
    expect(useUIStore.getState().effectiveLayout()).toBe("focus");
    useUIStore.setState({ layout: "split" });
    expect(useUIStore.getState().effectiveLayout()).toBe("focus");
  });

  it("returns the stored layout in pro mode", () => {
    useUIStore.setState({ uiMode: "pro", layout: "triptych" });
    expect(useUIStore.getState().effectiveLayout()).toBe("triptych");
    useUIStore.setState({ layout: "split" });
    expect(useUIStore.getState().effectiveLayout()).toBe("split");
    useUIStore.setState({ layout: "focus" });
    expect(useUIStore.getState().effectiveLayout()).toBe("focus");
  });

  it("round-trips simple <-> pro without losing the stored layout", () => {
    useUIStore.setState({ uiMode: "pro", layout: "triptych" });
    useUIStore.getState().setUiMode("simple");
    expect(useUIStore.getState().effectiveLayout()).toBe("focus");
    useUIStore.getState().setUiMode("pro");
    expect(useUIStore.getState().effectiveLayout()).toBe("triptych");
  });
});
