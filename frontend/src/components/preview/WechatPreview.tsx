import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";

/** 给所有 img 加圆角、去阴影 */
function normalizeImageStyles(html: string): string {
  return html.replace(
    /<img\b([^>]*?)style="([^"]*)"([^>]*?)>/gi,
    (_match, before, style, after) => {
      let s = style
        .replace(/box-shadow:[^;]+;?/gi, "")
        .replace(/border-radius:[^;]+;?/gi, "");
      s = `border-radius:8px;max-width:100%;${s}`;
      return `<img${before}style="${s}"${after}>`;
    }
  ).replace(
    /<img\b(?![^>]*style=)([^>]*?)>/gi,
    (_match, attrs) => `<img style="border-radius:8px;max-width:100%;"${attrs}>`
  );
}

export interface WechatPreviewHandle {
  insertHtml: (html: string) => void;
}

interface WechatPreviewProps {
  html: string;
  css: string;
  mode: "raw" | "wechat";
  onHtmlChange?: (html: string) => void;
}

const WechatPreview = forwardRef<WechatPreviewHandle, WechatPreviewProps>(
  function WechatPreview({ html, css, mode, onHtmlChange }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const isUserEditing = useRef(false);
    const lastSetHtml = useRef("");
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const processedHtml = normalizeImageStyles(html);

    // Write content into iframe (only when changed externally)
    const writeToIframe = useCallback((content: string, editable: boolean) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument;
      if (!doc) return;

      const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    outline: none;
    -webkit-user-modify: ${editable ? "read-write" : "read-only"};
  }
  body *::selection { background: rgba(168, 85, 247, 0.3); }
  img { border-radius: 8px; max-width: 100%; box-shadow: none; }
  ${css}
</style>
</head><body${editable ? ' contenteditable="true"' : ''}>${content}</body></html>`;

      doc.open();
      doc.write(fullHtml);
      doc.close();
      lastSetHtml.current = content;

      if (editable && onHtmlChange) {
        // Listen for edits inside iframe
        doc.body.addEventListener("input", () => {
          isUserEditing.current = true;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            const newHtml = doc.body.innerHTML;
            lastSetHtml.current = newHtml;
            onHtmlChange(newHtml);
            setTimeout(() => { isUserEditing.current = false; }, 500);
          }, 800);
        });

        // Handle paste: keep HTML format
        doc.body.addEventListener("paste", (e) => {
          // Let browser handle paste naturally for rich content
        });
      }
    }, [css, onHtmlChange]);

    // Sync external html changes
    useEffect(() => {
      if (isUserEditing.current) return;
      if (processedHtml === lastSetHtml.current) return;
      writeToIframe(processedHtml, mode === "wechat");
    }, [processedHtml, mode, writeToIframe]);

    // Initial write on mount
    useEffect(() => {
      // Small delay to ensure iframe is ready
      const timer = setTimeout(() => {
        writeToIframe(processedHtml, mode === "wechat");
      }, 50);
      return () => clearTimeout(timer);
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // Expose insert method
    useImperativeHandle(ref, () => ({
      insertHtml(newHtml: string) {
        const iframe = iframeRef.current;
        const doc = iframe?.contentDocument;
        if (!doc?.body) return;

        // Append to end
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = normalizeImageStyles(newHtml);
        while (wrapper.firstChild) {
          doc.body.appendChild(wrapper.firstChild);
        }

        // Notify parent
        const fullContent = doc.body.innerHTML;
        lastSetHtml.current = fullContent;
        onHtmlChange?.(fullContent);
      },
    }), [onHtmlChange]);

    return (
      <div className="h-full flex flex-col">
        <div className="mx-auto w-full h-full border border-border rounded-xl overflow-hidden">
          <div className="h-6 bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs text-gray-400">
              {mode === "raw" ? "原始预览（只读）" : "公众号效果（可编辑）"}
            </span>
          </div>
          <iframe
            ref={iframeRef}
            className="w-full border-0"
            style={{ height: "calc(100% - 24px)", background: "#0d0d0d" }}
            title="preview"
          />
        </div>
      </div>
    );
  },
);

export default WechatPreview;
