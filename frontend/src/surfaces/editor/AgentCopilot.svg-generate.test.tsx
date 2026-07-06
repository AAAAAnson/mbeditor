// frontend/src/surfaces/editor/AgentCopilot.svg-generate.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  default: { post: postSpy, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (_: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  vi.resetModules();
  postSpy.mockReset();
  localStorage.clear();
});

async function loadSubject() {
  const [{ AgentCopilot }, { useWeChatStore }, { useArticlesStore }] = await Promise.all([
    import("./AgentCopilot"),
    import("@/stores/wechatStore"),
    import("@/stores/articlesStore"),
  ]);
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  return { AgentCopilot, useArticlesStore };
}

describe("AgentCopilot 生成交互 SVG 积木", () => {
  it("renders the intent button", async () => {
    const { AgentCopilot } = await loadSubject();
    render(<AgentCopilot />);
    const btn = screen.getByRole("button", { name: /生成交互 SVG 积木/ });
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("POSTs /agent/generate-svg with the user prompt and appends html on success", async () => {
    const { AgentCopilot, useArticlesStore } = await loadSubject();
    const a = await useArticlesStore.getState().createArticle("Hello", "html");
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>body</p>" });
    useArticlesStore.getState().setCurrentArticle(a.id);

    postSpy.mockResolvedValueOnce({
      data: {
        code: 0,
        message: "ok",
        data: {
          status: "ok",
          html: '<section><svg xmlns="http://www.w3.org/2000/svg"/></section>',
          warnings: [],
          report: { issues: [], warnings: [], stats: {} },
          attempts: 1,
        },
      },
    });

    render(<AgentCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /生成交互 SVG 积木/ }));

    const input = await screen.findByLabelText(/interaction prompt/i);
    fireEvent.change(input, { target: { value: "FAQ 手风琴 5 题" } });
    fireEvent.click(screen.getByRole("button", { name: /^生成$/ }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/agent/generate-svg",
        expect.objectContaining({ prompt: "FAQ 手风琴 5 题" }),
      );
    });

    await waitFor(() => {
      const updated = useArticlesStore.getState().articles.find((x) => x.id === a.id) as {
        html: string;
      };
      expect(updated.html).toContain("<p>body</p>");
      expect(updated.html).toContain("<svg");
    });
  });

  it("shows the validation report when backend returns status=failed", async () => {
    const { AgentCopilot, useArticlesStore } = await loadSubject();
    const a = await useArticlesStore.getState().createArticle("Hello", "html");
    useArticlesStore.getState().setCurrentArticle(a.id);

    postSpy.mockResolvedValueOnce({
      data: {
        code: 0,
        message: "ok",
        data: {
          status: "failed",
          html: "",
          warnings: [],
          report: {
            issues: [
              {
                line: 3,
                rule: "forbidden-tag",
                message: "禁用的 HTML 标签 `<script>`",
                suggestion: "去掉",
              },
            ],
            warnings: [],
            stats: {},
          },
          attempts: 2,
        },
      },
    });

    render(<AgentCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /生成交互 SVG 积木/ }));
    const input = await screen.findByLabelText(/interaction prompt/i);
    fireEvent.change(input, { target: { value: "随便" } });
    fireEvent.click(screen.getByRole("button", { name: /^生成$/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/forbidden-tag/);
    expect(alert.textContent).toMatch(/行 3/);
  });
});
