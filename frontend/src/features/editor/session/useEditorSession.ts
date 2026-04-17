import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeEditableHtml } from "@/utils/htmlSemantics";
import type { Article } from "@/types";
import type {
  BlockEditorMode,
  BridgeDoc,
  EditableArticleField,
  MBDocBlockSummary,
  PublishMetadataDraft,
  PublishMetadataField,
  ProjectedBlockRecord,
  ProjectionFreshness,
  RenderRequest,
} from "@/features/editor/types";
import {
  applyProjectedBlockEdit,
  articleToBridgeDoc,
  bridgeDocToArticle,
  bridgeDocToArticleSnapshot,
  bridgeDocToArticleUpdatePayload,
  bridgeDocToPublishMetadata,
  getProjectedBlock,
  isProjectedBlockEditable,
  summarizeMBDocBlocks,
  shouldUseProjectedBridge,
} from "@/features/editor/adapters/DocumentAdapter";
import { fetchArticle, saveArticle } from "@/features/editor/api/articleApi";
import { projectArticleToMBDoc } from "@/features/editor/api/mbdocApi";
import { createRawRender, processBridgePreview } from "@/features/editor/services/RenderService";
import {
  copyArticleRichText,
  copyProjectedArticleRichText,
  exportArticleHtml,
  publishArticleDraft,
  saveArticleDraft,
  type CopyArticleResult,
  type PublishArticleResult,
  type WechatConfigInput,
} from "@/features/editor/services/DocumentActionService";

interface UseEditorSessionOptions {
  articleId?: string;
  markdownTheme: string;
}

interface EditorSessionResult {
  article: Article | null;
  bridgeDoc: BridgeDoc | null;
  projectedBlocks: MBDocBlockSummary[];
  selectedBlockId: string | null;
  selectedBlockIndex: number;
  selectedBlock: ProjectedBlockRecord | null;
  selectedBlockSummary: MBDocBlockSummary | null;
  blockEditorMode: BlockEditorMode;
  projectionFreshness: ProjectionFreshness;
  canEditSelectedBlock: boolean;
  rawPreview: RenderRequest;
  processedHtml: string;
  publishMetadata: PublishMetadataDraft;
  saved: boolean;
  loading: boolean;
  updateField: (field: EditableArticleField, value: string) => void;
  updatePublishMetadata: (field: PublishMetadataField, value: string) => void;
  resetPublishMetadata: () => void;
  selectBlock: (blockId: string) => void;
  setBlockEditorMode: (mode: BlockEditorMode) => void;
  updateSelectedBlock: (patch: Record<string, unknown>) => void;
  applyPreviewEdit: (newHtml: string) => void;
  copyRichText: () => Promise<CopyArticleResult>;
  exportHtml: () => Promise<void>;
  saveDraft: () => Promise<void>;
  publishDraft: (options?: {
    config?: WechatConfigInput;
    persistConfig?: boolean;
    timeoutMs?: number;
  }) => Promise<PublishArticleResult>;
}

