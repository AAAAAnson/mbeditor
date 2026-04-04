import { useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import WechatTiptapEditor from "@/components/editor/WechatTiptapEditor";
import type { WechatTiptapEditorHandle } from "@/components/editor/WechatTiptapEditor";

/** 给所有 img 加圆角、去阴影、限制宽度 */
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
    (_match, attrs) => {
      return `<img style="border-radius:8px;max-width:100%;"${attrs}>`;
    }
  );
}

export interface WechatPreviewHandle {
  insertRawHtmlBlock: (html: string) => void;
  insertImage: (url: string) => void;
}

interface WechatPreviewProps {
  html: string;
  css: string;
  js: string;
  mode: "raw" | "wechat";
  onHtmlChange?: (html: string) => void;
  onImageUpload: () => void;
}

const WechatPreview = forwardRef<WechatPreviewHandle, WechatPreviewProps>(
  function WechatPreview({ html, css, js, mode, onHtmlChange, onImageUpload }, ref) {
    const tiptapRef = useRef<WechatTiptapEditorHandle>(null);

    useImperativeHandle(
      ref,
      () => ({
        insertRawHtmlBlock(rawHtml: string) {
          tiptapRef.current?.insertRawHtmlBlock(rawHtml);
        },
        insertImage(url: string) {
          tiptapRef.current?.insertImage(url);
        },
      }),
      [],
    );

    // 原始预览模式：只读 iframe
    if (mode === "raw") {
      const srcDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body style="margin:0;padding:16px;font-family:-apple-system,sans-serif;">${normalizeImageStyles(html)}
<script>${js}<\/script></body></html>`;

      return (
        <div className="h-full flex flex-col">
          <div className="mx-auto w-full max-w-[414px] h-full border border-border rounded-xl overflow-hidden bg-white">
            <div className="h-6 bg-gray-100 flex items-center justify-center">
              <span className="text-xs text-gray-400">原始预览（只读）</span>
            </div>
            <iframe
              srcDoc={srcDoc}
              className="w-full flex-1 border-0"
              style={{ height: "calc(100% - 24px)" }}
              sandbox="allow-scripts"
              title="preview"
            />
          </div>
        </div>
      );
    }

    // 微信预览模式：TipTap WYSIWYG 编辑器
    return (
      <div className="h-full flex flex-col">
        <div className="mx-auto w-full max-w-[414px] h-full border border-border rounded-xl overflow-hidden bg-white">
          <div className="h-6 bg-gray-100 flex items-center justify-center">
            <span className="text-xs text-gray-400">公众号效果（可编辑）</span>
          </div>
          <div style={{ height: "calc(100% - 24px)" }}>
            <WechatTiptapEditor
              ref={tiptapRef}
              html={html}
              css={css}
              onChange={(newHtml) => onHtmlChange?.(newHtml)}
              onImageUpload={onImageUpload}
            />
          </div>
        </div>
      </div>
    );
  },
);

export default WechatPreview;
