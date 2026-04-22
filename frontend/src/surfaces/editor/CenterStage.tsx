import { useEffect, useMemo, useRef, useState } from "react";
import Seg from "@/components/ui/Seg";
import { IconArrowLeft, IconCopy, IconEye, IconSend } from "@/components/icons";
import CompatibilityBadge from "@/components/validation/CompatibilityBadge";
import { useUIStore } from "@/stores/uiStore";
import { uploadWithActive } from "@/lib/image-hosts/dispatch";
import type { EditorDraft, EditorField } from "@/types";
import type { OutlineBlock } from "./StructurePanel";

export async function dispatchEditorImageUpload(file: File): Promise<string> {
  const res = await uploadWithActive(file);
  return res.url;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
const PREVIEW_EDIT_DEBOUNCE_MS = 500;

interface CenterStageProps {
  articleId?: string;
  canGoBack: boolean;
  draft: EditorDraft;
  view: string;
  setView: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  saveState: SaveState;
  selected: string;
  navigationRequest?: {
    block: OutlineBlock;
    seq: number;
  } | null;
  previewHtml: string;
  previewLoading: boolean;
  previewError: string | null;
  publishing: boolean;
  copying: boolean;
  onBack: () => void;
  onFieldChange: (field: EditorField, value: string) => void;
  onRefreshPreview: () => void;
  onCopyRichText: () => void;
  onPublish: () => void;
}

const SAVE_META: Record<SaveState, { label: string; color: string }> = {
  idle: { label: "未保存", color: "var(--fg-4)" },
  dirty: { label: "编辑中", color: "var(--warn)" },
  saving: { label: "保存中", color: "var(--info)" },
  saved: { label: "已保存", color: "var(--forest)" },
  error: { label: "保存失败", color: "var(--accent)" },
};

type PreviewResizeDirection = "width" | "height" | "both";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeEditablePreviewHtml(value: string) {
  if (typeof DOMParser === "undefined") {
    return value.trim();
  }

  const doc = new DOMParser().parseFromString(`<body>${value}</body>`, "text/html");
  doc.body.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
  return doc.body.innerHTML.trim();
}

// Publish-pipeline injects a purely cosmetic outer <section> so the preview
// canvas matches the WeChat .rich_media_content container. That wrapper
// breaks the source↔preview shape comparison downstream, so peel any such
// cosmetic shell (including nested layers) until the preview's top level
// either matches the source or stops looking cosmetic.
const COSMETIC_STYLE_PATTERN = /(?:^|;)\s*(?:font-(?:size|family|weight|style)|line-height|letter-spacing|color|background(?:-color)?|word-(?:wrap|break)|padding|margin|text-align)\s*:/i;

function looksCosmetic(section: Element): boolean {
  if (section.classList.contains("wechat-root")) return true;
  const style = section.getAttribute("style") ?? "";
  if (!style.trim()) return false;
  return COSMETIC_STYLE_PATTERN.test(style);
}

function stripPreviewWrapper(doc: Document, sourceDoc?: Document) {
  const body = doc.body;
  const sourceChildren = sourceDoc ? semanticChildNodes(sourceDoc.body) : [];
  const sourceFirstElement = (
    sourceChildren.length === 1 && sourceChildren[0] instanceof Element
      ? (sourceChildren[0] as Element)
      : null
  );
  const sourceHasSectionRoot = sourceFirstElement?.tagName === "SECTION";

  // Peel layers of single-child <section> wrappers while they look like
  // cosmetic envelopes. Cap the loop so a malformed preview can never hang.
  let safety = 6;
  while (safety-- > 0) {
    const children = Array.from(body.children);
    if (children.length !== 1) break;
    const only = children[0];
    if (only.tagName !== "SECTION") break;

    // Stop as soon as the preview top matches the source's root shape, so
    // nodesShareShape has a real chance to succeed without extra unwrapping.
    if (sourceHasSectionRoot && sourceFirstElement) {
      const previewKids = semanticChildNodes(only);
      const sourceKids = semanticChildNodes(sourceFirstElement);
      if (
        previewKids.length === sourceKids.length &&
        previewKids.every((kid, i) => (
          kid instanceof Element &&
          sourceKids[i] instanceof Element &&
          (kid as Element).tagName === (sourceKids[i] as Element).tagName
        ))
      ) {
        break;
      }
    }

    if (!looksCosmetic(only) && sourceHasSectionRoot) break;

    body.replaceChildren(...Array.from(only.childNodes).map((node) => node.cloneNode(true)));
  }
}

function semanticChildNodes(node: Node) {
  return Array.from(node.childNodes).filter((child) => {
    if (child.nodeType === Node.COMMENT_NODE) return false;
    if (child.nodeType === Node.TEXT_NODE) return (child.textContent ?? "").trim().length > 0;
    return true;
  });
}

function nodesShareShape(sourceNode: Node, previewNode: Node): boolean {
  if (sourceNode.nodeType !== previewNode.nodeType) return false;
  if (sourceNode.nodeType === Node.TEXT_NODE) return true;
  if (sourceNode.nodeType !== Node.ELEMENT_NODE) return false;

  const sourceElement = sourceNode as Element;
  const previewElement = previewNode as Element;
  if (sourceElement.tagName !== previewElement.tagName) return false;

  const sourceChildren = semanticChildNodes(sourceElement);
  const previewChildren = semanticChildNodes(previewElement);
  if (sourceChildren.length !== previewChildren.length) return false;

  return sourceChildren.every((child, index) => nodesShareShape(child, previewChildren[index]!));
}

function copyTextContent(sourceNode: Node, previewNode: Node) {
  if (sourceNode.nodeType === Node.TEXT_NODE && previewNode.nodeType === Node.TEXT_NODE) {
    sourceNode.textContent = previewNode.textContent;
    return;
  }

  if (sourceNode.nodeType !== Node.ELEMENT_NODE || previewNode.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const sourceChildren = semanticChildNodes(sourceNode);
  const previewChildren = semanticChildNodes(previewNode);
  sourceChildren.forEach((child, index) => {
    const matchingPreviewChild = previewChildren[index];
    if (matchingPreviewChild) copyTextContent(child, matchingPreviewChild);
  });
}

const DANGEROUS_TAGS = new Set([
  "SCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "STYLE",
  "BASE",
  "FRAME",
  "FRAMESET",
]);

// Pydantic v2 rejects strings with lone surrogates (common in Word/Office
// rich-text clipboard payloads) with a 422 on ``/publish/preview``. Strip
// those and C0/C1 control chars (except TAB/LF/CR) before any content
// leaves the editor.
function stripUnsafeUnicode(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) {
      out += value[i];
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i++;
        continue;
      }
      continue; // lone high surrogate
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // lone low surrogate
    out += value[i];
  }
  return out;
}

