import { useState } from "react";
import { Copy, Send, Download } from "lucide-react";
import ImageManager from "./ImageManager";
import api from "@/lib/api";
import type { Article } from "@/types";

interface ActionPanelProps {
  article: Article;
  onInsertImage: (url: string) => void;
}

/** Copy rich text HTML to clipboard */
async function copyHtmlToClipboard(html: string): Promise<boolean> {
  try {
    const blob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([html], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blob,
        "text/plain": plainBlob,
      }),
    ]);
    return true;
  } catch {
    // Fallback
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.setAttribute("contenteditable", "true");
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const ok = document.execCommand("copy");
    document.body.removeChild(container);
    return ok;
  }
}

export default function ActionPanel({ article, onInsertImage }: ActionPanelProps) {
  const [copyMsg, setCopyMsg] = useState("");
  const [publishMsg, setPublishMsg] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    setCopyMsg("");
    try {
      // POST current HTML+CSS for processing (uses live editor state)
      const res = await api.post("/publish/preview", {
        html: article.html,
        css: article.css,
      });
      if (res.data.code === 0) {
        const inlinedHtml = res.data.data.html;
        const ok = await copyHtmlToClipboard(inlinedHtml);
        setCopyMsg(ok ? "已复制! CSS已inline化" : "复制失败");
      } else {
        setCopyMsg(res.data.message);
      }
    } catch {
      setCopyMsg("复制失败");
    }
    setCopying(false);
    setTimeout(() => setCopyMsg(""), 3000);
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishMsg("");
    try {
      // Save current editor state first, then push
      await api.put(`/articles/${article.id}`, {
        html: article.html,
        css: article.css,
        js: article.js || "",
        title: article.title,
        mode: article.mode,
      });
      const res = await api.post("/publish/draft", { article_id: article.id });
      setPublishMsg(res.data.code === 0 ? "草稿已推送!" : res.data.message);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setPublishMsg(err.response?.data?.message || "推送失败");
    }
    setPublishing(false);
    setTimeout(() => setPublishMsg(""), 3000);
  };

  const handleExport = async () => {
    try {
      const res = await api.post("/publish/preview", {
        html: article.html,
        css: article.css,
      });
      const inlinedHtml = res.data.code === 0 ? res.data.data.html : article.html;
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${article.title}</title></head><body>${inlinedHtml}</body></html>`;
      const blob = new Blob([fullHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${article.title || "article"}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${article.title}</title></head><body>${article.html}</body></html>`;
      const blob = new Blob([fullHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${article.title || "article"}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="w-56 shrink-0 border-l border-border p-4 bg-surface-secondary overflow-y-auto space-y-4">
      <div className="space-y-2">
        <button
          onClick={handleCopy}
          disabled={copying}
          className="w-full flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Copy size={14} /> {copying ? "处理中..." : "一键复制富文本"}
        </button>
        {copyMsg && <div className="text-xs text-success">{copyMsg}</div>}

        <button
          onClick={handlePublish}
          disabled={publishing}
          className="w-full flex items-center gap-2 px-3 py-2 bg-surface-tertiary hover:bg-border text-fg-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Send size={14} /> {publishing ? "推送中..." : "推送到草稿箱"}
        </button>
        {publishMsg && <div className="text-xs text-fg-secondary">{publishMsg}</div>}

        <button onClick={handleExport} className="w-full flex items-center gap-2 px-3 py-2 bg-surface-tertiary hover:bg-border text-fg-primary rounded-lg text-sm font-medium transition-colors">
          <Download size={14} /> 导出 HTML
        </button>
      </div>

      <hr className="border-border" />

      <ImageManager onInsert={onInsertImage} />
    </div>
  );
}
