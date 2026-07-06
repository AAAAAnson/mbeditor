import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSurface } from "./SettingsSurface";
import { useWeChatStore } from "@/stores/wechatStore";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { code: 0, message: "ok", data: { valid: true } } }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./credentialsApi", () => ({
  getCredentials: vi.fn().mockResolvedValue([]),
  putCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./llmApi", () => ({
  getLlmConfig: vi.fn().mockResolvedValue({
    provider: "openai_compat",
    base_url: "",
    model: "",
    keyConfigured: false,
    source: "env",
  }),
  putLlmConfig: vi.fn(),
  testLlmConnection: vi.fn(),
}));

vi.mock("./voiceApi", () => ({
  getVoice: vi.fn().mockResolvedValue(null),
  learnVoice: vi.fn(),
  clearVoice: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useWeChatStore.getState().reset();
});

describe("SettingsSurface WeChat section", () => {
  async function bindThroughWizard(args: { name: string; appid: string; appsecret: string }) {
    fireEvent.click(screen.getByRole("button", { name: /添加公众号/ }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: args.name } });
    fireEvent.change(screen.getByLabelText("AppID"), { target: { value: args.appid } });
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fireEvent.change(screen.getByLabelText("AppSecret"), { target: { value: args.appsecret } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    const confirm = await screen.findByRole("button", { name: /确认绑定/ });
    fireEvent.click(confirm);
  }

  it("binds a new account through the wizard (test-first) and persists to store", async () => {
    render(<SettingsSurface />);
    await bindThroughWizard({ name: "MB 科技", appid: "wxa7b6e6test", appsecret: "secret123" });

    await waitFor(() => {
      expect(useWeChatStore.getState().accounts).toHaveLength(1);
    });
    expect(useWeChatStore.getState().accounts[0].appid).toBe("wxa7b6e6test");
  });

  it("tests the connection before binding and uploads the secret to the server", async () => {
    const { default: api } = await import("@/lib/api");
    const { putCredential } = await import("./credentialsApi");
    render(<SettingsSurface />);
    await bindThroughWizard({ name: "MB", appid: "wxTEST", appsecret: "shh" });

    expect((api.post as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "/wechat/test-connection",
      { appid: "wxTEST", appsecret: "shh" },
    );
    await waitFor(() => {
      expect(putCredential as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("wxTEST", "shh");
    });
  });

  it("does not bind (no store write / no putCredential) when the connection test fails", async () => {
    const { default: api } = await import("@/lib/api");
    const { putCredential } = await import("./credentialsApi");
    (api.post as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("bad secret"));

    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /添加公众号/ }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("AppID"), { target: { value: "wxX" } });
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fireEvent.change(screen.getByLabelText("AppSecret"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() => expect(screen.getByText(/连接失败/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /确认绑定/ })).toBeNull();
    expect(useWeChatStore.getState().accounts).toHaveLength(0);
    expect(putCredential as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("shows a 密钥已保存 badge for server-persisted accounts", async () => {
    const { getCredentials } = await import("./credentialsApi");
    (getCredentials as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(["wxSaved"]);
    useWeChatStore.getState().addAccount({ name: "Saved", appid: "wxSaved", appsecret: "" });

    render(<SettingsSurface />);
    await waitFor(() => {
      expect(screen.getByText(/密钥已保存/)).toBeInTheDocument();
    });
  });

  it("shows a 会话临时 badge for in-memory-only secrets", async () => {
    useWeChatStore.getState().addAccount({ name: "Mem", appid: "wxMem", appsecret: "live" });

    render(<SettingsSurface />);
    await waitFor(() => {
      expect(screen.getByText(/会话临时/)).toBeInTheDocument();
    });
  });

  it("maps all three WeChat credential states to DS Tags", async () => {
    const { getCredentials } = await import("./credentialsApi");
    (getCredentials as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(["wxSaved"]);
    useWeChatStore.getState().addAccount({ name: "Saved", appid: "wxSaved", appsecret: "" });
    useWeChatStore.getState().addAccount({ name: "Session", appid: "wxSession", appsecret: "live" });
    useWeChatStore.getState().addAccount({ name: "None", appid: "wxNone", appsecret: "" });

    render(<SettingsSurface />);

    await waitFor(() => {
      expect(screen.getByText("密钥已保存").closest(".mb-tag")).toHaveClass("tone-success");
    });
    expect(screen.getByText("会话临时").closest(".mb-tag")).toHaveClass("tone-warning");
    expect(screen.getByText("未配置密钥").closest(".mb-tag")).toHaveClass("tone-neutral");
  });

  it("renders 图床 nav entry and section", async () => {
    render(<SettingsSurface go={vi.fn()} />);
    const navBtn = screen.getByRole("button", { name: "图床" });
    fireEvent.click(navBtn);
    await waitFor(() => {
      expect(screen.getByTestId("imagehost-section")).toBeInTheDocument();
    });
  });
});

describe("SettingsSurface Warm shell", () => {
  it("renders desktop Warm shell geometry and active nav color", () => {
    mockMatchMedia(false);
    render(<SettingsSurface go={vi.fn()} />);

    expect(screen.getByTestId("settings-surface")).toBeInTheDocument();
    expect(screen.getByTestId("settings-nav").style.width).toBe("256px");
    expect(screen.getByTestId("settings-content-inner").style.maxWidth).toBe("760px");

    // 批5:nav 叶子改套 .settings-navitem 专属类(承接 all:unset 击穿);
    // 选中态由 .is-active 类承载(orange-50 底 + orange-700 字),不再走行内 style。
    const active = screen.getByRole("button", { name: "公众号" });
    expect(active).toHaveClass("settings-navitem");
    expect(active).toHaveClass("is-active");
    const inactive = screen.getByRole("button", { name: "图床" });
    expect(inactive).toHaveClass("settings-navitem");
    expect(inactive).not.toHaveClass("is-active");
  });
});

describe("SettingsSurface 发布服务器/网关 section", () => {
  const STORED_EFFECTIVE = {
    transport: "https-gateway",
    enabled: true,
    base: "https://gw.example:8443",
    tokenConfigured: true,
    caConfigured: true,
    caFingerprint: "SHA256:AB:CD:EF",
    source: "stored",
  };

  it("never prefills token / PEM inputs even when already configured (write-only)", async () => {
    const { default: api } = await import("@/lib/api");
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { code: 0, message: "ok", data: STORED_EFFECTIVE },
    });

    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: "发布服务器" }));

    await waitFor(() => {
      expect(screen.getByLabelText("令牌")).toBeInTheDocument();
    });

    // Configured secrets must never be echoed back into the inputs.
    expect((screen.getByLabelText("令牌") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("证书 PEM") as HTMLTextAreaElement).value).toBe("");
    // A "configured" hint (fingerprint) shows, but never the secret body.
    expect(screen.getByText(/已配置/)).toBeInTheDocument();
    expect(screen.queryByText(/BEGIN CERTIFICATE/)).not.toBeInTheDocument();
  });

  it("sends token/caPem as null when left blank on save (keep existing)", async () => {
    const { default: api } = await import("@/lib/api");
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { code: 0, message: "ok", data: STORED_EFFECTIVE },
    });
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { code: 0, message: "ok", data: STORED_EFFECTIVE },
    });

    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: "发布服务器" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /保存/ })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(api.put as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        "/settings/gateway",
        expect.objectContaining({
          enabled: true,
          transport: "https-gateway",
          base: "https://gw.example:8443",
          token: null,
          caPem: null,
        }),
      );
    });
  });
});

