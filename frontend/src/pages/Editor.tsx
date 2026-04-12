import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import MonacoEditor, { type MonacoEditorHandle } from "@/components/editor/MonacoEditor";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import EditorTabs from "@/components/editor/EditorTabs";
import WechatPreview from "@/components/preview/WechatPreview";
import FullScreenPreviewModal from "@/components/preview/FullScreenPreviewModal";
import ActionPanel from "@/components/panel/ActionPanel";
import ThemeSelector from "@/components/panel/ThemeSelector";
import ImageManager from "@/components/panel/ImageManager";
import CommandBar from "@/components/ui/CommandBar";
import PublishModal from "@/components/ui/PublishModal";
import EditorHeader from "@/components/layout/EditorHeader";
import { renderMarkdown } from "@/utils/markdown";
import { extractHTML } from "@/utils/extractor";
import { normalizeEditableHtml } from "@/utils/htmlSemantics";
import { getWordCount, WORD_COUNT_TOOLTIP } from "@/utils/wordCount";
import { useImageUpload } from "@/hooks/useImageUpload";
import api from "@/lib/api";
import type { Article } from "@/types";

const HTML_TABS = [
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "js", label: "JS" },
];

const LANG_MAP: Record<string, string> = { html: "html", css: "css", js: "javascript" };

