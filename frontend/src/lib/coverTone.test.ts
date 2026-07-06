import { describe, it, expect } from "vitest";
import { COVER_TONES, coverTone, coverVariantKey } from "./coverTone";

describe("coverTone", () => {
  it("keeps the golden cover palette (consolidation, no accidental recolor)", () => {
    expect(COVER_TONES.warm).toEqual({ from: "#C14A3A", to: "#8A3B2E", stripe: "#D97860" });
    expect(COVER_TONES.terminal).toEqual({ from: "#1A1714", to: "#2A2225", stripe: "#C4A76C" });
    expect(COVER_TONES.paper).toEqual({ from: "#F0E8D8", to: "#C4A76C", stripe: "#8A6D5B" });
    expect(COVER_TONES.neon).toEqual({ from: "#7588B8", to: "#3D3730", stripe: "#C4A76C" });
    expect(COVER_TONES.earth).toEqual({ from: "#8A6D5B", to: "#C89458", stripe: "#F0E8D8" });
    expect(COVER_TONES.swiss).toEqual({ from: "#141013", to: "#302629", stripe: "#F0E8D8" });
  });

  it("resolves a known cover key to its tone", () => {
    expect(coverTone("paper", 99)).toEqual(COVER_TONES.paper);
    expect(coverVariantKey("neon", 3)).toBe("neon");
  });

  it("falls back by index for unknown/empty keys (stable order warm/terminal/paper/...)", () => {
    expect(coverTone(undefined, 0)).toEqual(COVER_TONES.warm);
    expect(coverTone("", 1)).toEqual(COVER_TONES.terminal);
    expect(coverVariantKey("bogus", 2)).toBe("paper");
  });
});
