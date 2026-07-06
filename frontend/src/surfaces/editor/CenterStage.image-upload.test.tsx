import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadWithActiveMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/image-hosts/dispatch", () => ({
  uploadWithActive: uploadWithActiveMock,
}));

beforeEach(() => {
  vi.resetModules();
  uploadWithActiveMock.mockReset();
  uploadWithActiveMock.mockResolvedValue({ url: "https://cdn/x.png" });
  window.localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // jsdom 无 execCommand;粘贴/工具栏插入走它,打桩为成功。
  (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => true);
});

afterEach(() => cleanup());

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

// 渲染真 CenterStage(动态 import 配合 resetModules,保证吃到本文件的 uploadWithActive mock;
// toastStore 也必须走动态 import 拿同一份新模块实例)。
async function renderStage() {
  const { default: CenterStage } = await import("./CenterStage");
  const { useUIStore } = await import("@/stores/uiStore");
  const { useToastStore } = await import("@/stores/toastStore");
  useUIStore.setState({ editorPreviewWidth: 420, editorPreviewHeight: 760, editorPreviewScale: 1 });
  useToastStore.setState({ toasts: [] });
  render(
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
    />,
  );
  return { useToastStore };
}

function imageFile(name = "shot.png") {
  return new File(["x"], name, { type: "image/png" });
}

function clipboardWith(files: File[], text = "") {
  return {
    files,
    items: [],
    types: files.length ? ["Files"] : ["text/plain"],
    getData: (type: string) => (type === "text/plain" ? text : ""),
  };
}

describe("onPaste 图片文件拦截(H8-1:阻断 blob: 默认插入)", () => {
  it("剪贴板含图片文件 → preventDefault + 走 dispatchEditorImageUpload 上传", async () => {
    await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    const file = imageFile();
    const notPrevented = fireEvent.paste(editable, { clipboardData: clipboardWith([file]) });
    expect(notPrevented).toBe(false); // preventDefault 已调,阻断浏览器默认插 blob:
    await waitFor(() => expect(uploadWithActiveMock).toHaveBeenCalledWith(file));
  });

  it("上传成功后以 execCommand insertHTML 插入 <img src=url>", async () => {
    await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    fireEvent.paste(editable, { clipboardData: clipboardWith([imageFile()]) });
    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith(
        "insertHTML",
        false,
        expect.stringContaining('src="https://cdn/x.png"'),
      );
    });
  });

  it("上传失败 → toast.error 透传错误信息(如图床未配置)", async () => {
    uploadWithActiveMock.mockRejectedValueOnce(new Error("图床未配置"));
    const { useToastStore } = await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    fireEvent.paste(editable, { clipboardData: clipboardWith([imageFile()]) });
    await waitFor(() => {
      const errors = useToastStore.getState().toasts.filter((t) => t.type === "error");
      expect(errors.some((t) => /图床未配置/.test(t.message))).toBe(true);
    });
  });

  it("纯文本粘贴不被误拦:不走上传,仍走既有 insertHTML 文本路径", async () => {
    await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    fireEvent.paste(editable, { clipboardData: clipboardWith([], "hello") });
    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith("insertHTML", false, "hello");
    });
    expect(uploadWithActiveMock).not.toHaveBeenCalled();
  });
});

describe("onDrop 图片(H8-2:落点 + 失败提示)", () => {
  it("jsdom 无 caretRangeFromPoint → 兜底 append 不炸,图片进预览区", async () => {
    await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    fireEvent.drop(editable, {
      dataTransfer: { files: [imageFile("drop.png")], types: ["Files"] },
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => {
      expect(editable.querySelector('img[src="https://cdn/x.png"]')).not.toBeNull();
    });
  });

  it("上传失败 → toast.error 明示(替换静默 console.error)", async () => {
    uploadWithActiveMock.mockRejectedValueOnce(new Error("图床未配置"));
    const { useToastStore } = await renderStage();
    const editable = screen.getByTestId("preview-editable-content");
    fireEvent.drop(editable, {
      dataTransfer: { files: [imageFile()], types: ["Files"] },
      clientX: 10,
      clientY: 10,
    });
    await waitFor(() => {
      const errors = useToastStore.getState().toasts.filter((t) => t.type === "error");
      expect(errors.some((t) => /图床未配置/.test(t.message))).toBe(true);
    });
  });
});

describe("dispatchEditorImageUpload", () => {
  it("delegates to uploadWithActive and returns the url", async () => {
    const { dispatchEditorImageUpload } = await import("./CenterStage");
    const file = new File(["x"], "x.png", { type: "image/png" });
    const url = await dispatchEditorImageUpload(file);
    expect(url).toBe("https://cdn/x.png");
    const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
    expect(uploadWithActive).toHaveBeenCalledWith(file);
  });

  it("bubbles engine error when not configured", async () => {
    const { dispatchEditorImageUpload } = await import("./CenterStage");
    const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
    (uploadWithActive as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("图床未配置"));
    const file = new File(["x"], "x.png", { type: "image/png" });
    await expect(dispatchEditorImageUpload(file)).rejects.toThrow("图床未配置");
  });
});
