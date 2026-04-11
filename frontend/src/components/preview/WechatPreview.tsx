import { useRef, useCallback, useEffect, useState } from "react";
import { normalizeEditableHtml } from "@/utils/htmlSemantics";

interface WechatPreviewProps {
  html: string;
  css: string;
  js?: string;
  mode: "raw" | "wechat";
  onHtmlChange?: (html: string) => void;
}

/**
 * WeChat article preview iframe.
 *
 * Renders the provided HTML inside an iframe that mimics the WeChat mobile
 * article view (375px width, PingFang font, line-height 1.8).
 *
 * Post-Stage-0 invariant: the HTML written into the iframe body is EXACTLY
 * what the caller passes in. No second-pass sanitization, no cleanMode toggle,
 * no image style normalization. WYSIWYG is enforced by the upstream
 * renderForWechat pipeline (Stage 1+).
 */
export default function WechatPreview({
  html,
  css,
  js,
  mode,
  onHtmlChange,
}: WechatPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isUserEditing = useRef(false);
  const lastSetHtml = useRef("");
  const lastSemanticKey = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [iframeHeight, setIframeHeight] = useState(400);

  // Post-Stage-0: in wechat mode the iframe body is unconditionally
  // contenteditable. Previously this was gated by a `cleanMode` toggle that
  // defaulted to true (read-only). The toggle has been removed so that
  // preview == final output. Upstream (Editor.tsx) controls whether
  // onHtmlChange is wired.
  const editable = mode === "wechat";

  // Listen for iframe resize messages (validate source to prevent spoofing).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (
        e.data?.type === "mbeditor:preview-resize" &&
        typeof e.data.height === "number"
      ) {
        setIframeHeight(Math.max(400, e.data.height + 40));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // NOTE: if `onHtmlChange` is an unstable reference (inline lambda), every
  // parent render reconstructs this callback, which re-runs the sync effect
  // below and redraws the iframe. Callers SHOULD memoize onHtmlChange via
  // useCallback. This is not fixed in Stage 0 — Stage 1 may refactor the
  // write path into a ref-based side effect to sever the dep.
  const writeToIframe = useCallback(
    (content: string, canEdit: boolean) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument;
      if (!doc) return;

      // The iframe chrome (font, padding, line-height) mimics the WeChat
      // article reader page. It is NOT part of the content — it is the
      // viewport. The content HTML is written AS-IS into body.
      const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 20px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    outline: none;
    -webkit-user-modify: ${canEdit ? "read-write" : "read-only"};
  }
  body *::selection { background: rgba(232, 85, 58, 0.12); }
  img { max-width: 100%; }
  ${css}
</style>
</head><body${canEdit ? ' contenteditable="true"' : ""}>${content}${js ? `<script>${js}<\/script>` : ""}<script>(function(){var post=function(){try{window.parent.postMessage({type:'mbeditor:preview-resize',height:document.body.scrollHeight},'*');}catch(e){}};if(typeof ResizeObserver!=='undefined'){var ro=new ResizeObserver(post);ro.observe(document.body);}Array.from(document.images).forEach(function(img){if(!img.complete)img.addEventListener('load',post);});post();setTimeout(post,100);setTimeout(post,500);})();<\/script></body></html>`;

      doc.open();
      doc.write(fullHtml);
      doc.close();

      const initial = normalizeEditableHtml(content);
      lastSemanticKey.current = initial.semanticKey;
      lastSetHtml.current = content;

      if (canEdit && onHtmlChange) {
        doc.body.addEventListener("input", () => {
          isUserEditing.current = true;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            if (!onHtmlChange) {
              setTimeout(() => {
                isUserEditing.current = false;
              }, 500);
              return;
            }
            const next = normalizeEditableHtml(doc.body.innerHTML);
            if (next.semanticKey !== lastSemanticKey.current) {
              lastSemanticKey.current = next.semanticKey;
              lastSetHtml.current = next.serialized;
              onHtmlChange(next.serialized);
            }
            setTimeout(() => {
              isUserEditing.current = false;
            }, 500);
          }, 800);
        });
      }
    },
    [css, js, onHtmlChange]
  );

  // Sync external html changes.
  useEffect(() => {
    if (isUserEditing.current) return;
    if (html === lastSetHtml.current) return;
    writeToIframe(html, editable);
  }, [html, editable, writeToIframe]);

  // Initial write on mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      writeToIframe(html, editable);
    }, 50);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-[375px] shrink-0 rounded-xl overflow-hidden border border-border-primary shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col">
        <div className="h-6 bg-surface-tertiary flex items-center justify-between px-2 shrink-0">
          <span className="text-[10px] text-fg-muted font-mono">
            {mode === "raw" ? "原始预览" : "公众号预览"}
          </span>
        </div>
        <iframe
          ref={iframeRef}
          className="w-full border-0"
          style={{
            height: `${iframeHeight}px`,
            background: "#FAF8F5",
            transition: "height 0.2s ease",
          }}
          title="preview"
        />
      </div>
    </div>
  );
}