function sanitizePastedHtml(raw: string) {
  const cleaned = stripUnsafeUnicode(raw)
    // Word / Outlook conditional comments: <!--[if gte mso 9]>...<![endif]-->
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    // Office smart-tag / namespace tags that browsers leave intact
    .replace(/<\/?o:[^>]*>/gi, "")
    .replace(/<\/?v:[^>]+>/gi, "")
    .replace(/<\/?w:[^>]+>/gi, "");

  if (typeof DOMParser === "undefined") return cleaned;

  const doc = new DOMParser().parseFromString(`<body>${cleaned}</body>`, "text/html");
  doc.body.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element)) return;
    if (DANGEROUS_TAGS.has(node.tagName)) {
      node.remove();
      return;
    }
    for (const name of Array.from(node.getAttributeNames())) {
      if (name.startsWith("on")) {
        node.removeAttribute(name);
        continue;
      }
      if (name === "contenteditable") {
        node.removeAttribute(name);
        continue;
      }
      if (name === "href" || name === "src" || name === "xlink:href") {
        const value = (node.getAttribute(name) ?? "").trim().toLowerCase();
        if (value.startsWith("javascript:") || value.startsWith("vbscript:") || value.startsWith("data:text/html")) {
          node.removeAttribute(name);
        }
      }
    }
  });
  return doc.body.innerHTML;
}

