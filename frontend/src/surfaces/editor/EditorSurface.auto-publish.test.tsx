import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationReport } from "@/components/validation/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { useToastStore } from "@/stores/toastStore";

// 与 copy-gate 测试同款:只 mock processForCopy,其余 editorApi 走真实管线,
// 这样 intent=publish 的自动触发能端到端跑到 copy 管线。
const processForCopySpy = vi.hoisted(() => vi.fn());
vi.mock("./services/editorApi", async () => {
  const actual = await vi.importActual<typeof import("./services/editorApi")>("./services/editorApi");
  return { ...actual, processForCopy: processForCopySpy };
});

// CenterStage 收窄成一颗 copy 按钮,断言聚焦 EditorSurface 自身的 intent 自动触发。
vi.mock("./CenterStage", () => ({
  default: ({ onCopyRichText }: { onCopyRichText: () => void }) => (
    <button type="button" data-testid="copy-btn" onClick={onCopyRichText}>
      复制富文本
    </button>
  ),
}));

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

async function seedArticle() {
  const a = await useArticlesStore.getState().createArticle("庆祝稿件", "html");
  await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });
  return a.id;
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

describe("EditorSurface intent=publish 自动复制优先", () => {
  it("进编辑器即自动触发复制管线(无需点击),并弹出 CopyReadyDialog", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} intent="publish" go={vi.fn()} canGoBack />);

    await waitFor(() => expect(processForCopySpy).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByTestId("copy-ready-dialog")).toBeInTheDocument();
    });
  });

  it("无 intent 时不自动触发复制", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    await waitFor(() => expect(screen.getByTestId("copy-btn")).toBeInTheDocument());
    // 给 effect 一拍,确认确实没有被自动调用。
    await new Promise((r) => setTimeout(r, 60));
    expect(processForCopySpy).not.toHaveBeenCalled();
  });

  it("自动触发只发一次,re-render 不会重复触发", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const id = await seedArticle();
    const { rerender } = render(
      <EditorSurface articleId={id} intent="publish" go={vi.fn()} canGoBack />,
    );

    await waitFor(() => expect(processForCopySpy).toHaveBeenCalledTimes(1));
    rerender(<EditorSurface articleId={id} intent="publish" go={vi.fn()} canGoBack />);
    await new Promise((r) => setTimeout(r, 60));
    expect(processForCopySpy).toHaveBeenCalledTimes(1);
  });

  it("自动触发后清掉持久化 intent(再从列表进同一篇不会被误判重发)", async () => {
    processForCopySpy.mockResolvedValue({ html: "<section>x</section>", report: report() });

    const id = await seedArticle();
    // 模拟进入时 App 已把 intent 写进 sessionStorage(三兜底之一)。
    sessionStorage.setItem(`mbeditor.editor.intent.${id}`, "publish");

    render(<EditorSurface articleId={id} intent="publish" go={vi.fn()} canGoBack />);

    await waitFor(() => expect(processForCopySpy).toHaveBeenCalledTimes(1));
    // 消费后持久化 intent 必须被清掉,避免后续 fresh mount 误触发。
    await waitFor(() => {
      expect(sessionStorage.getItem(`mbeditor.editor.intent.${id}`)).toBeNull();
    });
  });
});
