import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/types/agent";

const handlersBox: { current: any } = { current: null };
const abortSpy = vi.fn();
vi.mock("@/lib/agentStream", () => ({
  agentStream: (_url: string, _body: unknown, handlers: any) => {
    handlersBox.current = handlers;
    return { abort: abortSpy };
  },
}));

// H5:gate 走 useWeChatPushable(内存密钥 OR 服务器 configured 列表)。
// 默认服务器列表为空 → 旧「只看内存 appsecret」的断言原样成立。
const getCredentialsMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>(async () => []));
vi.mock("@/surfaces/settings/credentialsApi", () => ({
  getCredentials: () => getCredentialsMock(),
  putCredential: vi.fn(),
}));

// 批3:compose 生成完成后落一份 baseline 快照(reason="compose")。
const postRevisionMock = vi.hoisted(() => vi.fn(async () => "rev_1"));
vi.mock("@/lib/revisionsApi", () => ({
  postRevision: (...args: unknown[]) => postRevisionMock(...args),
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

function emit(ev: AgentEvent) {
  act(() => {
    handlersBox.current.onEvent(ev);
  });
}

beforeEach(() => {
  localStorage.clear();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  useWeChatStore.getState().reset();
  handlersBox.current = null;
  abortSpy.mockClear();
  getCredentialsMock.mockClear();
  getCredentialsMock.mockResolvedValue([]);
  postRevisionMock.mockClear();
  postRevisionMock.mockResolvedValue("rev_1");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GeneratingTheater", () => {
  it("lights up the 行文 stage and streams title + body tokens", () => {
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} />);

    emit({ type: "stage", stage: "行文", status: "active", desc: "" });
    expect(screen.getByTestId("stage-行文")).toHaveClass("active");

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({ type: "token", text: "上" });
    emit({ type: "token", text: "周末" });

    expect(screen.getByText("海洋馆里的两小时")).toBeInTheDocument();
    expect(screen.getByText(/上周末/)).toBeInTheDocument();

    emit({ type: "stage", stage: "行文", status: "done", desc: "约 820 字" });
    expect(screen.getByTestId("stage-行文")).toHaveClass("done");
    expect(screen.getByText("约 820 字")).toBeInTheDocument();
  });

  it("on done: writes the article to the store and shows a celebration (no silent jump)", async () => {
    const go = vi.fn();
    const onDone = vi.fn();
    render(<GeneratingTheater answers={ANSWERS} onDone={onDone} onRetry={() => {}} go={go} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文</section>",
      markdown: "# 海洋馆里的两小时\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    await vi.waitFor(() => {
      expect(useArticlesStore.getState().articles.length).toBe(1);
      expect(onDone).toHaveBeenCalled();
    });
    const art = useArticlesStore.getState().articles[0] as { html: string; title: string };
    expect(art.html).toBe("<section>正文</section>");
    expect(art.title).toBe("海洋馆里的两小时");

    // 成功庆祝层出现,不再 900ms 静默跳转
    const celebration = await screen.findByTestId("compose-celebration");
    expect(celebration).toHaveAttribute("data-overlay", "true");
    expect(celebration).toHaveTextContent("写好了");
    expect(go).not.toHaveBeenCalled();

    // 点「看看效果」才跳编辑器
    fireEvent.click(screen.getByRole("button", { name: /看看效果/ }));
    expect(go).toHaveBeenCalledWith("editor", expect.objectContaining({ articleSlug: expect.any(String) }));
  });

  it("on done: 落一份 compose baseline 快照(reason=compose,恰一次,用最终生成 html)", async () => {
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={vi.fn()} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文含图</section>",
      markdown: "# t\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    await vi.waitFor(() => {
      expect(useArticlesStore.getState().articles.length).toBe(1);
    });
    const created = useArticlesStore.getState().articles[0] as { id: string };

    // baseline 落且只落一次(不与 P1 首存/冲突快照重复:客户端唯一显式落 compose)
    await vi.waitFor(() => {
      expect(postRevisionMock).toHaveBeenCalledTimes(1);
    });
    expect(postRevisionMock).toHaveBeenCalledWith(created.id, "<section>正文含图</section>", "compose");
  });

  it("生成出错时不落 baseline 快照", async () => {
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={vi.fn()} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({ type: "error", code: "stream_error", message: "boom" });

    await Promise.resolve();
    expect(postRevisionMock).not.toHaveBeenCalled();
  });

  it("发布主按钮文案是『复制到公众号』,带 intent=publish 进编辑器跑复制流", async () => {
    const go = vi.fn();
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={go} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文</section>",
      markdown: "# t\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    const copyBtn = await screen.findByRole("button", { name: /复制到公众号/ });
    // 不再出现旧黑话「直接发布」
    expect(screen.queryByRole("button", { name: "直接发布" })).toBeNull();

    fireEvent.click(copyBtn);
    expect(go).toHaveBeenCalledWith(
      "editor",
      expect.objectContaining({ articleSlug: expect.any(String), intent: "publish" }),
    );
  });

  it("未绑公众号:不露『发到草稿箱』(不承诺做不到的发布)", async () => {
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={vi.fn()} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文</section>",
      markdown: "# t\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    await screen.findByRole("button", { name: /复制到公众号/ });
    expect(screen.queryByRole("button", { name: /发到草稿箱/ })).toBeNull();
  });

  it("已绑公众号(有 appsecret):额外露『发到草稿箱』,带 intent=draft 进编辑器", async () => {
    const id = useWeChatStore.getState().addAccount({
      name: "我的号",
      appid: "wx123",
      appsecret: "secret-xyz",
    });
    useWeChatStore.getState().setActive(id);

    const go = vi.fn();
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={go} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文</section>",
      markdown: "# t\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    const draftBtn = await screen.findByRole("button", { name: /发到「我的号」草稿箱/ });
    fireEvent.click(draftBtn);
    expect(go).toHaveBeenCalledWith(
      "editor",
      expect.objectContaining({ articleSlug: expect.any(String), intent: "draft" }),
    );
  });

  it("内存无密钥但 appid 在服务器 configured 列表:仍露『发到草稿箱』(回访用户不降级)", async () => {
    getCredentialsMock.mockResolvedValue(["wxSrv"]);
    const id = useWeChatStore.getState().addAccount({
      name: "服务器号",
      appid: "wxSrv",
      appsecret: "", // 重开浏览器后持久化已剥离密钥
    });
    useWeChatStore.getState().setActive(id);

    const go = vi.fn();
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={go} />);

    emit({ type: "title", text: "海洋馆里的两小时" });
    emit({
      type: "done",
      html: "<section>正文</section>",
      markdown: "# t\n正文",
      report: { issues: [], warnings: [], stats: {} },
      aigc: false,
    });

    const draftBtn = await screen.findByRole("button", { name: /发到「服务器号」草稿箱/ });
    fireEvent.click(draftBtn);
    expect(go).toHaveBeenCalledWith(
      "editor",
      expect.objectContaining({ articleSlug: expect.any(String), intent: "draft" }),
    );
  });

  it("renders an error card with a connect CTA on no_provider", () => {
    const onConnect = vi.fn();
    render(
      <GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} onConnect={onConnect} />,
    );

    emit({ type: "error", code: "no_provider", message: "还差最后一步:连上 AI 才能帮你写" });
    expect(screen.getByText("还差最后一步:连上 AI 才能帮你写")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /连接 AI 写手/ }));
    expect(onConnect).toHaveBeenCalled();
  });

  it("角标不出现 COMPOSING… / IN PRESS 英文黑话", () => {
    render(<GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} />);
    expect(screen.queryByText(/COMPOSING/)).toBeNull();
    expect(screen.queryByText(/IN PRESS/)).toBeNull();
    expect(screen.getByText("生成中…")).toBeInTheDocument();
  });

  it("no_provider 时给人话引导而非『去填模型 key』", () => {
    const onConnect = vi.fn();
    render(
      <GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={() => {}} go={() => {}} onConnect={onConnect} />,
    );

    emit({ type: "error", code: "no_provider", message: "还差最后一步:连上 AI 才能帮你写" });

    expect(screen.queryByText("去填模型 key")).toBeNull();
    expect(screen.getByText(/连接 AI 写手/)).toBeInTheDocument();
    expect(screen.getByText("还差最后一步:连上 AI 才能帮你写")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /连接 AI 写手/ }));
    expect(onConnect).toHaveBeenCalled();
  });

  it("renders a retry CTA on stream_error and aborts the stream on unmount", () => {
    const onRetry = vi.fn();
    const { unmount } = render(
      <GeneratingTheater answers={ANSWERS} onDone={() => {}} onRetry={onRetry} go={() => {}} />,
    );

    act(() => {
      handlersBox.current.onError("AI 流连接失败(boom)");
    });
    expect(screen.getByText(/AI 流连接失败/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "换个说法 / 重试" }));
    expect(onRetry).toHaveBeenCalled();

    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });
});