type ViewMode = "code" | "preview" | "split";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [activeTab, setActiveTab] = useState("html");
  const [previewMode, setPreviewMode] = useState<"raw" | "wechat">("wechat");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [mdTheme, setMdTheme] = useState("default");
  const [saved, setSaved] = useState(true);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlEditorRef = useRef<MonacoEditorHandle>(null);
  const mdEditorRef = useRef<MonacoEditorHandle>(null);
  const processTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstProcess = useRef(true);
  const [processedHtml, setProcessedHtml] = useState("");
  const { upload } = useImageUpload();
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/articles/${id}`).then((res) => {
      if (res.data.code === 0) setArticle(res.data.data);
    });
  }, [id]);

  const autoSave = useCallback((updated: Article) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api
        .put(`/articles/${updated.id}`, {
          html: updated.html,
          css: updated.css,
          js: updated.js,
          markdown: updated.markdown,
          title: updated.title,
          mode: updated.mode,
        })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 3000);
  }, []);

  const updateField = (field: keyof Article, value: string) => {
    if (!article) return;
    const updated = { ...article, [field]: value };
    setArticle(updated);
    autoSave(updated);
  };

  const handleInsertImage = useCallback(
    (url: string) => {
      if (!article) return;
      const imgTag = `<img src="${url}" style="max-width:100%;border-radius:8px;" />`;
      if (article.mode === "markdown") {
        if (mdEditorRef.current) {
          mdEditorRef.current.insertAtCursor("\n\n" + imgTag + "\n");
        } else {
          updateField("markdown", article.markdown + "\n\n" + imgTag + "\n");
        }
      } else {
        // HTML 模式：只有在 HTML tab 且 editor 可用时才走光标插入
        if (activeTab === "html" && htmlEditorRef.current) {
          htmlEditorRef.current.insertAtCursor("\n" + imgTag + "\n");
        } else {
          updateField("html", article.html + "\n" + imgTag);
        }
      }
    },
    [article, activeTab]
  );

  const handlePasteImage = useCallback(
    async (file: File) => {
      const record = await upload(file);
      if (record) {
        handleInsertImage(`/images/${record.path}`);
      }
    },
    [upload, handleInsertImage]
  );

  // Memoize stored semantic key to avoid re-parsing article.html on every iframe input
  const storedSemanticKey = useMemo(
    () => (article ? normalizeEditableHtml(article.html).semanticKey : ""),
    [article?.html]
  );

  const handlePreviewHtmlChange = useCallback(
    (newHtml: string) => {
      if (!article) return;
      const next = normalizeEditableHtml(newHtml);
      if (next.semanticKey === storedSemanticKey) return;
      updateField("html", next.serialized);
    },
    [article, storedSemanticKey]
  );

  const wordCount = useMemo(() => {
    if (!article) return 0;
    return getWordCount(
      article.mode === "markdown" ? article.markdown : article.html,
      article.mode as "html" | "markdown"
    );
  }, [article]);

  // Memoize raw preview data for processing pipeline
  const rawPreview = useMemo(() => {
    if (!article) return { html: "", css: "", js: "" };
    const html = article.mode === "markdown"
      ? renderMarkdown(article.markdown, mdTheme)
      : extractHTML(article.html);
    return {
      html,
      css: article.mode === "markdown" ? "" : article.css,
      js: article.mode === "markdown" ? "" : article.js,
    };
  }, [article?.mode, article?.markdown, article?.html, article?.css, article?.js, mdTheme]);

  // WYSIWYG: debounced backend processing ensures preview matches copy output
  useEffect(() => {
    if (!rawPreview.html.trim()) {
      setProcessedHtml("");
      return;
    }
    const delay = isFirstProcess.current ? 100 : 1500;
    if (processTimer.current) clearTimeout(processTimer.current);
    processTimer.current = setTimeout(async () => {
      try {
        const res = await api.post("/publish/preview", {
          html: rawPreview.html,
          css: rawPreview.css,
        });
        if (res.data.code === 0) {
          setProcessedHtml(res.data.data.html);
          isFirstProcess.current = false;
        }
      } catch {
        // On error, keep showing raw HTML
      }
    }, delay);
    return () => {
      if (processTimer.current) clearTimeout(processTimer.current);
    };
  }, [rawPreview.html, rawPreview.css]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
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
  }, [splitRatio]);

  if (!article) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Editor Header - 52px */}
      <EditorHeader
        title={article.title}
        mode={article.mode as "html" | "markdown"}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPreview={() => setFullPreviewOpen(true)}
        onPublish={() => setPublishOpen(true)}
      />

      {/* Three-column workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - 250px */}
        <div className="w-[300px] shrink-0 bg-surface-secondary border-r border-border-primary flex flex-col overflow-y-auto">
          {/* Structure section */}
          <div className="px-4 pt-4 pb-1">
            <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
              结构
            </span>
          </div>

          {/* Title input */}
          <div className="px-4 pb-2">
            <input
              value={article.title}
              onChange={(e) => updateField("title", e.target.value)}
              className="w-full bg-transparent text-fg-primary text-[13px] font-medium outline-none placeholder:text-fg-muted"
              placeholder="文章标题..."
            />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1.5 px-4 pb-3">
            <button
              onClick={() => updateField("mode", "html")}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                article.mode === "html" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              HTML
            </button>
            <button
              onClick={() => updateField("mode", "markdown")}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                article.mode === "markdown" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              Markdown
            </button>
          </div>

          {/* Document tree */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded text-fg-primary">
              <FileText size={14} className="text-accent shrink-0" />
              <span className="text-[12px] truncate">{article.title || "未命名文章"}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border-primary mx-4" />

          {/* Image Manager section */}
          <div className="px-4 py-3">
            <div className="mb-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
                图片
              </span>
            </div>
            <ImageManager onInsert={handleInsertImage} />
          </div>

          {/* Theme Selector (Markdown mode only) */}
          {article.mode === "markdown" && (
            <>
              <div className="h-px bg-border-primary mx-4" />
              <div className="px-4 py-3">
                <div className="mb-2">
                  <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
                    主题
                  </span>
                </div>
                <ThemeSelector value={mdTheme} onChange={setMdTheme} />
              </div>
            </>
          )}

        </div>

        {/* Center area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor + Preview */}
          <div ref={splitContainerRef} className="flex-1 flex min-w-0 overflow-hidden">
            {/* Code editor pane */}
            {showCode && (
              <div
                className="flex flex-col min-w-0 overflow-hidden"
                style={showBoth ? { width: `${splitRatio * 100}%`, flexShrink: 0 } : { flex: 1 }}
              >
                {article.mode === "html" ? (
                  <>
                    <EditorTabs
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      tabs={HTML_TABS}
                    />
                    <div className="flex-1">
                      <MonacoEditor
                        ref={htmlEditorRef}
                        value={editorValue}
                        onChange={(v) => updateField(activeTab as keyof Article, v)}
                        language={LANG_MAP[activeTab] || "html"}
                        onPasteImage={handlePasteImage}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-9 border-b border-border-primary bg-surface-secondary flex items-center px-4 text-xs text-fg-muted font-mono">
                      Markdown
                    </div>
                    <div className="flex-1">
                      <MarkdownEditor
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

            {/* Drag handle */}
            {showBoth && (
              <div
                className="w-1 shrink-0 cursor-col-resize bg-border-primary hover:bg-accent active:bg-accent transition-colors"
                onMouseDown={handleDragStart}
              />
            )}

            {/* Preview pane */}
            {showPreview && (
              <div
                className="flex flex-col bg-bg-primary overflow-hidden"
                style={showBoth ? { width: `${(1 - splitRatio) * 100}%`, flexShrink: 0 } : { flex: 1 }}
              >
                <div className="flex-1 overflow-y-auto overflow-x-auto">
                  <div className="p-8 flex justify-center">
                    <WechatPreview
                      html={previewHtml}
                      css={previewCss}
                      js={previewJs}
                      mode={previewMode}
                      onHtmlChange={handlePreviewHtmlChange}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Command Bar */}
          <CommandBar wordCount={wordCount} saved={saved} />
        </div>

        {/* Right sidebar - 280px */}
        <div className="w-[280px] shrink-0 bg-surface-secondary border-l border-border-primary flex flex-col overflow-y-auto">
          {/* Properties header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
            <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
              属性
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-bg text-accent text-[10px] font-mono font-medium">
              {article.mode === "markdown" ? "Markdown" : "HTML"}
            </span>
          </div>

          {/* Action buttons section */}
          <div className="flex-1">
            <ActionPanel
              article={{ ...article, html: rawPreview.html, css: rawPreview.css }}
              processedHtml={processedHtml}
            />
          </div>

          {/* Article metadata at bottom */}
          <div className="border-t border-border-primary px-4 py-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-fg-muted">
              <span>MBEditor 编辑</span>
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

      {/* Publish Modal */}
      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        article={{ ...article, html: previewHtml, css: previewCss }}
      />
    </div>
  );
}
