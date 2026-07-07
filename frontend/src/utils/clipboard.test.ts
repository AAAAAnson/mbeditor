import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunksHaveOversizedSvg, htmlByteSize, splitHtmlIntoChunks, writeHtmlToClipboard } from "./clipboard";

describe("htmlByteSize", () => {
  it("measures UTF-8 byte length, not character count", () => {
    expect(htmlByteSize("hello")).toBe(5);
    expect(htmlByteSize("中文")).toBe(6);
  });

  it("returns 0 for empty input", () => {
    expect(htmlByteSize("")).toBe(0);
  });
});

describe("splitHtmlIntoChunks", () => {
  it("returns input as a single chunk when under the limit", () => {
    const html = "<p>hi</p>";
    expect(splitHtmlIntoChunks(html, 1024)).toEqual([html]);
  });

  it("returns input as a single chunk when body has no children", () => {
    expect(splitHtmlIntoChunks("plain text", 1024)).toEqual(["plain text"]);
  });

  it("splits at top-level block boundaries", () => {
    const block = "<p>" + "x".repeat(100) + "</p>";
    const html = block.repeat(10);
    const chunks = splitHtmlIntoChunks(html, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith("<p>")).toBe(true);
      expect(chunk.endsWith("</p>")).toBe(true);
    }
    expect(chunks.join("")).toBe(html);
  });

  it("keeps a single oversized child as its own chunk", () => {
    const big = "<section>" + "x".repeat(5000) + "</section>";
    const small = "<p>tail</p>";
    const chunks = splitHtmlIntoChunks(big + small, 1024);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(big);
    expect(chunks[1]).toBe(small);
  });

  it("preserves the full content (round-trips by concatenation)", () => {
    const html =
      "<section><p>一</p></section>" +
      "<section><p>二</p></section>" +
      "<section><p>三</p></section>";
    const chunks = splitHtmlIntoChunks(html, 30);
    expect(chunks.join("")).toBe(html);
  });

  it("packs multiple small children into the same chunk", () => {
    const tiny = "<p>a</p>";
    const html = tiny.repeat(5);
    const chunks = splitHtmlIntoChunks(html, 1024);
    expect(chunks).toEqual([html]);
  });

  it("descends through a single outer wrapper and re-wraps every chunk", () => {
    // Mimics an article authored as one outer <section> containing many
    // paragraphs — the common case for editor-written long-form HTML.
    const para = "<p>" + "x".repeat(100) + "</p>";
    const inner = para.repeat(10);
    const html = `<section style="background:#fff">${inner}</section>`;
    const chunks = splitHtmlIntoChunks(html, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Every chunk gets its own wrapper so outer styling reaches WeChat.
      expect(chunk.startsWith('<section style="background:#fff">')).toBe(true);
      expect(chunk.endsWith("</section>")).toBe(true);
    }
  });

  it("returns one chunk when even after descent there is no splittable level", () => {
    // Single outer wrapper containing a single inline run with no element
    // children → no boundary exists to split on, return original.
    const html = '<section style="background:#fff">' + "x".repeat(5000) + "</section>";
    const chunks = splitHtmlIntoChunks(html, 1024);
    expect(chunks).toEqual([html]);
  });

  it("descends through nested single-child wrappers", () => {
    const para = "<p>p</p>";
    const inner = para.repeat(5);
    // Two levels of wrappers: <div><section>...</section></div>
    const html = `<div class="outer"><section class="inner">${inner}</section></div>`;
    const chunks = splitHtmlIntoChunks(html, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith('<div class="outer"><section class="inner">')).toBe(true);
      expect(chunk.endsWith("</section></div>")).toBe(true);
    }
  });

  it("recursively splits an oversized sibling that holds the bulk of the content", () => {
    // Mimics the typical real-world structure: small heading block first,
    // then a giant <section> that owns thousands of paragraphs. The naive
    // sibling-only chunker would emit "[tiny heading], [entire section]"
    // — exactly the 0KB-then-everything failure mode we hit in the wild.
    const para = "<p>" + "x".repeat(100) + "</p>";
    const huge = `<section class="body">${para.repeat(50)}</section>`;
    const html = `<h1>title</h1>${huge}`;
    const chunks = splitHtmlIntoChunks(html, 800);
    expect(chunks.length).toBeGreaterThan(2);
    // No chunk should be wildly bigger than the budget.
    for (const c of chunks) {
      expect(new Blob([c]).size).toBeLessThanOrEqual(1200);
    }
  });

  it("recursively splits when the body has a single deeply-nested heavy child", () => {
    // Outer wrapper → inner wrapper → many paragraphs (the structure that
    // the previous descent-then-split version mishandled when the inner
    // wrapper alone exceeded maxBytes).
    const para = "<p>" + "x".repeat(80) + "</p>";
    const inner = `<section class="content">${para.repeat(20)}</section>`;
    const html = `<section style="background:#fff">${inner}</section>`;
    const chunks = splitHtmlIntoChunks(html, 500);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      // The outer wrapper must survive on every chunk so layout repeats correctly.
      expect(chunk.startsWith('<section style="background:#fff">')).toBe(true);
      expect(chunk.endsWith("</section>")).toBe(true);
    }
  });

  // Regression: the pre-fix chunker iterated `.children` (elements only),
  // silently deleting bare text nodes whenever a level got decomposed.
  it("keeps bare text nodes inside an oversized wrapper that gets split", () => {
    const para = "<p>" + "x".repeat(100) + "</p>";
    const html =
      "<section>IMPORTANT-LEAD-TEXT" +
      para.repeat(5) +
      "MIDDLE-TEXT" +
      para.repeat(5) +
      "TAIL-TEXT</section>";
    const joined = splitHtmlIntoChunks(html, 300).join("");
    expect(joined).toContain("IMPORTANT-LEAD-TEXT");
    expect(joined).toContain("MIDDLE-TEXT");
    expect(joined).toContain("TAIL-TEXT");
  });

  it("keeps top-level text nodes between body-level blocks", () => {
    const big = "<p>" + "x".repeat(400) + "</p>";
    const html = big + "BETWEEN-BLOCKS-TEXT" + big;
    expect(splitHtmlIntoChunks(html, 450).join("")).toContain("BETWEEN-BLOCKS-TEXT");
  });

  it("keeps paragraph prose around inline children when an oversized <p> splits", () => {
    const html =
      "<p>" + "PROSE".repeat(200) + "<strong>bold</strong>" + "PROSE".repeat(200) + "</p>";
    const joined = splitHtmlIntoChunks(html, 500).join("");
    expect(joined).toContain("PROSE");
    expect(joined).toContain("<strong>bold</strong>");
  });

  it("keeps br-separated text runs when a section splits", () => {
    const html = "<section>" + ("line-of-text-".repeat(10) + "<br>").repeat(20) + "</section>";
    expect(splitHtmlIntoChunks(html, 600).join("")).toContain("line-of-text-");
  });

  describe("SVG atomicity", () => {
    // DOMParser re-serializes SVG self-closing tags (<rect/> → <rect></rect>),
    // so a raw `chunks.join("") === inputString` round-trip never holds for SVG
    // markup. Normalize both sides through the same parse+serialize path (a
    // single huge-budget split returns the canonical one-chunk serialization)
    // before comparing — that proves no content was lost or sliced, which is
    // the invariant we actually care about, independent of serializer quirks.
    const normalize = (h: string) => splitHtmlIntoChunks(h, 50 * 1024 * 1024).join("");

    // Build an <svg> whose serialized size comfortably exceeds the budget so
    // the splitter is forced to decide whether to descend into it.
    const bigSvg = (() => {
      const rects = Array.from(
        { length: 200 },
        (_, i) => `<rect x="${i}" y="${i}" width="10" height="10" fill="url(#g1)"/>`
      ).join("");
      return (
        '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="#f00"/>' +
        '<stop offset="1" stop-color="#00f"/></linearGradient></defs>' +
        rects +
        '<animate attributeName="opacity" begin="hero.click" from="0" to="1"/>' +
        "</svg>"
      );
    })();

    it("never splits a large <svg> — returns it whole even over budget", () => {
      const chunks = splitHtmlIntoChunks(bigSvg, 1024);
      expect(new Blob([bigSvg]).size).toBeGreaterThan(1024);
      // The whole SVG must arrive as exactly one chunk, byte-for-byte.
      const svgChunks = chunks.filter((c) => c.includes("<svg"));
      expect(svgChunks).toHaveLength(1);
      const svgChunk = svgChunks[0];
      expect(svgChunk.startsWith("<svg")).toBe(true);
      expect(svgChunk.endsWith("</svg>")).toBe(true);
      // Gradient definition and its references stay in the same chunk.
      expect(svgChunk).toContain('<linearGradient id="g1">');
      expect(svgChunk).toContain('fill="url(#g1)"');
      expect(svgChunk).toContain('begin="hero.click"');
    });

    it("moves an SVG whole to the next chunk when it straddles a boundary", () => {
      // A small block then a big SVG. Greedy packing must keep the SVG intact
      // in its own chunk rather than slicing its head onto the previous chunk.
      const head = "<p>" + "x".repeat(400) + "</p>";
      const html = head + bigSvg;
      const chunks = splitHtmlIntoChunks(html, 600);
      const svgChunks = chunks.filter((c) => c.includes("<svg"));
      expect(svgChunks).toHaveLength(1);
      expect(svgChunks[0].startsWith("<svg")).toBe(true);
      expect(svgChunks[0].endsWith("</svg>")).toBe(true);
      expect(svgChunks[0]).toContain('<linearGradient id="g1">');
      // Nothing got truncated: full document survives concatenation.
      expect(chunks.join("")).toBe(normalize(html));
    });

    it("keeps multiple consecutive SVGs each intact", () => {
      const svgA = bigSvg.replace(/g1/g, "ga").replace("hero.click", "a.click");
      const svgB = bigSvg.replace(/g1/g, "gb").replace("hero.click", "b.click");
      const svgC = bigSvg.replace(/g1/g, "gc").replace("hero.click", "c.click");
      const html = svgA + svgB + svgC;
      const chunks = splitHtmlIntoChunks(html, 1024);
      // Each SVG stays whole and self-consistent.
      for (const [id, evt] of [
        ["ga", "a.click"],
        ["gb", "b.click"],
        ["gc", "c.click"],
      ]) {
        const owner = chunks.find((c) => c.includes(`id="${id}"`));
        expect(owner).toBeDefined();
        expect(owner!).toContain(`fill="url(#${id})"`);
        expect(owner!).toContain(`begin="${evt}"`);
      }
      expect(chunks.join("")).toBe(normalize(html));
    });

    it("keeps an SVG nested inside an oversized wrapper intact", () => {
      // The wrapper <section> is split, but its child <svg> must never be
      // sliced — the wrapper repeats, the SVG rides whole inside one chunk.
      const para = "<p>" + "x".repeat(100) + "</p>";
      const html =
        '<section style="background:#fff">' + para.repeat(5) + bigSvg + para.repeat(5) + "</section>";
      const chunks = splitHtmlIntoChunks(html, 600);
      expect(chunks.length).toBeGreaterThan(1);
      // The wrapper got split, so the <section> open/close pair is (by design)
      // re-emitted on each chunk — joining won't byte-equal the single-wrapper
      // normalized form. The invariant we assert instead: the SVG is whole in
      // exactly one chunk, and every wrapped chunk carries the outer styling.
      const svgChunks = chunks.filter((c) => c.includes("<svg"));
      expect(svgChunks).toHaveLength(1);
      const owner = svgChunks[0];
      expect(owner).toContain('<linearGradient id="g1">');
      expect(owner).toContain('fill="url(#g1)"');
      expect(owner).toContain("</svg>");
      // The SVG sits inside the repeated wrapper, never naked.
      expect(owner.startsWith('<section style="background:#fff">')).toBe(true);
      expect(owner.endsWith("</section>")).toBe(true);
      for (const c of chunks) {
        expect(c.startsWith('<section style="background:#fff">')).toBe(true);
        expect(c.endsWith("</section>")).toBe(true);
      }
      // All ten paragraphs survive across the chunks.
      const pCount = chunks.join("").match(/<p>/g)?.length ?? 0;
      expect(pCount).toBe(10);
    });

    it("warns when a single SVG exceeds the chunk budget", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      splitHtmlIntoChunks(bigSvg, 1024);
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0][0]).toContain("<svg>");
      warn.mockRestore();
    });

    it("does not warn for an SVG that fits within budget", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const small = '<svg><rect fill="url(#g1)"></rect></svg>';
      const chunks = splitHtmlIntoChunks(small, 1024);
      // Fits in budget → one whole chunk, no warning.
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("<svg>");
      expect(chunks[0]).toContain('fill="url(#g1)"');
      expect(chunks[0]).toContain("</svg>");
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("chunksHaveOversizedSvg flags an over-budget atomic SVG chunk (review F10)", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const chunks = splitHtmlIntoChunks(bigSvg, 1024);
      expect(chunksHaveOversizedSvg(chunks, 1024)).toBe(true);
      vi.restoreAllMocks();
    });

    it("chunksHaveOversizedSvg is false when every chunk fits", () => {
      const chunks = splitHtmlIntoChunks("<p>" + "x".repeat(200) + "</p>", 1024);
      expect(chunksHaveOversizedSvg(chunks, 1024)).toBe(false);
    });
  });
});

