/**
 * Write sanitized HTML to the system clipboard so WeChat's paste handler
 * receives it as rich text (text/html) with a plain-text fallback.
 *
 * The HTML must already have been run through the WeChat-safe sanitizer
 * pipeline on the backend (/publish/process-for-copy) — that step strips
 * flex/grid/position:absolute/animations/transforms/etc and uploads local
 * images to mmbiz.qpic.cn so the paste result renders identically to the
 * editor preview.
 */
export async function writeHtmlToClipboard(html: string): Promise<void> {
  const plainText = htmlToPlainText(html);

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // fall through to execCommand fallback
    }
  }

  fallbackCopyRichText(html);
}

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const text = template.content.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

function fallbackCopyRichText(html: string): void {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持剪贴板");
  }

  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.opacity = "0";
  container.innerHTML = html;
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
