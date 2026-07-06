import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyReadyDialog from "./CopyReadyDialog";

const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (ORIGINAL_CLIPBOARD) {
    Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
  } else {
    // @ts-expect-error -- delete the stub we installed
    delete navigator.clipboard;
  }
});

// 非安全上下文(局域网 http):navigator.clipboard.write 不可用,但富文本复制并未失效
// ——writeHtmlToClipboard 会 fall back 到 document.execCommand("copy"),后者在 http
// 下可用(已在生产 NAS 实例上实测 execCommand 返回 true、粘贴保留排版)。所以复制
// 按钮必须照常给出,不能因为缺新 API 就藏掉、把用户赶去草稿箱。
describe("CopyReadyDialog 非安全上下文(局域网 http)仍能复制", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("照常给出「复制到剪贴板」按钮(execCommand 兜底,http 可用)", () => {
    render(<CopyReadyDialog open html="<p>正文</p>" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /复制到剪贴板/ })).toBeInTheDocument();
  });

  it("不再提供「下载 HTML」死路", () => {
    render(<CopyReadyDialog open html="<p>正文</p>" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /下载/ })).toBeNull();
  });

  it("不前置摆「复制源码」文本框(复制能用,不需要;只在复制失败时才出)", () => {
    render(<CopyReadyDialog open html="<p>正文</p>" onClose={vi.fn()} />);
    expect(screen.queryByTestId("copy-ready-fallback-textarea")).toBeNull();
  });
});
