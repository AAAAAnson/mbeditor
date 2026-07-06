import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { agentStream, AgentStreamHandlers } from "@/lib/agentStream";
import type { AgentEvent } from "@/types/agent";
import { useToastStore } from "@/stores/toastStore";

import ArticleRewriteMenu, { htmlToPlainText } from "./ArticleRewriteMenu";

const DRAFT = {
  title: "旧标题",
  mode: "html" as const,
  html: "<p>第一段。</p><p>第二段。</p>",
  css: "",
  js: "",
  markdown: "",
  author: "",
  digest: "旧摘要",
};

type StreamCall = {
  url: string;
  body: Record<string, unknown>;
  handlers: AgentStreamHandlers;
  abort: ReturnType<typeof vi.fn>;
};

function makeFakeStream() {
  const calls: StreamCall[] = [];
  const fake = ((url: string, body: unknown, handlers: AgentStreamHandlers) => {
    const abort = vi.fn();
    calls.push({ url, body: body as Record<string, unknown>, handlers, abort });
    return { abort };
  }) as unknown as typeof agentStream;
  return { fake, calls };
}

function setup(overrides: { ready?: boolean } = {}) {
  const { fake, calls } = makeFakeStream();
  const onFieldChange = vi.fn();
  const onInstruct = vi.fn();
  render(
    <ArticleRewriteMenu
      draft={DRAFT}
      onFieldChange={onFieldChange}
      onInstruct={onInstruct}
      stream={fake}
      checkLlmReady={() => Promise.resolve(overrides.ready ?? true)}
    />,
  );
  const emit = (i: number, event: AgentEvent) => act(() => calls[i].handlers.onEvent(event));
  return { calls, onFieldChange, onInstruct, emit };
}

async function openMenuAnd(label: string) {
  fireEvent.click(screen.getByTestId("article-rewrite-menu"));
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(label) }));
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("htmlToPlainText", () => {
  it("块级闭合转换行、标签剥净", () => {
    expect(htmlToPlainText("<section><p>甲</p><p>乙<strong>重</strong></p></section>")).toBe(
      "甲\n乙重",
    );
  });
});

describe("ArticleRewriteMenu — 菜单与门槛", () => {
  it("菜单含四项动作", () => {
    setup();
    fireEvent.click(screen.getByTestId("article-rewrite-menu"));
    expect(screen.getByRole("menuitem", { name: /标题再拟三个/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /摘要重写/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /整体换调子/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /缩到指定长度/ })).toBeInTheDocument();
  });

  it("未配 AI key(标题/摘要轻改):toast 引导,不发请求", async () => {
    const { calls } = setup({ ready: false });
    await openMenuAnd("标题再拟三个");
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message.includes("连接 AI"))).toBe(true),
    );
    expect(calls).toHaveLength(0);
  });
});

describe("ArticleRewriteMenu — 标题再拟三个(轻改,零改)", () => {
  it("请求 scope=title;候选点选写 title 字段", async () => {
    const { calls, onFieldChange, emit } = setup();
    await openMenuAnd("标题再拟三个");

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ scope: "title", title: "旧标题" });
    expect(String(calls[0].body.article_text)).toContain("第一段");

    emit(0, { type: "rewrite_done", text: "", variants: ["甲", "乙", "丙"] });
    const option = await screen.findByRole("button", { name: "乙" });
    fireEvent.click(option);
    expect(onFieldChange).toHaveBeenCalledWith("title", "乙");
    expect(screen.queryByTestId("title-variants-dialog")).toBeNull();
  });
});

describe("ArticleRewriteMenu — 摘要重写(轻改,零改)", () => {
  it("token 流式显示,用这条写 digest", async () => {
    const { calls, onFieldChange, emit } = setup();
    await openMenuAnd("摘要重写");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ scope: "digest" });

    emit(0, { type: "token", text: "新摘" });
    emit(0, { type: "token", text: "要" });
    expect((await screen.findByTestId("digest-dialog")).textContent).toContain("新摘要");

    emit(0, { type: "rewrite_done", text: "新摘要(权威)", variants: [] });
    const useBtn = await screen.findByRole("button", { name: "用这条" });
    await waitFor(() => expect(useBtn).toBeEnabled());
    fireEvent.click(useBtn);
    expect(onFieldChange).toHaveBeenCalledWith("digest", "新摘要(权威)");
  });
});

describe("ArticleRewriteMenu — 整体大改收编 chat", () => {
  it("换调子·温柔治愈:注入含「保留原有全部图片」的预设,不走 /agent/rewrite;菜单收起;无横条", async () => {
    const { calls, onInstruct } = setup();
    fireEvent.click(screen.getByTestId("article-rewrite-menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: /整体换调子/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "温柔治愈" }));

    expect(onInstruct).toHaveBeenCalledTimes(1);
    const instruction = onInstruct.mock.calls[0][0] as string;
    expect(instruction).toContain("温柔治愈");
    expect(instruction).toContain("保留原有全部图片");
    // 不再走整篇 SSE 直连
    expect(calls).toHaveLength(0);
    // 两套内存后悔已删:横条/生成层不存在
    expect(screen.queryByTestId("article-revert-banner")).toBeNull();
    expect(screen.queryByTestId("article-rewrite-overlay")).toBeNull();
    // 菜单已收起
    expect(screen.queryByRole("menuitem", { name: "温柔治愈" })).toBeNull();
  });

  it("缩到指定长度·约 800 字:注入含字数与「不要删图」的预设,长度弹窗收起", async () => {
    const { calls, onInstruct } = setup();
    await openMenuAnd("缩到指定长度");
    fireEvent.click(await screen.findByRole("button", { name: /约 800 字/ }));

    expect(onInstruct).toHaveBeenCalledTimes(1);
    const instruction = onInstruct.mock.calls[0][0] as string;
    expect(instruction).toContain("800");
    expect(instruction).toContain("不要删图");
    expect(calls).toHaveLength(0);
    expect(screen.queryByTestId("length-dialog")).toBeNull();
  });

  it("缩到指定长度·自定义字数:注入带自定义字数的预设", async () => {
    const { onInstruct } = setup();
    await openMenuAnd("缩到指定长度");
    const input = await screen.findByLabelText("自定义字数");
    fireEvent.change(input, { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "开始" }));

    expect(onInstruct).toHaveBeenCalledTimes(1);
    expect(onInstruct.mock.calls[0][0]).toContain("600");
  });
});
