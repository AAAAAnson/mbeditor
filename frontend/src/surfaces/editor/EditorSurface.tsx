import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArticleMode, EditorDraft, EditorField, Route } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { useHealthStore } from "@/stores/healthStore";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useWeChatPushable } from "@/hooks/useWeChatPushable";
import { validateWechatHtml, reportIsBlocking, detectSmilAnimations, findBlobImages } from "@/lib/wechat-validate";
import SmilWarningDialog from "@/components/validation/SmilWarningDialog";
import { previewInputKey } from "./hooks/previewInputKey";
import { clearPersistedEditorIntent } from "@/lib/route";
import type { ValidationReport } from "@/components/validation/types";
import { compileMarkdown } from "./utils/markdown";
import { buildSavePayload, refreshPreview, processForCopy, publishDraft } from "./services/editorApi";
import { clearStoredDraft } from "./services/draftStorage";
import { useEditorDraft } from "./hooks/useEditorDraft";
import { useAgentChat } from "./chat/useAgentChat";
import ChatPanel from "./chat/ChatPanel";
import StructurePanel, { buildOutlineFromDraft, type OutlineBlock } from "./StructurePanel";
import { insertEffectIntoHtml } from "@/features/editor/effect-registry/insert";
import CenterStage from "./CenterStage";
import ValidationDialog from "@/components/validation/ValidationDialog";
import ValidationBlockDialog from "@/components/validation/ValidationBlockDialog";
import LintSidebar from "@/features/editor/lint/LintSidebar";
import PublishProgress from "@/components/progress/PublishProgress";
import CopyReadyDialog from "@/components/progress/CopyReadyDialog";

