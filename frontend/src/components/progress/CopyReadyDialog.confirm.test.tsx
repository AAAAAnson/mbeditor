import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyReadyDialog from "./CopyReadyDialog";

const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  // jsdom 无 ClipboardItem,writeHtmlToClipboard 落 execCommand 兜底;让它返回 true 模拟复制成功。
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (ORIGINAL_CLIPBOARD) {
    Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
  } else {
    // @ts-expect-error -- delete the stub we installed
    delete navigator.clipboard;
  }
});

describe("CopyReadyDialog 复制成功可停留确认", () => {
  it("复制成功后不自动关框(900ms 后 onClose 未调、对话框仍在)", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<CopyReadyDialog open html="<p>x</p>" accountName="张姐的小厨房" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));
    // flush 复制 microtask + 推进远超旧的 900ms 自动关定时器
    await vi.advanceTimersByTimeAsync(1000);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-ready-dialog")).toBeInTheDocument();
  });

  it("复制成功后出现下一步去后台粘贴引导 + 完成按钮,点完成才 onClose", async () => {
    const onClose = vi.fn();
    render(<CopyReadyDialog open html="<p>x</p>" accountName="张姐的小厨房" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    // 结构化「下一步去后台粘贴」引导(非仅一句「已复制」)
    expect(await screen.findByText(/粘贴/)).toBeInTheDocument();
    expect(screen.getByText(/后台/)).toBeInTheDocument();
    // 账号标注仍在
    expect(screen.getByText(/张姐的小厨房/)).toBeInTheDocument();

    // 复制按钮成功后让位给明确的「完成」按钮;点它才关
    const done = screen.getByRole("button", { name: /完成|知道了/ });
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalled();
  });

  it("无账号时复制成功仍给通用提示,不强标账号", async () => {
    render(<CopyReadyDialog open html="<p>x</p>" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /复制到剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByText(/已复制到剪贴板/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/当前公众号「/)).toBeNull();
  });

  it("traps focus and closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CopyReadyDialog open html="<p>x</p>" onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /复制到剪贴板/ })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