function cleanPreviewFallback(doc: Document) {
  // Reached when shape matching fails — a structural edit, or a source whose
  // layout comes from ``<head><style>`` rules that the publish pipeline has
  // already inlined. Strip anything executable/navigational (scripts, events,
  // javascript: URLs, dangerous tags), but KEEP ``style`` and ``class``: those
  // carry the user's authored formatting (directly, or via premailer's
  // transcription of the head stylesheet). Dropping them would nuke the
  // entire layout on the first text edit — which is the bug we came here to
  // fix.
  doc.body.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element)) return;
    if (DANGEROUS_TAGS.has(node.tagName)) {
      node.remove();
      return;
    }
    for (const name of Array.from(node.getAttributeNames())) {
      if (name.startsWith("on")) {
        node.removeAttribute(name);
        continue;
      }
      if (name === "contenteditable") {
        node.removeAttribute(name);
        continue;
      }
      if (name === "href" || name === "src" || name === "xlink:href") {
        const value = (node.getAttribute(name) ?? "").trim().toLowerCase();
        if (value.startsWith("javascript:") || value.startsWith("vbscript:") || value.startsWith("data:text/html")) {
          node.removeAttribute(name);
        }
      }
    }
  });
  return doc.body.innerHTML.trim();
}

function mergeEditedPreviewIntoSource(sourceHtml: string, editedPreviewHtml: string) {
  if (typeof DOMParser === "undefined") {
    return normalizeEditablePreviewHtml(editedPreviewHtml);
  }

  const sourceDoc = new DOMParser().parseFromString(`<body>${sourceHtml}</body>`, "text/html");
  const previewDoc = new DOMParser().parseFromString(`<body>${editedPreviewHtml}</body>`, "text/html");
  stripPreviewWrapper(previewDoc, sourceDoc);

  const sourceChildren = semanticChildNodes(sourceDoc.body);
  const previewChildren = semanticChildNodes(previewDoc.body);

  if (
    sourceChildren.length > 0 &&
    sourceChildren.length === previewChildren.length &&
    sourceChildren.every((child, index) => nodesShareShape(child, previewChildren[index]!))
  ) {
    sourceChildren.forEach((child, index) => copyTextContent(child, previewChildren[index]!));
    return sourceDoc.body.innerHTML.trim();
  }

  return cleanPreviewFallback(previewDoc);
}

function normalizeMarkdownText(value: string) {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n");
}

function escapeMarkdownText(value: string) {
  return normalizeMarkdownText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]])/g, "\\$1")
    .replace(/^(#{1,6}|\>|\-|\+|\d+\.)\s/gm, "\\$&");
}

function serializeInlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  const children = semanticChildNodes(element).map(serializeInlineMarkdown).join("");

  switch (element.tagName) {
    case "STRONG":
    case "B":
      return children.trim() ? `**${children.trim()}**` : "";
    case "EM":
    case "I":
      return children.trim() ? `*${children.trim()}*` : "";
    case "DEL":
    case "S":
      return children.trim() ? `~~${children.trim()}~~` : "";
    case "CODE":
      return element.parentElement?.tagName === "PRE" ? children : `\`${(element.textContent ?? "").trim()}\``;
    case "A": {
      const href = element.getAttribute("href") ?? "";
      const text = children.trim() || href;
      return href ? `[${text}](${href})` : text;
    }
    case "IMG": {
      const src = element.getAttribute("src") ?? "";
      const alt = element.getAttribute("alt") ?? "";
      return src ? `![${alt}](${src})` : "";
    }
    case "BR":
      return "  \n";
    default:
      return children;
  }
}

function serializeInlineMarkdownNodes(nodes: Node[]) {
  return nodes.map(serializeInlineMarkdown).join("").replace(/\n[ \t]+/g, "\n").trim();
}

function isBlockMarkdownElement(element: Element) {
  return new Set([
    "P", "DIV", "SECTION", "ARTICLE", "MAIN",
    "H1", "H2", "H3", "H4", "H5", "H6",
    "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR",
  ]).has(element.tagName);
}

