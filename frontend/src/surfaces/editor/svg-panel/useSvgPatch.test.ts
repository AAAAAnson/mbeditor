import { describe, expect, it } from "vitest";
import { findSvgSpans, locateSvgSpan, spliceSvg } from "./useSvgPatch";
import { applySvgAttr, parseSvgModel } from "./svgParse";

const SVG_A = `<svg id="a" xmlns="http://www.w3.org/2000/svg"><rect fill="#F5A623"/></svg>`;
const SVG_B = `<svg id="b" xmlns="http://www.w3.org/2000/svg"><rect fill="#112233"/></svg>`;

const HTML = `<p>intro</p>\n${SVG_A}\n<p>middle</p>\n${SVG_B}\n<p>outro</p>`;

describe("findSvgSpans", () => {
  it("finds every svg span with accurate offsets", () => {
    const spans = findSvgSpans(HTML);
    expect(spans).toHaveLength(2);
    expect(HTML.slice(spans[0].start, spans[0].end)).toBe(SVG_A);
    expect(HTML.slice(spans[1].start, spans[1].end)).toBe(SVG_B);
  });

  it("returns empty for html with no svg", () => {
    expect(findSvgSpans("<p>nothing</p>")).toHaveLength(0);
  });
});

describe("locateSvgSpan", () => {
  it("selects the span at/before the source offset", () => {
    const offsetB = HTML.indexOf(SVG_B);
    const span = locateSvgSpan(HTML, offsetB);
    expect(span?.text).toBe(SVG_B);
  });

  it("selects the first span for offset 0", () => {
    const span = locateSvgSpan(HTML, HTML.indexOf(SVG_A));
    expect(span?.text).toBe(SVG_A);
  });
});

describe("spliceSvg + applySvgAttr — patch precision", () => {
  it("replaces the targeted svg colour and leaves bytes outside untouched", () => {
    const offsetA = HTML.indexOf(SVG_A);
    const span = locateSvgSpan(HTML, offsetA)!;
    const model = parseSvgModel(span.text);
    const fill = model.colors.find((c) => c.value === "#f5a623")!;
    const nextSvg = applySvgAttr(span.text, fill.elementIndex, "fill", "#000000");
    const nextHtml = spliceSvg(HTML, span, nextSvg);

    expect(nextHtml).toContain('fill="#000000"');
    expect(nextHtml).not.toContain("#F5A623");
    // the other svg is byte-identical
    expect(nextHtml).toContain(SVG_B);
    // non-svg html preserved verbatim
    expect(nextHtml).toContain("<p>intro</p>");
    expect(nextHtml).toContain("<p>middle</p>");
    expect(nextHtml).toContain("<p>outro</p>");
    // only the targeted svg differs in length
    const delta = nextHtml.length - HTML.length;
    expect(delta).toBe("#000000".length - "#F5A623".length);
  });

  it("patching the second svg leaves the first untouched", () => {
    const offsetB = HTML.indexOf(SVG_B);
    const span = locateSvgSpan(HTML, offsetB)!;
    const model = parseSvgModel(span.text);
    const fill = model.colors.find((c) => c.value === "#112233")!;
    const nextSvg = applySvgAttr(span.text, fill.elementIndex, "fill", "#abcdef");
    const nextHtml = spliceSvg(HTML, span, nextSvg);

    expect(nextHtml).toContain(SVG_A); // first svg byte-identical
    expect(nextHtml).toContain('fill="#abcdef"');
    expect(nextHtml).not.toContain("#112233");
  });
});
