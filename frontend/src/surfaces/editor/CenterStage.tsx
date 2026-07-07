import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Segmented } from "@/components/ui";
import {
  IconAgent,
  IconArrowLeft,
  IconClock,
  IconCopy,
  IconEye,
  IconSend,
  IconCode,
  IconLock,
  IconChevronDown,
  IconChevronUp,
} from "@/components/icons";
import CompatibilityBadge from "@/components/validation/CompatibilityBadge";
import ValidationBlockDialog from "@/components/validation/ValidationBlockDialog";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { uploadWithActive } from "@/lib/image-hosts/dispatch";
import {
  reportIsBlocking,
  validateWechatHtml,
  hasSmilAnimation,
  type ValidationReport,
} from "@/lib/wechat-validate";
import type { EditorDraft, EditorField } from "@/types";
import type { OutlineBlock } from "./StructurePanel";
import { buildHtmlOutline } from "./StructurePanel";
import { BackgroundControl } from "./BackgroundControl";
import { stripUnsafeUnicode } from "./utils/unicode";
import { sanitizePastedHtml } from "./utils/htmlSanitize";
import { buildRawPreviewSrcDoc } from "./utils/rawPreview";
import { useSvgPatch } from "./svg-panel/useSvgPatch";
import CodeDrawer from "./code-drawer/CodeDrawer";
import EditorToolbar from "./wysiwyg/EditorToolbar";
import ArticleRewriteMenu from "./rewrite/ArticleRewriteMenu";
import SelectionRewriteToolbar from "./rewrite/SelectionRewriteToolbar";
import RevisionHistory from "./history/RevisionHistory";