describe("SettingsSurface guards & deep-link", () => {
  it("opens the section named by initialSection", async () => {
    render(<SettingsSurface initialSection="aiengine" />);
    await waitFor(() => {
      expect(screen.getByTestId("ai-engine-section")).toBeInTheDocument();
    });
  });

  it("falls back to the 公众号 section when initialSection is unknown/missing", () => {
    render(<SettingsSurface />);
    expect(screen.getByRole("heading", { name: "公众号绑定" })).toBeInTheDocument();
  });
});

describe("SettingsSurface 关于 section", () => {
  it("renders a proper 开源/许可 entry (not just a footer)", () => {
    render(<SettingsSurface go={vi.fn()} initialSection="about" />);
    expect(screen.getByText("开源 / 许可")).toBeInTheDocument();
    expect(screen.getByText(/MIT 许可证/)).toBeInTheDocument();
  });
});

describe("SettingsSurface 界面模式 switch", () => {
  it("toggles uiMode to pro via the appearance 界面模式 control", async () => {
    const { useUIStore } = await import("@/stores/uiStore");
    useUIStore.setState({ uiMode: "simple" });

    render(<SettingsSurface initialSection="appearance" />);
    fireEvent.click(screen.getByRole("button", { name: /专业模式/ }));

    await waitFor(() => {
      expect(useUIStore.getState().uiMode).toBe("pro");
    });

    fireEvent.click(screen.getByRole("button", { name: /简单模式/ }));
    await waitFor(() => {
      expect(useUIStore.getState().uiMode).toBe("simple");
    });
  });

  it("外观抽屉提供 暖光/暖夜 两个主题", () => {
    render(<SettingsSurface go={vi.fn()} initialSection="appearance" />);
    for (const name of [/暖光/, /暖夜/]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("外观抽屉聚合 界面模式 + 字体族 + 编辑器默认模式控件", () => {
    render(<SettingsSurface go={vi.fn()} initialSection="appearance" />);
    expect(screen.getByRole("heading", { name: "外观与模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /简单模式/ })).toBeInTheDocument(); // 界面模式
    expect(screen.getByText("字体")).toBeInTheDocument(); // 字体族(新增)
    expect(screen.getByRole("button", { name: /圆润/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /人文衬线/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /系统/ })).toBeInTheDocument();
    // 原 editor section 并入,DS 换装后行 label 改设计稿文案(默认模式→默认编辑格式 / 字体大小→编辑器字号)。
    expect(screen.getByText("默认编辑格式")).toBeInTheDocument();
    expect(screen.getByText("编辑器字号")).toBeInTheDocument();
    // 自动保存改 DS Switch(role=switch),格式改 DS Segmented(roleType=buttons → 各项 aria-pressed)。
    expect(screen.getByRole("switch", { name: "自动保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HTML" })).toHaveAttribute("aria-pressed");
  });

  it("字体族选择切换 fontFamily", async () => {
    const { useUIStore } = await import("@/stores/uiStore");
    useUIStore.setState({ fontFamily: "rounded" });
    render(<SettingsSurface go={vi.fn()} initialSection="appearance" />);
    fireEvent.click(screen.getByRole("button", { name: /人文衬线/ }));
    await waitFor(() => {
      expect(useUIStore.getState().fontFamily).toBe("serif");
    });
  });

  it("deep-link section=editor 兜底落外观(editor 控件已并入)", () => {
    render(<SettingsSurface go={vi.fn()} initialSection="editor" />);
    expect(screen.getByText("字体")).toBeInTheDocument();
  });

  it("shows the pro-capabilities card so pro features are discoverable", () => {
    render(<SettingsSurface initialSection="appearance" />);
    // Each pro feature is listed verbatim in the discoverability card.
    expect(screen.getByText(/代码抽屉（HTML \/ CSS \/ JS）/)).toBeInTheDocument();
    expect(screen.getByText(/三栏编辑 \+ 大纲/)).toBeInTheDocument();
    expect(screen.getByText(/SVG 交互动效编辑/)).toBeInTheDocument();
    expect(screen.getByText(/公众号兼容性校验/)).toBeInTheDocument();
  });

  it("uses SVG icons (not emoji glyphs) across the appearance panel", () => {
    const { container } = render(<SettingsSurface initialSection="appearance" />);
    // No pictographic emoji or symbol glyphs leak into rendered text.
    expect(container.textContent || "").not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2728}✅✓▦✦✧]|️/u,
    );
    // Mode option labels read as clean prose now.
    expect(screen.getByRole("button", { name: /简单模式/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /专业模式/ })).toBeInTheDocument();
    // The pro-capabilities card draws inline SVG icons for each feature row.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });
});

describe("SettingsSurface AI 引擎 / 音色档案 nav", () => {
  it("renders AI 引擎 nav entry and section", async () => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: "AI 引擎" }));
    await waitFor(() => {
      expect(screen.getByTestId("ai-engine-section")).toBeInTheDocument();
    });
  });

  it("renders 音色档案 nav entry and section", async () => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: "音色档案" }));
    await waitFor(() => {
      expect(screen.getByTestId("brand-voice-section")).toBeInTheDocument();
    });
  });
});

