import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import * as Icons from "./index";

const runtimeIcons = Icons as Record<string, unknown>;

describe("Warm icon set", () => {
  it("exports the 36 Warm core icon names", () => {
    expect(Icons.WARM_ICON_CORE_NAMES).toHaveLength(36);
    for (const name of Icons.WARM_ICON_CORE_NAMES) {
      expect(name).toMatch(/^Icon/);
      expect(runtimeIcons[name]).toBeTypeOf("function");
    }
  });

  it("removes unused legacy icons", () => {
    for (const removed of ["IconLogo", "IconPlay", "IconPause", "IconTweak", "IconWechat", "IconGithub"]) {
      expect(runtimeIcons[removed]).toBeUndefined();
    }
  });

  it("keeps className support on newly added icons", () => {
    const IconHome = runtimeIcons.IconHome as ComponentType<{ size?: number; className?: string }>;
    const { container } = render(<IconHome size={18} className="warm-home" />);
    expect(container.querySelector("svg")).toHaveClass("warm-home");
  });
});
