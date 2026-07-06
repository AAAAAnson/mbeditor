import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "./useTheme";
import { useUIStore } from "@/stores/uiStore";

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-font");
    useUIStore.persist.clearStorage();
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-font");
  });

  it("defaults to the light theme", () => {
    expect(useUIStore.getState().theme).toBe("light");
  });

  it("uses :root (no data-theme attr) for the light theme", () => {
    useUIStore.setState({ theme: "light" });
    renderHook(() => useTheme());
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applies data-theme=dark for the warm-dark theme", () => {
    useUIStore.setState({ theme: "dark" });
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies no data-font for the default rounded font", () => {
    useUIStore.setState({ fontFamily: "rounded" });
    renderHook(() => useTheme());
    expect(document.documentElement.hasAttribute("data-font")).toBe(false);
  });

  it("applies data-font=serif when the serif font is chosen", () => {
    useUIStore.setState({ fontFamily: "serif" });
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-font")).toBe("serif");
  });

  it("applies data-font=system when the system font is chosen", () => {
    useUIStore.setState({ fontFamily: "system" });
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-font")).toBe("system");
  });
});
