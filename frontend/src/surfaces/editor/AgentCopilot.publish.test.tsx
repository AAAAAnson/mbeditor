// frontend/src/surfaces/editor/AgentCopilot.publish.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCopilot } from "./AgentCopilot";
import { useWeChatStore } from "@/stores/wechatStore";
import { useArticlesStore } from "@/stores/articlesStore";

const postSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { code: 0, message: "ok", data: { media_id: "m-1" } } }),
);
vi.mock("@/lib/api", () => ({
  default: { post: postSpy, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (e: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  postSpy.mockClear();
  localStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
});

describe("AgentCopilot publish", () => {
  it("POSTs /wechat/draft with active creds + article in one call", async () => {
    useWeChatStore.getState().addAccount({ name: "MB", appid: "wxA", appsecret: "secretA" });
    const a = await useArticlesStore.getState().createArticle("Hello", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });
    useArticlesStore.getState().setCurrentArticle(a.id);

    render(<AgentCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /推送到草稿|publish draft/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/wechat/draft",
        expect.objectContaining({
          appid: "wxA",
          appsecret: "secretA",
          article: expect.objectContaining({ title: "Hello", html: "<p>body</p>" }),
        }),
      );
    });
  });
});
