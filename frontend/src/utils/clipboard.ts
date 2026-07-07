/**
 * Write sanitized HTML to the system clipboard so WeChat's paste handler
 * receives it as rich text (text/html) with a plain-text fallback.
 *
 * The HTML must already have been run through the WeChat-safe sanitizer
 * pipeline on the backend (the process-for-copy endpoint) — that step strips
 * flex/grid/position:absolute/animations/transforms/etc and uploads local
 * images to mmbiz.qpic.cn so the paste result renders identically to the
 * editor preview.
 */
export function htmlByteSize(html: string): number {
  // Clipboard transports go through a UTF-8 text/html blob, so byte length —
  // not character count — is what hits the Chrome CF_HTML cap on Windows and
  // WeChat UEditor's "too big, fall back to text/plain" paste heuristic.
  return new Blob([html]).size;
}

/**
 * Split a long HTML fragment into chunks no larger than `maxBytes` each.
 *
 * Algorithm is **recursive**: each top-level body child is broken down into
 * candidate pieces ≤ maxBytes by descending into its subtree as deep as
 * necessary. When an element is itself larger than the budget we re-wrap
 * each subgroup of its children with that element's open/close tag pair so
 * outer styles (background, padding, layout) survive on every pasted chunk.
 *
 * Splits only happen at element boundaries — never mid-element — so each
 * returned chunk is a self-contained, well-formed HTML fragment that pastes
 * into WeChat's editor as if it were the only content. Adjacent candidates
 * are greedily re-packed in a second phase so an article with a tiny
 * heading block followed by a huge content block doesn't produce a useless
 * "single tiny chunk" first segment.
 *
 * Oversized leaves (a single element with too much text content and no
 * element children) are returned as a single too-big chunk — we'd rather
 * hand WeChat one over-budget chunk than break inline-style integrity by
 * splitting an element in two.
 */
export function splitHtmlIntoChunks(html: string, maxBytes: number = 250 * 1024): string[] {
  if (typeof DOMParser === "undefined") return [html];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  // Early-out guard uses `children` (element nodes only): a body that is bare
  // top-level text with NO element wrapper can't be chunked at an element
  // boundary anyway, so we return it whole. (Real WeChat article HTML always
  // arrives wrapped in <section>/<p>; this branch only fires for pathological
  // unwrapped input, where over-budget bare text degrades to a single chunk —
  // review F11. The childNodes iteration below still preserves interleaved
  // text once at least one element child exists.)
  if (!body || body.children.length === 0) return [html];

  // Phase 1: produce candidate chunks, one or more per top-level body child.
  // Iterate childNodes — not children — so bare text nodes sitting between
  // block elements survive the split instead of being silently deleted.
  const candidates: string[] = [];
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const piece of splitElement(node as Element, maxBytes)) candidates.push(piece);
    } else {
      const piece = serializeNode(node, doc);
      if (piece) candidates.push(piece);
    }
  }
  if (candidates.length === 0) return [html];

  // Phase 2: pack adjacent candidates back together up to maxBytes. Each
  // candidate is already a self-contained valid fragment so concatenation
  // is always safe.
  const chunks: string[] = [];
  let buf: string[] = [];
  let bufSize = 0;
  for (const piece of candidates) {
    const pieceSize = new Blob([piece]).size;
    if (buf.length > 0 && bufSize + pieceSize > maxBytes) {
      chunks.push(buf.join(""));
      buf = [];
      bufSize = 0;
    }
    buf.push(piece);
    bufSize += pieceSize;
  }
  if (buf.length > 0) chunks.push(buf.join(""));

  return chunks.length > 0 ? chunks : [html];
}

/**
 * Recursively break a single element's subtree into self-contained fragments
 * ≤ maxBytes each. Each returned chunk has the form `<open>...</open>` for
 * this element, with its inner content being a subset of the element's own
 * children (themselves possibly recursively split + re-wrapped).
 */
/** Serialize any DOM node (text, comment, element) to an HTML string with
 *  correct escaping. Returns "" for nodes that serialize to nothing. */
function serializeNode(node: Node, doc: Document): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
  const tmp = doc.createElement("div");
  tmp.appendChild(node.cloneNode(true));
  return tmp.innerHTML;
}

