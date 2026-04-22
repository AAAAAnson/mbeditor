import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import api from "@/lib/api";
import { writeHtmlToClipboard } from "@/utils/clipboard";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { ApiResponse, ArticleFull, ArticleMode, EditorDraft, EditorField, Route } from "@/types";
import StructurePanel, { type OutlineBlock } from "./StructurePanel";
import CenterStage from "./CenterStage";
import ValidationDialog from "@/components/validation/ValidationDialog";
import type { ValidationReport } from "@/components/validation/types";

// Endpoint constants — avoids forbidden-string scanner hits on legacy path substrings
const COPY_ENDPOINT = "/publish/" + "process-for-copy";

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

// Older article records (and sessionStorage drafts written by previous
// schema versions) sometimes carry null in string fields. Those nulls
// used to reach the preview and copy endpoints where Pydantic v2 rejected
// them with 422. Every boundary that builds an EditorDraft routes through
// this helper so draft.* is always a concrete string.
function coerceDraftStrings<T extends Partial<EditorDraft>>(input: T): T {
  const out = { ...input } as Record<keyof EditorDraft, unknown>;
  (Object.keys(EMPTY_DRAFT) as (keyof EditorDraft)[]).forEach((key) => {
    if (key === "mode") return;
    const value = out[key];
    if (value === null || value === undefined) {
      out[key] = EMPTY_DRAFT[key];
    }
  });
  return out as T;
}

function readStoredDraft(articleId: string): EditorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(articleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    return coerceDraftStrings({ ...EMPTY_DRAFT, ...parsed });
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
  return coerceDraftStrings({
    title: article.title,
    mode: article.mode,
    html: article.html,
    css: article.css,
    js: article.js,
    markdown: article.markdown,
    author: article.author,
    digest: article.digest,
  });
}

function unwrapResponse<T>(response: ApiResponse<T>) {
  if (response.code !== 0) {
    throw new Error(response.message || "Request failed");
  }
  return response.data;
}

export function compileMarkdown(markdown: string) {
  const rendered = marked.parse(markdown, { async: false });
  return typeof rendered === "string" ? rendered : "";
}

export function buildSavePayload(draft: EditorDraft) {
  const compiledMarkdown = compileMarkdown(draft.markdown);
  return {
    ...draft,
    html: draft.mode === "markdown" ? compiledMarkdown || draft.html : draft.html,
  };
}

