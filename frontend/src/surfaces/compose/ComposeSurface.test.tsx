import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handlersBox: { current: any } = { current: null };
vi.mock("@/lib/agentStream", () => ({
  agentStream: (_url: string, _body: unknown, handlers: any) => {
    handlersBox.current = handlers;
    return { abort: () => {} };
  },
}));

const getLlmConfig = vi.fn();
const putLlmConfig = vi.fn();
const testLlmConnection = vi.fn();
vi.mock("@/surfaces/settings/llmApi", () => ({
  getLlmConfig: (...a: unknown[]) => getLlmConfig(...a),
  putLlmConfig: (...a: unknown[]) => putLlmConfig(...a),
  testLlmConnection: (...a: unknown[]) => testLlmConnection(...a),
}));

import ComposeSurface from "./ComposeSurface";
import { useArticlesStore } from "@/stores/articlesStore";
import { useHealthStore } from "@/stores/healthStore";

function redacted(keyConfigured: boolean) {
  return {
    provider: "openai_compat",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyConfigured,
    source: keyConfigured ? "stored" : "env",
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  // 默认后端健康:不出条幅(避免与现有用例串味)。
  useHealthStore.setState({ status: "ok" });
  handlersBox.current = null;
  getLlmConfig.mockReset();
  putLlmConfig.mockReset();
  testLlmConnection.mockReset();
  // 默认已连 AI:走原有流程
  getLlmConfig.mockResolvedValue(redacted(true));
  putLlmConfig.mockResolvedValue(redacted(true));
  testLlmConnection.mockResolvedValue({ ok: true, detail: "可用" });
});

afterEach(() => {
  useHealthStore.setState({ status: "unknown" });
  vi.restoreAllMocks();
});

