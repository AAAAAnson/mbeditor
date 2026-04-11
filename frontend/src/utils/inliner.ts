import juice from "juice";

/**
 * Inline the given CSS rules into the HTML's style attributes.
 *
 * This function is the ONLY place in the frontend where CSS-to-inline-style
 * conversion happens. It is consumed by Stage-1 renderForWechat.
 *
 * Stage-0 scope: simply wraps juice. Does NOT strip tags, classes, or apply
 * any WeChat-specific rewriting — that responsibility moves to the backend
 * renderForWechat pipeline in Stage 1.
 */
export function inlineCSS(html: string, css: string): string {
  if (!css.trim()) return html;
  try {
    const wrapped = `<style>${css}</style>${html}`;
    return juice(wrapped, { removeStyleTags: true, preserveImportant: true });
  } catch {
    return html;
  }
}
