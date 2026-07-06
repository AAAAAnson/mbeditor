import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";
import { useToastStore } from "@/stores/toastStore";

const publishDraftSpy = vi.hoisted(() => vi.fn());
vi.mock("./services/editorApi", async () => {
  const actual = await vi.importActual<typeof import("./services/editorApi")>("./services/editorApi");
  return { ...actual, publishDraft: publishDraftSpy };
});

// 只覆盖 validateWechatHtml/reportIsBlocking,保留真实的 SMIL 检测纯函数。
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
    reportIsBlocking: () => false,
  };
});

// CenterStage 收窄成一颗「发草稿箱」按钮,聚焦 handlePublish 的成功提示文案。
vi.mock("./CenterStage", () => ({
  default: ({ onPublish }: { onPublish: () => void }) => (
    <button type="button" data-testid="publish-btn" onClick={onPublish}>
      发草稿箱
    </button>
  ),
}));

vi.mock("@/features/editor/lint/LintSidebar", () => ({ default: () => null }));

import EditorSurface from "./EditorSurface";

beforeEach(() => {
  publishDraftSpy.mockReset();
  publishDraftSpy.mockResolvedValue({ media_id: "MEDIA_SECRET_123" });
  localStorage.clear();
  sessionStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => cleanup());

describe("EditorSurface 草稿箱成功提示", () => {
  it("发草稿箱成功标号名 + 后台引导,不露 media_id 黑话", async () => {
    useWeChatStore.getState().addAccount({ name: "张姐的小厨房", appid: "wxX", appsecret: "s" });
    const a = await useArticlesStore.getState().createArticle("稿件", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });

    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);
    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => {
      const texts = useToastStore.getState().toasts.map((t) => t.message).join(" ");
      expect(texts).toMatch(/张姐的小厨房/);
      expect(texts).toMatch(/草稿箱/);
    });
    const texts = useToastStore.getState().toasts.map((t) => t.message).join(" ");
    expect(texts).not.toMatch(/MEDIA_SECRET_123/);
    expect(texts).not.toMatch(/media_id/);
  });

  it("image_failures 非空 → 明示 N 张图片未上传(裂图预警)并列出 src", async () => {
    publishDraftSpy.mockResolvedValue({
      media_id: "m-1",
      image_failures: [
        { src: "http://img.hotlink.example/a.png", reason: "图片源返回 HTTP 403(常见原因:图床防盗链)" },
      ],
    });
    useWeChatStore.getState().addAccount({ name: "号A", appid: "wxX", appsecret: "s" });
    const a = await useArticlesStore.getState().createArticle("裂图稿", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });

    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);
    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => {
      const texts = useToastStore.getState().toasts.map((t) => t.message).join(" ");
      expect(texts).toMatch(/1 张图片未能上传/);
      expect(texts).toMatch(/img\.hotlink\.example/);
      expect(texts).toMatch(/防盗链/);
    });
  });

  it("image_failures 为空 → 不弹裂图预警", async () => {
    publishDraftSpy.mockResolvedValue({ media_id: "m-2", image_failures: [] });
    useWeChatStore.getState().addAccount({ name: "号A", appid: "wxX", appsecret: "s" });
    const a = await useArticlesStore.getState().createArticle("正常稿", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });

    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);
    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => {
      const texts = useToastStore.getState().toasts.map((t) => t.message).join(" ");
      expect(texts).toMatch(/草稿箱/);
    });
    const texts = useToastStore.getState().toasts.map((t) => t.message).join(" ");
    expect(texts).not.toMatch(/未能上传/);
  });

  it("html 含 SMIL 时发草稿箱前先弹 SMIL 预警,继续后才 publishDraft", async () => {
    useWeChatStore.getState().addAccount({ name: "号A", appid: "wxX", appsecret: "s" });
    const a = await useArticlesStore.getState().createArticle("动画稿", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<svg><animate/></svg>" });

    render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);
    fireEvent.click(await screen.findByTestId("publish-btn"));

    await waitFor(() => expect(screen.getByTestId("smil-warning-dialog")).toBeInTheDocument());
    expect(publishDraftSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("smil-warning-continue"));
    await waitFor(() => expect(publishDraftSpy).toHaveBeenCalled());
  });
});
