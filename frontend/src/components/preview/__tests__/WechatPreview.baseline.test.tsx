import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WechatPreview from "../WechatPreview";

describe("WechatPreview baseline behavior (pre-Stage-0 cleanup)", () => {
  it("renders an iframe", () => {
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="wechat" />
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("title")).toBe("preview");
  });

  it("wraps the iframe in a 375px container", () => {
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="wechat" />
    );
    const wrapper = container.querySelector(".w-\\[375px\\]");
    expect(wrapper).not.toBeNull();
  });

  it("accepts mode=raw without crashing", () => {
    const { container } = render(
      <WechatPreview html="<p>hello</p>" css="" mode="raw" />
    );
    expect(container.querySelector("iframe")).not.toBeNull();
  });
});
