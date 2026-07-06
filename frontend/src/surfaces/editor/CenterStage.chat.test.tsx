// CenterStage × AI 对话入口:docbar 按钮(simple/pro 都可见)、aria-pressed、
// 无 onToggleChat(旧调用方)不渲染 —— 既有测试零改的兼容防线。
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import CenterStage from "./CenterStage";
import { useUIStore } from "@/stores/uiStore";

const DRAFT = {
  title: "测试稿件",
  mode: "html" as const,
  html: "<p>Hello preview</p>",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "",
};

function renderStage(overrides: Partial<Parameters<typeof CenterStage>[0]> = {}) {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome={false}
      canGoBack
      draft={DRAFT}
      view="preview"
      setView={vi.fn()}
      tab="html"
      setTab={vi.fn()}
      saveState="saved"
      selected="body"
      navigationRequest={null}
      previewHtml="<p>Hello preview</p>"
      previewLoading={false}
      previewError={null}
      publishing={false}
      copying={false}
      previewMode="wechat"
      onPreviewModeChange={vi.fn()}
      onBackToList={vi.fn()}
      onFieldChange={vi.fn()}
      onRefreshPreview={vi.fn()}
      onCopyRichText={vi.fn()}
      onPublish={vi.fn()}
      {...overrides}
    />,
  );
}

describe("CenterStage — AI 对话入口", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("simple 模式(showProChrome=false)docbar 也有「AI 对话」按钮,点击触发 toggle", () => {
    const onToggleChat = vi.fn();
    renderStage({ onToggleChat, chatOpen: false });

    const btn = screen.getByRole("button", { name: /AI 对话/ });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it("chatOpen 时按钮呈按下态(aria-pressed=true)", () => {
    renderStage({ onToggleChat: vi.fn(), chatOpen: true });
    expect(screen.getByRole("button", { name: /AI 对话/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("未传 onToggleChat(旧调用方)不渲染按钮", () => {
    renderStage();
    expect(screen.queryByRole("button", { name: /AI 对话/ })).toBeNull();
  });

  it("pro 模式同样可见", () => {
    renderStage({ showProChrome: true, onToggleChat: vi.fn() });
    expect(screen.getByRole("button", { name: /AI 对话/ })).toBeInTheDocument();
  });
});