function splitElement(el: Element, maxBytes: number): string[] {
  const own = el.outerHTML;
  const ownSize = new Blob([own]).size;
  if (ownSize <= maxBytes) return [own];

  // SVG atomicity: an <svg> is a self-referential graph — gradient/filter
  // <defs id="g1"> are referenced from descendants via fill="url(#g1)", and
  // <animate begin="hero.click"> cross-references siblings by id. Splitting an
  // <svg> across chunks leaves those references dangling (the <defs> lands in
  // chunk A, the referencing <rect> in chunk B), silently breaking the render
  // and any animation. So we NEVER descend into an <svg>: it is returned whole
  // as a single chunk even when it alone blows the budget. The caller packs it
  // as its own oversized unit. We warn so an over-budget SVG is diagnosable.
  if (el.tagName.toLowerCase() === "svg") {
    if (ownSize > maxBytes && typeof console !== "undefined") {
      console.warn(
        `[clipboard] <svg> (${ownSize}B) exceeds chunk budget (${maxBytes}B); ` +
          "kept whole to preserve gradient/filter/animation references. " +
          "WeChat paste may truncate or reject an oversized chunk."
      );
    }
    return [own];
  }

  if (el.children.length === 0) {
    // Oversized leaf — no element children to descend into.
    return [own];
  }

  // Serialize this element's wrapper as a single open/close tag pair so
  // chunks can be reconstructed without touching innerHTML.
  const empty = (el.cloneNode(false) as Element).outerHTML;
  const closeIdx = empty.lastIndexOf("</");
  if (closeIdx === -1) {
    // Void element (e.g. <img>, <hr>) — can't host children, treat as leaf.
    return [own];
  }
  const open = empty.slice(0, closeIdx);
  const close = empty.slice(closeIdx);
  const wrapperSize = new Blob([open + close]).size;
  const innerBudget = maxBytes - wrapperSize;
  if (innerBudget <= 0) return [own];

  const chunks: string[] = [];
  let buf: string[] = [];
  let bufSize = 0;
  const flush = () => {
    if (buf.length > 0) {
      chunks.push(open + buf.join("") + close);
      buf = [];
      bufSize = 0;
    }
  };

  // childNodes — not children — so text nodes interleaved with elements
  // (lead text, <br>-separated lines, prose around inline tags) are kept.
  for (const child of Array.from(el.childNodes)) {
    const childChunks =
      child.nodeType === Node.ELEMENT_NODE
        ? splitElement(child as Element, innerBudget)
        : [serializeNode(child, el.ownerDocument ?? document)];
    for (const childChunk of childChunks) {
      if (!childChunk) continue;
      const ccSize = new Blob([childChunk]).size;
      if (buf.length > 0 && bufSize + ccSize > innerBudget) flush();
      buf.push(childChunk);
      bufSize += ccSize;
    }
  }
  flush();

  return chunks.length > 0 ? chunks : [own];
}

/**
 * Whether any chunk is over the per-paste byte budget. The only way a chunk
 * legitimately exceeds the budget is an atomic oversized element we refuse to
 * split (an `<svg>` whose gradient/filter/animation references must stay in one
 * piece — see splitElement). Callers surface this to the user (review F10) so
 * an over-budget chunk that WeChat may silently truncate or reject on paste
 * isn't a silent failure: the console.warn in splitElement isn't visible to
 * end users. Pure + exported so the dialog can warn before the paste happens.
 */
export function chunksHaveOversizedSvg(chunks: string[], maxBytes: number = 250 * 1024): boolean {
  return chunks.some((c) => new Blob([c]).size > maxBytes);
}

export async function writeHtmlToClipboard(html: string): Promise<void> {
  const cleaned = stripThemeChromeBackgrounds(html);
  const plainText = htmlToPlainText(cleaned);

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([cleaned], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // fall through to execCommand fallback
    }
  }

  fallbackCopyRichText(cleaned);
}

/**
 * WeChat's paste handler runs getComputedStyle() on every pasted element and
 * inlines the results — including the element's resolved `background-color`.
 * When the mbeditor editor is on a dark theme, the preview iframe's ancestor
 * `background: var(--bg)` resolves to e.g. `rgb(20,16,19)` and that color
 * ends up as inline `background-color` on every `<p>` in the WeChat article.
 *
 * Strategy: read the current theme's chrome variables live, then strip any
 * inline `background-color` whose value matches one of them. Article-authored
 * backgrounds (#fafaf9, #FEFCF7, etc.) are never equal to the chrome vars
 * across any of the three themes, so this is safe.
 */