export function useEditorSession({
  articleId,
  markdownTheme,
}: UseEditorSessionOptions): EditorSessionResult {
  const [bridgeDoc, setBridgeDoc] = useState<BridgeDoc | null>(null);
  const [processedHtml, setProcessedHtml] = useState("");
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockEditorMode, setBlockEditorModeState] =
    useState<BlockEditorMode>("legacy-fragment");
  const [projectionFreshness, setProjectionFreshness] =
    useState<ProjectionFreshness>("ready");
  const [publishMetadata, setPublishMetadata] = useState<PublishMetadataDraft>({
    title: "",
    author: "",
    digest: "",
  });
  const publishMetadataDirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstProcess = useRef(true);
  const isHydrated = useRef(false);

  useEffect(() => {
    if (!articleId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      fetchArticle(articleId),
      projectArticleToMBDoc(articleId, false),
    ])
      .then(([articleResult, mbdocResult]) => {
        if (cancelled) return;
        if (articleResult.status !== "fulfilled") {
          throw articleResult.reason;
        }
        const nextDoc = articleToBridgeDoc(articleResult.value);
        if (mbdocResult.status === "fulfilled") {
          nextDoc.mbdoc = mbdocResult.value;
          nextDoc.capabilities = ["legacy-only", "bridge"];
          setProjectionFreshness("ready");
          setSelectedBlockId(mbdocResult.value.blocks[0]?.id ?? null);
          setBlockEditorModeState(
            mbdocResult.value.projection?.editableBlockIds?.[0]
              ? "projected-block"
              : "legacy-fragment",
          );
        } else {
          setProjectionFreshness("stale");
          setSelectedBlockId(null);
          setBlockEditorModeState("legacy-fragment");
        }
        setBridgeDoc(nextDoc);
        setPublishMetadata(bridgeDocToPublishMetadata(nextDoc));
        publishMetadataDirty.current = false;
        setProcessedHtml("");
        setSaved(true);
        isFirstProcess.current = true;
        isHydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setBridgeDoc(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const article = useMemo(() => (bridgeDoc ? bridgeDocToArticle(bridgeDoc) : null), [bridgeDoc]);

  const projectedBlocks = useMemo(
    () => summarizeMBDocBlocks(bridgeDoc?.mbdoc ?? null),
    [bridgeDoc],
  );

  const selectedBlock = useMemo(
    () => getProjectedBlock(bridgeDoc?.mbdoc ?? null, selectedBlockId),
    [bridgeDoc, selectedBlockId],
  );

  const selectedBlockSummary = useMemo(
    () =>
      projectedBlocks.find((block) => block.id === selectedBlockId) ?? null,
    [projectedBlocks, selectedBlockId],
  );

  const selectedBlockIndex = useMemo(
    () => projectedBlocks.findIndex((block) => block.id === selectedBlockId),
    [projectedBlocks, selectedBlockId],
  );

  const canEditSelectedBlock = useMemo(
    () =>
      projectionFreshness === "ready" &&
      isProjectedBlockEditable(bridgeDoc?.mbdoc ?? null, selectedBlockId),
    [bridgeDoc, projectionFreshness, selectedBlockId],
  );

  const rawPreview = useMemo<RenderRequest>(() => {
    if (!bridgeDoc) {
      return { html: "", css: "", js: "", sourceKind: "html" };
    }
    return createRawRender(bridgeDoc, markdownTheme);
  }, [bridgeDoc, markdownTheme]);

  const actionArticle = useMemo(() => {
    if (!bridgeDoc) return null;
    return bridgeDocToArticleSnapshot(bridgeDoc, {
      html: rawPreview.html,
      css: rawPreview.css,
      js: rawPreview.js,
    });
  }, [bridgeDoc, rawPreview]);

  useEffect(() => {
    if (!bridgeDoc) return;
    setBridgeDoc((current) => {
      if (!current) return current;
      const render = current.derived.render;
      if (
        render.rawHtml === rawPreview.html &&
        render.css === rawPreview.css &&
        render.js === rawPreview.js &&
        render.sourceKind === rawPreview.sourceKind
      ) {
        return current;
      }
      return {
        ...current,
        derived: {
          ...current.derived,
          render: {
            ...render,
            rawHtml: rawPreview.html,
            css: rawPreview.css,
            js: rawPreview.js,
            sourceKind: rawPreview.sourceKind,
          },
        },
      };
    });
  }, [bridgeDoc, rawPreview]);

  useEffect(() => {
    if (!bridgeDoc || publishMetadataDirty.current) return;
    setPublishMetadata(bridgeDocToPublishMetadata(bridgeDoc));
  }, [bridgeDoc]);

  const storedSemanticKey = useMemo(
    () => (bridgeDoc ? normalizeEditableHtml(bridgeDoc.legacyFields.html).semanticKey : ""),
    [bridgeDoc]
  );

  const updateField = useCallback((field: EditableArticleField, value: string) => {
    setBridgeDoc((current) => {
      if (!current) return current;
      const next: BridgeDoc = {
        ...current,
        metadata: { ...current.metadata },
        legacyFields: { ...current.legacyFields },
        derived: {
          ...current.derived,
          dirty: true,
        },
      };

      switch (field) {
        case "title":
        case "mode":
        case "cover":
        case "author":
        case "digest":
          next.metadata = {
            ...next.metadata,
            [field]: value,
          };
          break;
        default:
          next.legacyFields = {
            ...next.legacyFields,
            [field]: value,
          };
      }

      next.metadata.updatedAt = new Date().toISOString();
      return next;
    });
    if (field === "html" || field === "css" || field === "js" || field === "markdown" || field === "mode") {
      setProjectionFreshness("stale");
      setBlockEditorModeState("legacy-fragment");
    }
    setSaved(false);
  }, []);

  const applyPreviewEdit = useCallback((newHtml: string) => {
    const next = normalizeEditableHtml(newHtml);
    if (next.semanticKey === storedSemanticKey) return;
    updateField("html", next.serialized);
  }, [storedSemanticKey, updateField]);

  const updatePublishMetadata = useCallback((field: PublishMetadataField, value: string) => {
    publishMetadataDirty.current = true;
    setPublishMetadata((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const resetPublishMetadata = useCallback(() => {
    if (!bridgeDoc) return;
    publishMetadataDirty.current = false;
    setPublishMetadata(bridgeDocToPublishMetadata(bridgeDoc));
  }, [bridgeDoc]);

  const selectBlock = useCallback(
    (blockId: string) => {
      setSelectedBlockId(blockId);
      if (
        projectionFreshness === "ready" &&
        isProjectedBlockEditable(bridgeDoc?.mbdoc ?? null, blockId)
      ) {
        setBlockEditorModeState("projected-block");
        return;
      }
      setBlockEditorModeState("legacy-fragment");
    },
    [bridgeDoc, projectionFreshness],
  );

  const setBlockEditorMode = useCallback(
    (mode: BlockEditorMode) => {
      if (
        mode === "projected-block" &&
        (!selectedBlockId || projectionFreshness !== "ready")
      ) {
        setBlockEditorModeState("legacy-fragment");
        return;
      }
      setBlockEditorModeState(mode);
    },
    [bridgeDoc, projectionFreshness, selectedBlockId],
  );

  const updateSelectedBlock = useCallback(
    (patch: Record<string, unknown>) => {
      if (!bridgeDoc || !selectedBlockId) {
        return;
      }
      const nextDoc = applyProjectedBlockEdit(bridgeDoc, selectedBlockId, patch);
      if (!nextDoc) {
        setBlockEditorModeState("legacy-fragment");
        return;
      }
      setBridgeDoc(nextDoc);
      setProjectionFreshness("stale");
      setSaved(false);
    },
    [bridgeDoc, selectedBlockId],
  );

  const commitSavedMetadata = useCallback((nextMetadata: PublishMetadataDraft) => {
    publishMetadataDirty.current = false;
    setBridgeDoc((current) => {
      if (!current) return current;
      const updatedAt = new Date().toISOString();
      return {
        ...current,
        metadata: {
          ...current.metadata,
          ...nextMetadata,
          updatedAt,
        },
        derived: {
          ...current.derived,
          dirty: false,
        },
      };
    });
    setSaved(true);
    setPublishMetadata(nextMetadata);
  }, []);

  const refreshProjectedMBDoc = useCallback(async (articleIdToProject: string) => {
    try {
      setProjectionFreshness("syncing");
      const projected = await projectArticleToMBDoc(articleIdToProject, true);
      setBridgeDoc((current) => {
        if (!current) return current;
        return {
          ...current,
          mbdoc: projected,
          capabilities: current.capabilities.includes("bridge")
            ? current.capabilities
            : [...current.capabilities, "bridge"],
        };
      });
      setSelectedBlockId((current) =>
        projected.blocks.some((block) => block.id === current)
          ? current
          : projected.blocks[0]?.id ?? null,
      );
      setProjectionFreshness("ready");
    } catch {
      // Keep legacy editing flow usable even if projection persistence fails.
      setProjectionFreshness("stale");
    }
  }, []);

  useEffect(() => {
    if (!bridgeDoc || saved || !isHydrated.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveArticle(bridgeDoc.metadata.id, bridgeDocToArticleUpdatePayload(bridgeDoc))
        .then(() => {
          setSaved(true);
          setBridgeDoc((current) => {
            if (!current) return current;
            return {
              ...current,
              derived: {
                ...current.derived,
                dirty: false,
              },
            };
          });
          void refreshProjectedMBDoc(bridgeDoc.metadata.id);
        })
        .catch(() => setSaved(false));
    }, 3000);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [bridgeDoc, refreshProjectedMBDoc, saved]);

  useEffect(() => {
    if (!rawPreview.html.trim()) {
      setProcessedHtml("");
      return;
    }

    const delay = isFirstProcess.current ? 100 : 1500;
    if (processTimer.current) clearTimeout(processTimer.current);
    processTimer.current = setTimeout(async () => {
      try {
        if (!bridgeDoc) {
          return;
        }
        const html = await processBridgePreview(bridgeDoc, rawPreview);
        setProcessedHtml(html);
        setBridgeDoc((current) => {
          if (!current || current.derived.render.processedHtml === html) {
            return current;
          }
          return {
            ...current,
            derived: {
              ...current.derived,
              render: {
                ...current.derived.render,
                processedHtml: html,
              },
            },
          };
        });
        isFirstProcess.current = false;
      } catch {
        // Keep the raw preview in the view when processing fails.
      }
    }, delay);

    return () => {
      if (processTimer.current) clearTimeout(processTimer.current);
    };
  }, [rawPreview]);

  const copyRichText = useCallback(async () => {
    if (!actionArticle) {
      throw new Error("No article available to copy");
    }
    if (shouldUseProjectedBridge(bridgeDoc)) {
      return copyProjectedArticleRichText(actionArticle, processedHtml || undefined);
    }
    return copyArticleRichText(actionArticle, processedHtml || undefined);
  }, [actionArticle, bridgeDoc, processedHtml]);

  const exportHtml = useCallback(async () => {
    if (!actionArticle) {
      throw new Error("No article available to export");
    }
    await exportArticleHtml(actionArticle, processedHtml || undefined);
  }, [actionArticle, processedHtml]);

  const saveDraft = useCallback(async () => {
    if (!article) {
      throw new Error("No article available to save");
    }
    await saveArticleDraft(article, publishMetadata);
    commitSavedMetadata(publishMetadata);
  }, [article, commitSavedMetadata, publishMetadata]);

  const publishDraft = useCallback(async (options?: {
    config?: WechatConfigInput;
    persistConfig?: boolean;
    timeoutMs?: number;
  }) => {
    if (!article) {
      throw new Error("No article available to publish");
    }
    return publishArticleDraft({
      articleId: article.id,
      sourceArticle: article,
      publishAsMBDoc: shouldUseProjectedBridge(bridgeDoc),
      metadata: publishMetadata,
      config: options?.config,
      persistConfig: options?.persistConfig,
      timeoutMs: options?.timeoutMs,
    });
  }, [article, bridgeDoc, publishMetadata]);

  const publishDraftWithCommit = useCallback(async (options?: {
    config?: WechatConfigInput;
    persistConfig?: boolean;
    timeoutMs?: number;
  }) => {
    const result = await publishDraft(options);
    commitSavedMetadata(publishMetadata);
    return result;
  }, [commitSavedMetadata, publishDraft, publishMetadata]);

  return {
    article,
    bridgeDoc,
    projectedBlocks,
    selectedBlockId,
    selectedBlockIndex,
    selectedBlock,
    selectedBlockSummary,
    blockEditorMode,
    projectionFreshness,
    canEditSelectedBlock,
    rawPreview,
    processedHtml,
    publishMetadata,
    saved,
    loading,
    updateField,
    updatePublishMetadata,
    resetPublishMetadata,
    selectBlock,
    setBlockEditorMode,
    updateSelectedBlock,
    applyPreviewEdit,
    copyRichText,
    exportHtml,
    saveDraft,
    publishDraft: publishDraftWithCommit,
  };
}
