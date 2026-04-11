/**
 * Writes rich-text HTML to the clipboard.
 *
 * Post-Stage-0: the single public API is writeHtmlToClipboard. Callers are
 * responsible for preparing the HTML upstream (via renderForWechat in Stage 1).
 * No more processForWechat helper, no more "copyRichText" — those lived in a
 * world where the frontend did its own CSS inlining, which violated WYSIWYG.
 */
export async function writeHtmlToClipboard(html: string): Promise<boolean> {
  try {
    const blob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([html], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blob,
        "text/plain": plainBlob,
      }),
    ]);
    return true;
  } catch {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.setAttribute("contenteditable", "true");
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const ok = document.execCommand("copy");
    document.body.removeChild(container);
    return ok;
  }
}
