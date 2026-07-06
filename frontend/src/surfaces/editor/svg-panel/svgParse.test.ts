import { describe, expect, it } from "vitest";
import { applySvgAttr, normalizeHex, parseSvgModel } from "./svgParse";

const COLOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="40" height="40" fill="#F5A623" stroke="#1A2B3C"/>
  <linearGradient id="grad"><stop offset="0" stop-color="#00FFAA"/></linearGradient>
</svg>`;

const HOTSPOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect id="tab1btn" x="10" y="20" width="80" height="30" fill="#fff"/>
  <g id="flipbtn"><rect width="10" height="10"/></g>
  <rect id="plainrect" x="0" y="0" width="5" height="5"/>
</svg>`;

const SMIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect width="10" height="10">
    <animate attributeName="opacity" begin="0.6s" dur="1s" to="1"/>
    <set attributeName="visibility" to="visible" begin="tab1btn.click"/>
    <animateTransform attributeName="transform" type="translate" begin="0s" dur="2s"/>
  </rect>
</svg>`;

describe("normalizeHex", () => {
  it("lowercases valid hex and rejects non-hex", () => {
    expect(normalizeHex("#F5A623")).toBe("#f5a623");
    expect(normalizeHex("#ABC")).toBe("#abc");
    expect(normalizeHex("rgb(0,0,0)")).toBeNull();
    expect(normalizeHex("url(#grad)")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("parseSvgModel — colours", () => {
  it("extracts fill/stroke/stop-color hex values", () => {
    const model = parseSvgModel(COLOR_SVG);
    expect(model.ok).toBe(true);
    const values = model.colors.map((c) => c.value).sort();
    expect(values).toEqual(["#00ffaa", "#1a2b3c", "#f5a623"]);

    const fill = model.colors.find((c) => c.value === "#f5a623");
    expect(fill?.attr).toBe("fill");
    const stop = model.colors.find((c) => c.value === "#00ffaa");
    expect(stop?.attr).toBe("stop-color");
  });

  it("ignores non-hex colour values", () => {
    const model = parseSvgModel(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#grad)" stroke="red"/></svg>`,
    );
    expect(model.colors).toHaveLength(0);
  });
});

describe("parseSvgModel — hotspots", () => {
  it("identifies rect/g elements whose id ends with btn", () => {
    const model = parseSvgModel(HOTSPOT_SVG);
    const ids = model.hotspots.map((h) => h.elementId).sort();
    expect(ids).toEqual(["flipbtn", "tab1btn"]);

    const rectHotspot = model.hotspots.find((h) => h.elementId === "tab1btn");
    expect(rectHotspot?.tag).toBe("rect");
    expect(rectHotspot?.x).toBe(10);
    expect(rectHotspot?.y).toBe(20);

    const gHotspot = model.hotspots.find((h) => h.elementId === "flipbtn");
    expect(gHotspot?.tag).toBe("g");
  });

  it("does not treat non-btn ids as hotspots", () => {
    const model = parseSvgModel(HOTSPOT_SVG);
    expect(model.hotspots.some((h) => h.elementId === "plainrect")).toBe(false);
  });
});

describe("parseSvgModel — SMIL", () => {
  it("identifies animate/animateTransform/set with begin and dur", () => {
    const model = parseSvgModel(SMIL_SVG);
    expect(model.smil).toHaveLength(3);

    const anim = model.smil.find((s) => s.tag === "animate");
    expect(anim?.begin).toBe("0.6s");
    expect(anim?.dur).toBe("1s");
    expect(anim?.attributeName).toBe("opacity");

    const setNode = model.smil.find((s) => s.tag === "set");
    expect(setNode?.begin).toBe("tab1btn.click");

    const transform = model.smil.find((s) => s.tag === "animateTransform");
    expect(transform?.begin).toBe("0s");
    expect(transform?.dur).toBe("2s");
  });
});

describe("parseSvgModel — robustness", () => {
  it("returns ok:false for non-svg input", () => {
    expect(parseSvgModel("<p>not svg</p>").ok).toBe(false);
    expect(parseSvgModel("").ok).toBe(false);
  });
});

describe("applySvgAttr", () => {
  it("changes the addressed element's attribute and re-serialises", () => {
    const model = parseSvgModel(COLOR_SVG);
    const fill = model.colors.find((c) => c.value === "#f5a623");
    expect(fill).toBeTruthy();
    const next = applySvgAttr(COLOR_SVG, fill!.elementIndex, "fill", "#000000");
    expect(next).toContain('fill="#000000"');
    expect(next).not.toContain("#F5A623");
    // unrelated colour untouched
    expect(next.toLowerCase()).toContain("#1a2b3c");
  });

  it("returns source unchanged for an out-of-range index", () => {
    const next = applySvgAttr(COLOR_SVG, 999, "fill", "#000000");
    expect(next).toBe(COLOR_SVG);
  });
});
