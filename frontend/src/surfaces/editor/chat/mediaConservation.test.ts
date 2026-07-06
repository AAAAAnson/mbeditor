import { describe, expect, it } from "vitest";

import { countMediaBlocks } from "./mediaConservation";

describe("countMediaBlocks", () => {
  it("数 image 与 svg 块:2 image + 1 svg → 3", () => {
    expect(
      countMediaBlocks([
        { kind: "image" },
        { kind: "text" },
        { kind: "svg" },
        { kind: "heading" },
        { kind: "image" },
      ]),
    ).toBe(3);
  });

  it("空块表 → 0", () => {
    expect(countMediaBlocks([])).toBe(0);
  });

  it("无媒体块 → 0", () => {
    expect(countMediaBlocks([{ kind: "text" }, { kind: "divider" }, { kind: "raw" }])).toBe(0);
  });
});
