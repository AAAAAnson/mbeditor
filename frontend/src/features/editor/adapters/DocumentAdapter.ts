import type { Article } from "@/types";
import type {
  ArticleUpdatePayload,
  BridgeDoc,
  BlockEditorMode,
  MBDocBlockSummary,
  ProjectionInfo,
  ProjectedBlockRecord,
  MBDocSnapshot,
  PublishMetadataDraft,
} from "@/features/editor/types";

interface ArticleSnapshotOverrides {
  title?: string;
  mode?: Article["mode"];
  html?: string;
  css?: string;
  js?: string;
  markdown?: string;
  cover?: string;
  author?: string;
  digest?: string;
  updatedAt?: string;
}

export function articleToBridgeDoc(article: Article): BridgeDoc {
  return {
    metadata: {
      id: article.id,
      title: article.title,
      mode: article.mode,
      cover: article.cover,
      author: article.author,
      digest: article.digest,
      createdAt: article.created_at,
      updatedAt: article.updated_at,
    },
    legacyFields: {
      html: article.html,
      css: article.css,
      js: article.js,
      markdown: article.markdown,
    },
    mbdoc: null,
    capabilities: ["legacy-only"],
    derived: {
      dirty: false,
      render: {
        rawHtml: "",
        processedHtml: "",
        css: article.css,
        js: article.js,
        sourceKind: article.mode,
        warnings: [],
      },
    },
  };
}

export function bridgeDocToArticleSnapshot(
  doc: BridgeDoc,
  overrides: ArticleSnapshotOverrides = {},
): Article {
  return {
    id: doc.metadata.id,
    title: overrides.title ?? doc.metadata.title,
    mode: overrides.mode ?? doc.metadata.mode,
    html: overrides.html ?? doc.legacyFields.html,
    css: overrides.css ?? doc.legacyFields.css,
    js: overrides.js ?? doc.legacyFields.js,
    markdown: overrides.markdown ?? doc.legacyFields.markdown,
    cover: overrides.cover ?? doc.metadata.cover,
    author: overrides.author ?? doc.metadata.author,
    digest: overrides.digest ?? doc.metadata.digest,
    created_at: doc.metadata.createdAt,
    updated_at: overrides.updatedAt ?? doc.metadata.updatedAt,
  };
}

export function bridgeDocToArticle(doc: BridgeDoc): Article {
  return bridgeDocToArticleSnapshot(doc);
}

export function bridgeDocToArticleUpdatePayload(doc: BridgeDoc): ArticleUpdatePayload {
  return {
    html: doc.legacyFields.html,
    css: doc.legacyFields.css,
    js: doc.legacyFields.js,
    markdown: doc.legacyFields.markdown,
    title: doc.metadata.title,
    mode: doc.metadata.mode,
    cover: doc.metadata.cover,
    author: doc.metadata.author,
    digest: doc.metadata.digest,
  };
}

export function bridgeDocToPublishMetadata(doc: BridgeDoc): PublishMetadataDraft {
  return {
    title: doc.metadata.title,
    author: doc.metadata.author,
    digest: doc.metadata.digest,
  };
}

function summarizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 48);
  return normalized || fallback;
}