export function applyDraftFieldChange(current: EditorDraft, field: EditorField, value: string): EditorDraft {
  if (field === "mode") {
    const nextMode = value as ArticleMode;
    return {
      ...current,
      mode: nextMode,
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

function viewForLayout(layout: "focus" | "split" | "triptych") {
  return layout === "focus" ? "code" : "split";
}

export function chromeForLayout(layout: "focus" | "split" | "triptych") {
  return {
    showStructurePanel: layout === "triptych",
    defaultView: viewForLayout(layout),
  };
}

// uiMode-aware chrome resolver. 'simple' 强制全屏可编辑预览(无三栏、无 IDE
// 状态栏、主视图直接 preview);'pro' 走用户存的 layout 偏好并放出 pro 双轨
// (三 tab / IDE 状态栏 / 复制富文本)。门控是「收起不删除」:showProChrome
// 为 false 时只是不渲染 pro 件,store 里的 layout 偏好原样保留。
export function chromeForUi(uiMode: "simple" | "pro", layout: "focus" | "split" | "triptych") {
  if (uiMode === "simple") {
    return {
      showStructurePanel: false,
      defaultView: "preview" as const,
      showProChrome: false,
    };
  }
  const base = chromeForLayout(layout);
  return {
    showStructurePanel: base.showStructurePanel,
    defaultView: base.defaultView,
    showProChrome: true,
  };
}

// 窄屏(<600px)强制 focus:收三栏、收 pro chrome(等价简单模式门控,
// CenterStage 据 showProChrome=false 自动关 CodeDrawer / 强制可编辑预览)。
// defaultView 不动。运行时派生,不写 store。
export function applyMobileChrome<T extends { showProChrome: boolean; showStructurePanel: boolean }>(
  chrome: T,
  isMobile: boolean,
): T {
  if (!isMobile) return chrome;
  return { ...chrome, showProChrome: false, showStructurePanel: false };
}

/**
 * Decide what the 复制富文本 flow should do with the report the copy pipeline
 * (``/publish/process-for-copy``) returned alongside the processed HTML.
 *
 * - ``block``  — report has blocking issues; surface ValidationBlockDialog and
 *                abort the clipboard write (mirrors the draft path gate).
 * - ``warn``   — no blocking issues but warnings exist; proceed to copy, but
 *                toast the warning count.
 * - ``proceed``— clean report; copy with no extra messaging.
 * - ``skip``   — report is ``null`` (backend omitted it / malformed). Fail
 *                open and copy, but the caller MUST toast that validation was
 *                skipped — never silent.
 *
 * Pure + exported so the three gate outcomes are unit-testable without
 * standing up the whole surface.
 */
export type CopyGateOutcome =
  | { kind: "block"; report: ValidationReport }
  | { kind: "warn"; warnings: number }
  | { kind: "proceed" }
  | { kind: "skip" };

export function decideCopyGate(report: ValidationReport | null): CopyGateOutcome {
  if (!report) return { kind: "skip" };
  if (reportIsBlocking(report)) return { kind: "block", report };
  if (report.warnings.length > 0) return { kind: "warn", warnings: report.warnings.length };
  return { kind: "proceed" };
}

/**
 * 编辑器根网格列模板。桌面开 AI 对话时左侧加 336px 竖栏(不挤压预览主区,
 * 预览列仍是 1fr);移动恒单列 —— ChatPanel 自己转 fixed 底抽屉,不占列。
 * 纯函数导出,接线布局可单测。
 */
export function editorGridTemplate(opts: {
  isMobile: boolean;
  showStructurePanel: boolean;
  chatOpen: boolean;
}): string {
  const base = opts.isMobile ? "1fr" : opts.showStructurePanel ? "280px 1fr auto" : "1fr auto";
  return !opts.isMobile && opts.chatOpen ? `336px ${base}` : base;
}

function extractErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败";
}

interface EditorSurfaceProps {
  articleId?: string;
  go: (route: Route, params?: Record<string, string>) => void;
  // canGoBack 仍透传给 CenterStage(保留 pro 接口),但「返回」已统一回起稿台,
  // 不再依据 canGoBack 走 history.back —— 见 onBackToList。
  canGoBack: boolean;
  // 从 compose 成功庆祝层带过来的意图,一进编辑器自动跑(整个挂载只触发一次):
  //  - intent==="publish":跑「复制优先」主推流(handleCopyRichText → CopyReadyDialog),
  //    适合还没绑公众号的小白(复制粘贴零门槛);
  //  - intent==="draft":跑真·草稿箱(handlePublish → publishDraft),compose 仅在
  //    已绑号(活跃号本会话有 appsecret)时才会发这个意图,不会撞「未绑号」死路。
  intent?: string;
}

export default function EditorSurface({ articleId, go, canGoBack, intent }: EditorSurfaceProps) {
  const updateArticle = useArticlesStore((state) => state.updateArticle);
  const layout = useUIStore((state) => state.layout);
  const uiMode = useUIStore((state) => state.uiMode);
  const autoSaveEnabled = useUIStore((state) => state.editorAutoSave);
  const isMobile = useIsMobile();
  // 窄屏强制 focus:收三栏 + 收 pro chrome(CenterStage 据此自动关 drawer)。
  const { showStructurePanel, defaultView, showProChrome } = applyMobileChrome(
    chromeForUi(uiMode, layout),
    isMobile,
  );

  // Reactively track whether the user has a usable bound account so the
  // CopyReadyDialog's "改用草稿箱" button can enable/disable correctly.
  // H5:判据放宽为「内存密钥 OR 服务器已存密钥」——持久化剥离 appsecret 后,
  // 回访用户靠服务器 configured 列表照样能走草稿箱(后端空 secret fallback)。
  const { canPush: hasUsableWeChatAccount } = useWeChatPushable();

  // 当前公众号名 → CopyReadyDialog 复制成功后标注「贴到哪个号」。无活跃账号时
  // 为 undefined,对话框就不标注账号、只提示图片未上传。
  const activeWeChatName = useWeChatStore((state) => {
    const acct = state.accounts.find((a) => a.id === state.activeAccountId);
    return acct?.name || undefined;
  });

  // 后端健康灯 → 复制失败时归因(后端连不上 vs 用户操作),避免误导。
  const backendDown = useHealthStore((state) => state.status === "down");

  const {
    article,
    setArticle,
    draft,
    loading: loadingArticle,
    error: loadError,
    dirty,
    handleFieldChange,
  } = useEditorDraft(articleId);

  const [selected, setSelected] = useState("body");
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState(defaultView);
  const [tab, setTab] = useState("html");
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"wechat" | "raw">("wechat");
  const [publishing, setPublishing] = useState(false);
  const [navigationRequest, setNavigationRequest] = useState<{ block: OutlineBlock; seq: number } | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pendingPublish, setPendingPublish] = useState<null | (() => Promise<void>)>(null);
  const [draftBlockReport, setDraftBlockReport] = useState<ValidationReport | null>(null);
  const [copyBlockReport, setCopyBlockReport] = useState<ValidationReport | null>(null);
  // SVG/SMIL 发布前预警(信息级、可继续):检测到 SMIL 时延迟真实动作,弹 SmilWarningDialog,
  // 用户确认后再执行。复制主推流 + 草稿箱 + intent 自动流均经此(放在 handler 内而非按钮)。
  const [pendingSmilAction, setPendingSmilAction] = useState<null | (() => void)>(null);
  const [smilCount, setSmilCount] = useState(0);
  const [copying, setCopying] = useState(false);
  const [copyReadyHtml, setCopyReadyHtml] = useState<string | null>(null);

  const draftDebugAllowForce = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("mbeditor.debug.forceDraft") === "1";
    } catch {
      return false;
    }
  }, []);

  const saveNonceRef = useRef(0);
  const navigationSeqRef = useRef(0);

  // ── Agent 对话式编辑接线(批6)──
  // getHtml/onHtmlChange 必须稳定(useAgentChat 的 send 闭包依赖),经 ref
  // 间接读最新 draft / handleFieldChange:onHtmlChange 走既有 onFieldChange('html')
  // 路径,复用 700ms autosave 与预览自动刷新,不另起持久化。
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const handleFieldChangeRef = useRef(handleFieldChange);
  handleFieldChangeRef.current = handleFieldChange;
  const chatGetHtml = useCallback(() => draftRef.current.html, []);
  const chatOnHtmlChange = useCallback((html: string) => {
    handleFieldChangeRef.current("html", html);
  }, []);
  const chat = useAgentChat({
    articleId: articleId && articleId !== "new" ? articleId : "",
    getHtml: chatGetHtml,
    onHtmlChange: chatOnHtmlChange,
  });

  // P2 三入口收编:AI 改稿(换调子/缩长度)与选中即改点一下 = 把一句预设指令注入
  // 统一 Agent 对话并展开面板,后续流式改稿/后悔全走 useAgentChat + 检查点。
  // chat.send 是 useAgentChat 内稳定的 useCallback,引用不随渲染变。
  const runAgentInstruction = useCallback(
    (text: string) => {
      setChatOpen(true);
      chat.send(text);
    },
    [chat.send],
  );

  // Reset UI state when articleId changes
  useEffect(() => {
    setSelected("body");
    setNavigationRequest(null);
    setPreviewHtml("");
    setPreviewError(null);
    setSaveState("idle");
    // Raw 交互预览 is per-article scratch state. Reset to the default 公众号效果
    // mode on navigation so article B never inherits article A's raw mode —
    // otherwise the wechat auto-refresh (guarded on previewMode==="wechat")
    // would never fire and B's preview would stay blank until manually toggled.
    setPreviewMode("wechat");
  }, [articleId]);

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  useEffect(() => {
    if (draft.mode === "markdown" && tab === "html") {
      setTab("markdown");
    } else if (draft.mode === "html" && tab === "markdown") {
      setTab("html");
    }
  }, [draft.mode, tab]);

  // Set save state based on dirty flag
  useEffect(() => {
    if (!article) return;
    if (dirty) {
      setSaveState("dirty");
    } else {
      setSaveState((prev) => (prev === "dirty" ? "saved" : prev));
    }
  }, [dirty, article]);

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
  }, [article, articleId, updateArticle, setArticle]);

  const refreshPreviewNow = useCallback(async (source: EditorDraft, quiet = true) => {
    if (!articleId || !article) return;

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const html = await refreshPreview(
        buildSavePayload(source).html ?? "",
        source.css ?? "",
      );
      startTransition(() => setPreviewHtml(html));
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

  // Auto-save
  useEffect(() => {
    if (!articleId || !article || !dirty) return;

    setSaveState("dirty");
    if (!autoSaveEnabled) return;
    const timeoutId = window.setTimeout(() => {
      void saveDraftNow(draft).catch(() => undefined);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [articleId, article, autoSaveEnabled, dirty, draft, saveDraftNow]);

  // 预览只受 html+css 影响(后端 /publish/preview 只吃这两段)。盯字段指纹而非整个
  // draft,改 js / title / author / digest 不再触发多余的后端往返。
  const previewKey = useMemo(() => previewInputKey(draft), [draft]);

  // Auto-refresh preview — only the 公众号效果 (wechat) mode round-trips through
  // POST /publish/preview. The raw 交互预览 mode renders draft.html/css directly
  // in an iframe and never hits the backend, so skip the refresh there.
  useEffect(() => {
    if (!articleId || !article || view === "code" || previewMode !== "wechat") return;

    const timeoutId = window.setTimeout(() => {
      void refreshPreviewNow(draft).catch(() => undefined);
    }, 320);

    return () => window.clearTimeout(timeoutId);
    // 依赖 previewKey(html+css 指纹)而非 draft:draft 仅在 refreshPreviewNow 内被读,
    // 且只取 html+css(已含于 previewKey),改 js 不应重跑本 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, article, previewKey, refreshPreviewNow, view, previewMode]);

  const handleSelectOutlineBlock = useCallback((block: OutlineBlock) => {
    const contentTab = draft.mode === "markdown" ? "markdown" : "html";
    setSelected(block.id);
    setTab(contentTab);
    setNavigationRequest({
      block,
      seq: ++navigationSeqRef.current,
    });
  }, [draft.mode]);

  const handleCopyRichText = useCallback(async () => {
    if (!articleId || !article) return;

    const active = useWeChatStore.getState().getActiveAccount();

    setCopying(true);
    try {
      await saveDraftNow(draft, false);

      const payload = buildSavePayload(draft);
      // Empty body: nothing to copy and nothing for the validator to flag.
      // Short-circuit BEFORE the network call so an unexpected backend issue
      // on empty HTML can't produce a false-positive copy block (review F9).
      if (!(payload.html ?? "").trim()) {
        toast.info("正文为空，没有可复制的内容");
        return;
      }

      // H8-3 blob: 硬闸——blob: URL 只在当前浏览器会话有效,复制进公众号后必裂,
      // 且刷新即失效没有自动补救路径。检出即中止(finally 复位 copying,不卡按钮)。
      const blobImages = findBlobImages(payload.html ?? "");
      if (blobImages.length > 0) {
        toast.error(
          `检测到 ${blobImages.length} 张浏览器临时图片，微信端无法显示：请删除后用工具栏「图片」按钮重新上传`,
        );
        return;
      }

      const { html, report } = await processForCopy(
        payload.html ?? "",
        draft.css ?? "",
        active?.appid,
        active?.appsecret,
      );

      // Hard gate — mirror the draft path (:301). When the copy pipeline
      // returns a report with blocking issues, stop the clipboard write and
      // surface the same ValidationBlockDialog (action="copy"). Warnings pass
      // through with a toast; a missing report fails open but is never silent.
      const gate = decideCopyGate(report);
      if (gate.kind === "block") {
        setCopyBlockReport(gate.report);
        return;
      }
      if (gate.kind === "warn") {
        toast.info(`有 ${gate.warnings} 条建议但未阻断`);
      } else if (gate.kind === "skip") {
        toast.warning("校验服务不可用，已跳过兼容性检查");
      }

      const openCopyReady = () => {
        setCopyReadyHtml(html);
        if (!active) {
          toast.info("未绑定公众号：图片未上传到素材库");
        }
      };

      // SVG/SMIL 落差预警:源 html 含 SMIL 动画 → 复制到公众号前先告知会变静态(可继续)。
      const smil = detectSmilAnimations(payload.html ?? "");
      if (smil.total > 0) {
        setSmilCount(smil.total);
        setPendingSmilAction(() => openCopyReady);
        return;
      }
      openCopyReady();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setCopying(false);
    }
  }, [articleId, article, draft, saveDraftNow]);

  const handlePublish = useCallback(async () => {
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

      // H8-3 blob: 硬闸(与复制路径同款)——后端草稿搬图只认 http/data:,
      // blob: 图必裂。检出即中止(finally 复位 publishing,不卡按钮)。
      const blobImages = findBlobImages(payload.html ?? "");
      if (blobImages.length > 0) {
        toast.error(
          `检测到 ${blobImages.length} 张浏览器临时图片，微信端无法显示：请删除后用工具栏「图片」按钮重新上传`,
        );
        return;
      }

      const pushDraft = async () => {
        const result = await publishDraft({
          appid: active.appid,
          appsecret: active.appsecret,
          article: {
            ...draft,
            html: payload.html ?? "",
            cover: article.cover ?? "",
          },
        });
        // 去掉 media_id 黑话:标号名 + 去后台草稿箱查看的人话引导。
        toast.success(`已发到「${active.name || "公众号"}」草稿箱，去公众号后台 → 草稿箱即可查看`);
        // H7:图片搬运失败不再静默——草稿成功但微信端会裂图,必须明示。
        const failures = result.image_failures ?? [];
        if (failures.length > 0) {
          const heads = failures
            .slice(0, 3)
            .map((f) => (f.src.startsWith("data:") ? "（内嵌图片）" : f.src))
            .join("、");
          const reason = failures[0]?.reason ? `：${failures[0].reason}` : "（常见原因：图床防盗链）";
          toast.warning(
            `${failures.length} 张图片未能上传到微信，发布后可能显示裂图${reason}。涉及：${heads}`,
          );
        }
      };

      const vres = await validateWechatHtml(payload.html ?? "");
      if (!vres.ok) {
        console.warn("wechat validator unavailable, skipping pre-flight:", vres.error);
        toast.info("校验服务不可用，已跳过");
        await pushDraft();
        return;
      }

      if (reportIsBlocking(vres.report)) {
        setDraftBlockReport(vres.report);
        setPendingPublish(() => pushDraft);
        setPublishing(false);
        return;
      }

      if (vres.report.warnings.length > 0) {
        toast.info(`有 ${vres.report.warnings.length} 条建议但未阻断`);
      }

      // SVG/SMIL 落差预警:发草稿箱前先告知 SMIL 动画会被微信清成静态(可继续)。
      const smil = detectSmilAnimations(payload.html ?? "");
      if (smil.total > 0) {
        setSmilCount(smil.total);
        setPendingSmilAction(() => () => {
          void pushDraft();
        });
        setPublishing(false);
        return;
      }

      await pushDraft();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  }, [articleId, article, draft, saveDraftNow, draftDebugAllowForce]);

  // intent=publish 自动触发(一次性)。等文章载入后再跑,且整个挂载周期只发
  // 一次——ref 守卫避免 draft/article 引用变化导致的 effect 重跑反复弹复制框。
  // 触发后立刻清掉持久化的 intent(sessionStorage),这样以后从列表再点进同一篇
  // (无 intent param)不会因残留 intent 被误判成「又要自动复制」。
  const autoPublishedRef = useRef(false);
  useEffect(() => {
    if (intent !== "publish" && intent !== "draft") return;
    if (autoPublishedRef.current) return;
    if (!articleId || !article) return;
    autoPublishedRef.current = true;
    clearPersistedEditorIntent(articleId);
    void (intent === "draft" ? handlePublish() : handleCopyRichText());
  }, [intent, articleId, article, handleCopyRichText, handlePublish]);

  const handleRefreshPreview = useCallback(() => {
    void refreshPreviewNow(draft, false).catch(() => undefined);
  }, [draft, refreshPreviewNow]);

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

  // 窄屏强制单列(无三栏、无 lint 侧栏的 auto 列);桌面开 AI 对话加左栏。
  const gridTemplate = editorGridTemplate({ isMobile, showStructurePanel, chatOpen });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        height: "100%",
        minHeight: 0,
      }}
    >
      {chatOpen && (
        <ChatPanel
          articleId={articleId}
          isMobile={isMobile}
          hasContent={Boolean(draft.html.trim() || draft.markdown.trim())}
          chat={chat}
          getHtml={chatGetHtml}
          onHtmlChange={chatOnHtmlChange}
          onClose={() => setChatOpen(false)}
        />
      )}

      {showStructurePanel && (
        <StructurePanel
          articleId={articleId}
          draft={draft}
          selected={selected}
          setSelected={setSelected}
          onSelectBlock={handleSelectOutlineBlock}
          onTitleChange={(title) => handleFieldChange("title", title)}
          onModeChange={(mode) => handleFieldChange("mode", mode)}
          onInsertHtml={(html) => handleFieldChange("html", html)}
          onInsertEffectHtml={(html) => {
            // md 模式下 outline 偏移是 markdown 偏移，但 handleFieldChange("html",...)
            // 改的是 html 字段 —— 为避免插错位置，md 模式走 outline 空（末尾追加）。
            const outline = draft.mode === "markdown" ? [] : buildOutlineFromDraft(draft);
            const newHtml = insertEffectIntoHtml(draft.html, outline, selected, html);
            handleFieldChange("html", newHtml);
          }}
        />
      )}

      <CenterStage
        articleId={articleId}
        showProChrome={showProChrome}
        isMobile={isMobile}
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
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        onBackToList={() => go("list")}
        onFieldChange={handleFieldChange}
        onCopyRichText={handleCopyRichText}
        onRefreshPreview={handleRefreshPreview}
        onPublish={handlePublish}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
        chatStreaming={chat.status === "streaming"}
        onChatReset={chat.reset}
        onAgentInstruct={runAgentInstruction}
      />

      {!isMobile && <LintSidebar html={draft.html} enabled={Boolean(articleId && article)} />}

      <ValidationDialog
        open={validationReport !== null}
        report={validationReport}
        pushing={publishing}
        onCancel={handleValidationCancel}
        onIgnoreAndPush={handleValidationIgnore}
      />

      <ValidationBlockDialog
        open={draftBlockReport !== null}
        report={draftBlockReport}
        action="draft"
        onClose={() => {
          setDraftBlockReport(null);
          setPendingPublish(null);
        }}
        onForceContinue={
          draftDebugAllowForce && pendingPublish
            ? () => {
                const pending = pendingPublish;
                setDraftBlockReport(null);
                setPendingPublish(null);
                if (!pending) return;
                setPublishing(true);
                void pending()
                  .catch((error) => toast.error(extractErrorMessage(error)))
                  .finally(() => setPublishing(false));
              }
            : undefined
        }
        allowForce={draftDebugAllowForce}
      />

      <ValidationBlockDialog
        open={copyBlockReport !== null}
        report={copyBlockReport}
        action="copy"
        onClose={() => setCopyBlockReport(null)}
      />

      <SmilWarningDialog
        open={pendingSmilAction !== null}
        count={smilCount}
        onContinue={() => {
          const action = pendingSmilAction;
          setPendingSmilAction(null);
          action?.();
        }}
        onCancel={() => setPendingSmilAction(null)}
      />

      <PublishProgress
        open={
          (publishing || copying) &&
          validationReport === null &&
          draftBlockReport === null &&
          copyBlockReport === null
        }
        mode={publishing ? "draft" : "copy"}
      />

      <CopyReadyDialog
        open={copyReadyHtml !== null}
        html={copyReadyHtml}
        accountName={activeWeChatName}
        backendDown={backendDown}
        onClose={() => setCopyReadyHtml(null)}
        canSendToDraft={hasUsableWeChatAccount}
        onSendToDraft={() => {
          setCopyReadyHtml(null);
          void handlePublish();
        }}
      />
    </div>
  );
}
