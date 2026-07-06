import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationReport } from "@/components/validation/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { useToastStore } from "@/stores/toastStore";

// processForCopy is the only editorApi surface this test drives; keep the rest
// (buildSavePayload, etc.) real so the copy handler runs end-to-end.
const processForCopySpy = vi.hoisted(() => vi.fn());
vi.mock("./services/editorApi", async () => {
  const actual = await vi.importActual<typeof import("./services/editorApi")>("./services/editorApi");
  return { ...actual, processForCopy: processForCopySpy };
});

// Stub CenterStage down to a single 复制 button wired to onCopyRichText so the
// test targets EditorSurface's own pipeline-report gate, not CenterStage's
// independent /wechat/validate pre-flight (Track-owned by another file).
vi.mock("./CenterStage", () => ({
  default: ({ onCopyRichText }: { onCopyRichText: () => void }) => (
    <button type="button" data-testid="copy-btn" onClick={onCopyRichText}>
      复制富文本
    </button>
  ),
}));

// Avoid the lint sidebar's own validator network chatter in this render.
vi.mock("@/features/editor/lint/LintSidebar", () => ({ default: () => null }));

import EditorSurface from "./EditorSurface";

function report(over: Partial<ValidationReport> = {}): ValidationReport {
  return {
    issues: [],
    warnings: [],
    stats: {
      svg_count: 0,
      animate_count: 0,
      animate_transform_count: 0,
      set_count: 0,
      anchor_count: 0,
    },
    ...over,
  };
}

const ISSUE = { line: 1, rule: "svg-animate", message: "违规", suggestion: "修复" };
const WARNING = { line: 2, rule: "css-var", message: "建议", suggestion: "确认" };

async function seedArticle() {
  const a = await useArticlesStore.getState().createArticle("门禁稿件", "html");
  await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });
  return a.id;
}

function toastsOfType(type: string) {
  return useToastStore.getState().toasts.filter((t) => t.type === type);
}

beforeEach(() => {
  processForCopySpy.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => cleanup());

describe("EditorSurface copy 路径硬门禁", () => {
  it("blocks the clipboard write and shows ValidationBlockDialog(action=copy) on issues", async () => {
    processForCopySpy.mockResolvedValue({
      html: "<section>x</section>",
      report: report({ issues: [ISSUE], warnings: [WARNING] }),
    });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-block-dialog")).toBeInTheDocument();
    });
    // Header copy is driven by action="copy".
    expect(screen.getByText(/复制富文本前被兼容性校验拦住了/)).toBeInTheDocument();
    // The CopyReadyDialog (the real clipboard hand-off) must NOT open.
    expect(screen.queryByTestId("copy-ready-dialog")).not.toBeInTheDocument();
  });

  it("does not block on warnings — toasts and proceeds to the copy-ready hand-off", async () => {
    processForCopySpy.mockResolvedValue({
      html: "<section>x</section>",
      report: report({ warnings: [WARNING, WARNING] }),
    });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(toastsOfType("info").some((t) => /2 条建议/.test(t.message))).toBe(true);
    });
    expect(screen.queryByTestId("validation-block-dialog")).not.toBeInTheDocument();
  });

  it("fails open with an explicit warning toast when the backend omits the report", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: null });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(toastsOfType("warning").some((t) => /校验服务不可用/.test(t.message))).toBe(true);
    });
    // Fail-open still hands off to copy — gate did not abort.
    expect(screen.queryByTestId("validation-block-dialog")).not.toBeInTheDocument();
  });

  it("short-circuits on empty body without calling the copy pipeline (review F9)", async () => {
    const a = await useArticlesStore.getState().createArticle("空稿件", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "   " });

    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(toastsOfType("info").some((t) => /正文为空/.test(t.message))).toBe(true);
    });
    // No network call, no block dialog, no copy-ready hand-off on empty input.
    expect(processForCopySpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("validation-block-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("copy-ready-dialog")).not.toBeInTheDocument();
  });

  it("clears the copying state after a block so no spinner is stuck (review F8)", async () => {
    processForCopySpy.mockResolvedValue({
      html: "<section>x</section>",
      report: report({ issues: [ISSUE] }),
    });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-block-dialog")).toBeInTheDocument();
    });
    // When the block dialog is up, the PublishProgress overlay must NOT also be
    // showing (its open condition excludes copyBlockReport !== null), i.e. the
    // copying spinner did not get stuck behind the block dialog.
    expect(screen.queryByTestId("publish-progress")).not.toBeInTheDocument();
  });

  it("html 含 SMIL 时复制前先弹 SMIL 预警,继续后才 copy-ready", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const a = await useArticlesStore.getState().createArticle("动画稿", "html");
    await useArticlesStore.getState().updateArticle(a.id, {
      html: '<svg><animate attributeName="opacity"/></svg>',
    });
    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    // SMIL 预警先弹,clipboard hand-off 未开。
    await waitFor(() => expect(screen.getByTestId("smil-warning-dialog")).toBeInTheDocument());
    expect(screen.queryByTestId("copy-ready-dialog")).not.toBeInTheDocument();

    // 继续后才进 copy-ready。
    fireEvent.click(screen.getByTestId("smil-warning-continue"));
    await waitFor(() => expect(screen.getByTestId("copy-ready-dialog")).toBeInTheDocument());
  });

  it("SMIL 与硬拦 issue 并存时优先硬拦(SMIL 不抢先)", async () => {
    processForCopySpy.mockResolvedValue({
      html: "<section>x</section>",
      report: report({ issues: [ISSUE] }),
    });

    const a = await useArticlesStore.getState().createArticle("动画+违规", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<svg><animate/></svg>" });
    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => expect(screen.getByTestId("validation-block-dialog")).toBeInTheDocument());
    expect(screen.queryByTestId("smil-warning-dialog")).not.toBeInTheDocument();
  });

  it("html 无 SMIL 时不弹预警,直接进 copy-ready(回归)", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const id = await seedArticle(); // html=<p>body</p> 无 SMIL
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => expect(screen.getByTestId("copy-ready-dialog")).toBeInTheDocument());
    expect(screen.queryByTestId("smil-warning-dialog")).not.toBeInTheDocument();
  });

  it("surfaces an error toast when the copy pipeline itself throws (backend unreachable)", async () => {
    processForCopySpy.mockRejectedValue(new Error("Network Error"));

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-btn"));

    await waitFor(() => {
      expect(toastsOfType("error").some((t) => /Network Error/.test(t.message))).toBe(true);
    });
    expect(screen.queryByTestId("validation-block-dialog")).not.toBeInTheDocument();
  });
});
