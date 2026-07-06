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

// 多个小顶层块,总和超过 400KB → 可拆分成多段(chunkCount > 1)
function splittableOversizeHtml(): string {
  return Array.from({ length: 1200 }, (_, i) => `<p>段落${i} ${"字".repeat(200)}</p>`).join("");
}

// 单个超大根块 → 无法拆分(chunkCount === 1)
function unsplittableOversizeHtml(): string {
  return `<section>${"内容".repeat(150000)}</section>`;
}

describe("CopyReadyDialog ChooseView 黑话改人话(review 补项3)", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { write: vi.fn().mockResolvedValue(undefined) } });
  });

  it("可拆分长文:不出现技术黑话,改人话", async () => {
    render(<CopyReadyDialog open html={splittableOversizeHtml()} onClose={vi.fn()} canSendToDraft={false} />);
    await screen.findByRole("button", { name: /分段复制（共/ });

    // 黑话清零
    expect(screen.queryByText(/清洗器/)).toBeNull();
    expect(screen.queryByText(/顶层块/)).toBeNull();
    expect(screen.queryByText(/draft.?add 接口|draft\/add/)).toBeNull();
    // 草稿箱按钮 title 不再暴露 appsecret 黑话
    const draftBtn = screen.getByRole("button", { name: /草稿箱/ });
    expect(draftBtn.getAttribute("title") ?? "").not.toContain("appsecret");
  });

  it("不可拆分长文:不出现「根块/兄弟节点」黑话,改人话", async () => {
    render(<CopyReadyDialog open html={unsplittableOversizeHtml()} onClose={vi.fn()} canSendToDraft={false} />);
    await screen.findByTestId("copy-ready-dialog");

    expect(screen.queryByText(/根块|兄弟节点|穿透外层包装/)).toBeNull();
    // 人话:这篇文章是一整块/没法自动分段
    expect(screen.getByText(/没法.*分段|是一整块|无法.*分段/)).toBeInTheDocument();
  });
});

describe("CopyReadyDialog 长文非安全上下文仍能分段复制", () => {
  beforeEach(() => {
    // 非安全上下文:navigator.clipboard 不可用,但分段复制每段也走 execCommand 兜底、
    // http 下可用,故照常给「分段复制」,不藏、不前置源码文本框。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  it("长文 http 下照常给「分段复制」(execCommand 兜底),不前置源码文本框", async () => {
    render(
      <CopyReadyDialog open html={splittableOversizeHtml()} onClose={vi.fn()} canSendToDraft onSendToDraft={vi.fn()} />,
    );
    expect(await screen.findByRole("button", { name: /分段复制（共/ })).toBeInTheDocument();
    // 草稿箱仍作为可选项保留
    expect(screen.getByRole("button", { name: /草稿箱/ })).toBeInTheDocument();
    // 复制能用,不前置源码文本框
    expect(screen.queryByTestId("copy-ready-fallback-textarea")).toBeNull();
  });
});
