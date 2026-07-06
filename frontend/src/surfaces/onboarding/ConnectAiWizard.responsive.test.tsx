// H3 compose 移动适配:ConnectAiWizard 390px 下左轨 416px 挤没右侧密钥区 → 窄屏转纵向。
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

const putLlmConfig = vi.fn();
const testLlmConnection = vi.fn();
vi.mock("@/surfaces/settings/llmApi", () => ({
  putLlmConfig: (...args: unknown[]) => putLlmConfig(...args),
  testLlmConnection: (...args: unknown[]) => testLlmConnection(...args),
}));

import ConnectAiWizard from "./ConnectAiWizard";

beforeEach(() => {
  putLlmConfig.mockReset();
  testLlmConnection.mockReset();
  putLlmConfig.mockResolvedValue({
    provider: "openai_compat",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyConfigured: true,
    source: "stored",
  });
  testLlmConnection.mockResolvedValue({ ok: true, detail: "可用" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConnectAiWizard responsive (≤600px)", () => {
  it("移动:shell 转纵向,左轨不再占死 416px、改全宽顶部横条", () => {
    mockMatchMedia(true);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    const shell = screen.getByTestId("connect-ai-wizard");
    const rail = screen.getByTestId("connect-ai-rail");

    expect(shell.style.flexDirection).toBe("column");
    expect(rail.style.flex).not.toBe("0 0 416px");
    expect(rail.style.flex).toBe("0 0 auto");
    expect(rail.style.width).toBe("100%");
  });

  it("移动:流程可走通——选服务商 → 粘密钥 → 「测试并连接」按钮在", () => {
    mockMatchMedia(true);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-abc" } });
    expect(screen.getByRole("button", { name: "测试并连接" })).toBeInTheDocument();
  });

  it("移动:左轨科普卡收起(要花钱吗/密钥安全吗不渲染),密钥输入区不被挤出首屏", () => {
    mockMatchMedia(true);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    expect(screen.queryByText(/要花钱吗/)).not.toBeInTheDocument();
    expect(screen.queryByText(/密钥安全吗/)).not.toBeInTheDocument();
  });

  it("桌面:科普卡照常渲染", () => {
    mockMatchMedia(false);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    expect(screen.getByText(/要花钱吗/)).toBeInTheDocument();
    expect(screen.getByText(/密钥安全吗/)).toBeInTheDocument();
  });

  it("桌面:原布局逐字节不变——左轨仍 0 0 416px、shell 不转纵向", () => {
    mockMatchMedia(false);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    const shell = screen.getByTestId("connect-ai-wizard");
    const rail = screen.getByTestId("connect-ai-rail");

    expect(rail.style.flex).toBe("0 0 416px");
    expect(shell.style.flexDirection).not.toBe("column");
  });

  it("桌面:流程照旧可走通", () => {
    mockMatchMedia(false);
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-abc" } });
    expect(screen.getByRole("button", { name: "测试并连接" })).toBeInTheDocument();
  });
});
