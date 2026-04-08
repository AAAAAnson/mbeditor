import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import MonacoEditor from "@/components/editor/MonacoEditor";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import EditorTabs from "@/components/editor/EditorTabs";
import WechatPreview from "@/components/preview/WechatPreview";
import type { WechatPreviewHandle } from "@/components/preview/WechatPreview";
import ActionPanel from "@/components/panel/ActionPanel";
import ThemeSelector from "@/components/panel/ThemeSelector";
import SvgTemplatePanel from "@/components/panel/SvgTemplatePanel";
import ImageManager from "@/components/panel/ImageManager";
import CommandBar from "@/components/ui/CommandBar";
import PublishModal from "@/components/ui/PublishModal";
import EditorHeader from "@/components/layout/EditorHeader";
import { renderMarkdown } from "@/utils/markdown";
import { extractHTML } from "@/utils/extractor";
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
  const [publishOpen, setPublishOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<WechatPreviewHandle>(null);

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

  const handleInsertImage = (url: string) => {
    if (!article) return;
    const imgTag = `<img src="${url}" style="max-width:100%;border-radius:8px;" />`;
    if (article.mode === "markdown") {
      updateField("markdown", article.markdown + "\n\n" + imgTag + "\n");
    } else if (previewRef.current) {
      previewRef.current.insertHtml(imgTag);
    } else {
      updateField("html", article.html + "\n" + imgTag);
    }
  };

  const handleInsertSvg = (svgHtml: string) => {
    if (!article) return;
    if (article.mode === "markdown") {
      // Markdown 中直接插入 HTML 块（需要前后空行）
      updateField("markdown", article.markdown + "\n\n" + svgHtml + "\n");
    } else if (previewRef.current) {
      previewRef.current.insertHtml(svgHtml);
    } else {
      updateField("html", article.html + "\n" + svgHtml);
    }
  };

  const handlePreviewHtmlChange = useCallback(
    (newHtml: string) => {
      if (!article) return;
      updateField("html", newHtml);
    },
    [article]
  );

  const wordCount = useMemo(() => {
    if (!article) return 0;
    const text =
      article.mode === "markdown" ? article.markdown : article.html;
    // Count Chinese characters + English words
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (
      text.replace(/[\u4e00-\u9fff]/g, "").match(/[a-zA-Z]+/g) || []
    ).length;
    return chinese + english;
  }, [article]);

  if (!article) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const editorValue = (article[activeTab as keyof Article] as string) || "";
  const extractedHtml =
    article.mode === "markdown"
      ? renderMarkdown(article.markdown, mdTheme)
      : extractHTML(article.html);
  const previewHtml = extractedHtml;
  const previewCss = article.mode === "markdown" ? "" : article.css;
  const previewJs = article.mode === "markdown" ? "" : article.js;

  const showCode = viewMode === "code" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Editor Header - 52px */}
      <EditorHeader
        title={article.title}
        mode={article.mode as "html" | "markdown"}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPreview={() => setViewMode(viewMode === "preview" ? "split" : "preview")}
        onPublish={() => setPublishOpen(true)}
      />

      {/* Three-column workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - 250px */}
        <div className="w-[250px] shrink-0 bg-surface-secondary border-r border-border-primary flex flex-col overflow-y-auto">
          {/* Structure section header */}
          <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
            <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
              结构
            </span>
            <div className="flex items-center gap-1">
              {/* placeholder for search/add icons */}
            </div>
          </div>

          {/* Title input */}
          <div className="px-3.5 pb-2">
            <input
              value={article.title}
              onChange={(e) => updateField("title", e.target.value)}
              className="w-full bg-transparent text-fg-primary text-[13px] font-medium outline-none placeholder:text-fg-muted"
              placeholder="文章标题..."
            />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 px-3.5 pb-2">
            <button
              onClick={() => updateField("mode", "html")}
              className={`px-2 py-1 text-[11px] rounded-md font-medium transition-colors ${
                article.mode === "html" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              HTML
            </button>
            <button
              onClick={() => updateField("mode", "markdown")}
              className={`px-2 py-1 text-[11px] rounded-md font-medium transition-colors ${
                article.mode === "markdown" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              Markdown
            </button>
          </div>

          {/* Document tree placeholder - shows article structure */}
          <div className="px-2 flex-1 overflow-y-auto">
            <div className="flex items-center gap-1.5 px-2 py-[5px] rounded text-fg-primary w-full">
              <FileText size={14} className="text-accent shrink-0" />
              <span className="text-[12px] truncate">{article.title || "未命名文章"}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border-primary mx-2" />

          {/* Image Manager section */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
                图片
              </span>
            </div>
            <ImageManager onInsert={handleInsertImage} />
          </div>

          {/* Theme Selector (Markdown mode only) */}
          {article.mode === "markdown" && (
            <>
              <div className="h-px bg-border-primary mx-2" />
              <div className="p-3">
                <div className="mb-2">
                  <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
                    主题
                  </span>
                </div>
                <ThemeSelector value={mdTheme} onChange={setMdTheme} />
              </div>
            </>
          )}

          {/* SVG Templates */}
          <div className="h-px bg-border-primary mx-2" />
          <SvgTemplatePanel onInsert={handleInsertSvg} />
        </div>

        {/* Center area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor + Preview */}
          <div className="flex-1 flex min-w-0 overflow-hidden">
            {/* Code editor pane */}
            {showCode && (
              <div className={`flex flex-col min-w-0 ${showPreview ? "flex-1 border-r border-border-primary" : "flex-1"}`}>
                {article.mode === "html" ? (
                  <>
                    <EditorTabs
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      tabs={HTML_TABS}
                    />
                    <div className="flex-1">
                      <MonacoEditor
                        value={editorValue}
                        onChange={(v) => updateField(activeTab as keyof Article, v)}
                        language={LANG_MAP[activeTab] || "html"}
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
                        value={article.markdown}
                        onChange={(v) => updateField("markdown", v)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Preview pane */}
            {showPreview && (
              <div className="flex-1 min-w-[360px] shrink-0 flex flex-col bg-bg-primary">
                <div className="flex-1 flex justify-center p-8 min-h-0">
                  <WechatPreview
                    ref={previewRef}
                    html={previewHtml}
                    css={previewCss}
                    js={previewJs}
                    mode={previewMode}
                    onHtmlChange={handlePreviewHtmlChange}
                  />
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
              article={{ ...article, html: previewHtml, css: previewCss }}
            />
          </div>

          {/* Article metadata at bottom */}
          <div className="border-t border-border-primary px-4 py-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-fg-muted">
              <span>MBEditor 编辑</span>
              <span>{wordCount.toLocaleString()} 字</span>
            </div>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        article={{ ...article, html: previewHtml, css: previewCss }}
      />
    </div>
  );
}
