import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
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

function renderStage(showProChrome: boolean, overrides: Partial<ComponentProps<typeof CenterStage>> = {}) {
  return render(
    <CenterStage
      articleId="draft-1"
      showProChrome={showProChrome}
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

describe("CenterStage 发布区:复制优先 + 草稿箱降级", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("主发布按钮是「复制到公众号」(simple)", () => {
    renderStage(false);
    expect(screen.getByRole("button", { name: /复制到公众号/ })).toBeInTheDocument();
  });

  it("主发布按钮是「复制到公众号」(pro)", () => {
    renderStage(true);
    expect(screen.getByRole("button", { name: /复制到公众号/ })).toBeInTheDocument();
  });

  it("「发到草稿箱」不在主区,展开「更多方式」后才出现", () => {
    renderStage(false);
    // Collapsed by default.
    expect(screen.queryByRole("button", { name: /发到草稿箱/ })).toBeNull();
    // Expand the "更多方式" disclosure.
    fireEvent.click(screen.getByRole("button", { name: /更多方式/ }));
    expect(screen.getByRole("menuitem", { name: /发到草稿箱/ })).toBeInTheDocument();
  });

  it("More menu calls draft publish, then closes", () => {
    const onPublish = vi.fn();
    renderStage(false, { onPublish });

    fireEvent.click(screen.getByRole("button", { name: /更多方式/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /发到草稿箱/ }));

    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("More menu closes on outside pointer and Escape", () => {
    renderStage(false);

    fireEvent.click(screen.getByRole("button", { name: /更多方式/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /更多方式/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("More menu controls expose 44px touch targets", () => {
    renderStage(false);
    const more = screen.getByRole("button", { name: /更多方式/ });
    expect(more).toHaveStyle({ minHeight: "44px" });

    fireEvent.click(more);
    expect(screen.getByRole("menuitem", { name: /发到草稿箱/ })).toHaveStyle({
      minHeight: "44px",
    });
  });
});
