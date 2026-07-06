import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { useToastStore } from "@/stores/toastStore";

// H8-3:发布/复制前 blob: 硬闸。blob: URL 页面刷新即失效,后端两条搬图路径
// (草稿上传只认 http/data:、复制内联只认可 fetch 的)都无能为力 → 发出去必裂,
// 检出即中止并 toast 指路(删除后用工具栏「图片」重新上传)。

const processForCopySpy = vi.hoisted(() => vi.fn());
const publishDraftSpy = vi.hoisted(() => vi.fn());
vi.mock("./services/editorApi", async () => {
  const actual = await vi.importActual<typeof import("./services/editorApi")>("./services/editorApi");
  return { ...actual, processForCopy: processForCopySpy, publishDraft: publishDraftSpy };
});

// 只桩掉网络校验;findBlobImages/detectSmilAnimations 等纯函数保持真实现。
vi.mock("@/lib/wechat-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wechat-validate")>("@/lib/wechat-validate");
  return {
    ...actual,
    validateWechatHtml: vi.fn(async () => ({
      ok: true,
      report: {
        issues: [],
        warnings: [],
        stats: { svg_count: 0, animate_count: 0, animate_transform_count: 0, set_count: 0, anchor_count: 0 },
      },
    })),
  };
});

// CenterStage 收窄成两颗按钮,聚焦 EditorSurface 自身的 blob 闸。
vi.mock("./CenterStage", () => ({
  default: ({ onCopyRichText, onPublish }: { onCopyRichText: () => void; onPublish: () => void }) => (
    <div>
      <button type="button" data-testid="copy-btn" onClick={onCopyRichText}>
        复制富文本
      </button>
      <button type="button" data-testid="publish-btn" onClick={onPublish}>
        发草稿箱
      </button>
    </div>
  ),
}));

vi.mock("@/features/editor/lint/LintSidebar", () => ({ default: () => null }));

import EditorSurface from "./EditorSurface";

const BLOB_HTML = '<p>正文</p><img src="blob:http://localhost/dead-beef">';

async function seedArticle(html: string) {
  const a = await useArticlesStore.getState().createArticle("blob 闸稿件", "html");
  await useArticlesStore.getState().updateArticle(a.id, { html });
  return a.id;
}

function errorToasts() {
  return useToastStore.getState().toasts.filter((t) => t.type === "error");
}

beforeEach(() => {
  processForCopySpy.mockReset();
  processForCopySpy.mockResolvedValue({
    html: "<section>x</section>",
    report: {
      issues: [],
      warnings: [],
      stats: { svg_count: 0, animate_count: 0, animate_transform_count: 0, set_count: 0, anchor_count: 0 },
    },
  });
  publishDraftSpy.mockReset();
  publishDraftSpy.mockResolvedValue({ media_id: "m-1" });
  localStorage.clear();
  sessionStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => cleanup());

describe("EditorSurface blob: 图片硬闸(H8-3)", () => {
  it("复制:html 含 blob: img → 中止,不进复制管线,toast.error 指路", async () => {
    const id = await seedArticle(BLOB_HTML);
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    fireEvent.click(await screen.findByTestId("copy-btn"));

    await waitFor(() => {
      expect(errorToasts().some((t) => /浏览器临时图片/.test(t.message))).toBe(true);
    });
    expect(processForCopySpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("copy-ready-dialog")).not.toBeInTheDocument();
    // busy 态已复位,复制没有卡死在 spinner。
    expect(screen.queryByTestId("publish-progress")).not.toBeInTheDocument();
  });

  it("复制:无 blob → 正常进复制管线(回归)", async () => {
    const id = await seedArticle("<p>干净正文</p>");
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    fireEvent.click(await screen.findByTestId("copy-btn"));

    await waitFor(() => expect(processForCopySpy).toHaveBeenCalled());
    expect(errorToasts()).toHaveLength(0);
  });

  it("发草稿箱:html 含 blob: img → 中止,不调 publishDraft,toast.error 指路", async () => {
    useWeChatStore.getState().addAccount({ name: "号A", appid: "wxX", appsecret: "s" });
    const id = await seedArticle(BLOB_HTML);
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => {
      expect(errorToasts().some((t) => /浏览器临时图片/.test(t.message))).toBe(true);
    });
    expect(publishDraftSpy).not.toHaveBeenCalled();
    // publishing 态已复位,按钮不卡死。
    expect(screen.queryByTestId("publish-progress")).not.toBeInTheDocument();
  });

  it("发草稿箱:无 blob → 正常调 publishDraft(回归)", async () => {
    useWeChatStore.getState().addAccount({ name: "号A", appid: "wxX", appsecret: "s" });
    const id = await seedArticle("<p>干净正文</p>");
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => expect(publishDraftSpy).toHaveBeenCalled());
    expect(errorToasts()).toHaveLength(0);
  });
});
