import { useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import type { MonacoEditorHandle } from "@/components/editor/MonacoEditor";
import LazyMarkdownEditor from "@/components/editor/LazyMarkdownEditor";
import LazyMonacoEditor from "@/components/editor/LazyMonacoEditor";
import EditorTabs from "@/components/editor/EditorTabs";
import WechatPreview from "@/components/preview/WechatPreview";
import FullScreenPreviewModal from "@/components/preview/FullScreenPreviewModal";
import ActionPanel from "@/components/panel/ActionPanel";
import ThemeSelector from "@/components/panel/ThemeSelector";
import ImageManager from "@/components/panel/ImageManager";
import CommandBar from "@/components/ui/CommandBar";
import PublishModal from "@/components/ui/PublishModal";
import EditorHeader from "@/components/layout/EditorHeader";
import { getWordCount, WORD_COUNT_TOOLTIP } from "@/utils/wordCount";
import { useImageUpload } from "@/hooks/useImageUpload";
import type { Article } from "@/types";
import BlockInspector from "@/features/editor/components/BlockInspector";
import BlockList from "@/features/editor/components/BlockList";
import ProjectedBlockEditor from "@/features/editor/components/ProjectedBlockEditor";
import { useEditorSession } from "@/features/editor/session/useEditorSession";

const HTML_TABS = [
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "js", label: "JS" },
];

const LANG_MAP: Record<string, string> = {
  html: "html",
  css: "css",
  js: "javascript",
};

type ViewMode = "code" | "preview" | "split";

