import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import api from "@/lib/api";
import { useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { ApiResponse, ArticleFull, ArticleMode, EditorDraft, EditorField, Route } from "@/types";
import StructurePanel from "./StructurePanel";
import CenterStage from "./CenterStage";

const EMPTY_DRAFT: EditorDraft = {
  title: "",
  mode: "html",
  html: "",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

function draftStorageKey(articleId: string) {
  return `mbeditor.editorDraft.${articleId}`;
}

function readStoredDraft(articleId: string): EditorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(articleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

function writeStoredDraft(articleId: string, draft: EditorDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(draftStorageKey(articleId), JSON.stringify(draft));
}

function clearStoredDraft(articleId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(draftStorageKey(articleId));
}

function normalizeArticle(article: ArticleFull): EditorDraft {
  return {
    title: article.title,
    mode: article.mode,
    html: article.html,
    css: article.css,
    js: article.js,
    markdown: article.markdown,
    author: article.author,
    digest: article.digest,
  };
}

function unwrapResponse<T>(response: ApiResponse<T>) {
  if (response.code !== 0) {
    throw new Error(response.message || "Request failed");
  }
  return response.data;
}

function compileMarkdown(markdown: string) {
  const rendered = marked.parse(markdown, { async: false });
  return typeof rendered === "string" ? rendered : "";
}

function buildSavePayload(draft: EditorDraft) {
  return {
    ...draft,
    html: draft.mode === "markdown" ? compileMarkdown(draft.markdown) : draft.html,
  };
}

function extractErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败";
}

function isDirty(article: ArticleFull | null, draft: EditorDraft) {
  if (!article) return false;

  const payload = buildSavePayload(draft);
  return (
    article.title !== draft.title ||
    article.mode !== draft.mode ||
    article.html !== payload.html ||
    article.css !== draft.css ||
    article.js !== draft.js ||
    article.markdown !== draft.markdown ||
    article.author !== draft.author ||
    article.digest !== draft.digest
  );
}

function viewForLayout(layout: "focus" | "split" | "triptych") {
  return layout === "focus" ? "code" : "split";
}

interface EditorSurfaceProps {
  articleId?: string;
  go: (route: Route, params?: Record<string, string>) => void;
}

export default function EditorSurface({ articleId, go }: EditorSurfaceProps) {
  const fetchArticle = useArticlesStore((state) => state.fetchArticle);
  const updateArticle = useArticlesStore((state) => state.updateArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);
  const layout = useUIStore((state) => state.layout);
  const autoSaveEnabled = useUIStore((state) => state.editorAutoSave);

  const [selected, setSelected] = useState("body");
  const [view, setView] = useState(viewForLayout(layout));
  const [tab, setTab] = useState("html");
  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const saveNonceRef = useRef(0);
  const dirty = useMemo(() => isDirty(article, draft), [article, draft]);

  useEffect(() => {
    setView(viewForLayout(layout));
  }, [layout]);

  useEffect(() => {
    if (draft.mode === "markdown" && tab === "html") {
      setTab("markdown");
    } else if (draft.mode === "html" && tab === "markdown") {
      setTab("html");
    }
  }, [draft.mode, tab]);

  useEffect(() => {
    let cancelled = false;

    if (!articleId || articleId === "new") {
      setCurrentArticle(null);
      setArticle(null);
      setDraft(EMPTY_DRAFT);
      setPreviewHtml("");
      setPreviewError(null);
      setLoadingArticle(false);
      setSaveState("idle");
      setLoadError(articleId === "new" ? "请先从稿库创建真实文章。" : null);
      return () => {
        cancelled = true;
      };
    }

    setCurrentArticle(articleId);
    setLoadingArticle(true);
    setLoadError(null);
    setPreviewHtml("");
    setPreviewError(null);

    void fetchArticle(articleId)
      .then((nextArticle) => {
        if (cancelled) return;
        setArticle(nextArticle);
        const restoredDraft = readStoredDraft(articleId);
        setDraft(restoredDraft ?? normalizeArticle(nextArticle));
        setSelected("body");
        setTab((restoredDraft?.mode ?? nextArticle.mode) === "markdown" ? "markdown" : "html");
        setSaveState(restoredDraft && isDirty(nextArticle, restoredDraft) ? "dirty" : "saved");
      })
      .catch((error) => {
        if (cancelled) return;
        const message = extractErrorMessage(error);
        setLoadError(message);
        setArticle(null);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingArticle(false);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId, fetchArticle, setCurrentArticle]);

  useEffect(() => {
    if (!articleId || !article) return;
    writeStoredDraft(articleId, draft);
  }, [article, articleId, draft]);

  const saveDraftNow = useCallback(async (source: EditorDraft, quiet = true) => {
    if (!articleId || !article) return null;

    const requestId = ++saveNonceRef.current;
    setSaveState("saving");

    try {
      const updated = await updateArticle(articleId, buildSavePayload(source));
      if (requestId === saveNonceRef.current) {
        setArticle(updated);
        setSaveState("saved");
        clearStoredDraft(articleId);
      }
      return updated;
    } catch (error) {
      if (requestId === saveNonceRef.current) {
        setSaveState("error");
      }
      if (!quiet) {
        throw error;
      }
      return null;
    }
  }, [article, articleId, updateArticle]);

  const refreshPreviewNow = useCallback(async (source: EditorDraft, quiet = true) => {
    if (!articleId || !article) return;

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await api.post<ApiResponse<{ html: string }>>("/publish/preview", {
        html: buildSavePayload(source).html,
        css: source.css,
      });
      const data = unwrapResponse(res.data);
      startTransition(() => setPreviewHtml(data.html));
    } catch (error) {
      const message = extractErrorMessage(error);
      setPreviewError(message);
      if (!quiet) {
        toast.error(message);
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [article, articleId]);

  useEffect(() => {
    if (!articleId || !article || !dirty) return;

    setSaveState("dirty");
    if (!autoSaveEnabled) return;
    const timeoutId = window.setTimeout(() => {
      void saveDraftNow(draft).catch(() => undefined);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [articleId, article, autoSaveEnabled, dirty, draft, saveDraftNow]);

  useEffect(() => {
    if (!articleId || !article || view === "code") return;

    const timeoutId = window.setTimeout(() => {
      void refreshPreviewNow(draft).catch(() => undefined);
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [articleId, article, draft, refreshPreviewNow, view]);

  const handleFieldChange = (field: EditorField, value: string) => {
    setDraft((current) => {
      if (field === "mode") {
        const nextMode = value as ArticleMode;
        return {
          ...current,
          mode: nextMode,
          html: nextMode === "markdown" ? compileMarkdown(current.markdown) : current.html || compileMarkdown(current.markdown),
        };
      }

      if (field === "markdown") {
        return {
          ...current,
          markdown: value,
          html: compileMarkdown(value),
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handlePublish = async () => {
    if (!articleId || !article) return;

    setPublishing(true);
    try {
      await saveDraftNow(draft, false);

      const res = await api.post<ApiResponse<{ media_id: string }>>("/publish/draft", {
        article_id: articleId,
        author: draft.author,
        digest: draft.digest,
      });
      const data = unwrapResponse(res.data);
      toast.success(`已投递到微信草稿箱 · ${data.media_id}`);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  if (!articleId || articleId === "new") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          background: "var(--bg)",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div className="caps" style={{ color: "var(--fg-5)", marginBottom: 12 }}>
            EDITOR READY
          </div>
          <h2 className="title-serif" style={{ fontSize: 40, color: "var(--fg)", margin: "0 0 12px" }}>
            先从稿库打开一篇真实文章
          </h2>
          <p style={{ margin: "0 0 20px", color: "var(--fg-3)", lineHeight: 1.8 }}>
            {loadError || "编辑器已经接到真实后端链路，接下来只需要从稿库进入具体稿件。"}
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => go("list")}>
            返回稿库
          </button>
        </div>
      </div>
    );
  }

  if (loadingArticle) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          background: "var(--bg)",
          color: "var(--fg-4)",
          fontFamily: "var(--f-mono)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Loading article...
      </div>
    );
  }

  if (loadError || !article) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          background: "var(--bg)",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div className="caps" style={{ color: "var(--fg-5)", marginBottom: 12 }}>
            LOAD ERROR
          </div>
          <h2 className="title-serif" style={{ fontSize: 40, color: "var(--fg)", margin: "0 0 12px" }}>
            无法载入这篇文章
          </h2>
          <p style={{ margin: "0 0 20px", color: "var(--fg-3)", lineHeight: 1.8 }}>
            {loadError || "文章不存在，或者后端返回了错误。"}
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => go("list")}>
            返回稿库
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        height: "100%",
        minHeight: 0,
      }}
    >
      <StructurePanel
        articleId={articleId}
        draft={draft}
        selected={selected}
        setSelected={setSelected}
        onTitleChange={(title) => handleFieldChange("title", title)}
        onModeChange={(mode) => handleFieldChange("mode", mode)}
      />

      <CenterStage
        articleId={articleId}
        draft={draft}
        view={view}
        setView={setView}
        tab={tab}
        setTab={setTab}
        saveState={saveState}
        selected={selected}
        previewHtml={previewHtml}
        previewLoading={previewLoading}
        previewError={previewError}
        publishing={publishing}
        onFieldChange={handleFieldChange}
        onRefreshPreview={() => {
          void refreshPreviewNow(draft, false).catch(() => undefined);
        }}
        onPublish={handlePublish}
      />
    </div>
  );
}