function serializeListMarkdown(list: Element, indent = "", ordered = false): string {
  const items = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI");
  if (items.length === 0) return "";

  const result = items.map((item, index) => {
    const marker = ordered ? `${index + 1}. ` : "- ";
    const inlineNodes: Node[] = [];
    const nestedBlocks: string[] = [];

    semanticChildNodes(item).forEach((child) => {
      if (child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")) {
        nestedBlocks.push(serializeListMarkdown(child, `${indent}  `, child.tagName === "OL").trimEnd());
        return;
      }
      inlineNodes.push(child);
    });

    let content = "";
    if (inlineNodes.some((child) => child instanceof HTMLElement && isBlockMarkdownElement(child) && child.tagName !== "P")) {
      const fragment = document.implementation.createHTMLDocument("");
      inlineNodes.forEach((child) => fragment.body.appendChild(child.cloneNode(true)));
      content = serializeMarkdownFromHtml(fragment.body.innerHTML).trim();
    } else {
      const flattened = inlineNodes.flatMap((child) => (
        child instanceof HTMLElement && child.tagName === "P"
          ? semanticChildNodes(child)
          : [child]
      ));
      content = serializeInlineMarkdownNodes(flattened);
    }

    const lines = (content || " ").split("\n");
    const firstLine = `${indent}${marker}${lines[0] ?? ""}`.trimEnd();
    const continuation = lines.slice(1)
      .map((line) => `${indent}  ${line}`.trimEnd())
      .join("\n");
    const nested = nestedBlocks.filter(Boolean).join("\n");
    return [firstLine, continuation, nested].filter(Boolean).join("\n");
  }).join("\n");

  return `${result}\n\n`;
}

function serializeBlockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = escapeMarkdownText(node.textContent ?? "").trim();
    return text ? `${text}\n\n` : "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  const children = semanticChildNodes(element);

  switch (element.tagName) {
    case "SECTION":
    case "DIV":
    case "ARTICLE":
    case "MAIN":
      return children.map(serializeBlockMarkdown).join("");
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      const level = Number(element.tagName[1]);
      const text = serializeInlineMarkdownNodes(children);
      return text ? `${"#".repeat(level)} ${text}\n\n` : "";
    }
    case "P": {
      const text = serializeInlineMarkdownNodes(children);
      return text ? `${text}\n\n` : "";
    }
    case "UL":
      return serializeListMarkdown(element, "", false);
    case "OL":
      return serializeListMarkdown(element, "", true);
    case "BLOCKQUOTE": {
      const content = children.map(serializeBlockMarkdown).join("").trim();
      if (!content) return "";
      return `${content.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}\n\n`;
    }
    case "PRE": {
      const code = element.textContent?.replace(/\n+$/, "") ?? "";
      return code ? `\`\`\`\n${code}\n\`\`\`\n\n` : "";
    }
    case "HR":
      return "---\n\n";
    case "IMG": {
      const src = element.getAttribute("src") ?? "";
      const alt = element.getAttribute("alt") ?? "";
      return src ? `![${alt}](${src})\n\n` : "";
    }
    default: {
      const inline = serializeInlineMarkdownNodes(children);
      return inline ? `${inline}\n\n` : "";
    }
  }
}

function serializeMarkdownFromHtml(html: string) {
  if (typeof DOMParser === "undefined") return html.trim();

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return semanticChildNodes(doc.body)
    .map(serializeBlockMarkdown)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scrollCodeToBlock(
  textarea: HTMLTextAreaElement,
  block: OutlineBlock,
  editorFontSize: number,
  codeLineHeight: number,
) {
  const targetOffset = Math.max(0, block.sourceOffset ?? 0);
  textarea.focus();
  textarea.setSelectionRange(targetOffset, targetOffset);

  const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
  const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : editorFontSize * codeLineHeight;
  const targetLine = Math.max(1, block.sourceLine ?? 1);
  textarea.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - lineHeight * 2);
}

function findPreviewTarget(container: HTMLElement, block: OutlineBlock) {
  if (block.type === "image" && typeof block.previewImageIndex === "number") {
    const images = container.querySelectorAll("img");
    const image = images.item(block.previewImageIndex);
    return image instanceof HTMLElement ? image : null;
  }

  const needles = [block.label, block.preview]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  if (needles.length === 0) return null;

  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, section, blockquote, li"),
  ).filter((node) => {
    const text = normalizeText(node.innerText || node.textContent || "");
    return text.length > 0 && text.length < 280 && needles.some((needle) => text.includes(needle));
  });

  if (candidates.length === 0) return null;

  return candidates.sort((left, right) => {
    const leftLength = normalizeText(left.innerText || left.textContent || "").length;
    const rightLength = normalizeText(right.innerText || right.textContent || "").length;
    return leftLength - rightLength;
  })[0];
}

