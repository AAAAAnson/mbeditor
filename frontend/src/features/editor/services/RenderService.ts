import { renderMarkdown } from "@/utils/markdown";
import { extractHTML } from "@/utils/extractor";
import type { BridgeDoc, RenderRequest } from "@/features/editor/types";
import {
  bridgeDocToArticleSnapshot,
  shouldUseProjectedBridge,
} from "@/features/editor/adapters/DocumentAdapter";
import { renderProjectedArticleAsMBDoc } from "@/features/editor/api/mbdocApi";
import { previewWechatHtml } from "@/features/editor/api/publishApi";

export function createRawRender(doc: BridgeDoc, markdownTheme: string): RenderRequest {
  const sourceKind = doc.metadata.mode;
  const html = sourceKind === "markdown"
    ? renderMarkdown(doc.legacyFields.markdown, markdownTheme)
    : extractHTML(doc.legacyFields.html);

  return {
    html,
    css: sourceKind === "markdown" ? "" : doc.legacyFields.css,
    js: sourceKind === "markdown" ? "" : doc.legacyFields.js,
    sourceKind,
  };
}

export async function processRenderPreview(render: RenderRequest): Promise<string> {
  if (!render.html.trim()) {
    return "";
  }
  return previewWechatHtml(render.html, render.css);
}


export async function processBridgePreview(
  doc: BridgeDoc,
  render: RenderRequest,
): Promise<string> {
  if (shouldUseProjectedBridge(doc)) {
    return renderProjectedArticleAsMBDoc(
      bridgeDocToArticleSnapshot(doc, {
        html: doc.legacyFields.html,
        css: doc.legacyFields.css,
        js: doc.legacyFields.js,
        markdown: doc.legacyFields.markdown,
      }),
      false,
    );
  }
  return processRenderPreview(render);
}