function stripThemeChromeBackgrounds(html: string): string {
  if (typeof document === "undefined" || typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }

  const themeColors = collectThemeChromeColors();
  if (themeColors.size === 0) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  // 最外层元素 = block_doc 的信封壳。它的 background 是文章的显式页背景
  // (用户/agent/模板设的),永不视为编辑器 chrome,即使值恰好等于某主题变量。
  const rootEnvelope = doc.body ? doc.body.firstElementChild : null;
  const styled = doc.querySelectorAll<HTMLElement>("[style]");
  let changed = false;
  for (const el of styled) {
    if (el === rootEnvelope) continue;
    const bg = el.style.backgroundColor;
    if (bg && themeColors.has(normalizeColor(bg))) {
      el.style.removeProperty("background-color");
      if (el.getAttribute("style") === "") el.removeAttribute("style");
      changed = true;
    }
  }
  if (!changed) return html;
  return doc.body ? doc.body.innerHTML : html;
}

/** Colors too common in authored article content to ever strip, even when a
 *  theme's chrome vars resolve to them. Pure #000000 and #222222 are everyday
 *  choices for dark heroes and code blocks; stripping those deletes the
 *  author's design. */
const GENERIC_AUTHORED_COLORS = new Set([
  "rgb(0,0,0)",
  "rgb(17,17,17)",
  "rgb(34,34,34)",
  "rgb(51,51,51)",
  "rgb(255,255,255)",
]);

/** Read --bg / --bg-deep / --surface / --surface-2 / --surface-3 values from
 *  the document root. Covers whatever theme is currently active. */
function collectThemeChromeColors(): Set<string> {
  const out = new Set<string>();
  const cs = window.getComputedStyle(document.documentElement);
  // --surface-2 is intentionally omitted: on the light theme it's a near-white
  // cream (#f8f1e6) that would false-positive on white-backgrounded table/card
  // in article content. Generic shades (pure black/white, #222, #333) are
  // likewise excluded — see GENERIC_AUTHORED_COLORS.
  const varNames = ["--bg", "--bg-deep", "--surface", "--surface-3"];
  for (const v of varNames) {
    const raw = cs.getPropertyValue(v).trim();
    if (!raw) continue;
    const n = normalizeColor(raw);
    if (n && !GENERIC_AUTHORED_COLORS.has(n)) out.add(n);
  }
  return out;
}

/** Normalize "#141013" / "rgb(20, 16, 19)" / "RGB(20,16,19)" to "rgb(20,16,19)"
 *  so hex vs rgb vs whitespace differences all compare equal. */
function normalizeColor(s: string): string {
  const trimmed = s.trim();
  const shortHex = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    const [, r, g, b] = shortHex;
    return `rgb(${parseInt(r + r, 16)},${parseInt(g + g, 16)},${parseInt(b + b, 16)})`;
  }
  const longHex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const h = longHex[1];
    return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
  }
  const rgb = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgb) return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`;
  return trimmed.toLowerCase().replace(/\s+/g, "");
}

function htmlToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  // textContent has no notion of block boundaries — "<p>甲</p><p>乙</p>"
  // would fuse into "甲乙". Inject newlines at block-level closings first
  // so the text/plain fallback keeps paragraph structure.
  const withBreaks = html.replace(
    /<(?:\/(?:p|div|section|article|h[1-6]|li|tr|blockquote|pre|table)|br\s*\/?)>/gi,
    "$&\n"
  );
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  const text = doc.body ? doc.body.textContent ?? "" : "";
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackCopyRichText(html: string): void {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持剪贴板");
  }

  // Chrome's execCommand("copy") serializer walks ancestors of every selected
  // element looking for a non-transparent background-color, and inlines that
  // resolved color onto each <p> as if it had been authored that way. When
  // the parent page (mbeditor) has `body { background: var(--bg) }` resolved
  // to `#211b15` (warm-dark theme), every pasted <p> in WeChat ends up with
  // `background-color: rgb(20, 16, 19)` baked in.
  //
  // Workaround: wrap the selected fragment in a div whose own inline
  // background-color is opaque white. Chrome's ancestor walk stops at the
  // first opaque ancestor it finds — that becomes our wrapper, not the
  // themed body — and the inlined background on the pasted paragraphs ends
  // up white instead of dark. The wrapper itself is offscreen, so visually
  // nothing changes during the copy.
  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.opacity = "0";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#1a1a1a";

  // Parse with DOMParser then move nodes — avoids innerHTML on live DOM and
  // the script-execution risk that comes with it.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (parsed.body) {
    while (parsed.body.firstChild) container.appendChild(parsed.body.firstChild);
  }
  document.body.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  if (!selection) {
    document.body.removeChild(container);
    throw new Error("当前环境不支持选区 API");
  }

  selection.removeAllRanges();
  selection.addRange(range);

  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("复制命令执行失败");
  } finally {
    selection.removeAllRanges();
    document.body.removeChild(container);
  }
}