describe("writeHtmlToClipboard", () => {
  // Swiss theme palette from src/styles/index.css [data-theme="swiss"] —
  // its --bg-deep/#000000 and --surface-3/#222222 collide with everyday
  // authored dark backgrounds.
  const SWISS: Record<string, string> = {
    "--bg": "#0A0A0A",
    "--bg-deep": "#000000",
    "--surface": "#131313",
    "--surface-3": "#222222",
  };

  let capturedHtml: string | null = null;
  let capturedText: string | null = null;

  beforeEach(() => {
    capturedHtml = null;
    capturedText = null;
    const origGCS = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const cs = origGCS(el as HTMLElement);
      if (el === document.documentElement) {
        const proxy = Object.create(cs);
        proxy.getPropertyValue = (name: string) => SWISS[name] ?? cs.getPropertyValue(name);
        return proxy as CSSStyleDeclaration;
      }
      return cs;
    });

    // @ts-expect-error test stub
    globalThis.ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
    };
    Object.assign(navigator, {
      clipboard: {
        write: async (items: any[]) => {
          capturedHtml = await items[0].items["text/html"].text();
          const plain = items[0].items["text/plain"];
          capturedText = plain ? await plain.text() : null;
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression: theme-chrome stripping must never eat AUTHORED dark
  // backgrounds that happen to equal a swiss theme var.
  it("keeps authored background-color:#000000 on the swiss theme", async () => {
    await writeHtmlToClipboard(
      '<section style="background-color:#000000;color:#fff;padding:20px"><p>dark hero</p></section>'
    );
    expect(capturedHtml).toContain("background-color");
  });

  it("keeps authored background-color:#222222 (code block) on the swiss theme", async () => {
    await writeHtmlToClipboard(
      '<pre style="background-color:#222222;color:#eee"><code>x = 1</code></pre>'
    );
    expect(capturedHtml).toContain("background-color");
  });

  it("keeps rgb(0, 0, 0) spelled as rgb too", async () => {
    await writeHtmlToClipboard('<section style="background-color: rgb(0, 0, 0);"><p>x</p></section>');
    expect(capturedHtml).toContain("background-color");
  });

  it("keeps unrelated authored colors", async () => {
    await writeHtmlToClipboard('<section style="background-color:#E9F0FC;"><p>x</p></section>');
    expect(capturedHtml).toContain("background-color");
  });

  // 文章背景显式化(2026-07-07):最外层信封壳的背景是文章的显式页背景,
  // 复制时永不当作编辑器 chrome 剥掉——即使其值恰好等于某主题变量。
  it("never strips the outer envelope background even if it matches a chrome var", async () => {
    await writeHtmlToClipboard(
      '<section style="background-color:#131313;padding:8px"><p style="background-color:#131313">x</p></section>'
    );
    // 壳背景保留;内部 <p> 同色 chrome 背景才被剥(格式容忍 hex/rgb)
    const COLOR = /131313|rgb\(19, ?19, ?19\)/;
    expect(capturedHtml).toMatch(COLOR);
    const pStart = capturedHtml!.indexOf("<p");
    expect(capturedHtml!.slice(pStart)).not.toMatch(COLOR);
  });

  // Regression: the text/plain fallback used bare textContent, fusing
  // "<p>End.</p><p>Start</p>" into "End.Start" and collapsing whole
  // articles onto one line.
  it("inserts line breaks at block boundaries in the text/plain fallback", async () => {
    await writeHtmlToClipboard("<section><h2>Heading</h2><p>Para one.</p><p>Para two.</p></section>");
    expect(capturedText).toContain("Heading");
    expect(capturedText).toContain("\n");
    expect(capturedText).not.toContain("one.Para");
  });
});
