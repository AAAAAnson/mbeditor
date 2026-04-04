import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import MonacoEditor from "@/components/editor/MonacoEditor";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import EditorTabs from "@/components/editor/EditorTabs";
import WechatPreview from "@/components/preview/WechatPreview";
import type { WechatPreviewHandle } from "@/components/preview/WechatPreview";
import ActionPanel from "@/components/panel/ActionPanel";
import ThemeSelector from "@/components/panel/ThemeSelector";
import SvgTemplatePanel from "@/components/panel/SvgTemplatePanel";
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

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [activeTab, setActiveTab] = useState("html");
  const [previewMode, setPreviewMode] = useState<"raw" | "wechat">("wechat");
  const [mdTheme, setMdTheme] = useState("default");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<WechatPreviewHandle>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/articles/${id}`).then((res) => {
      if (res.data.code === 0) setArticle(res.data.data);
    });
  }, [id]);

  const autoSave = useCallback((updated: Article) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/articles/${updated.id}`, {
        html: updated.html,
        css: updated.css,
        js: updated.js,
        markdown: updated.markdown,
        title: updated.title,
        mode: updated.mode,
      });
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
    if (previewRef.current) {
      previewRef.current.insertHtml(imgTag);
    } else {
      updateField("html", article.html + "\n" + imgTag);
    }
  };

  const handleInsertSvg = (svgHtml: string) => {
    if (!article) return;
    if (previewRef.current) {
      previewRef.current.insertHtml(svgHtml);
    } else {
      updateField("html", article.html + "\n" + svgHtml);
    }
  };

  const handlePreviewHtmlChange = useCallback((newHtml: string) => {
    if (!article) return;
    updateField("html", newHtml);
  }, [article]);

  if (!article) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const editorValue = (article[activeTab as keyof Article] as string) || "";
  const extractedHtml = article.mode === "markdown" ? renderMarkdown(article.markdown, mdTheme) : extractHTML(article.html);
  const previewHtml = extractedHtml;
  const previewCss = article.mode === "markdown" ? "" : article.css;

  return (
    <div className="h-full flex flex-col">
      {/* Title bar */}
      <div className="h-10 border-b border-border flex items-center px-4 bg-surface-secondary shrink-0">
        <div className="flex gap-1 mr-4">
          <button onClick={() => updateField("mode", "html")} className={`px-2 py-1 text-xs rounded ${article.mode === "html" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"}`}>
            HTML
          </button>
          <button onClick={() => updateField("mode", "markdown")} className={`px-2 py-1 text-xs rounded ${article.mode === "markdown" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"}`}>
            Markdown
          </button>
        </div>
        <input
          value={article.title}
          onChange={(e) => updateField("title", e.target.value)}
          className="bg-transparent text-fg-primary text-sm font-medium outline-none flex-1"
          placeholder="文章标题..."
        />
        <div className="flex gap-1">
          <button onClick={() => setPreviewMode("raw")} className={`px-2 py-1 text-xs rounded ${previewMode === "raw" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"}`}>
            原始
          </button>
          <button onClick={() => setPreviewMode("wechat")} className={`px-2 py-1 text-xs rounded ${previewMode === "wechat" ? "bg-accent text-white" : "text-fg-muted hover:text-fg-secondary"}`}>
            微信
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor */}
        {article.mode === "html" ? (
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            <EditorTabs activeTab={activeTab} onTabChange={setActiveTab} tabs={HTML_TABS} />
            <div className="flex-1">
              <MonacoEditor
                value={editorValue}
                onChange={(v) => updateField(activeTab as keyof Article, v)}
                language={LANG_MAP[activeTab] || "html"}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            <div className="h-9 border-b border-border bg-surface-secondary flex items-center px-4 text-xs text-fg-muted">
              Markdown
            </div>
            <div className="flex-1">
              <MarkdownEditor value={article.markdown} onChange={(v) => updateField("markdown", v)} />
            </div>
          </div>
        )}

        {/* Preview — iframe with contentEditable for perfect visual fidelity */}
        <div className="flex-1 min-w-[400px] shrink-0 p-2 bg-surface-primary overflow-y-auto">
          <WechatPreview
            ref={previewRef}
            html={previewHtml}
            css={previewCss}
            mode={previewMode}
            onHtmlChange={handlePreviewHtmlChange}
          />
        </div>

        {/* Action Panel */}
        <div className="flex flex-col overflow-y-auto">
          <ActionPanel article={{...article, html: previewHtml, css: previewCss}} onInsertImage={handleInsertImage} />
          {article.mode === "markdown" && (
            <div className="px-4 pb-4 bg-surface-secondary border-l border-border">
              <ThemeSelector value={mdTheme} onChange={setMdTheme} />
            </div>
          )}
          <div className="bg-surface-secondary border-l border-border">
            <SvgTemplatePanel onInsert={handleInsertSvg} />
          </div>
        </div>
      </div>
    </div>
  );
}