function getFilename(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

function getProjectionInfo(mbdoc: MBDocSnapshot | null): ProjectionInfo {
  return (
    mbdoc?.projection ?? {
      editability: "informational-only",
      reason: "Projected blocks are informational only.",
      editableBlockIds: [],
    }
  );
}

function isEditableBlock(mbdoc: MBDocSnapshot | null, blockId: string): boolean {
  return getProjectionInfo(mbdoc).editableBlockIds.includes(blockId);
}

function getBlockReason(mbdoc: MBDocSnapshot | null, blockId: string): string {
  const projection = getProjectionInfo(mbdoc);
  if (projection.editableBlockIds.includes(blockId)) {
    return "Projected block edits write back to legacy source.";
  }
  return projection.reason;
}

export function summarizeMBDocBlocks(
  mbdoc: MBDocSnapshot | null,
): MBDocBlockSummary[] {
  if (!mbdoc) {
    return [];
  }

  return mbdoc.blocks.map((block, index) => {
    const type = typeof block.type === "string" ? block.type : "unknown";
    const id =
      typeof block.id === "string" && block.id.trim()
        ? block.id
        : `block-${index + 1}`;
    const editable = isEditableBlock(mbdoc, id);
    const reason = getBlockReason(mbdoc, id);
    const editMode: BlockEditorMode = editable ? "projected-block" : "legacy-fragment";

    switch (type) {
      case "heading":
      case "paragraph":
        return { id, type, label: summarizeText(block.text, type), editable, editMode, reason };
      case "markdown":
        return { id, type, label: summarizeText(block.source, "Markdown block"), editable, editMode, reason };
      case "html":
        return { id, type, label: summarizeText(block.source, "HTML block"), editable, editMode, reason };
      case "image":
        return { id, type, label: getFilename(block.src, "Image block"), editable, editMode, reason };
      case "svg":
        return { id, type, label: "SVG block", editable, editMode, reason };
      case "raster":
        return { id, type, label: "Raster block", editable, editMode, reason };
      default:
        return { id, type, label: type, editable, editMode, reason };
    }
  });
}

export function getProjectedBlock(
  mbdoc: MBDocSnapshot | null,
  blockId: string | null,
): ProjectedBlockRecord | null {
  if (!mbdoc || !blockId) {
    return null;
  }
  return mbdoc.blocks.find((block) => block.id === blockId) ?? null;
}

export function isProjectedBlockEditable(
  mbdoc: MBDocSnapshot | null,
  blockId: string | null,
): boolean {
  if (!blockId) {
    return false;
  }
  return isEditableBlock(mbdoc, blockId);
}

export function shouldUseProjectedBridge(doc: BridgeDoc | null): boolean {
  return Boolean(doc?.mbdoc && doc.capabilities.includes("bridge"));
}

function stringifyAttr(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return ` ${name}="${String(value)}"`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildCanonicalImageHtml(block: {
  src?: unknown;
  alt?: unknown;
  width?: unknown;
  height?: unknown;
}): string {
  const src = typeof block.src === "string" ? block.src : "";
  const alt = typeof block.alt === "string" ? block.alt : "";
  const width = typeof block.width === "number" ? block.width : null;
  const height = typeof block.height === "number" ? block.height : null;
  return `<p><img src="${src}"${stringifyAttr("alt", alt)}${stringifyAttr("width", width)}${stringifyAttr("height", height)}></p>`;
}

function patchProjectedBlock(
  block: ProjectedBlockRecord,
  patch: Record<string, unknown>,
): ProjectedBlockRecord {
  return {
    ...block,
    ...patch,
  };
}

function blockToLegacyHtml(block: ProjectedBlockRecord): string {
  switch (block.type) {
    case "heading":
      return `<h${typeof block.level === "number" ? block.level : 1}>${escapeHtml(
        typeof block.text === "string" ? block.text : "",
      )}</h${typeof block.level === "number" ? block.level : 1}>`;
    case "paragraph":
      return `<p>${escapeHtml(typeof block.text === "string" ? block.text : "")}</p>`;
    case "image":
      return buildCanonicalImageHtml({
        src: block.src,
        alt: block.alt,
        width: block.width,
        height: block.height,
      });
    case "svg":
      return typeof block.source === "string" ? block.source : "";
    case "raster":
      return typeof block.html === "string" ? block.html : "";
    case "html":
      return typeof block.source === "string" ? block.source : "";
    default:
      return "";
  }
}

function blockToLegacyCss(block: ProjectedBlockRecord): string {
  if (block.type === "html" || block.type === "raster") {
    return typeof block.css === "string" ? block.css : "";
  }
  return "";
}

function rebuildLegacyFieldsFromBlocks(
  blocks: ProjectedBlockRecord[],
  currentLegacyFields: BridgeDoc["legacyFields"],
): BridgeDoc["legacyFields"] {
  if (
    blocks.length === 1 &&
    blocks[0].type === "markdown" &&
    typeof blocks[0].source === "string"
  ) {
    return {
      ...currentLegacyFields,
      markdown: blocks[0].source,
    };
  }

  const html = blocks.map(blockToLegacyHtml).filter(Boolean).join("\n");
  const css = blocks.map(blockToLegacyCss).filter(Boolean).join("\n\n");
  return {
    ...currentLegacyFields,
    html,
    css,
  };
}

type ProjectedBlockPatch = Partial<{
  text: string;
  source: string;
  html: string;
  css: string;
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}>;

export function applyProjectedBlockEdit(
  doc: BridgeDoc,
  blockId: string,
  patch: ProjectedBlockPatch,
): BridgeDoc | null {
  const block = getProjectedBlock(doc.mbdoc, blockId);
  if (!block || !isProjectedBlockEditable(doc.mbdoc, blockId)) {
    return null;
  }

  const next: BridgeDoc = {
    ...doc,
    metadata: { ...doc.metadata, updatedAt: new Date().toISOString() },
    legacyFields: { ...doc.legacyFields },
    derived: { ...doc.derived, dirty: true },
  };

  const currentMBDoc = doc.mbdoc;
  const nextBlocks = currentMBDoc?.blocks.map((currentBlock) =>
    currentBlock.id === blockId ? patchProjectedBlock(currentBlock, patch) : currentBlock,
  );

  if (!currentMBDoc || !nextBlocks) {
    return null;
  }

  next.mbdoc = {
    ...currentMBDoc,
    blocks: nextBlocks,
  };
  next.legacyFields = rebuildLegacyFieldsFromBlocks(nextBlocks, next.legacyFields);
  next.metadata.mode =
    nextBlocks.length === 1 && nextBlocks[0].type === "markdown" ? "markdown" : "html";
  if (next.metadata.mode === "html") {
    next.legacyFields.markdown = "";
  }
  return next;
}
