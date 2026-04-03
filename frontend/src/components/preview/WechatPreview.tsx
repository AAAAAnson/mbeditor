import { useMemo } from "react";
import { processForWechat } from "@/utils/inliner";

interface WechatPreviewProps {
  html: string;
  css: string;
  js: string;
  mode: "raw" | "wechat";
}

export default function WechatPreview({ html, css, js, mode }: WechatPreviewProps) {
  const srcDoc = useMemo(() => {
    if (mode === "raw") {
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body style="margin:0;padding:16px;font-family:-apple-system,sans-serif;">${html}
<script>${js}<\/script></body></html>`;
    }
    const processed = processForWechat(html, css);
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{margin:0;padding:16px;font-family:-apple-system,sans-serif;font-size:16px;line-height:1.8;color:#333;}</style>
</head><body>${processed}</body></html>`;
  }, [html, css, js, mode]);

  return (
    <div className="h-full flex flex-col">
      <div className="mx-auto w-full max-w-[414px] h-full border border-border rounded-xl overflow-hidden bg-white">
        <div className="h-6 bg-gray-100 flex items-center justify-center">
          <span className="text-xs text-gray-400">{mode === "raw" ? "原始预览" : "公众号效果"}</span>
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
