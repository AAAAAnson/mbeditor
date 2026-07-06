import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("ConnectAiWizard", () => {
  it("renders the Warm split layout without retired editorial classes", () => {
    const { container } = render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    const retiredSelector = [".e" + "d-screen", ".e" + "d-wizard-step"].join(",");

    expect(screen.getByTestId("connect-ai-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("connect-ai-rail")).toBeInTheDocument();
    expect(container.querySelector(retiredSelector)).toBeNull();
  });

  it("第一步让用户选一个 AI 服务商,DeepSeek 在推荐位", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/选一个 AI/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DeepSeek/ })).toBeInTheDocument();
    expect(screen.getByText("推荐")).toBeInTheDocument();
  });

  it("第一步带科普:BYOK 是用自己的模型账号、不经我们服务器、写一篇约几分钱(以官网为准)", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    // 用自己的账号 / 自己的 key
    expect(screen.getByText(/你自己的/)).toBeInTheDocument();
    // 不经过我们的服务器
    expect(screen.getByText(/不经过我们的服务器/)).toBeInTheDocument();
    // 成本锚:几分钱(科普盒 + 卡片都出现,非承诺数字)
    expect(screen.getAllByText(/几分钱/).length).toBeGreaterThan(0);
    // 以官网为准:标明真实价以官网为准,不承诺数字
    expect(screen.getByText(/以.*官网为准/)).toBeInTheDocument();
  });

  it("第一步带 key 安全一句话:只存本机/本服务端,不上传第三方", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/不上传.*第三方/)).toBeInTheDocument();
    expect(screen.getByText(/本机|本服务/)).toBeInTheDocument();
  });

  it("DeepSeek 卡带可信度/价格锚:国内手机号注册 · 按量计费 · 写一篇约几分钱", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    const ds = screen.getByRole("button", { name: /DeepSeek/ });
    expect(ds).toHaveTextContent(/手机号注册/);
    expect(ds).toHaveTextContent(/按量|几分钱/);
  });

  it("cancel 文案为「我先去设置里配置」并触发 onCancel(由调用方 deep-link 到设置)", () => {
    const onCancel = vi.fn();
    render(<ConnectAiWizard onConnected={() => {}} onCancel={onCancel} />);
    const btn = screen.getByRole("button", { name: /我先去设置里配置/ });
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalled();
  });

  it("连接步骤每步带图示:第1步真注册页截图(img),第2/3步标注示意图(svg)", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    const s1 = screen.getByTestId("placeholder-step-1");
    const s2 = screen.getByTestId("placeholder-step-2");
    const s3 = screen.getByTestId("placeholder-step-3");
    // 第 1 步:真 DeepSeek 注册页截图
    expect(s1.querySelector("img")).toBeInTheDocument();
    // 第 2/3 步:内联 SVG 标注示意图(不涉第三方登录态、随主题变色)
    expect(s2.querySelector("svg")).toBeInTheDocument();
    expect(s3.querySelector("svg")).toBeInTheDocument();
    // 占位字样不再出现
    expect(screen.queryByText(/截图占位/)).toBeNull();
  });

  it("第二步只要求粘贴一个密钥,base_url/model 已自动锁定显示", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));

    const keyInput = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(keyInput).toBeInTheDocument();
    expect(screen.getByText("https://api.deepseek.com/v1")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    // 第二步不再出现可编辑的 base_url / model 输入框
    expect(screen.queryByLabelText("Base URL")).toBeNull();
    expect(screen.queryByLabelText("Model")).toBeNull();
  });

  it("测试并连接成功后调 putLlmConfig 并回调 onConnected", async () => {
    const onConnected = vi.fn();
    render(<ConnectAiWizard onConnected={onConnected} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-abc" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    await waitFor(() => {
      expect(putLlmConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai_compat",
          base_url: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          api_key: "sk-abc",
        }),
      );
      expect(onConnected).toHaveBeenCalled();
    });
  });

  it("H4:step2 密钥区带官方控制台外链(域名级,target=_blank rel=noreferrer)", () => {
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));

    const link = screen.getByRole("link", { name: /控制台/ });
    expect(link).toHaveAttribute("href", "https://platform.deepseek.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") || "").toMatch(/noreferrer/);
  });

  it("H4:测试失败 code=quota → 错误卡额外给「去充值」外链出路", async () => {
    testLlmConnection.mockResolvedValue({ ok: false, detail: "余额不足,去服务商控制台充值后再试。", code: "quota" });
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-poor" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/余额不足/);
    const recharge = within(alert).getByRole("link", { name: /充值/ });
    expect(recharge).toHaveAttribute("href", "https://platform.deepseek.com");
    expect(recharge).toHaveAttribute("target", "_blank");
  });

  it("错误卡拼接不产生双标点(detail 以句号结尾时先剥掉再接引导句)", async () => {
    testLlmConnection.mockResolvedValue({ ok: false, detail: "余额不足,去服务商控制台充值后再试。", code: "quota" });
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-poor" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/。\./);
    expect(alert.textContent).toContain("再试。改好再点一次");
  });

  it("H4:测试失败非 quota → 错误卡不出现充值链接", async () => {
    testLlmConnection.mockResolvedValue({ ok: false, detail: "密钥无效或未授权,请检查 API Key。", code: "auth" });
    render(<ConnectAiWizard onConnected={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/密钥无效/);
    expect(within(alert).queryByRole("link", { name: /充值/ })).toBeNull();
  });

  it("连接失败不回调 onConnected,提示失败原因", async () => {
    testLlmConnection.mockResolvedValue({ ok: false, detail: "401 未授权" });
    const onConnected = vi.fn();
    render(<ConnectAiWizard onConnected={onConnected} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    await waitFor(() => {
      expect(screen.getByText(/401 未授权/)).toBeInTheDocument();
    });
    expect(onConnected).not.toHaveBeenCalled();
    expect(putLlmConfig).not.toHaveBeenCalled();
  });
});