export default function CenterStage({
  articleId,
  canGoBack,
  draft,
  view,
  setView,
  tab,
  setTab,
  saveState,
  selected,
  navigationRequest,
  previewHtml,
  previewLoading,
  previewError,
  publishing,
  copying,
  onBack,
  onFieldChange,
  onRefreshPreview,
  onCopyRichText,
  onPublish,
}: CenterStageProps) {
  const editorFontSize = useUIStore((state) => state.editorFontSize);
  const editorPreviewWidth = useUIStore((state) => state.editorPreviewWidth);
  const editorPreviewHeight = useUIStore((state) => state.editorPreviewHeight);
  const editorPreviewScale = useUIStore((state) => state.editorPreviewScale);
  const setEditorPreviewSize = useUIStore((state) => state.setEditorPreviewSize);
  const setEditorPreviewScale = useUIStore((state) => state.setEditorPreviewScale);
  const resetEditorPreviewSize = useUIStore((state) => state.resetEditorPreviewSize);
  const resetEditorPreviewScale = useUIStore((state) => state.resetEditorPreviewScale);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const previewEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedPreviewHtmlRef = useRef("");
  const stalePreviewBodyRef = useRef("");
  const pendingPreviewSyncRef = useRef(false);
  const previewResizeRef = useRef<{
    direction: PreviewResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [previewResizeDirection, setPreviewResizeDirection] = useState<PreviewResizeDirection | null>(null);
  const [isPreviewEditing, setIsPreviewEditing] = useState(false);
  const tabs = draft.mode === "markdown"
    ? ["markdown", "css", "js"]
    : ["html", "css", "js"];

  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const saveMeta = SAVE_META[saveState];
  const showCode = view === "code" || view === "split";
  const showPreview = view === "preview" || view === "split";
  const codeLineHeight = editorFontSize <= 12 ? 1.65 : editorFontSize >= 16 ? 1.8 : 1.75;
  const contentTab = draft.mode === "markdown" ? "markdown" : "html";

  const currentCode = activeTab === "html"
    ? draft.html
    : activeTab === "markdown"
      ? draft.markdown
      : activeTab === "css"
        ? draft.css
        : draft.js;

  const lineCount = currentCode.split("\n").length;
  const visibleSource = draft.mode === "markdown" ? draft.markdown : draft.html.replace(/<[^>]*>/g, " ");
  const wordCount = visibleSource.replace(/\s+/g, "").length;
  const previewBody = previewError
    ? `
      <div style="padding: 24px 18px; border-radius: 12px; border: 1px solid rgba(193,74,58,0.24); background: rgba(193,74,58,0.08); color: #8A3B2E;">
        ${escapeHtml(previewError)}
      </div>
    `
    : previewHtml || `
      <div style="padding: 36px 18px; text-align: center; color: #8a7e6e; font-size: 13px; line-height: 1.8;">
        ${previewLoading ? "正在生成预览…" : "这里会显示预览内容。"}
      </div>
    `;
  const previewEditingEnabled = Boolean(articleId) && !previewError && Boolean(previewHtml);

  const previewHint = useMemo(() => {
    if (draft.mode === "markdown") return "可直接在预览里改内容，修改会同步回 Markdown 源码。";
    if (draft.js.trim()) return "JS 会保留下来，但不会出现在公众号预览和草稿里。";
    return previewEditingEnabled
      ? "可直接在预览里改文字，停顿后会自动同步回 HTML 源码。"
      : "预览内容已经按公众号兼容规则处理。";
  }, [draft.js, draft.mode, previewEditingEnabled]);
  const previewFrameLabel = `${editorPreviewWidth} × ${editorPreviewHeight}`;
  const previewScaleLabel = `${Math.round(editorPreviewScale * 100)}%`;
  const scaledPreviewWidth = Math.round(editorPreviewWidth * editorPreviewScale);
  const scaledPreviewHeight = Math.round(editorPreviewHeight * editorPreviewScale);

  useEffect(() => {
    const node = previewContentRef.current;
    if (!node || isPreviewEditing) return;

    const normalizedNext = normalizeEditablePreviewHtml(previewBody);
    const normalizedCurrent = normalizeEditablePreviewHtml(node.innerHTML);

    if (
      pendingPreviewSyncRef.current &&
      normalizedCurrent === lastCommittedPreviewHtmlRef.current &&
      normalizedNext === stalePreviewBodyRef.current
    ) {
      return;
    }

    if (pendingPreviewSyncRef.current && normalizedNext !== stalePreviewBodyRef.current) {
      pendingPreviewSyncRef.current = false;
    }

    if (normalizedCurrent === normalizedNext) {
      lastCommittedPreviewHtmlRef.current = normalizedNext;
      return;
    }

    node.innerHTML = previewBody;
    lastCommittedPreviewHtmlRef.current = normalizedNext;
  }, [isPreviewEditing, previewBody]);

  useEffect(() => {
    return () => {
      if (previewEditTimerRef.current) {
        clearTimeout(previewEditTimerRef.current);
      }
    };
  }, []);

  const commitPreviewChanges = (node: HTMLDivElement | null) => {
    if (!node || !previewEditingEnabled) return;

    // Strip lone surrogates / C0 control chars that Word/Office rich-text
    // pastes leave in the DOM. Without this, POST /publish/preview gets
    // invalid Unicode in the JSON body and Pydantic v2 responds 422.
    const nextHtml = stripUnsafeUnicode(normalizeEditablePreviewHtml(node.innerHTML));
    if (nextHtml === lastCommittedPreviewHtmlRef.current) return;

    stalePreviewBodyRef.current = normalizeEditablePreviewHtml(previewBody);
    pendingPreviewSyncRef.current = true;
    lastCommittedPreviewHtmlRef.current = nextHtml;
    const mergedHtml = mergeEditedPreviewIntoSource(draft.html, nextHtml);
    if (draft.mode === "markdown") {
      onFieldChange("markdown", serializeMarkdownFromHtml(mergedHtml));
      return;
    }
    onFieldChange("html", mergedHtml);
  };

  useEffect(() => {
    if (!previewResizeDirection) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = previewResizeDirection === "width"
      ? "ew-resize"
      : previewResizeDirection === "height"
        ? "ns-resize"
        : "nwse-resize";
    document.body.style.userSelect = "none";

    const updatePreviewSize = (clientX: number, clientY: number) => {
      const dragState = previewResizeRef.current;
      if (!dragState) return;

      const deltaX = clientX - dragState.startX;
      const deltaY = clientY - dragState.startY;

      setEditorPreviewSize({
        width: dragState.direction === "width" || dragState.direction === "both"
          ? dragState.startWidth + deltaX
          : dragState.startWidth,
        height: dragState.direction === "height" || dragState.direction === "both"
          ? dragState.startHeight + deltaY
          : dragState.startHeight,
      });
    };

    const stopResizing = () => {
      previewResizeRef.current = null;
      setPreviewResizeDirection(null);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updatePreviewSize(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updatePreviewSize(touch.clientX, touch.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", stopResizing);
    window.addEventListener("touchcancel", stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopResizing);
      window.removeEventListener("touchcancel", stopResizing);
    };
  }, [previewResizeDirection, setEditorPreviewSize]);

  useEffect(() => {
    if (!navigationRequest || activeTab !== contentTab) return;

    if (showCode && textareaRef.current) {
      scrollCodeToBlock(textareaRef.current, navigationRequest.block, editorFontSize, codeLineHeight);
    }

    if (showPreview && previewContentRef.current) {
      const target = findPreviewTarget(previewContentRef.current, navigationRequest.block);
      target?.scrollIntoView({ block: "center" });
    }
  }, [
    activeTab,
    codeLineHeight,
    contentTab,
    editorFontSize,
    navigationRequest,
    showCode,
    showPreview,
  ]);

  const startPreviewResize = (direction: PreviewResizeDirection, clientX: number, clientY: number) => {
    previewResizeRef.current = {
      direction,
      startX: clientX,
      startY: clientY,
      startWidth: editorPreviewWidth,
      startHeight: editorPreviewHeight,
    };
    setPreviewResizeDirection(direction);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div className="caps">编辑器</div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          title={canGoBack ? "返回上一页" : "返回稿库"}
        >
          <IconArrowLeft size={12} /> {canGoBack ? "返回上一页" : "返回稿库"}
        </button>
        <div style={{ flex: 1 }} />

        <Seg
          options={[
            { value: "code", label: "编辑" },
            { value: "split", label: "分栏" },
            { value: "preview", label: "预览" },
          ]}
          value={view}
          onChange={setView}
        />

        <span className="chip" style={{ color: saveMeta.color }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: saveMeta.color,
            }}
          />
          {saveMeta.label}
        </span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setView("preview");
            onRefreshPreview();
          }}
          disabled={!articleId || previewLoading}
        >
          <IconEye size={12} /> {previewLoading ? "更新中" : "更新预览"}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onCopyRichText}
          disabled={!articleId || copying}
        >
          <IconCopy size={12} /> {copying ? "复制中" : "复制富文本"}
        </button>
        <CompatibilityBadge html={draft.html} />
        <button
          className="btn btn-primary btn-sm"
          onClick={onPublish}
          disabled={!articleId || publishing}
        >
          <IconSend size={12} /> {publishing ? "发送中" : "发到草稿箱"}
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showCode && (
          <div
            style={{
              flex: showPreview ? 1 : 2,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              borderRight: showPreview ? "1px solid var(--border)" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-deep)",
              }}
            >
              {tabs.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  style={{
                    all: "unset",
                    padding: "8px 18px",
                    fontFamily: "var(--f-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: activeTab === item ? "var(--fg)" : "var(--fg-4)",
                    background: activeTab === item ? "var(--surface)" : "transparent",
                    borderRight: "1px solid var(--border)",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {item}
                  {activeTab === item && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -1,
                        height: 2,
                        background: "var(--accent)",
                      }}
                    />
                  )}
                </button>
              ))}
              <div style={{ flex: 1, borderBottom: "1px solid var(--border)" }} />
              <div
                style={{
                  padding: "8px 16px",
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  color: "var(--fg-5)",
                  letterSpacing: "0.1em",
                }}
              >
                UTF-8 &middot; LF &middot; {selected}
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-deep)" }}>
              <div
                style={{
                  padding: "14px 8px 14px 14px",
                  fontFamily: "var(--f-mono)",
                  fontSize: editorFontSize,
                  lineHeight: codeLineHeight,
                  color: "var(--fg-5)",
                  userSelect: "none",
                  textAlign: "right",
                  minWidth: 36,
                  overflow: "hidden",
                }}
              >
                {Array.from({ length: lineCount }, (_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={currentCode}
                onChange={(event) => onFieldChange(activeTab as EditorField, event.target.value)}
                spellCheck={false}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  resize: "none",
                  background: "transparent",
                  color: "var(--fg-2)",
                  fontFamily: "var(--f-mono)",
                  fontSize: editorFontSize,
                  lineHeight: codeLineHeight,
                  padding: "14px 20px 14px 8px",
                  overflow: "auto",
                  tabSize: 2,
                  whiteSpace: "pre",
                }}
              />
            </div>
          </div>
        )}

        {showPreview && (
          <div
            className="dots-bg"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--bg-deep)",
              padding: "32px 28px",
              overflow: "auto",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                maxWidth: 720,
                margin: "0 auto 14px",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div className="caps">公众号预览</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  当前尺寸 {previewFrameLabel}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  缩放 {previewScaleLabel}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  拖右边或下边调整大小
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 220,
                  }}
                >
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditorPreviewScale(editorPreviewScale - 0.1)}
                  >
                    缩小
                  </button>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    step={5}
                    value={Math.round(editorPreviewScale * 100)}
                    onChange={(event) => setEditorPreviewScale(Number(event.target.value) / 100)}
                    aria-label="调整预览缩放"
                    style={{ width: 120, accentColor: "var(--accent)" }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditorPreviewScale(editorPreviewScale + 0.1)}
                  >
                    放大
                  </button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    resetEditorPreviewSize();
                    resetEditorPreviewScale();
                  }}
                >
                  全部还原
                </button>
              </div>
            </div>

            <div
              style={{
                width: Math.min(editorPreviewWidth, 640),
                maxWidth: "100%",
                margin: "0 auto 12px",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "rgba(20,16,19,0.72)",
                color: "var(--fg-4)",
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                lineHeight: 1.7,
              }}
            >
              {previewHint}
            </div>

            <div
              data-testid="preview-frame-shell"
              style={{
                width: scaledPreviewWidth,
                height: scaledPreviewHeight,
                margin: "0 auto",
                position: "relative",
                maxWidth: "100%",
              }}
            >
              <div
                data-testid="preview-frame"
                style={{
                  width: editorPreviewWidth,
                  height: editorPreviewHeight,
                  borderRadius: "var(--r-md)",
                  overflow: "hidden",
                  boxShadow: "0 24px 48px -24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.1)",
                  background: "#FAF6EB",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `scale(${editorPreviewScale})`,
                  transformOrigin: "top left",
                }}
              >
                {previewLoading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(250,246,235,0.72)",
                      display: "grid",
                      placeItems: "center",
                      zIndex: 1,
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      color: "#8A7E6E",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    正在更新预览…
                  </div>
                )}
                <div
                  ref={previewContentRef}
                  data-testid="preview-editable-content"
                  contentEditable={previewEditingEnabled}
                  suppressContentEditableWarning
                  onInput={(event) => {
                    if (!previewEditingEnabled) return;

                    setIsPreviewEditing(true);
                    if (previewEditTimerRef.current) {
                      clearTimeout(previewEditTimerRef.current);
                    }

                    const node = event.currentTarget;
                    previewEditTimerRef.current = setTimeout(() => {
                      commitPreviewChanges(node);
                      setIsPreviewEditing(false);
                    }, PREVIEW_EDIT_DEBOUNCE_MS);
                  }}
                  onPaste={(event) => {
                    if (!previewEditingEnabled) return;
                    const clipboard = event.clipboardData;
                    if (!clipboard) return;
                    const htmlData = clipboard.getData("text/html");
                    const textData = clipboard.getData("text/plain");
                    if (!htmlData && !textData) return;
                    event.preventDefault();
                    const insert = htmlData
                      ? sanitizePastedHtml(htmlData)
                      : escapeHtml(stripUnsafeUnicode(textData)).replace(/\r?\n/g, "<br>");
                    // execCommand is deprecated but remains the only
                    // cross-browser way to insert HTML at the current caret
                    // while preserving undo history and triggering the
                    // standard ``input`` event that drives our debounced
                    // commit.
                    document.execCommand("insertHTML", false, insert);
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer?.types.includes("Files")) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    const file = event.dataTransfer?.files?.[0];
                    if (!file || !file.type.startsWith("image/")) return;
                    event.preventDefault();
                    void dispatchEditorImageUpload(file)
                      .then((url) => {
                        const node = previewContentRef.current;
                        if (!node) return;
                        const img = document.createElement("img");
                        img.src = url;
                        img.alt = file.name;
                        node.appendChild(img);
                        commitPreviewChanges(node);
                      })
                      .catch((err) => {
                        console.error("image upload failed:", err);
                      });
                  }}
                  onBlur={(event) => {
                    if (previewEditTimerRef.current) {
                      clearTimeout(previewEditTimerRef.current);
                      previewEditTimerRef.current = null;
                    }
                    commitPreviewChanges(event.currentTarget);
                    setIsPreviewEditing(false);
                  }}
                  aria-label="公众号预览编辑区"
                  aria-readonly={!previewEditingEnabled}
                  style={{
                    height: "100%",
                    padding: "28px 22px 32px",
                    fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: "#1A1512",
                    overflow: "auto",
                    boxSizing: "border-box",
                    outline: "none",
                    cursor: previewEditingEnabled ? "text" : "default",
                  }}
                />
              </div>
              <div
                data-testid="preview-resize-right"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("width", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("width", touch.clientX, touch.clientY);
                }}
                style={{
                  position: "absolute",
                  top: 10,
                  right: -6,
                  bottom: 10,
                  width: 12,
                  cursor: "ew-resize",
                }}
              />
              <div
                data-testid="preview-resize-bottom"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("height", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("height", touch.clientX, touch.clientY);
                }}
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: -6,
                  height: 12,
                  cursor: "ns-resize",
                }}
              />
              <button
                type="button"
                aria-label="拖动调整预览大小"
                data-testid="preview-resize-corner"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("both", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("both", touch.clientX, touch.clientY);
                }}
                style={{
                  all: "unset",
                  position: "absolute",
                  right: -8,
                  bottom: -8,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                  cursor: "nwse-resize",
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-deep)",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--fg-4)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: saveMeta.color }}>&bull; {saveMeta.label}</span>
        <span>行 {lineCount}</span>
        <span>{draft.mode.toUpperCase()}</span>
        <span>当前位置 · {selected}</span>
        <div style={{ flex: 1 }} />
        <span>{wordCount.toLocaleString()} 字</span>
        <span>&middot; {(new Blob([draft.html + draft.css + draft.js + draft.markdown]).size / 1024).toFixed(1)}KB</span>
        <span>&middot; 文章 {articleId?.toUpperCase() ?? "未打开"}</span>
      </div>
    </div>
  );
}
