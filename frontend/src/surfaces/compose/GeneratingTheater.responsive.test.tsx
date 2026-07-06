// H3 compose 移动适配:GeneratingTheater 390px 下 "344px 1fr" 手稿区剩 ~46px → 窄屏单列。
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

vi.mock("@/lib/agentStream", () => ({
  agentStream: (_url: string, _body: unknown, _handlers: unknown) => ({ abort: vi.fn() }),
}));

const getCredentialsMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>(async () => []));
vi.mock("@/surfaces/settings/credentialsApi", () => ({
  getCredentials: () => getCredentialsMock(),
  putCredential: vi.fn(),
}));

import GeneratingTheater from "./GeneratingTheater";
import type { ComposeAnswers } from "./ComposeSurface";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";

const ANSWERS: ComposeAnswers = {
  intent: "上周末带娃去海洋馆",
  audience: "生活同好",
  tone: "温柔治愈",
  voiceSample: "",
  useBrandVoice: false,
};

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useWeChatStore.getState().reset();
  getCredentialsMock.mockClear();
  getCredentialsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GeneratingTheater responsive (≤600px)", () => {
  it("移动:stage 单列(工序轨在上、手稿纸在下),rail 分隔线转 borderBottom", () => {
    mockMatchMedia(true);
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} />);

    const stage = screen.getByTestId("gen-stage");
    expect(stage.style.gridTemplateColumns).toBe("1fr");

    const rail = screen.getByTestId("gen-rail");
    expect(rail.style.borderRight).not.toContain("1px solid");
    expect(rail.style.borderBottom).toContain("1px solid");
  });

  it("桌面:原布局逐字节不变——stage 仍 '344px 1fr',rail 仍 borderRight", () => {
    mockMatchMedia(false);
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} />);

    const stage = screen.getByTestId("gen-stage");
    expect(stage.style.gridTemplateColumns).toBe("344px 1fr");

    const rail = screen.getByTestId("gen-rail");
    expect(rail.style.borderRight).toContain("1px solid");
    expect(rail.style.borderBottom).toBe("");
  });
});
