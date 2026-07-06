import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomeSurface from "./HomeSurface";
import { selectLiveArticles, useArticlesStore } from "@/stores/articlesStore";
import { draftKey } from "@/lib/draftKey";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.confirm = vi.fn(() => true);
  useArticlesStore.setState({
    articles: [],
    currentArticleId: null,
    loading: false,
    firstVisit: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeSurface · hero + 三路", () => {
  it("渲染 hero 标题与三条路 CTA", () => {
    render(<HomeSurface go={() => {}} />);
    expect(screen.getByText(/想写点什么呀/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /让 AI 帮我写/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /套个好看模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自己写一篇/ })).toBeInTheDocument();
  });

  it("渲染一句话意图输入框", () => {
    render(<HomeSurface go={() => {}} />);
    const input = screen.getByTestId("home-intent-input") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "text");
    expect(input.getAttribute("placeholder") || "").toContain("今天带娃去公园");
  });

  it("点击灵感胶囊会填充并聚焦输入框", async () => {
    render(<HomeSurface go={() => {}} />);
    const input = screen.getByTestId("home-intent-input") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: /带娃日记/ }));
    expect(input.value).toContain("今天带娃");
    await vi.waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it("主 CTA 让 AI 帮我写 → go('compose')", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /让 AI 帮我写/ }));
    expect(go).toHaveBeenCalledWith("compose");
  });

  it("自己写一篇 → 建空文章并进 editor", async () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /自己写一篇/ }));
    await vi.waitFor(() => {
      expect(useArticlesStore.getState().articles.length).toBe(1);
    });
    await vi.waitFor(() => {
      expect(go).toHaveBeenCalledWith(
        "editor",
        expect.objectContaining({ articleSlug: expect.any(String) }),
      );
    });
  });

  it("套个好看模板 → 用 seed 建文章(有内容)并进 editor", async () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /套个好看模板/ }));
    await vi.waitFor(() => {
      expect(useArticlesStore.getState().articles.length).toBe(1);
    });
    const created = useArticlesStore.getState().articles[0];
    expect((created as { html?: string }).html).toBeTruthy();
    await vi.waitFor(() => {
      expect(go).toHaveBeenCalledWith(
        "editor",
        expect.objectContaining({ articleSlug: expect.any(String) }),
      );
    });
  });

  it("创建忙碌时禁用模板和空白路径", () => {
    render(<HomeSurface go={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /套个好看模板/ }));
    expect(screen.getByRole("button", { name: /套个好看模板/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /自己写一篇/ })).toBeDisabled();
  });
});

