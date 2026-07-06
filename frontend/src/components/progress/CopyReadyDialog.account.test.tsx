import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("CopyReadyDialog 复制成功标注当前公众号", () => {
  beforeEach(() => {
    // jsdom 无 ClipboardItem,writeHtmlToClipboard 会落到 execCommand 兜底。
    // 让 execCommand 返回 true 模拟复制成功。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
  });

  it("有当前公众号时,复制成功标注号名", async () => {
    render(
      <CopyReadyDialog open html="<p>正文</p>" accountName="张姐的小厨房" onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByText(/张姐的小厨房/)).toBeInTheDocument();
    });
  });

  it("无当前公众号时,复制成功不强标账号(只给通用提示)", async () => {
    render(<CopyReadyDialog open html="<p>正文</p>" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByText(/已复制到剪贴板/)).toBeInTheDocument();
    });
    // 没有「当前公众号「…」」的标注。
    expect(screen.queryByText(/当前公众号「/)).toBeNull();
  });
});

describe("CopyReadyDialog 后端不可用错误归因", () => {
  beforeEach(() => {
    // 非安全上下文 + execCommand 失败 → writeHtmlToClipboard 抛错,触发错误分支。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    // jsdom 不实现 execCommand;显式抛出一个可识别的错误。
    document.execCommand = vi.fn(() => {
      throw new Error("write blocked");
    }) as unknown as typeof document.execCommand;
  });

  it("backendDown 时把复制失败归因到后端连不上(而非原始错误)", async () => {
    render(<CopyReadyDialog open html="<p>正文</p>" backendDown onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByText(/后端服务连不上/)).toBeInTheDocument();
    });
    // 归因优先于原始错误信息。
    expect(screen.queryByText(/write blocked/)).toBeNull();
  });

  it("backend 正常时复制失败不归因到后端(沿用原始错误信息)", async () => {
    render(<CopyReadyDialog open html="<p>正文</p>" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByText(/write blocked/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/后端服务连不上/)).toBeNull();
  });
});
