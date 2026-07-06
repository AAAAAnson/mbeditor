import { describe, expect, it } from "vitest";
import { buildRawPreviewSrcDoc } from "./rawPreview";

describe("buildRawPreviewSrcDoc", () => {
  it("wraps raw html in a full document with charset", () => {
    const doc = buildRawPreviewSrcDoc("<p>Hi</p>", "");
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain("<body><p>Hi</p></body>");
    expect(doc).toContain("</html>");
  });

  it("injects non-empty css as a <style> tag (no inlining, no sanitize)", () => {
    const doc = buildRawPreviewSrcDoc("<p>Hi</p>", ".x{color:red}");
    expect(doc).toContain("<style>.x{color:red}</style>");
  });

  it("omits the css style tag when css is empty or whitespace", () => {
    expect(buildRawPreviewSrcDoc("<p>Hi</p>", "")).not.toContain(".x{");
    const doc = buildRawPreviewSrcDoc("<p>Hi</p>", "   ");
    // only the base reset <style> should be present, not an empty author one
    expect(doc).not.toContain("<style>   </style>");
  });

  it("embeds SVG/SMIL markup verbatim without stripping animate elements", () => {
    const svg =
      '<svg><rect id="r" width="10" height="10"><animate attributeName="width" begin="r.click" to="50"/></rect></svg>';
    const doc = buildRawPreviewSrcDoc(svg, "");
    expect(doc).toContain('<animate attributeName="width" begin="r.click" to="50"/>');
    expect(doc).toContain("<svg>");
  });

  it("neutralizes a </style> breakout in the author css", () => {
    const doc = buildRawPreviewSrcDoc(
      "<p>Hi</p>",
      ".x{color:red}</style><img src=x onerror=alert(1)>",
    );
    // The author css must not be allowed to close the style element early and
    // smuggle trailing HTML into the body.
    expect(doc).not.toContain("</style><img");
    expect(doc).toContain("<\\/style>");
    // The injected breakout HTML stays inside the <style> tag as inert text,
    // never as a live <img> sibling in the body.
    expect(doc).toContain("<body><p>Hi</p></body>");
  });

  it("tolerates empty html", () => {
    const doc = buildRawPreviewSrcDoc("", "");
    expect(doc).toContain("<body></body>");
  });
});
