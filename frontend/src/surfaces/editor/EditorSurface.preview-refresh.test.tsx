import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticlesStore } from "@/stores/articlesStore";
import { useUIStore } from "@/stores/uiStore";

const refreshSpy = vi.hoisted(() => vi.fn());
vi.mock("./services/editorApi", async () => {
  const actual = await vi.importActual<typeof import("./services/editorApi")>("./services/editorApi");
  return { ...actual, refreshPreview: refreshSpy };
});

// CenterStage 收窄成几颗「改字段」按钮,聚焦 EditorSurface 自动刷新预览的触发面。
vi.mock("./CenterStage", () => ({
  default: ({ onFieldChange }: { onFieldChange: (f: string, v: string) => void }) => (
    <div>
      <button data-testid="ch-js" onClick={() => onFieldChange("js", "newjs")}>js</button>
      <button data-testid="ch-html" onClick={() => onFieldChange("html", "<p>new</p>")}>html</button>
      <button data-testid="ch-css" onClick={() => onFieldChange("css", ".new{}")}>css</button>
    </div>
  ),
}));

vi.mock("@/features/editor/lint/LintSidebar", () => ({ default: () => null }));

import EditorSurface from "./EditorSurface";

async function seedArticle() {
  const a = await useArticlesStore.getState().createArticle("预览稿", "html");
  await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>", css: ".a{}" });
  return a.id;
}

beforeEach(() => {
  refreshSpy.mockReset();
  refreshSpy.mockResolvedValue("<p>preview</p>");
  localStorage.clear();
  sessionStorage.clear();
  useUIStore.setState({ uiMode: "simple" }); // simple → defaultView "preview", previewMode "wechat"
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
});

afterEach(() => cleanup());

describe("EditorSurface 预览自动刷新只随 html+css", () => {
  it("改 js 不触发 /publish/preview;改 html / css 触发", async () => {
    const id = await seedArticle();
    render(<EditorSurface articleId={id} go={vi.fn()} canGoBack />);

    // 初始加载触发一次刷新,清掉后再测字段改动。
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled());
    refreshSpy.mockClear();

    // 改 JS → 推进过 320ms debounce 后仍不触发后端往返。
    fireEvent.click(screen.getByTestId("ch-js"));
    await new Promise((r) => setTimeout(r, 420));
    expect(refreshSpy).not.toHaveBeenCalled();

    // 改 HTML → 触发刷新。
    fireEvent.click(screen.getByTestId("ch-html"));
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));

    // 改 CSS → 再触发一次(锁定 CSS 仍自动刷)。
    refreshSpy.mockClear();
    fireEvent.click(screen.getByTestId("ch-css"));
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
  });
});
