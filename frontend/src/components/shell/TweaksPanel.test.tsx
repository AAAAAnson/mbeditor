import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TweaksPanel from "./TweaksPanel";
import { useUIStore } from "@/stores/uiStore";

describe("TweaksPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({
      theme: "walnut",
      density: "comfy",
      layout: "triptych",
      tweaksOpen: true,
    });
  });

  it("closes when pressing Escape", () => {
    render(
      <div>
        <button>outside</button>
        <TweaksPanel />
      </div>
    );

    expect(screen.getByRole("dialog", { name: "界面设置" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "界面设置" })).not.toBeInTheDocument();
    expect(useUIStore.getState().tweaksOpen).toBe(false);
  });

  it("closes when clicking outside the panel", () => {
    render(
      <div>
        <button>outside</button>
        <TweaksPanel />
      </div>
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("dialog", { name: "界面设置" })).not.toBeInTheDocument();
    expect(useUIStore.getState().tweaksOpen).toBe(false);
  });
});
