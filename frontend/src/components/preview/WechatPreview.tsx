import { useRef, useCallback, useEffect, useState } from "react";
import { normalizeEditableHtml } from "@/utils/htmlSemantics";

interface WechatPreviewProps {
  html: string;
  css: string;
  js?: string;
  mode: "raw" | "wechat";
  onHtmlChange?: (html: string) => void;
}

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
  const editable = mode === "wechat";

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

  const writeToIframe = useCallback(
    (content: string, canEdit: boolean) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument;
      if (!doc) return;

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
    [css, js, onHtmlChange],
  );

  useEffect(() => {
    if (isUserEditing.current) return;
    if (html === lastSetHtml.current) return;
    writeToIframe(html, editable);
  }, [html, editable, writeToIframe]);

  useEffect(() => {
    const timer = setTimeout(() => {
      writeToIframe(html, editable);
    }, 50);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [previewWidth, setPreviewWidth] = useState(375);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = previewWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const change = side === "right" ? delta : -delta;
        setPreviewWidth(Math.max(320, Math.min(800, startWidth + change * 2)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [previewWidth],
  );

  return (
    <div className="w-full flex items-start justify-center">
      <div
        className="w-3 shrink-0 cursor-col-resize flex items-center justify-center self-stretch max-h-screen sticky top-0 group"
        onMouseDown={handleResizeStart("left")}
      >
        <div className="w-1 h-12 rounded-full bg-fg-muted/20 group-hover:bg-accent group-hover:h-16 transition-all" />
      </div>

      <div
        ref={containerRef}
        className="shrink-0 rounded-xl overflow-hidden border border-border-primary shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col"
        style={{ width: `${previewWidth}px` }}
      >
        <div className="h-6 bg-surface-tertiary flex items-center justify-between px-3 shrink-0">
          <span className="text-[10px] text-fg-muted font-mono">
            {mode === "raw" ? "原始预览" : "公众号预览"}
          </span>
          <span className="text-[10px] text-fg-muted font-mono">
            {previewWidth}px
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

      <div
        className="w-3 shrink-0 cursor-col-resize flex items-center justify-center self-stretch max-h-screen sticky top-0 group"
        onMouseDown={handleResizeStart("right")}
      >
        <div className="w-1 h-12 rounded-full bg-fg-muted/20 group-hover:bg-accent group-hover:h-16 transition-all" />
      </div>
    </div>
  );
}