describe("ComposeSurface phase machine", () => {
  it("renders a Warm Compose root without the retired editorial classes", () => {
    const { container } = render(<ComposeSurface go={vi.fn()} />);
    const retiredSelector = [".e" + "d-root", ".e" + "d-wrap", ".e" + "d-screen"].join(",");

    expect(screen.getByTestId("compose-surface")).toBeInTheDocument();
    expect(container.querySelector(retiredSelector)).toBeNull();
  });

  it("intent phase renders the Warm intent screen copy and affordances", () => {
    render(<ComposeSurface go={vi.fn()} />);

    expect(screen.getByText("想写点什么?")).toBeInTheDocument();
    expect(screen.getByText("不知道写啥?点一个,我先帮你起个头")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "落笔" })).toBeDisabled();
  });

  it("asking phase shows the true intent recap and edit affordance", async () => {
    render(<ComposeSurface go={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("一句话意图"), {
      target: { value: "周末带娃去植物园,想写银杏叶。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));

    expect(await screen.findByText("周末带娃去植物园,想写银杏叶。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /改一下/ })).toBeInTheDocument();
  });

  it("intent -> asking after 落笔, then asking -> generating after answers", async () => {
    const go = vi.fn();
    render(<ComposeSurface go={go} />);

    const ta = screen.getByLabelText("一句话意图") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "上周末带娃去海洋馆" } });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));

    expect(await screen.findByText("这篇写给谁看？")).toBeInTheDocument();

    const start = screen.getByRole("button", { name: "开始写" }) as HTMLButtonElement;
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "生活同好" }));
    fireEvent.click(screen.getByRole("button", { name: "温柔治愈" }));
    expect(start).not.toBeDisabled();

    fireEvent.click(start);

    expect(await screen.findByText("工序 / 制版")).toBeInTheDocument();
    expect(handlersBox.current).not.toBeNull();
  });

  it("未连 AI 时点开始写,先出连接向导而非直接流式", async () => {
    getLlmConfig.mockResolvedValue(redacted(false));
    render(<ComposeSurface go={vi.fn()} />);

    const ta = screen.getByLabelText("一句话意图") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "上周末带娃去海洋馆" } });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));
    fireEvent.click(screen.getByRole("button", { name: "生活同好" }));
    fireEvent.click(screen.getByRole("button", { name: "温柔治愈" }));
    fireEvent.click(screen.getByRole("button", { name: "开始写" }));

    expect(await screen.findByText(/选一个 AI/)).toBeInTheDocument();
    expect(screen.queryByText("工序 / 制版")).toBeNull();
  });

  it("向导连接成功后续上生成", async () => {
    getLlmConfig.mockResolvedValue(redacted(false));
    render(<ComposeSurface go={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("一句话意图"), { target: { value: "上周末带娃去海洋馆" } });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));
    fireEvent.click(screen.getByRole("button", { name: "生活同好" }));
    fireEvent.click(screen.getByRole("button", { name: "温柔治愈" }));
    fireEvent.click(screen.getByRole("button", { name: "开始写" }));

    fireEvent.click(await screen.findByRole("button", { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-abc" } });
    fireEvent.click(screen.getByRole("button", { name: "测试并连接" }));

    expect(await screen.findByText("工序 / 制版")).toBeInTheDocument();
  });

  it("向导取消时 deep-link 到设置 AI 引擎(section=aiengine),不在原地打转", async () => {
    getLlmConfig.mockResolvedValue(redacted(false));
    const go = vi.fn();
    render(<ComposeSurface go={go} />);

    fireEvent.change(screen.getByLabelText("一句话意图"), { target: { value: "上周末带娃去海洋馆" } });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));
    fireEvent.click(screen.getByRole("button", { name: "生活同好" }));
    fireEvent.click(screen.getByRole("button", { name: "温柔治愈" }));
    fireEvent.click(screen.getByRole("button", { name: "开始写" }));

    fireEvent.click(await screen.findByRole("button", { name: /我先去设置里配置/ }));
    expect(go).toHaveBeenCalledWith("settings", { section: "aiengine" });
  });

  it("后端不可用(healthStore down)时顶部出『写作服务暂连不上』条幅", () => {
    useHealthStore.setState({ status: "down" });
    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.getByText(/写作服务暂连不上/)).toBeInTheDocument();
  });

  it("后端不可用条幅使用 Warm danger token,不再引用 cinnabar", () => {
    useHealthStore.setState({ status: "down" });
    render(<ComposeSurface go={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveStyle({ color: "var(--danger)" });
    expect(alert.getAttribute("style") ?? "").not.toContain("--" + "cinnabar");
  });

  it("后端健康时不出条幅", () => {
    useHealthStore.setState({ status: "ok" });
    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.queryByText(/写作服务暂连不上/)).toBeNull();
  });

  it("落笔 is disabled while intent is blank", () => {
    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.getByRole("button", { name: "落笔" })).toBeDisabled();
  });

  it("不暴露内部组件名 ComposeSurface", () => {
    render(<ComposeSurface go={() => {}} />);
    expect(screen.queryByText("ComposeSurface")).toBeNull();
  });

  it("顶部『返回起稿台』走 navigate('list'),不是 history.back", () => {
    const go = vi.fn();
    const backSpy = vi.spyOn(window.history, "back");
    render(<ComposeSurface go={go} />);

    fireEvent.click(screen.getByRole("button", { name: /返回起稿台/ }));
    expect(go).toHaveBeenCalledWith("list");
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("一句话意图实时写进 sessionStorage", () => {
    render(<ComposeSurface go={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("一句话意图"), { target: { value: "上周末带娃去海洋馆" } });

    const raw = sessionStorage.getItem("mbeditor.compose.draft");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).intent).toBe("上周末带娃去海洋馆");
  });

  it("已选受众/调子也实时写进 sessionStorage", () => {
    render(<ComposeSurface go={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("一句话意图"), { target: { value: "上周末带娃去海洋馆" } });
    fireEvent.click(screen.getByRole("button", { name: "落笔" }));
    fireEvent.click(screen.getByRole("button", { name: "生活同好" }));
    fireEvent.click(screen.getByRole("button", { name: "温柔治愈" }));

    const draft = JSON.parse(sessionStorage.getItem("mbeditor.compose.draft") as string);
    expect(draft.audience).toBe("生活同好");
    expect(draft.tone).toBe("温柔治愈");
  });

  it("刷新 /new 时从 sessionStorage 恢复:非空 intent 直接进问答,已选项亮起", () => {
    sessionStorage.setItem(
      "mbeditor.compose.draft",
      JSON.stringify({
        intent: "上周末带娃去海洋馆",
        audience: "生活同好",
        tone: "温柔治愈",
        voiceSample: "",
        useBrandVoice: false,
      }),
    );

    render(<ComposeSurface go={vi.fn()} />);
    // intent 非空 → 初渲染即 asking,已选项亮起(说明 answers 已恢复)
    expect(screen.getByText("这篇写给谁看？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生活同好" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "温柔治愈" })).toHaveClass("on");
    // 改一下 → 回 intent,一句话恢复进输入框
    fireEvent.click(screen.getByRole("button", { name: /改一下/ }));
    expect((screen.getByLabelText("一句话意图") as HTMLTextAreaElement).value).toBe("上周末带娃去海洋馆");
  });

  it("sessionStorage 有非空 intent(来自首页一句话)→ 初渲染直接进 asking", () => {
    sessionStorage.setItem(
      "mbeditor.compose.draft",
      JSON.stringify({
        intent: "今天带娃去公园，他第一次自己荡秋千",
        audience: "",
        tone: "",
        voiceSample: "",
        useBrandVoice: false,
      }),
    );

    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.getByText("这篇写给谁看？")).toBeInTheDocument();
    expect(screen.queryByLabelText("一句话意图")).toBeNull();
    // 回看一句话:AskFlow recap 展示真实 intent
    expect(screen.getByText("今天带娃去公园，他第一次自己荡秋千")).toBeInTheDocument();
  });

  it("intent 全空白的 draft → 仍从 intent phase 开始", () => {
    sessionStorage.setItem(
      "mbeditor.compose.draft",
      JSON.stringify({ intent: "   ", audience: "", tone: "", voiceSample: "", useBrandVoice: false }),
    );

    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.getByLabelText("一句话意图")).toBeInTheDocument();
    expect(screen.queryByText("这篇写给谁看？")).toBeNull();
  });

  it("无 draft → 仍从 intent phase 开始", () => {
    render(<ComposeSurface go={vi.fn()} />);
    expect(screen.getByLabelText("一句话意图")).toBeInTheDocument();
    expect(screen.queryByText("这篇写给谁看？")).toBeNull();
  });
});
