// SVG parsing helpers for the visual edit panel (WP-P2-1).
//
// These are pure functions: given an <svg> string, parse it with DOMParser
// and surface the editable handles the panel UI needs — colour swatches,
// drag hotspots, and SMIL timeline nodes. Nothing here mutates the source;
// the panel applies edits through useSvgPatch (which re-serialises and splices
// the result back into draft.html via onFieldChange — see contract B).
//
// DOM feature contract (契约 D, from backend effect_registry.py):
//  - <rect id="...btn"> / <g id="...btn"> = click hotspot
//  - <animate>/<animateTransform>/<set> with begin/dur = SMIL timeline node
//  - colours live in fill="#..", stroke="#..", stop-color="#.."
//
// Local types only — we deliberately do NOT import effect-registry/types
// (契约 C: keep the SVG panel decoupled from the effect template registry).

/** A single editable colour occurrence inside the SVG. */
export interface SvgColorEntry {
  /** Stable key the panel uses for React lists + patch targeting. */
  id: string;
  /** Which attribute carries the colour. */
  attr: "fill" | "stroke" | "stop-color";
  /** Current hex value, normalised to lowercase #rrggbb / #rgb. */
  value: string;
  /** Human label, e.g. the owning element's id or tag. */
  label: string;
  /** 0-based index into the flattened element list (DOM order). */
  elementIndex: number;
}

/** A draggable click hotspot (rect/g whose id ends with "btn"). */
export interface SvgHotspotEntry {
  id: string;
  /** The element's id attribute (always present for hotspots). */
  elementId: string;
  tag: string;
  /** x/y/width/height when the element is a <rect>; undefined for <g>. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  elementIndex: number;
}

/** A SMIL timeline node (<animate>/<animateTransform>/<set>). */
export interface SvgSmilEntry {
  id: string;
  tag: "animate" | "animateTransform" | "set";
  /** begin attribute, e.g. "0s" / "0.6s" / "btn1.click". */
  begin: string;
  /** dur attribute, e.g. "1s" (may be empty for <set>). */
  dur: string;
  /** attributeName being animated, when present. */
  attributeName?: string;
  /** label the panel shows; defaults to begin. */
  label: string;
  elementIndex: number;
}

export interface SvgModel {
  colors: SvgColorEntry[];
  hotspots: SvgHotspotEntry[];
  smil: SvgSmilEntry[];
  /** true when the input parsed into a usable <svg> root. */
  ok: boolean;
}

const COLOR_ATTRS = ["fill", "stroke", "stop-color"] as const;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalise a hex colour to lowercase; return null if not a hex literal. */
export function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!HEX_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function isHotspotId(id: string | null): boolean {
  return Boolean(id && /btn$/i.test(id));
}

function parseNumberAttr(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name);
  if (raw == null || raw.trim() === "") return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parse an <svg> source string into the editable model.
 * Safe in jsdom and the browser; returns ok:false when no <svg> root is found.
 */
export function parseSvgModel(svgSource: string): SvgModel {
  const empty: SvgModel = { colors: [], hotspots: [], smil: [], ok: false };
  if (typeof DOMParser === "undefined" || !svgSource) return empty;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  } catch {
    return empty;
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === "parsererror") return empty;
  // documentElement may be the <svg> itself or an html wrapper if malformed.
  const svgRoot =
    root.nodeName.toLowerCase() === "svg"
      ? root
      : root.querySelector("svg");
  if (!svgRoot) return empty;

  const colors: SvgColorEntry[] = [];
  const hotspots: SvgHotspotEntry[] = [];
  const smil: SvgSmilEntry[] = [];

  const all = Array.from(svgRoot.querySelectorAll("*"));
  // Include the root element itself so root-level fill/stroke is editable.
  const elements = [svgRoot, ...all];

  elements.forEach((el, elementIndex) => {
    const tag = el.nodeName.toLowerCase();
    const elId = el.getAttribute("id");

    // --- colours ---
    for (const attr of COLOR_ATTRS) {
      const hex = normalizeHex(el.getAttribute(attr));
      if (hex) {
        colors.push({
          id: `color-${elementIndex}-${attr}`,
          attr,
          value: hex,
          label: elId ? `#${elId} ${attr}` : `${tag} ${attr}`,
          elementIndex,
        });
      }
    }

    // --- hotspots ---
    if ((tag === "rect" || tag === "g") && isHotspotId(elId)) {
      hotspots.push({
        id: `hotspot-${elementIndex}`,
        elementId: elId as string,
        tag,
        x: parseNumberAttr(el, "x"),
        y: parseNumberAttr(el, "y"),
        width: parseNumberAttr(el, "width"),
        height: parseNumberAttr(el, "height"),
        elementIndex,
      });
    }

    // --- SMIL timeline nodes ---
    if (tag === "animate" || tag === "animatetransform" || tag === "set") {
      const begin = el.getAttribute("begin") ?? "";
      const dur = el.getAttribute("dur") ?? "";
      const normalizedTag =
        tag === "animatetransform" ? "animateTransform" : (tag as "animate" | "set");
      smil.push({
        id: `smil-${elementIndex}`,
        tag: normalizedTag,
        begin,
        dur,
        attributeName: el.getAttribute("attributeName") ?? undefined,
        label: begin || el.getAttribute("attributeName") || normalizedTag,
        elementIndex,
      });
    }
  });

  return { colors, hotspots, smil, ok: true };
}

/**
 * Re-serialise an SVG source after applying a single attribute edit, addressed
 * by the flattened elementIndex used in parseSvgModel (root = 0).
 *
 * Returns the new <svg> string, or the original when the index/attr can't be
 * resolved (defensive: never corrupt the source).
 */
export function applySvgAttr(
  svgSource: string,
  elementIndex: number,
  attr: string,
  value: string,
): string {
  if (typeof DOMParser === "undefined" || !svgSource) return svgSource;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  } catch {
    return svgSource;
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === "parsererror") return svgSource;
  const svgRoot =
    root.nodeName.toLowerCase() === "svg" ? root : root.querySelector("svg");
  if (!svgRoot) return svgSource;

  const elements = [svgRoot, ...Array.from(svgRoot.querySelectorAll("*"))];
  const target = elements[elementIndex];
  if (!target) return svgSource;

  target.setAttribute(attr, value);

  try {
    return new XMLSerializer().serializeToString(svgRoot);
  } catch {
    return svgSource;
  }
}
