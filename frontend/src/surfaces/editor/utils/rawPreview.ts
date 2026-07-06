/**
 * Build a complete, standalone HTML document for the "交互预览（原始）" mode.
 *
 * Unlike the WeChat-effect preview (which round-trips through
 * POST /publish/preview → inline_css → sanitize_for_wechat), this assembles the
 * draft's *raw* html/css verbatim so the browser can render the original
 * SVG/SMIL exactly as authored — including declarative click-to-expand
 * animations that only work before the WeChat compatibility pass strips them.
 *
 * IMPORTANT: no sanitize, no inlining. The css is injected as a <style> tag and
 * the html is embedded as-is into <body>. Safety is enforced at the render
 * boundary instead: the consuming <iframe srcDoc=...> runs without
 * allow-same-origin (opaque origin → no access to parent window / cookies /
 * storage) and without allow-scripts (SMIL is declarative and needs no JS).
 */
export function buildRawPreviewSrcDoc(html: string, css: string): string {
  // Escape any `</style` (and the generic `</`) sequence inside the author CSS
  // before it lands between our literal <style>…</style> tags. Without this an
  // author CSS field containing `</style><img src=x onerror=…>` would close the
  // style element early and the trailing text would parse as body HTML. `<\/`
  // is a CSS-spec-legal escape the browser parses identically, so the styles
  // still apply while the breakout is neutralized.
  const safeCss = css ? css.replace(/<\//g, "<\\/") : css;
  const styleBlock = safeCss && safeCss.trim() ? `<style>${safeCss}</style>` : "";
  return (
    "<!doctype html>" +
    '<html><head><meta charset="utf-8">' +
    styleBlock +
    "<style>*,*::before,*::after{box-sizing:border-box}" +
    "html,body{margin:0;padding:0}" +
    "img,svg,video{max-width:100%}</style>" +
    "</head><body>" +
    (html ?? "") +
    "</body></html>"
  );
}