function getProjectionHint(reason?: string | null) {
  return reason ?? "请选择一个投影块以查看详情。";
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("html");
  const [previewMode] = useState<"raw" | "wechat">("wechat");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [mdTheme, setMdTheme] = useState("default");
  const [projectedHtmlTab, setProjectedHtmlTab] = useState("source");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const htmlEditorRef = useRef<MonacoEditorHandle>(null);
  const mdEditorRef = useRef<MonacoEditorHandle>(null);
  const { upload } = useImageUpload();
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const {
    article,
    projectedBlocks,
    selectedBlockId,
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
    selectBlock,
    setBlockEditorMode,
    updateSelectedBlock,
    applyPreviewEdit,
    copyRichText,
    exportHtml,
    saveDraft,
    publishDraft,
  } = useEditorSession({
    articleId: id,
    markdownTheme: mdTheme,
  });

  const handleInsertImage = useCallback(
    (url: string) => {
      if (!article) return;

      const imgTag = `<img src="${url}" style="max-width:100%;border-radius:8px;" />`;
      if (article.mode === "markdown") {
        if (mdEditorRef.current) {
          mdEditorRef.current.insertAtCursor(`\n\n${imgTag}\n`);
        } else {
          updateField("markdown", `${article.markdown}\n\n${imgTag}\n`);
        }
        return;
      }

      if (activeTab === "html" && htmlEditorRef.current) {
        htmlEditorRef.current.insertAtCursor(`\n${imgTag}\n`);
      } else {
        updateField("html", `${article.html}\n${imgTag}`);
      }
    },
    [activeTab, article, updateField],
  );

  const handlePasteImage = useCallback(
    async (file: File) => {
      const record = await upload(file);
      if (record) {
        handleInsertImage(`/images/${record.path}`);
      }
    },
    [handleInsertImage, upload],
  );

  const wordCount = useMemo(() => {
    if (!article) return 0;
    return getWordCount(
      article.mode === "markdown" ? article.markdown : article.html,
      article.mode as "html" | "markdown",
    );
  }, [article]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const startRatio = splitRatio;
      const rect = container.getBoundingClientRect();

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newRatio = Math.min(0.8, Math.max(0.2, startRatio + delta / rect.width));
        setSplitRatio(newRatio);
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
    [splitRatio],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-primary">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-primary px-6">
        <div className="max-w-md rounded-2xl border border-border-primary bg-surface-secondary px-6 py-8 text-center shadow-sm">
          <div className="text-lg font-semibold text-fg-primary">文章加载失败</div>
          <div className="mt-2 text-sm leading-6 text-fg-muted">
            未能读取当前文章内容。请返回列表页重试，或确认后端服务与文章 ID 是否正常。
          </div>
        </div>
      </div>
    );
  }

  const editorValue = (article[activeTab as keyof Article] as string) || "";
  const previewHtml = processedHtml || rawPreview.html;
  const previewCss = processedHtml ? "" : rawPreview.css;
  const previewJs = processedHtml ? "" : rawPreview.js;

  const showCode = viewMode === "code" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";
  const showBoth = showCode && showPreview;
  const showProjectedBlockEditor =
    blockEditorMode === "projected-block" &&
    projectionFreshness === "ready" &&
    selectedBlock !== null;
  const blockInspectorHint = getProjectionHint(selectedBlockSummary?.reason);

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <EditorHeader
        title={article.title}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPreview={() => setFullPreviewOpen(true)}
        onPublish={() => setPublishOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border-primary bg-surface-secondary">
          <div className="px-4 pt-4 pb-1">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-fg-muted">
              结构
            </span>
          </div>

          <div className="px-4 pb-2">
            <input
              value={article.title}
              onChange={(e) => updateField("title", e.target.value)}
              className="w-full bg-transparent text-[13px] font-medium text-fg-primary outline-none placeholder:text-fg-muted"
              placeholder="文章标题..."
            />
          </div>

          <div className="flex items-center gap-1.5 px-4 pb-3">
            <button
              onClick={() => updateField("mode", "html")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                article.mode === "html"
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              HTML
            </button>
            <button
              onClick={() => updateField("mode", "markdown")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                article.mode === "markdown"
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              Markdown
            </button>
          </div>

          <div className="px-3 pb-2">
            <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-fg-primary">
              <FileText size={14} className="shrink-0 text-accent" />
              <span className="truncate text-[12px]">{article.title || "未命名文章"}</span>
            </div>
            <BlockList
              blocks={projectedBlocks}
              selectedBlockId={selectedBlockId}
              projectionFreshness={projectionFreshness}
              onSelectBlock={selectBlock}
            />
          </div>

          <div className="mx-4 h-px bg-border-primary" />

          <div className="px-4 py-3">
            <div className="mb-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-fg-muted">
                图片
              </span>
            </div>
            <ImageManager onInsert={handleInsertImage} />
          </div>

          {article.mode === "markdown" && (
            <>
              <div className="mx-4 h-px bg-border-primary" />
              <div className="px-4 py-3">
                <div className="mb-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-fg-muted">
                    主题
                  </span>
                </div>
                <ThemeSelector value={mdTheme} onChange={setMdTheme} />
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={splitContainerRef} className="flex min-w-0 flex-1 overflow-hidden">
            {showCode && (
              <div
                className="flex min-w-0 flex-col overflow-hidden"
                style={showBoth ? { width: `${splitRatio * 100}%`, flexShrink: 0 } : { flex: 1 }}
              >
                {article.mode === "html" ? (
                  showProjectedBlockEditor ? (
                    <ProjectedBlockEditor
                      selectedBlock={selectedBlock}
                      selectedBlockSummary={selectedBlockSummary}
                      canEditSelectedBlock={canEditSelectedBlock}
                      blockInspectorHint={blockInspectorHint}
                      projectedHtmlTab={projectedHtmlTab}
                      onProjectedHtmlTabChange={setProjectedHtmlTab}
                      onUpdateSelectedBlock={updateSelectedBlock}
                      onFallbackToLegacy={() => setBlockEditorMode("legacy-fragment")}
                      onPasteImage={handlePasteImage}
                      htmlEditorRef={htmlEditorRef}
                      mdEditorRef={mdEditorRef}
                    />
                  ) : (
                    <>
                      <EditorTabs
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        tabs={HTML_TABS}
                      />
                      <div className="flex-1">
                        <LazyMonacoEditor
                          ref={htmlEditorRef}
                          value={editorValue}
                          onChange={(v) => updateField(activeTab as "html" | "css" | "js", v)}
                          language={LANG_MAP[activeTab] || "html"}
                          onPasteImage={handlePasteImage}
                        />
                      </div>
                    </>
                  )
                ) : showProjectedBlockEditor ? (
                  <ProjectedBlockEditor
                    selectedBlock={selectedBlock}
                    selectedBlockSummary={selectedBlockSummary}
                    canEditSelectedBlock={canEditSelectedBlock}
                    blockInspectorHint={blockInspectorHint}
                    projectedHtmlTab={projectedHtmlTab}
                    onProjectedHtmlTabChange={setProjectedHtmlTab}
                    onUpdateSelectedBlock={updateSelectedBlock}
                    onFallbackToLegacy={() => setBlockEditorMode("legacy-fragment")}
                    onPasteImage={handlePasteImage}
                    htmlEditorRef={htmlEditorRef}
                    mdEditorRef={mdEditorRef}
                  />
                ) : (
                  <>
                    <div className="flex h-9 items-center border-b border-border-primary bg-surface-secondary px-4 font-mono text-xs text-fg-muted">
                      Markdown
                    </div>
                    <div className="flex-1">
                      <LazyMarkdownEditor
                        ref={mdEditorRef}
                        value={article.markdown}
                        onChange={(v) => updateField("markdown", v)}
                        onPasteImage={handlePasteImage}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {showBoth && (
              <div
                className="w-1 shrink-0 cursor-col-resize bg-border-primary transition-colors hover:bg-accent active:bg-accent"
                onMouseDown={handleDragStart}
              />
            )}

            {showPreview && (
              <div
                className="flex flex-col overflow-hidden bg-bg-primary"
                style={showBoth ? { width: `${(1 - splitRatio) * 100}%`, flexShrink: 0 } : { flex: 1 }}
              >
                <div className="flex-1 overflow-x-auto overflow-y-auto">
                  <div className="flex justify-center p-8">
                    <WechatPreview
                      html={previewHtml}
                      css={previewCss}
                      js={previewJs}
                      mode={previewMode}
                      onHtmlChange={applyPreviewEdit}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <CommandBar wordCount={wordCount} saved={saved} />
        </div>

        <div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border-primary bg-surface-secondary">
          <BlockInspector
            articleMode={article.mode as "html" | "markdown"}
            selectedBlockSummary={selectedBlockSummary}
            blockEditorMode={blockEditorMode}
            projectionFreshness={projectionFreshness}
            canShowProjectedMode={Boolean(selectedBlock) && projectionFreshness === "ready"}
            hint={blockInspectorHint}
            onSetBlockEditorMode={setBlockEditorMode}
          />

          <div className="flex-1">
            <ActionPanel
              onCopy={copyRichText}
              onPublish={() => publishDraft({ timeoutMs: 300000 })}
              onExport={exportHtml}
            />
          </div>

          <div className="border-t border-border-primary px-4 py-3">
            <div className="flex items-center justify-between font-mono text-[10px] text-fg-muted">
              <span>MBEditor 编辑器</span>
              <span title={WORD_COUNT_TOOLTIP}>{wordCount.toLocaleString()} 字</span>
            </div>
          </div>
        </div>
      </div>

      <FullScreenPreviewModal
        open={fullPreviewOpen}
        onClose={() => setFullPreviewOpen(false)}
        html={previewHtml}
        css={previewCss}
        js={previewJs}
      />

      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        article={{ ...article, html: previewHtml, css: previewCss }}
        metadata={publishMetadata}
        onMetadataChange={updatePublishMetadata}
        onSaveDraft={saveDraft}
        onPublish={publishDraft}
      />
    </div>
  );
}
