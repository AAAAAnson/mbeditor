// useSvgPatch — locate the selected <svg> inside draft.html and write edits
// back through the one legal path: onFieldChange("html", newFullHtml)
// (contract B). We never touch useEditorDraft / setDraft directly.
//
// Targeting strategy: the selected outline block's sourceOffset points at the
// "<svg" start inside draft.html (StructurePanel.buildHtmlOutline). We match
// all <svg>…</svg> spans and pick the one whose start index is closest to (and
// not past) sourceOffset. Patching splices the new svg string in by exact byte
// offsets so everything outside the svg is preserved verbatim.

import { useCallback, useMemo } from "react";
import { applySvgAttr, parseSvgModel, type SvgModel } from "./svgParse";

// Kept for back-compat / quick existence checks. NOTE: this lazy regex stops at
// the first </svg> and therefore mis-handles nested <svg> (e.g. inside
// <foreignObject>). findSvgSpans below does NOT use it for boundary detection —
// it scans tag depth so a nested </svg> can't truncate the outer span.
export const SVG_SPAN_RE = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;

// Matches any <svg ...> open tag or </svg> close tag (and self-closing <svg/>),
// case-insensitive, used to walk depth. The \b guards against <svgfoo>.
const SVG_TAG_RE = /<svg\b[^>]*?(\/?)>|<\/svg\s*>/gi;

export interface SvgSpan {
  /** Absolute start index in html. */
  start: number;
  /** Absolute end index (exclusive) in html. */
  end: number;
  /** The matched <svg>…</svg> substring. */
  text: string;
}

/**
 * Find every top-level <svg>…</svg> span with absolute offsets.
 *
 * Depth-aware: a nested <svg> (or </svg> appearing inside a <foreignObject>/
 * <use> subtree) does not terminate the outer span early. We only emit a span
 * when depth returns to 0, so the boundaries always wrap a balanced subtree.
 */
export function findSvgSpans(html: string): SvgSpan[] {
  const spans: SvgSpan[] = [];
  if (!html) return spans;

  let depth = 0;
  let start = -1;
  SVG_TAG_RE.lastIndex = 0;
  for (let m = SVG_TAG_RE.exec(html); m; m = SVG_TAG_RE.exec(html)) {
    const token = m[0];
    const isClose = token.startsWith("</");
    const isSelfClosing = !isClose && m[1] === "/";

    if (isSelfClosing) {
      // <svg .../> — a complete span only when not nested inside another svg.
      if (depth === 0) {
        spans.push({ start: m.index, end: m.index + token.length, text: token });
      }
      continue;
    }

    if (!isClose) {
      if (depth === 0) start = m.index;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const end = m.index + token.length;
        spans.push({ start, end, text: html.slice(start, end) });
        start = -1;
      }
    }
  }
  return spans;
}

/**
 * Pick the svg span addressed by sourceOffset.
 * Prefers the last span starting at or before sourceOffset (the block's
 * sourceOffset is the "<svg" start). Falls back to the nearest span when no
 * span starts at/before the offset (defensive against drift).
 */
export function locateSvgSpan(
  html: string,
  sourceOffset: number | undefined,
): SvgSpan | null {
  const spans = findSvgSpans(html);
  if (spans.length === 0) return null;
  if (typeof sourceOffset !== "number") return spans[0];

  let chosen: SvgSpan | null = null;
  for (const span of spans) {
    if (span.start <= sourceOffset && (!chosen || span.start > chosen.start)) {
      chosen = span;
    }
  }
  if (chosen && sourceOffset < chosen.end) return chosen;

  // No span contains the offset — fall back to nearest by distance.
  return spans.reduce((best, span) => {
    const bestDist = Math.abs((best.start as number) - sourceOffset);
    const dist = Math.abs(span.start - sourceOffset);
    return dist < bestDist ? span : best;
  }, spans[0]);
}

/**
 * Splice a replacement svg string into html at the given span, returning the
 * full html. Pure — used by both the hook and the tests.
 */
export function spliceSvg(html: string, span: SvgSpan, nextSvg: string): string {
  return html.slice(0, span.start) + nextSvg + html.slice(span.end);
}

export interface UseSvgPatchResult {
  /** Parsed model of the currently-targeted svg, or null if none. */
  model: SvgModel | null;
  /** The targeted svg span (offsets + text), or null. */
  span: SvgSpan | null;
  /**
   * Edit one attribute on one element of the targeted svg and write the whole
   * html back via onFieldChange. No-op when there is no target.
   */
  patchAttr: (elementIndex: number, attr: string, value: string) => void;
}

/**
 * Hook wiring a selected svg block to its editable model + write-back.
 *
 * @param html        draft.html (full flat string)
 * @param sourceOffset the selected OutlineBlock.sourceOffset (svg start)
 * @param onFieldChange the canonical write-back (contract B)
 */
export function useSvgPatch(
  html: string,
  sourceOffset: number | undefined,
  onFieldChange: (field: "html", value: string) => void,
): UseSvgPatchResult {
  const span = useMemo(
    () => locateSvgSpan(html, sourceOffset),
    [html, sourceOffset],
  );

  const model = useMemo(
    () => (span ? parseSvgModel(span.text) : null),
    [span],
  );

  const patchAttr = useCallback(
    (elementIndex: number, attr: string, value: string) => {
      if (!span) return;
      const nextSvg = applySvgAttr(span.text, elementIndex, attr, value);
      if (nextSvg === span.text) return;
      const nextHtml = spliceSvg(html, span, nextSvg);
      if (nextHtml === html) return;
      onFieldChange("html", nextHtml);
    },
    [span, html, onFieldChange],
  );

  return { model, span, patchAttr };
}
