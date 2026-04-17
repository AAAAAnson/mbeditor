import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WechatPreview from "../WechatPreview";

/**
 * Baseline freeze for the WechatPreview component.
 *
 * These tests document the critical static behaviors that must NOT break
 * during the Stage 0 pipeline cleanup (Task 5 will rewrite internals of
 * this component). If Task 5 breaks any test here, it's a regression.
 *
 * Intentionally NOT tested (deferred to integration tests in later Stages):
 * - iframe content rendering (requires async DOM write tracking)
 * - postMessage-driven height synchronization (requires async event plumbing)
 *
 * The 375px preview width is a fixed design constant of this component.
 * This test is intentionally coupled to that contract, but not to a specific
 * Tailwind class implementation.
 */
describe("WechatPreview contract (baseline freeze)", () => {
  it("renders an iframe with title='preview'", () => {
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="wechat" />
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("title")).toBe("preview");
  });

  it("wraps the iframe in a 375px mobile-simulation container", () => {
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="wechat" />
    );
    const iframe = container.querySelector("iframe");
    const wrapper = iframe?.parentElement;
    expect(wrapper).not.toBeNull();
    expect((wrapper as HTMLElement).style.width).toBe("375px");
  });

  it("renders successfully when mode='raw' (smoke check for the raw-mode code path)", () => {
    // Raw mode takes a different conditional branch in writeToIframe.
    // This test ensures that branch does not crash on render. We don't
    // assert anything about sanitization differences — Task 5 is free to
    // restructure the raw/wechat branching internally.
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="raw" />
    );
    expect(container.querySelector("iframe")).not.toBeNull();
  });
});

describe("WechatPreview post-cleanup", () => {
  it("does not import sanitizeForWechatPreview", async () => {
    const mod = await import("../WechatPreview");
    // Verify the module string doesn't mention the removed function
    const src = mod.default.toString();
    expect(src).not.toContain("sanitizeForWechatPreview");
    expect(src).not.toContain("normalizeImageStyles");
  });

  it("does not render a cleanMode toggle button", () => {
    const { container } = render(
      <WechatPreview html="<p>hi</p>" css="" mode="wechat" />
    );
    const buttons = container.querySelectorAll("button");
    const hasCleanModeBtn = Array.from(buttons).some((b) =>
      b.textContent?.includes("清洗预览")
    );
    expect(hasCleanModeBtn).toBe(false);
  });
});