describe("HomeSurface · 一句话直达 compose(H2 假门修复)", () => {
  const DRAFT_KEY = "mbeditor.compose.draft";

  it("非空输入点主 CTA → 写 compose 草稿到 sessionStorage 并 go('compose')", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.change(screen.getByTestId("home-intent-input"), {
      target: { value: "  今天带娃去公园，他第一次自己荡秋千  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /让 AI 帮我写/ }));

    const raw = sessionStorage.getItem(DRAFT_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      intent: "今天带娃去公园，他第一次自己荡秋千",
      audience: "",
      tone: "",
      voiceSample: "",
      useBrandVoice: false,
    });
    expect(go).toHaveBeenCalledWith("compose");
  });

  it("空输入点主 CTA → 直接 go('compose') 且不写草稿(行为不变)", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /让 AI 帮我写/ }));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(go).toHaveBeenCalledWith("compose");
  });

  it("输入框按 Enter(非 IME 组合态)→ 与主 CTA 同一路径", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    const input = screen.getByTestId("home-intent-input");
    fireEvent.change(input, { target: { value: "读完一本书想写闲读笔记" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const raw = sessionStorage.getItem(DRAFT_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).intent).toBe("读完一本书想写闲读笔记");
    expect(go).toHaveBeenCalledWith("compose");
  });

  it("IME 组合态按 Enter 不提交(不写草稿、不导航)", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    const input = screen.getByTestId("home-intent-input");
    fireEvent.change(input, { target: { value: "带娃日记" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it("空输入按 Enter 不提交", () => {
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    const input = screen.getByTestId("home-intent-input");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });
});

describe("HomeSurface · 空 articles → 模板墙", () => {
  it("无文章时渲染模板墙(模板缩略图),不渲染最近文章网格", () => {
    useArticlesStore.setState({ articles: [], firstVisit: true });
    render(<HomeSurface go={() => {}} />);
    // 模板墙存在
    expect(screen.getByTestId("home-template-wall")).toBeInTheDocument();
    // 不渲染文章网格
    expect(screen.queryByTestId("article-grid")).toBeNull();
  });

  it("即便 firstVisit=false,只要无文章仍渲染模板墙(判据是 articles.length 而非 firstVisit)", () => {
    useArticlesStore.setState({ articles: [], firstVisit: false });
    render(<HomeSurface go={() => {}} />);
    expect(screen.getByTestId("home-template-wall")).toBeInTheDocument();
    expect(screen.queryByTestId("article-grid")).toBeNull();
  });

  it("模板墙渲染 5 套且不含 cdrive-cleanup demo 范文(修 slice bug)", () => {
    useArticlesStore.setState({ articles: [], firstVisit: true });
    render(<HomeSurface go={() => {}} />);
    const wall = screen.getByTestId("home-template-wall");
    expect(within(wall).getAllByRole("button")).toHaveLength(5);
    expect(within(wall).queryByText(/C 盘再深呼吸/)).toBeNull();
  });
});

describe("HomeSurface · 回收站入口(可达性回归:不许再挂到孤儿 ArticleList)", () => {
  const trashedArticle = {
    id: "t1",
    title: "已删的文章",
    mode: "html" as const,
    cover: "",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    deleted_at: "2026-07-02T00:00:00.000Z",
  };

  it("有软删文章时首页显示回收站入口(带计数)", () => {
    useArticlesStore.setState({ articles: [trashedArticle], firstVisit: false });
    render(<HomeSurface go={() => {}} />);
    const toggle = screen.getByTestId("trash-toggle");
    expect(toggle).toBeInTheDocument();
    expect(screen.getByTestId("trash-count").textContent).toContain("1");
  });

  it("无软删文章时不显示回收站入口", () => {
    useArticlesStore.setState({
      articles: [{ ...trashedArticle, deleted_at: null }],
      firstVisit: false,
    });
    render(<HomeSurface go={() => {}} />);
    expect(screen.queryByTestId("trash-toggle")).toBeNull();
  });

  it("点回收站入口展开 TrashPanel(含被删文章行)", () => {
    useArticlesStore.setState({ articles: [trashedArticle], firstVisit: false });
    render(<HomeSurface go={() => {}} />);
    fireEvent.click(screen.getByTestId("trash-toggle"));
    expect(screen.getByTestId("trash-panel")).toBeInTheDocument();
    expect(screen.getByTestId("trash-row-t1")).toBeInTheDocument();
  });

  it("全部文章软删后仍能进回收站(入口在 live/空态两分支之外)", () => {
    // selectLiveArticles 为空 → 走模板墙,但回收站入口仍在
    useArticlesStore.setState({ articles: [trashedArticle], firstVisit: false });
    render(<HomeSurface go={() => {}} />);
    expect(screen.getByTestId("home-template-wall")).toBeInTheDocument();
    expect(screen.getByTestId("trash-toggle")).toBeInTheDocument();
  });

  it("删除确认文案反映软删语义(可恢复,不说无法撤销)", () => {
    useArticlesStore.setState({
      articles: [{ ...trashedArticle, deleted_at: null }],
      firstVisit: false,
    });
    render(<HomeSurface go={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /删除文章 已删的文章/ }));
    expect(screen.getByText(/移到回收站/)).toBeInTheDocument();
    expect(screen.queryByText(/无法撤销/)).toBeNull();
  });
});

describe("HomeSurface · 响应式", () => {
  it("窄屏模板墙强制单列(gridTemplateColumns:1fr)", () => {
    mockMatchMedia(true);
    useArticlesStore.setState({ articles: [], firstVisit: true });
    render(<HomeSurface go={() => {}} />);
    const grid = screen.getByTestId("home-template-grid");
    expect(grid.style.gridTemplateColumns).toBe("1fr");
  });

  it("宽屏模板墙保持 auto-fill 流式", () => {
    mockMatchMedia(false);
    useArticlesStore.setState({ articles: [], firstVisit: true });
    render(<HomeSurface go={() => {}} />);
    const grid = screen.getByTestId("home-template-grid");
    expect(grid.style.gridTemplateColumns).toContain("auto-fill");
  });

  it("hero 标题用 clamp 自适应字号", () => {
    render(<HomeSurface go={() => {}} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.style.fontSize).toContain("clamp");
  });
});

describe("HomeSurface · 有 articles → 网格", () => {
  it("有文章时渲染 ArticleGrid,且不渲染模板墙", async () => {
    await useArticlesStore.getState().createArticle("已有文章", "html");
    render(<HomeSurface go={() => {}} />);
    expect(screen.getByTestId("article-grid")).toBeInTheDocument();
    expect(screen.getByText("已有文章")).toBeInTheDocument();
    expect(screen.queryByTestId("home-template-wall")).toBeNull();
  });

  it("点文章卡片 → 进 editor", async () => {
    const created = await useArticlesStore.getState().createArticle("点我打开", "html");
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    fireEvent.click(screen.getByTestId(`article-card-${created.id}`));
    expect(go).toHaveBeenCalledWith(
      "editor",
      expect.objectContaining({ articleSlug: expect.any(String) }),
    );
  });

  it("删除文章 → 页面内确认后从网格移除", async () => {
    const created = await useArticlesStore.getState().createArticle("待删除", "html");
    render(<HomeSurface go={() => {}} />);
    const card = screen.getByTestId(`article-card-${created.id}`);
    fireEvent.click(within(card).getByTestId(`delete-article-${created.id}`));
    expect(window.confirm).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: /删除/ });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    await vi.waitFor(() => {
      // 批2 起 deleteArticle 为软删:记录留在 store(带 deleted_at),
      // 展示语义(活文章)为 0 —— 网格移除即验证的就是这层。
      expect(selectLiveArticles(useArticlesStore.getState()).length).toBe(0);
    });
  });

  it("删除文章后清掉该 id 残留的 sessionStorage 草稿(不留孤儿)", async () => {
    const created = await useArticlesStore.getState().createArticle("有草稿待删", "html");
    // 模拟编辑器留下的草稿缓存
    sessionStorage.setItem(draftKey(created.id), JSON.stringify({ title: "脏草稿" }));
    expect(sessionStorage.getItem(draftKey(created.id))).not.toBeNull();

    render(<HomeSurface go={() => {}} />);
    const card = screen.getByTestId(`article-card-${created.id}`);
    fireEvent.click(within(card).getByTestId(`delete-article-${created.id}`));
    const dialog = await screen.findByRole("dialog", { name: /删除/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    await vi.waitFor(() => {
      expect(sessionStorage.getItem(draftKey(created.id))).toBeNull();
    });
  });
});

describe("HomeSurface · 删光文章回模板墙,不弹路由", () => {
  it("删掉最后一篇文章后渲染模板墙,且不触发 go(导航)", async () => {
    const created = await useArticlesStore.getState().createArticle("最后一篇", "html");
    const go = vi.fn();
    render(<HomeSurface go={go} />);
    // 初始有网格
    expect(screen.getByTestId("article-grid")).toBeInTheDocument();
    const card = screen.getByTestId(`article-card-${created.id}`);
    fireEvent.click(within(card).getByTestId(`delete-article-${created.id}`));
    const dialog = await screen.findByRole("dialog", { name: /删除/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    // 删光后回到模板墙
    await screen.findByTestId("home-template-wall");
    expect(screen.queryByTestId("article-grid")).toBeNull();
    // 删除不应触发任何导航跳转
    expect(go).not.toHaveBeenCalled();
  });
});

describe("HomeSurface · 首帧不闪空列表", () => {
  it("有文章但 firstVisit 仍是 false(rehydrate 微任务未落地)时首帧直接渲染网格,不闪模板墙", async () => {
    // 模拟 rehydrate 已灌入 articles、但 firstVisit 异步标记还没落地的竞态:
    // 判据应只看 articles.length,首帧即渲染网格,不应短暂显示模板墙。
    await useArticlesStore.getState().createArticle("竞态文章", "html");
    useArticlesStore.setState({ firstVisit: false });
    render(<HomeSurface go={() => {}} />);
    expect(screen.getByTestId("article-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("home-template-wall")).toBeNull();
  });
});