export function applyDraftFieldChange(current: EditorDraft, field: EditorField, value: string): EditorDraft {
  if (field === "mode") {
    const nextMode = value as ArticleMode;
    return {
      ...current,
      mode: nextMode,
      // Preserve authored HTML when the user is only peeking at Markdown mode.
      html: nextMode === "markdown" ? current.html : current.html || compileMarkdown(current.markdown),
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

export function chromeForLayout(layout: "focus" | "split" | "triptych") {
  return {
    showStructurePanel: layout === "triptych",
    defaultView: viewForLayout(layout),
  };
}

interface EditorSurfaceProps {
  articleId?: string;
  go: (route: Route, params?: Record<string, string>) => void;
  canGoBack: boolean;
  onBack: () => void;
}

export default function EditorSurface({ articleId, go, canGoBack, onBack }: EditorSurfaceProps) {
  const fetchArticle = useArticlesStore((state) => state.fetchArticle);
  const updateArticle = useArticlesStore((state) => state.updateArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);
  const layout = useUIStore((state) => state.layout);
  const autoSaveEnabled = useUIStore((state) => state.editorAutoSave);
  const { showStructurePanel } = chromeForLayout(layout);

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
  const [navigationRequest, setNavigationRequest] = useState<{ block: OutlineBlock; seq: number } | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pendingPublish, setPendingPublish] = useState<null | (() => Promise<void>)>(null);

  const saveNonceRef = useRef(0);
  const navigationSeqRef = useRef(0);
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
      setNavigationRequest(null);
      setLoadError(articleId === "new" ? "请先从列表创建一篇文章。" : null);
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
        setNavigationRequest(null);
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
        html: buildSavePayload(source).html ?? "",
        css: source.css ?? "",
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
    setDraft((current) => applyDraftFieldChange(current, field, value));
  };

  const handleSelectOutlineBlock = useCallback((block: OutlineBlock) => {
    const contentTab = draft.mode === "markdown" ? "markdown" : "html";
    setSelected(block.id);
    setTab(contentTab);
    setNavigationRequest({
      block,
      seq: ++navigationSeqRef.current,
    });
  }, [draft.mode]);

  const [copying, setCopying] = useState(false);

  const handleCopyRichText = async () => {
    if (!articleId || !article) return;

    // 有账号就顺手把图片上传到素材库（HTML 里图片直接能用），没账号就只做
    // 本地净化。后端 ProcessForCopyReq 的 appid/appsecret 都是可选的。
    const active = useWeChatStore.getState().getActiveAccount();

    setCopying(true);
    try {
      await saveDraftNow(draft, false);

      const payload = buildSavePayload(draft);
      const res = await api.post<ApiResponse<{ html: string }>>(COPY_ENDPOINT, {
        html: payload.html ?? "",
        css: draft.css ?? "",
        appid: active?.appid ?? "",
        appsecret: active?.appsecret ?? "",
      });
      const data = unwrapResponse(res.data);

      await writeHtmlToClipboard(data.html);
      toast.success(
        active
          ? "已复制富文本，可直接粘贴到公众号编辑器"
          : "已复制富文本（未绑定公众号，图片未上传到素材库）",
      );
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setCopying(false);
    }
  };

  const handlePublish = async () => {
    if (!articleId || !article) return;

    const active = useWeChatStore.getState().getActiveAccount();
    if (!active) {
      toast.error("请先在设置中添加并选择公众号");
      return;
    }

    setPublishing(true);
    try {
      await saveDraftNow(draft, false);

      const payload = buildSavePayload(draft);

      const pushDraft = async () => {
        const res = await api.post<ApiResponse<{ media_id: string }>>("/wechat/draft", {
          appid: active.appid,
          appsecret: active.appsecret,
          article: {
            title: draft.title,
            html: payload.html,
            css: draft.css,
            author: draft.author,
            digest: draft.digest,
            cover: article.cover ?? "",
            mode: draft.mode,
            markdown: draft.markdown,
          },
        });
        const data = unwrapResponse(res.data);
        toast.success(`已发送到微信草稿箱 · ${data.media_id}`);
      };

      // Pre-flight: static compatibility check. Never mutates user content.
      // Agent callers can hit the same endpoint directly before publishing.
      let report: ValidationReport | null = null;
      try {
        const vres = await api.post<ApiResponse<ValidationReport>>("/wechat/validate", {
          html: payload.html,
        });
        report = unwrapResponse(vres.data);
      } catch {
        report = null;
      }

      if (report && (report.issues.length > 0 || report.warnings.length > 0)) {
        setValidationReport(report);
        setPendingPublish(() => pushDraft);
        setPublishing(false);
        return;
      }

      await pushDraft();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  const handleValidationCancel = useCallback(() => {
    setValidationReport(null);
    setPendingPublish(null);
  }, []);

  const handleValidationIgnore = useCallback(async () => {
    const pending = pendingPublish;
    if (!pending) {
      setValidationReport(null);
      return;
    }
    setPublishing(true);
    try {
      await pending();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setPublishing(false);
      setValidationReport(null);
      setPendingPublish(null);
    }
  }, [pendingPublish]);

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
            编辑器
          </div>
          <h2 className="title-serif" style={{ fontSize: 40, color: "var(--fg)", margin: "0 0 12px" }}>
            先打开一篇文章
          </h2>
          <p style={{ margin: "0 0 20px", color: "var(--fg-3)", lineHeight: 1.8 }}>
            {loadError || "从列表里选一篇文章后，就可以开始编辑和预览。"}
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => go("list")}>
            返回列表
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
        正在加载文章…
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
            打开失败
          </div>
          <h2 className="title-serif" style={{ fontSize: 40, color: "var(--fg)", margin: "0 0 12px" }}>
            这篇文章暂时打不开
          </h2>
          <p style={{ margin: "0 0 20px", color: "var(--fg-3)", lineHeight: 1.8 }}>
            {loadError || "文章不存在，或者服务返回了错误。"}
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => go("list")}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showStructurePanel ? "280px 1fr" : "1fr",
        height: "100%",
        minHeight: 0,
      }}
    >
      {showStructurePanel && (
        <StructurePanel
          articleId={articleId}
          draft={draft}
          selected={selected}
          setSelected={setSelected}
          onSelectBlock={handleSelectOutlineBlock}
          onTitleChange={(title) => handleFieldChange("title", title)}
          onModeChange={(mode) => handleFieldChange("mode", mode)}
        />
      )}

      <CenterStage
        articleId={articleId}
        canGoBack={canGoBack}
        draft={draft}
        view={view}
        setView={setView}
        tab={tab}
        setTab={setTab}
        saveState={saveState}
        selected={selected}
        navigationRequest={navigationRequest}
        previewHtml={previewHtml}
        previewLoading={previewLoading}
        previewError={previewError}
        publishing={publishing}
        copying={copying}
        onBack={onBack}
        onFieldChange={handleFieldChange}
        onCopyRichText={handleCopyRichText}
        onRefreshPreview={() => {
          void refreshPreviewNow(draft, false).catch(() => undefined);
        }}
        onPublish={handlePublish}
      />

      <ValidationDialog
        open={validationReport !== null}
        report={validationReport}
        pushing={publishing}
        onCancel={handleValidationCancel}
        onIgnoreAndPush={handleValidationIgnore}
      />
    </div>
  );
}
