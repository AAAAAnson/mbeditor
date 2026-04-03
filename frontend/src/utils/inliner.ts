import juice from "juice";

const WX_TAG_WHITELIST = new Set([
  "section", "p", "span", "img", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "td", "th",
  "br", "hr", "pre", "code", "a", "sub", "sup",
  "figure", "figcaption",
]);

const WX_ATTR_WHITELIST = new Set([
  "style", "src", "href", "alt", "width", "height",
  "colspan", "rowspan", "target",
]);

export function inlineCSS(html: string, css: string): string {
  if (!css.trim()) return html;
  const wrapped = `<style>${css}</style>${html}`;
  return juice(wrapped, { removeStyleTags: true, preserveImportant: true });
}

export function sanitizeForWechat(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body) return html;

  function walk(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (!WX_TAG_WHITELIST.has(tag)) {
        const replacement = doc.createElement("section");
        replacement.innerHTML = el.innerHTML;
        const style = el.getAttribute("style");
        if (style) replacement.setAttribute("style", style);
        el.replaceWith(replacement);
        walk(replacement);
        return;
      }

      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (!WX_ATTR_WHITELIST.has(attr.name)) {
          el.removeAttribute(attr.name);
        }
      }

      Array.from(el.childNodes).forEach(walk);
    }
  }

  walk(doc.body);
  return doc.body.innerHTML;
}

export function processForWechat(html: string, css: string): string {
  if (!html.trim()) return "";
  const inlined = inlineCSS(html, css);
  return sanitizeForWechat(inlined);
}