describe("SettingsSurface 4 分组导航", () => {
  it("renders the four nav groups 写作/发布/外观/关于", () => {
    render(<SettingsSurface go={vi.fn()} />);
    for (const label of ["写作", "发布", "外观", "关于"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("reaches 外观 (appearance) — single-section group is itself clickable", async () => {
    render(<SettingsSurface go={vi.fn()} />);
    // 批5:叶子文案「外观」→「外观与模式」(key=appearance 不变)。
    fireEvent.click(screen.getByRole("button", { name: "外观与模式" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /简单模式/ })).toBeInTheDocument();
    });
  });

  it("reaches 关于 (about) — single-section group is itself clickable", async () => {
    render(<SettingsSurface go={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "关于" }));
    await waitFor(() => {
      expect(screen.getByText("项目地址")).toBeInTheDocument();
    });
  });
});

describe("SettingsSurface nav <600px accordion", () => {
  it("窄屏:渲染叶子级单开手风琴", () => {
    mockMatchMedia(true);
    render(<SettingsSurface go={vi.fn()} />);
    expect(screen.getByTestId("settings-mobile-accordion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 引擎" })).toHaveAttribute("aria-expanded");
  });

  it("窄屏:点叶子展开对应 section,再点另一个叶子会收起前一个", async () => {
    mockMatchMedia(true);
    render(<SettingsSurface go={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 引擎" }));
    expect(await screen.findByTestId("ai-engine-section")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "发布服务器" }));
    await waitFor(() => {
      expect(screen.queryByTestId("ai-engine-section")).toBeNull();
    });
    expect(screen.getByText("网关地址")).toBeInTheDocument();
  });

  it("窄屏:叶子手风琴标题触控 ≥54px", () => {
    mockMatchMedia(true);
    render(<SettingsSurface go={vi.fn()} />);
    const header = screen.getByRole("button", { name: "AI 引擎" });
    expect(parseInt(header.style.minHeight || "0", 10)).toBeGreaterThanOrEqual(54);
  });

  it("桌面态(默认)仍 4 分组全展开 + deep-link 不变", () => {
    render(<SettingsSurface go={vi.fn()} initialSection="aiengine" />);
    for (const g of ["写作", "发布", "外观", "关于"]) {
      expect(screen.getAllByText(g).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId("ai-engine-section")).toBeInTheDocument();
  });
});