export async function dispatchEditorImageUpload(file: File): Promise<string> {
  const res = await uploadWithActive(file);
  return res.url;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
const PREVIEW_EDIT_DEBOUNCE_MS = 500;

interface CenterStageProps {
  articleId?: string;
  showProChrome?: boolean;
  /** 真实窄视口(<600px):旁路手机预览模拟框、隐藏「手机预览」按钮。 */
  isMobile?: boolean;
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
  previewMode: "wechat" | "raw";
  onPreviewModeChange: (mode: "wechat" | "raw") => void;
  // 统一返回:无论从哪进编辑器(列表点开 / 深链 /a/slug / compose 发布后),
  // 「返回」一律回起稿台(list),不再走 history.back 的「上一页/稿库」二元歧义。
  onBackToList: () => void;
  onFieldChange: (field: EditorField, value: string) => void;
  onRefreshPreview: () => void;
  onCopyRichText: () => void;
  onPublish: () => void;
  /** AI 对话面板开合态(docbar 入口按钮的按下态)。 */
  chatOpen?: boolean;
  /** 提供即渲染「AI 对话」入口(EditorSurface 接线;旧调用方不传 = 不出按钮)。 */
  onToggleChat?: () => void;
  /** AI 对话是否流式中(docbar「历史版本」按钮 disabled 参考)。 */
  chatStreaming?: boolean;
  /** 清空 AI 对话(docbar 恢复任意历史版本后调用——恢复后旧对话不再描述当前文档)。 */
  onChatReset?: () => void;
  /** 把一句预设指令注入统一 Agent 对话并展开面板(AI 改稿换调子/缩长度、选中即改)。 */
  onAgentInstruct?: (text: string) => void;
}

const SAVE_META: Record<SaveState, { label: string; color: string }> = {
  idle: { label: "未保存", color: "var(--fg-4)" },
  // 「编辑中」已收归全局 TopBar(编辑/写作路由居中显示);docbar 保存态用「有改动」
  // 表达「未保存的改动」语义,避免与顶栏「编辑中」同字重复(QA #15)。
  dirty: { label: "有改动", color: "var(--warn)" },
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
  showProChrome = true,
  isMobile = false,
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
  previewMode,
  onPreviewModeChange,
  onBackToList,
  onFieldChange,
  onRefreshPreview,
  onCopyRichText,
  onPublish,
  chatOpen = false,
  onToggleChat,
  chatStreaming = false,
  onChatReset,
  onAgentInstruct,
}: CenterStageProps) {
  const instruct = onAgentInstruct ?? (() => {});
  const [historyOpen, setHistoryOpen] = useState(false);
  const editorPreviewWidth = useUIStore((state) => state.editorPreviewWidth);
  const editorPreviewHeight = useUIStore((state) => state.editorPreviewHeight);
  const editorPreviewScale = useUIStore((state) => state.editorPreviewScale);
  const setEditorPreviewSize = useUIStore((state) => state.setEditorPreviewSize);
  const setEditorPreviewScale = useUIStore((state) => state.setEditorPreviewScale);
  const resetEditorPreviewSize = useUIStore((state) => state.resetEditorPreviewSize);
  const resetEditorPreviewScale = useUIStore((state) => state.resetEditorPreviewScale);
  const codeDrawerOpen = useUIStore((state) => state.codeDrawerOpen);
  const setCodeDrawerOpen = useUIStore((state) => state.setCodeDrawerOpen);
  const codeDrawerWidth = useUIStore((state) => state.codeDrawerWidth);
  const setCodeDrawerWidth = useUIStore((state) => state.setCodeDrawerWidth);
  const editorFontSize = useUIStore((state) => state.editorFontSize);
  const phonePreviewMode = useUIStore((state) => state.phonePreviewMode);
  const setPhonePreviewMode = useUIStore((state) => state.setPhonePreviewMode);
  // 真机(真实窄视口)上再套 390 手机框是双重缩小;运行时旁路掉,
  // 不写 store(phonePreviewMode 是持久化用户偏好,别污染桌面态)。
  const effPhonePreview = isMobile ? false : phonePreviewMode;
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const toolbarImageInputRef = useRef<HTMLInputElement | null>(null);
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
  // 代码抽屉左缘拖拽调宽(与预览尺寸拖拽同款模式,独立状态不搅动预览逻辑)。
  const drawerResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [drawerResizing, setDrawerResizing] = useState(false);
  const [isPreviewEditing, setIsPreviewEditing] = useState(false);
  const [moreWaysOpen, setMoreWaysOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [copyLintRunning, setCopyLintRunning] = useState(false);
  const [copyBlockReport, setCopyBlockReport] = useState<ValidationReport | null>(null);
  const copyLintAbortRef = useRef<AbortController | null>(null);
  const copyDebugAllowForce = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("mbeditor.debug.forceCopy") === "1";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyLintAbortRef.current) {
        copyLintAbortRef.current.abort();
        copyLintAbortRef.current = null;
      }
    };
  }, []);

  // 复制富文本 pre-flight: run the WeChat compatibility validator before
  // handing off to the (parent-owned) copy pipeline. Hard issues block the
  // action and surface a dialog; warnings pass through with a toast;
  // validator failures fail-open so a broken backend never wedges the
  // editor.
  const handleCopyWithValidation = async () => {
    if (!articleId || copying || copyLintRunning) return;

    if (copyLintAbortRef.current) {
      copyLintAbortRef.current.abort();
    }
    const controller = new AbortController();
    copyLintAbortRef.current = controller;
    setCopyLintRunning(true);

    try {
      const result = await validateWechatHtml(draft.html ?? "", { signal: controller.signal });
      if (copyLintAbortRef.current !== controller) return;

      if (!result.ok) {
        if (result.error === "aborted") return;
        console.warn("wechat validator unavailable, skipping pre-flight:", result.error);
        toast.info("校验服务不可用，已跳过");
        onCopyRichText();
        return;
      }

      if (reportIsBlocking(result.report)) {
        setCopyBlockReport(result.report);
        return;
      }

      if (result.report.warnings.length > 0) {
        toast.info(`有 ${result.report.warnings.length} 条建议但未阻断`);
      }

      onCopyRichText();
    } finally {
      if (copyLintAbortRef.current === controller) {
        copyLintAbortRef.current = null;
      }
      setCopyLintRunning(false);
    }
  };

  const forceCopyIgnoringIssues = () => {
    setCopyBlockReport(null);
    onCopyRichText();
  };
  const tabs = draft.mode === "markdown"
    ? ["markdown", "css", "js"]
    : ["html", "css", "js"];

  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const saveMeta = SAVE_META[saveState];
  // Code editing now lives in the right-side drawer. In pro chrome the legacy
  // 编辑/分栏 views auto-open it (so the IDE-shaped tests + power workflows keep
  // working); everyone else opens it on demand via the 「代码」 toggle.
  const proCodeView = showProChrome && (view === "code" || view === "split");
  // Simple mode seals the Monaco IDE shut. ``codeDrawerOpen`` is persisted, so a
  // stale ``true`` from a prior pro session (or a leftover view='split') must not
  // surface the full code/SVG surface on a 小白 — gate the whole drawer behind
  // showProChrome so neither toggle state nor view can leak the IDE.
  const drawerOpen = showProChrome && (codeDrawerOpen || proCodeView);
  const showCode = drawerOpen;
  // The preview always renders now (the drawer floats beside it); only the
  // legacy pure-code pro view (no split) suppresses it.
  const showPreview = !(proCodeView && view === "code");
  const contentTab = draft.mode === "markdown" ? "markdown" : "html";

  const currentCode = activeTab === "html"
    ? draft.html
    : activeTab === "markdown"
      ? draft.markdown
      : activeTab === "css"
        ? draft.css
        : draft.js;

  const lineCount = currentCode.split("\n").length;

  // P2-1: locate the selected inline-SVG block so we can offer the visual
  // editor. Outline blocks are rebuilt here (read-only consumption, contract A)
  // purely to map the selected id -> its sourceOffset (the "<svg" start).
  // SVG blocks are image-typed with preview "内联 SVG"; we only treat a block
  // as svg-editable when draft.html actually contains an <svg> at that offset.
  const selectedSvgBlock = useMemo<OutlineBlock | null>(() => {
    if (draft.mode === "markdown" || !selected) return null;
    const block = buildHtmlOutline(draft.html).find((item) => item.id === selected);
    if (!block) return null;
    const isSvgKind =
      block.svgNodeKind != null ||
      (block.type === "image" &&
        draft.html
          .slice(block.sourceOffset, block.sourceOffset + 5)
          .toLowerCase()
          .startsWith("<svg"));
    return isSvgKind ? block : null;
  }, [draft.mode, draft.html, selected]);

  const { model: svgModel, patchAttr: svgPatchAttr } = useSvgPatch(
    draft.html,
    selectedSvgBlock?.sourceOffset,
    onFieldChange,
  );
  const showSvgPanel = showCode && Boolean(selectedSvgBlock) && Boolean(svgModel?.ok);

  const visibleSource = draft.mode === "markdown" ? draft.markdown : draft.html.replace(/<[^>]*>/g, " ");
  const wordCount = visibleSource.replace(/\s+/g, "").length;
  const previewBody = previewError
    ? `
      <div style="padding: 24px 18px; border-radius: 12px; border: 1px solid var(--danger); background: var(--danger-soft); color: var(--danger-ink);">
        ${escapeHtml(previewError)}
      </div>
    `
    : previewHtml || `
      <div style="padding: 36px 18px; text-align: center; color: var(--fg-4); font-size: 13px; line-height: 1.8;">
        ${previewLoading ? "正在生成预览…" : "这里会显示预览内容。"}
      </div>
    `;
  const isRawPreview = previewMode === "raw";
  const previewEditingEnabled = !isRawPreview && Boolean(articleId) && !previewError && Boolean(previewHtml);

  // ── 选中即改(P2 收编)——工具条只注入指令进统一 Agent 对话,不再持有块级状态机。
  const rawPreviewSrcDoc = useMemo(
    () => (isRawPreview ? buildRawPreviewSrcDoc(draft.html, draft.css) : ""),
    [isRawPreview, draft.html, draft.css],
  );

  // SVG/SMIL 交互（begin="…click/touchstart"）只能在「交互预览」里点击验证：
  // 「公众号效果」预览走 sanitize，attributeName 被小写化、SMIL 失活，点击无反应。
  const hasInteractiveSvg = useMemo(
    () => /begin\s*=\s*["'][^"']*(?:click|touchstart)/i.test(draft.html),
    [draft.html],
  );
  // 自动播放类 SMIL(<animate>/<animateTransform>/<set>,无 begin=click)在交互预览能动,
  // 但发到公众号会被微信清成静态 —— 与发布前 SmilWarningDialog 同源(hasSmilAnimation)。
  const hasSmilAnim = useMemo(() => hasSmilAnimation(draft.html), [draft.html]);

  const previewHint = useMemo(() => {
    if (isRawPreview) {
      return "原始交互预览：可点击测试 SVG/SMIL 交互；此为未经公众号兼容处理的原始效果，不代表公众号实际显示，且内容不可在此直接编辑。";
    }
    if (hasInteractiveSvg) {
      return "检测到可交互 SVG：当前「公众号效果」预览经兼容处理后不可点击；切到上方「交互预览」即可点击测试展开/切换等效果（编辑内容不受影响）。";
    }
    if (hasSmilAnim) {
      return "检测到 SVG 动画：发到公众号后会变静态，动效只在「交互预览」里能看到。";
    }
    if (draft.mode === "markdown") return "可直接在预览里改内容，修改会同步回 Markdown 源码。";
    if (draft.js.trim()) return "JS 仅随源码保存，公众号效果与交互预览都不会执行它，也不会进草稿。";
    return previewEditingEnabled
      ? "可直接在预览里改文字，停顿后会自动同步回 HTML 源码。"
      : "预览内容已经按公众号兼容规则处理。";
  }, [draft.js, draft.mode, isRawPreview, previewEditingEnabled, hasInteractiveSvg, hasSmilAnim]);
  // 手机预览:锁定常见手机尺寸、缩放归 1,隐藏设备尺/缩放/拖拽裸控件。
  const PHONE_PREVIEW_WIDTH = 390;
  const PHONE_PREVIEW_HEIGHT = 844;
  const effPreviewWidth = effPhonePreview ? PHONE_PREVIEW_WIDTH : editorPreviewWidth;
  const effPreviewHeight = effPhonePreview ? PHONE_PREVIEW_HEIGHT : editorPreviewHeight;
  const effPreviewScale = effPhonePreview ? 1 : editorPreviewScale;
  const previewFrameLabel = `${editorPreviewWidth} × ${editorPreviewHeight}`;
  const previewScaleLabel = `${Math.round(editorPreviewScale * 100)}%`;
  const scaledPreviewWidth = Math.round(effPreviewWidth * effPreviewScale);
  const scaledPreviewHeight = Math.round(effPreviewHeight * effPreviewScale);
  // 移动端预览框走流式:固定 420px 框在 <420 视口会横溢右缘(390 真机可见)。
  // isMobile 时 shell/frame 同走 100% 占满容器、scale 归 1(缩放控件本就隐),
  // 数值计算(scaledPreview*)仍保持 number、不被 "100%" 字符串打断成 NaN。
  const frameRenderWidth = isMobile ? "100%" : effPreviewWidth;
  const shellRenderWidth = isMobile ? "100%" : scaledPreviewWidth;
  const frameRenderScale = isMobile ? 1 : effPreviewScale;

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

    // The publish pipeline wraps every response in a cosmetic <section
    // class="wechat-root"> envelope. The contentEditable DOM holds the
    // unwrapped form. If the server round-trip only added that envelope —
    // or a nested cosmetic wrapper — back onto content the user already
    // sees, reassigning innerHTML would cause a visible flicker, drop the
    // caret, and wipe the browser's native undo stack (breaking Ctrl+Z).
    // Peel the same envelope stripPreviewWrapper uses and only rewrite
    // when the payloads genuinely differ.
    if (typeof DOMParser !== "undefined") {
      const nextDoc = new DOMParser().parseFromString(`<body>${previewBody}</body>`, "text/html");
      stripPreviewWrapper(nextDoc);
      const unwrappedNext = normalizeEditablePreviewHtml(nextDoc.body.innerHTML);
      if (unwrappedNext === normalizedCurrent) {
        lastCommittedPreviewHtmlRef.current = normalizedNext;
        return;
      }
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

  useEffect(() => {
    if (!moreWaysOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && moreMenuRef.current?.contains(target)) return;
      setMoreWaysOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreWaysOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreWaysOpen]);

  // 历史版本弹层焦点管理:autofocus 入弹层、Tab 焦点环、Esc 关闭、关闭后焦点
  // 归还触发按钮(复用 WeChatBindWizard 同款 useFocusTrap)。点外关闭走 overlay
  // 背板 onClick。streaming/rewriting 时按钮已 disabled,不会新开。
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  useFocusTrap(historyPanelRef, historyOpen, closeHistory);

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

  // Toolbar 图片按钮:打开隐藏 file input,上传后在当前选区插入 <img>。
  // 走和拖拽上传同一条 dispatchEditorImageUpload 管线,commit 复用既有同步逻辑。
  const handleToolbarImageFile = async (file: File) => {
    if (!previewEditingEnabled) return;
    try {
      const url = await dispatchEditorImageUpload(file);
      const node = previewContentRef.current;
      if (!node) return;
      node.focus();
      const inserted = document.execCommand(
        "insertHTML",
        false,
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}">`,
      );
      if (!inserted) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = file.name;
        node.appendChild(img);
      }
      commitPreviewChanges(node);
    } catch (err) {
      console.error("toolbar image upload failed:", err);
    }
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

    // 大纲跳转仅在所见即所得预览侧定位;代码抽屉(Monaco)不再做源码光标定位。
    if (showPreview && previewContentRef.current) {
      const target = findPreviewTarget(previewContentRef.current, navigationRequest.block);
      target?.scrollIntoView({ block: "center" });
    }
  }, [activeTab, contentTab, navigationRequest, showPreview]);

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

  useEffect(() => {
    if (!drawerResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const updateDrawerWidth = (clientX: number) => {
      const dragState = drawerResizeRef.current;
      if (!dragState) return;
      // 手柄在抽屉左缘:向左拖(clientX 变小)→ 抽屉变宽。clamp 在 uiStore(360~1400)。
      setCodeDrawerWidth(dragState.startWidth + (dragState.startX - clientX));
    };

    const stopResizing = () => {
      drawerResizeRef.current = null;
      setDrawerResizing(false);
    };

    const handleMouseMove = (event: MouseEvent) => updateDrawerWidth(event.clientX);
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) updateDrawerWidth(touch.clientX);
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
  }, [drawerResizing, setCodeDrawerWidth]);

  const startDrawerResize = (clientX: number) => {
    drawerResizeRef.current = { startX: clientX, startWidth: codeDrawerWidth };
    setDrawerResizing(true);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      <div
        data-testid="editor-toolbar"
        className="editor-docbar"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* 「编辑中」状态由全局 TopBar 居中显示(编辑/写作路由),docbar 不再重复同一文案;
            本行只保留可点击操作 + 保存态/兼容性两枚状态标。 */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onBackToList}
          title="返回起稿台"
          style={{ minHeight: 44 }}
        >
          <IconArrowLeft size={12} /> 返回起稿台
        </button>
        <div style={{ flex: 1 }} />

        {showProChrome && (
          <Segmented
            roleType="buttons"
            options={[
              { value: "code", label: "编辑" },
              { value: "split", label: "分栏" },
              { value: "preview", label: "预览" },
            ]}
            value={view}
            onChange={setView}
          />
        )}

        {/* 保存态状态标(只读状态,非按钮):data-role=status 让 docbar 在窄屏把它
            与兼容性徽标一并对齐到与按钮等高的行内,视觉上自成「状态」一层。 */}
        <span className="chip" data-role="status" style={{ color: saveMeta.color }}>
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
            // raw 交互预览随 draft 自动重渲，无需打后端刷新。
            if (previewMode !== "raw") {
              onRefreshPreview();
            }
          }}
          disabled={!articleId || (previewMode !== "raw" && previewLoading)}
          style={{ minHeight: 44 }}
        >
          <IconEye size={12} /> {previewMode !== "raw" && previewLoading ? "更新中" : "更新预览"}
        </button>
        {/* AI 对话(Agent 对话式编辑,批6):simple/pro 都可用,与「AI 改稿」/
            选中即改并存互不干扰(收编留后续刀)。 */}
        {Boolean(articleId) && onToggleChat && (
          <button
            className={chatOpen ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            onClick={onToggleChat}
            aria-pressed={chatOpen}
            title="打开/收起 AI 对话面板,用对话逐块修改文章"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 44 }}
          >
            <IconAgent size={13} /> AI 对话
          </button>
        )}
        {/* AI 改稿(文章级):simple 模式同样可见,这是给新手的能力 */}
        {Boolean(articleId) && (
          <ArticleRewriteMenu draft={draft} onFieldChange={onFieldChange} onInstruct={instruct} />
        )}
        {/* 历史版本(全局入口):列 revisions 并一键恢复;恢复前统一落 restore_backup。
            弹层 portal 到 body —— 预览缩放框有 transform,fixed 元素不 portal 会被劫持。 */}
        {Boolean(articleId) && (
          <button
            className={historyOpen ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            data-testid="history-button"
            aria-pressed={historyOpen}
            aria-label="历史版本"
            title="查看并恢复历史版本"
            onClick={() => setHistoryOpen((open) => !open)}
            disabled={chatStreaming}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 44 }}
          >
            <IconClock size={13} /> 历史版本
          </button>
        )}
        {showProChrome && (
          <button
            className={drawerOpen ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            onClick={() => setCodeDrawerOpen(!drawerOpen)}
            title="打开/收起代码抽屉（HTML / CSS / JS）"
            aria-pressed={drawerOpen}
            style={{ minHeight: 44 }}
          >
            <IconCode size={13} /> 代码
          </button>
        )}
        <span data-role="status" style={{ display: "inline-flex", alignItems: "center" }}>
          <CompatibilityBadge html={draft.html} />
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleCopyWithValidation}
          disabled={!articleId || copying || copyLintRunning}
          title="复制带格式的正文，粘到公众号后台即可"
          style={{ minHeight: 44 }}
        >
          <IconCopy size={12} /> {copying ? "复制中" : copyLintRunning ? "校验中…" : "复制到公众号"}
        </button>
        <div ref={moreMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setMoreWaysOpen((open) => !open)}
            aria-expanded={moreWaysOpen}
            aria-haspopup="menu"
            title="其它发布方式（高级）"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44 }}
          >
            更多方式 {moreWaysOpen ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />}
          </button>
          {moreWaysOpen && (
            <div
              role="menu"
              data-testid="editor-more-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 20,
                minWidth: 220,
                padding: 8,
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                boxShadow: "var(--shadow-lg)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setMoreWaysOpen(false);
                  onPublish();
                }}
                disabled={!articleId || publishing}
                title="直接调微信草稿箱接口（需先连公众号）"
                style={{ justifyContent: "flex-start", minHeight: 44, width: "100%" }}
              >
                <IconSend size={13} />
                <span>{publishing ? "发送中" : "发到草稿箱"}</span>
                {/* 锁收成右侧角标(单一前导语义图标 = 发送),表达「需先连公众号才解锁」,
                    与下方说明文呼应;不再与发送图标并排挤两枚。 */}
                <span style={{ flex: 1 }} aria-hidden />
                <span style={{ opacity: 0.45, display: "inline-flex" }} aria-hidden>
                  <IconLock size={11} />
                </span>
              </button>
              <div style={{ fontSize: 11, color: "var(--fg-4)", lineHeight: 1.6, padding: "0 2px" }}>
                需先在「设置」里连上公众号才能直接发草稿箱。
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

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
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="label-soft">公众号预览</div>
                <Segmented
                  roleType="buttons"
                  options={[
                    { value: "wechat", label: "公众号效果" },
                    { value: "raw", label: "交互预览" },
                  ]}
                  value={previewMode}
                  onChange={(value) => onPreviewModeChange(value as "wechat" | "raw")}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <BackgroundControl
                  html={draft.html}
                  onChange={(nextHtml) => onFieldChange("html", nextHtml)}
                />
                {!isMobile && (
                  <button
                    type="button"
                    className={phonePreviewMode ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                    aria-pressed={phonePreviewMode}
                    onClick={() => setPhonePreviewMode(!phonePreviewMode)}
                    title="按手机宽度预览"
                  >
                    手机预览
                  </button>
                )}
                {!effPhonePreview && !isMobile && (
                  <>
                    {/* 元信息(尺寸/缩放/拖拽提示)由 --fg-5 (ink-faint) 加深一档到
                        --fg-3 (ink-soft),弱对比次级文字读得清。 */}
                    <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                      当前尺寸 {previewFrameLabel}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                      缩放 {previewScaleLabel}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
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
                  </>
                )}
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
                // 暗灰字压深棕底对比 <3:1 且深条突兀于暖纸 → 改浅底深字与暖纸统一,
                // 文字提到 --fg-3 (≈4.7:1 on --surface) 达 AA。
                background: "var(--surface)",
                color: "var(--fg-3)",
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                lineHeight: 1.7,
              }}
            >
              {previewHint}
            </div>

            {previewEditingEnabled && (
              <div style={{ maxWidth: 720, margin: "0 auto 12px" }}>
                <EditorToolbar
                  targetRef={previewContentRef}
                  onCommit={() => commitPreviewChanges(previewContentRef.current)}
                  onPickImage={() => toolbarImageInputRef.current?.click()}
                />
                <input
                  ref={toolbarImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleToolbarImageFile(file);
                  }}
                />
              </div>
            )}

            <div
              data-testid="preview-frame-shell"
              style={{
                width: shellRenderWidth,
                height: scaledPreviewHeight,
                margin: "0 auto",
                position: "relative",
                maxWidth: "100%",
              }}
            >
              <div
                data-testid="preview-frame"
                style={{
                  width: frameRenderWidth,
                  maxWidth: isMobile ? "100%" : undefined,
                  height: effPreviewHeight,
                  // 手机预览给设备级大圆角,让 390 宽的预览框一眼读得出是手机,
                  // 而非一块普通纸矩形;非手机模式仍走主题小圆角。
                  borderRadius: effPhonePreview ? 28 : "var(--r-md)",
                  overflow: "hidden",
                  boxShadow: "0 24px 48px -24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.1)",
                  // 画布恒白:模拟公众号白页,是 chrome、永不进复制。文章自身背景
                  // (信封壳 background)才是会被复制的显式页背景,由控件/agent 决定。
                  background: "#ffffff",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `scale(${frameRenderScale})`,
                  transformOrigin: "top left",
                }}
              >
                {!isRawPreview && previewLoading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(255,255,255,0.72)",
                      display: "grid",
                      placeItems: "center",
                      zIndex: 1,
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      color: "var(--fg-4)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    正在更新预览…
                  </div>
                )}
                {isRawPreview ? (
                  <iframe
                    data-testid="raw-preview-iframe"
                    srcDoc={rawPreviewSrcDoc}
                    sandbox="allow-popups"
                    title="交互预览（原始）"
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      display: "block",
                      background: "#ffffff",
                    }}
                  />
                ) : (
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
                    // H8-1:图片文件优先。Chromium 粘贴截图默认插 blob: URL,后端
                    // 两条搬图路径(草稿上传只认 http/data:、复制内联只认可 fetch 的)
                    // 都对 blob: 无能为力 → 发出去必裂。拦下默认行为,走与工具栏图片
                    // 按钮同一条 dispatchEditorImageUpload 管线。此时 text/html 通常
                    // 只是冗余的 <img blob:>,只走图片路径、既有文本路径零改。
                    // files 与 items 是同一批文件的两种投递形态(Chromium 两处都给),
                    // 取 files 非空则用 files,否则退 items,避免同图重复计数。
                    const fromFiles = Array.from(clipboard.files ?? []).filter(
                      (f) => f && f.type.startsWith("image/"),
                    );
                    const pastedImages = fromFiles.length > 0
                      ? fromFiles
                      : Array.from(clipboard.items ?? [])
                          .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                          .map((it) => it.getAsFile())
                          .filter((f): f is File => f !== null);
                    const pastedImage = pastedImages[0];
                    if (pastedImage) {
                      event.preventDefault();
                      // 上传是异步的,先留住当前选区,成功后恢复再插入。
                      const selection = window.getSelection();
                      const savedRange =
                        selection && selection.rangeCount > 0
                          ? selection.getRangeAt(0).cloneRange()
                          : null;
                      void dispatchEditorImageUpload(pastedImage)
                        .then((url) => {
                          const node = previewContentRef.current;
                          if (!node) return;
                          node.focus();
                          if (savedRange && node.contains(savedRange.commonAncestorContainer)) {
                            const sel = window.getSelection();
                            sel?.removeAllRanges();
                            sel?.addRange(savedRange);
                          }
                          const inserted = document.execCommand(
                            "insertHTML",
                            false,
                            `<img src="${escapeHtml(url)}" alt="${escapeHtml(pastedImage.name)}">`,
                          );
                          if (!inserted) {
                            const img = document.createElement("img");
                            img.src = url;
                            img.alt = pastedImage.name;
                            node.appendChild(img);
                          }
                          commitPreviewChanges(node);
                          if (pastedImages.length > 1) {
                            toast.warning(
                              `剪贴板里有 ${pastedImages.length} 张图片,已上传第 1 张;其余请逐张粘贴`,
                            );
                          }
                        })
                        .catch((err) => {
                          toast.error(err instanceof Error ? err.message : "图片上传失败");
                        });
                      return;
                    }
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
                    // H8-2:落点修正——caretRangeFromPoint 非标准(jsdom/Firefox 无),
                    // 运行时 feature-detect;拿不到或落点不在预览容器内时维持旧的
                    // 文末 appendChild 兜底。上传是异步的,先在 drop 时捕获落点。
                    const caretApi = (
                      document as Document & {
                        caretRangeFromPoint?: (x: number, y: number) => Range | null;
                      }
                    ).caretRangeFromPoint;
                    const dropRange =
                      typeof caretApi === "function"
                        ? caretApi.call(document, event.clientX, event.clientY)
                        : null;
                    void dispatchEditorImageUpload(file)
                      .then((url) => {
                        const node = previewContentRef.current;
                        if (!node) return;
                        const img = document.createElement("img");
                        img.src = url;
                        img.alt = file.name;
                        if (dropRange && node.contains(dropRange.startContainer)) {
                          dropRange.collapse(true);
                          dropRange.insertNode(img);
                        } else {
                          node.appendChild(img);
                        }
                        commitPreviewChanges(node);
                      })
                      .catch((err) => {
                        toast.error(err instanceof Error ? err.message : "图片上传失败");
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
                )}
                {!isRawPreview && (
                  <SelectionRewriteToolbar
                    containerRef={previewContentRef}
                    enabled={previewEditingEnabled}
                    isMobile={isMobile}
                    onInstruct={instruct}
                  />
                )}
              </div>
              {!effPhonePreview && !isMobile && (
              <>
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
              </>
              )}
            </div>
          </div>
        )}

        {drawerOpen && !isMobile && (
          <div
            data-testid="code-drawer-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动调整代码区宽度"
            onMouseDown={(event) => {
              event.preventDefault();
              startDrawerResize(event.clientX);
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) startDrawerResize(touch.clientX);
            }}
            style={{
              flexShrink: 0,
              width: 6,
              cursor: "ew-resize",
              background: "var(--line)",
              touchAction: "none",
            }}
          />
        )}
        {drawerOpen && (
          <CodeDrawer
            articleId={articleId}
            draft={draft}
            tabs={tabs}
            activeTab={activeTab}
            setTab={setTab}
            currentCode={currentCode}
            lineCount={lineCount}
            selected={selected}
            saveMeta={saveMeta}
            wordCount={wordCount}
            editorFontSize={editorFontSize}
            onFieldChange={onFieldChange}
            showSvgPanel={showSvgPanel}
            svgModel={svgModel ?? null}
            svgPatchAttr={svgPatchAttr}
            svgKey={selectedSvgBlock?.id}
            width={codeDrawerWidth}
            onClose={() => setCodeDrawerOpen(false)}
          />
        )}
      </div>

      <ValidationBlockDialog
        open={copyBlockReport !== null}
        report={copyBlockReport}
        action="copy"
        onClose={() => setCopyBlockReport(null)}
        onForceContinue={copyDebugAllowForce ? forceCopyIgnoringIssues : undefined}
        allowForce={copyDebugAllowForce}
      />

      {/* 历史版本弹层(portal 到 body:预览缩放框 transform 会劫持 fixed)。
          桌面 = 居中卡片;移动 390 = 底部通栏。恢复走 onFieldChange('html')。 */}
      {historyOpen && articleId &&
        createPortal(
          <div
            data-testid="history-overlay"
            onClick={closeHistory}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 82,
              background: "rgba(26,21,18,0.32)",
              display: "flex",
              alignItems: isMobile ? "flex-end" : "center",
              justifyContent: "center",
            }}
          >
            <div
              ref={historyPanelRef}
              tabIndex={-1}
              data-testid="history-panel"
              role="dialog"
              aria-modal="true"
              aria-label="历史版本"
              onClick={(event) => event.stopPropagation()}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-2)",
                borderRadius: isMobile ? "16px 16px 0 0" : 12,
                padding: 16,
                width: isMobile ? "100%" : "min(420px, calc(100vw - 32px))",
                maxHeight: isMobile ? "70vh" : "min(70vh, 520px)",
                overflow: "auto",
                boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span style={{ display: "inline-flex", color: "var(--accent)" }} aria-hidden>
                  <IconClock size={14} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>历史版本</span>
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="关闭历史版本"
                  onClick={closeHistory}
                  style={{ minHeight: isMobile ? 44 : undefined }}
                >
                  关闭
                </button>
              </div>
              <RevisionHistory
                variant="panel"
                articleId={articleId}
                getCurrentHtml={() => draft.html}
                onRestore={(html) => {
                  onFieldChange("html", html);
                  // 恢复任意历史版本后旧对话不再描述当前文档 → 清空,免下一轮换调子/
                  // 对话带陈旧上下文致模型误判(与「回到此轮之前」裁剪同类防护)。
                  onChatReset?.();
                  setHistoryOpen(false);
                }}
                disabled={chatStreaming}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
