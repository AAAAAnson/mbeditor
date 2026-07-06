import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./llmApi", () => ({
  getLlmConfig: vi.fn(),
  putLlmConfig: vi.fn(),
  testLlmConnection: vi.fn(),
}));
vi.mock("@/stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AIEngineSection from "./AIEngineSection";
import { getLlmConfig, putLlmConfig, testLlmConnection } from "./llmApi";

const mockGet = getLlmConfig as unknown as ReturnType<typeof vi.fn>;
const mockPut = putLlmConfig as unknown as ReturnType<typeof vi.fn>;
const mockTest = testLlmConnection as unknown as ReturnType<typeof vi.fn>;

const STORED = {
  provider: "openai_compat" as const,
  base_url: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  keyConfigured: true,
  source: "stored" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(STORED);
});
afterEach(cleanup);

describe("AIEngineSection", () => {
  it("renders Warm scaffold heading and two cards", async () => {
    const { container } = render(<AIEngineSection />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "AI 引擎" })).toBeInTheDocument();
    });
    // C1 双卡:换服务商卡 + 连接配置卡(走设计稿 .ss-card)。
    expect(container.querySelectorAll(".ss-card").length).toBeGreaterThanOrEqual(2);
  });

  it("loads redacted config and never prefills the API key", async () => {
    render(<AIEngineSection />);
    await waitFor(() => {
      expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe("https://api.deepseek.com/v1");
    });
    expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("deepseek-chat");
    expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/已配置/)).toBeInTheDocument();
  });

  it("hides Base URL field when provider is anthropic", async () => {
    mockGet.mockResolvedValue({ ...STORED, provider: "anthropic", base_url: "" });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
  });

  it("save sends only filled fields; blank key omitted (keep existing)", async () => {
    mockPut.mockResolvedValue(STORED);
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "deepseek-reasoner" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({
        provider: "openai_compat",
        base_url: "https://api.deepseek.com/v1",
        model: "deepseek-reasoner",
      });
    });
    expect(mockPut.mock.calls[0][0]).not.toHaveProperty("api_key");
  });

  it("save includes api_key when typed", async () => {
    mockPut.mockResolvedValue({ ...STORED, keyConfigured: true });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("API Key")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-new" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockPut.mock.calls[0][0]).toMatchObject({ api_key: "sk-new" });
    });
  });

  it("选 DeepSeek 自动填 base_url/model,用户只需填 key", async () => {
    mockGet.mockResolvedValue({ ...STORED, base_url: "", model: "", keyConfigured: false, source: "env" });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("DeepSeek"));
    expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe("https://api.deepseek.com/v1");
    expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("deepseek-chat");
  });

  it("选 Claude 切到 anthropic 并隐藏 Base URL、填 model", async () => {
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Claude"));
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("claude-opus-4-8");
  });

  it("「其它…」展开后保留手填 Provider/Base URL/Model 字段", async () => {
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("其它…"));
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });

  it("test connection shows result detail", async () => {
    mockTest.mockResolvedValue({ ok: true, detail: "deepseek-chat 可用" });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }));
    await waitFor(() => {
      expect(screen.getByTestId("llm-test-result")).toHaveTextContent("deepseek-chat 可用");
    });
  });

  it("success result is a DS success Tag", async () => {
    mockTest.mockResolvedValue({ ok: true, detail: "deepseek-chat \u53ef\u7528" });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /\u6d4b\u8bd5\u8fde\u63a5/ }));
    await waitFor(() => {
      const result = screen.getByTestId("llm-test-result");
      expect(result).toHaveClass("mb-tag");
      expect(result).toHaveClass("tone-success");
    });
  });

  it("failed connection result is a DS danger Tag (no cinnabar)", async () => {
    mockTest.mockResolvedValue({ ok: false, detail: "unauthorized" });
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());

    const testButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("\u6d4b\u8bd5"));
    expect(testButton).toBeTruthy();
    fireEvent.click(testButton!);

    await waitFor(() => {
      const result = screen.getByTestId("llm-test-result");
      expect(result).toHaveClass("mb-tag");
      expect(result).toHaveClass("tone-danger");
      expect(result.className).not.toContain("cinnabar");
    });
  });

  it("shows the config source as a DS Tag in the card header", async () => {
    render(<AIEngineSection />);
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeInTheDocument());
    const sourceTag = screen.getByTestId("llm-source");
    expect(sourceTag).toHaveClass("mb-tag");
    expect(sourceTag).toHaveTextContent(/\u7f51\u9875\u914d\u7f6e|\u6765\u6e90/);
  });
});
