import { stripUnsafeUnicode } from "./unicode";

const DANGEROUS_TAGS = new Set([
  "SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META",
  "STYLE", "BASE", "FRAME", "FRAMESET",
]);

/**
 * Sanitize pasted HTML from Word/Office and remove dangerous elements.
 */
export function sanitizePastedHtml(raw: string): string {
  const cleaned = stripUnsafeUnicode(raw)
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<\/?o:[^>]*>/gi, "")
    .replace(/<\/?v:[^>]+>/gi, "")
    .replace(/<\/?w:[^>]+>/gi, "");

  if (typeof DOMParser === "undefined") return cleaned;

  const doc = new DOMParser().parseFromString(`<body>${cleaned}</body>`, "text/html");
  doc.body.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element)) return;
    if (DANGEROUS_TAGS.has(node.tagName)) {
      node.remove();
      return;
    }
    for (const name of Array.from(node.getAttributeNames())) {
      if (name.startsWith("on")) {
        node.removeAttribute(name);
        continue;
      }
      if (name === "contenteditable") {
        node.removeAttribute(name);
        continue;
      }
      if (name === "href" || name === "src" || name === "xlink:href") {
        const value = (node.getAttribute(name) ?? "").trim().toLowerCase();
        if (value.startsWith("javascript:") || value.startsWith("vbscript:") || value.startsWith("data:text/html")) {
          node.removeAttribute(name);
        }
      }
    }
  });
  return doc.body.innerHTML;
}

/**
 * Escape HTML entities.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
