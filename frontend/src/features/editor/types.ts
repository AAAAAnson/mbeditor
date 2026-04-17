import type { Article } from "@/types";

export type EditorCapability = "legacy-only" | "bridge" | "native-mbdoc";

export interface BridgeMetadata {
  id: string;
  title: string;
  mode: Article["mode"];
  cover: string;
  author: string;
  digest: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyFields {
  html: string;
  css: string;
  js: string;
  markdown: string;
}

export interface RenderSnapshot {
  rawHtml: string;
  processedHtml: string;
  css: string;
  js: string;
  sourceKind: Article["mode"];
  warnings: string[];
}

export interface MBDocSnapshot {
  id: string;
  version: string;
  meta: {
    title: string;
    author: string;
    digest: string;
    cover: string;
  };
  blocks: ProjectedBlockRecord[];
  projection?: ProjectionInfo;
}

export interface ProjectionInfo {
  editability: "reversible" | "partially-reversible" | "informational-only";
  reason: string;
  editableBlockIds: string[];
}

export interface ProjectedBlockRecord extends Record<string, unknown> {
  id: string;
  type: string;
}

export interface MBDocBlockSummary {
  id: string;
  type: string;
  label: string;
  editable: boolean;
  editMode: "projected-block" | "legacy-fragment";
  reason: string;
}

export interface BridgeDoc {
  metadata: BridgeMetadata;
  legacyFields: LegacyFields;
  mbdoc: MBDocSnapshot | null;
  capabilities: EditorCapability[];
  derived: {
    dirty: boolean;
    render: RenderSnapshot;
  };
}

export type EditableArticleField =
  | "title"
  | "mode"
  | "html"
  | "css"
  | "js"
  | "markdown"
  | "cover"
  | "author"
  | "digest";

export interface ArticleUpdatePayload {
  html: string;
  css: string;
  js: string;
  markdown: string;
  title: string;
  mode: Article["mode"];
  cover?: string;
  author?: string;
  digest?: string;
}

export interface RenderRequest {
  html: string;
  css: string;
  js: string;
  sourceKind: Article["mode"];
}

export interface PublishMetadataDraft {
  title: string;
  author: string;
  digest: string;
}

export type PublishMetadataField = keyof PublishMetadataDraft;

export type BlockEditorMode = "legacy-fragment" | "projected-block";
export type ProjectionFreshness = "stale" | "syncing" | "ready";
