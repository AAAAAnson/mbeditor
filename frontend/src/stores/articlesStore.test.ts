// frontend/src/stores/articlesStore.test.ts
// 批2:articlesStore 后端化(写穿 + pendingSync 补同步 + 一次性迁移 + 软删)。
// @/lib/articlesApi 已在 test-setup 全局 mock,这里按测试逐个驱动其实现。
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as articlesApi from "@/lib/articlesApi";
import type { ArticleFull, ArticleSummary } from "@/types";
import { useToastStore } from "./toastStore";
import { useHealthStore } from "./healthStore";
import {
  selectLiveArticles,
  selectTrashedArticles,
  useArticlesStore,
} from "./articlesStore";

const mocked = {
  listArticles: vi.mocked(articlesApi.listArticles),
  getArticle: vi.mocked(articlesApi.getArticle),
  putArticle: vi.mocked(articlesApi.putArticle),
  deleteArticle: vi.mocked(articlesApi.deleteArticle),
  restoreArticle: vi.mocked(articlesApi.restoreArticle),
  purgeArticle: vi.mocked(articlesApi.purgeArticle),
};

function full(id: string, title: string, updated: string, html = "<p>正文</p>"): ArticleFull {
  return {
    id,
    title,
    mode: "html",
    cover: "",
    created_at: updated,
    updated_at: updated,
    html,
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

function summary(id: string, title: string, updated: string, deleted: string | null = null): ArticleSummary {
  return {
    id,
    title,
    mode: "html",
    cover: "",
    created_at: updated,
    updated_at: updated,
    deleted_at: deleted,
  };
}

/** 等到指定 id 不在 pendingSync(写穿完成)。 */
async function waitSynced(id: string) {
  await vi.waitFor(() => {
    expect(useArticlesStore.getState().pendingSync).not.toContain(id);
  });
}

beforeEach(() => {
  localStorage.clear();
  useToastStore.setState({ toasts: [] });
  useArticlesStore.setState({
    articles: [],
    currentArticleId: null,
    loading: false,
    pendingSync: [],
    lastSyncedAt: {},
  });
  vi.clearAllMocks();
  // 恢复默认实现(等价「后端一切正常」):PUT echo 回执、列表空。
  mocked.listArticles.mockImplementation(async () => []);
  mocked.getArticle.mockImplementation(async () => {
    throw new articlesApi.ArticlesApiError("文章不存在", 404);
  });
  mocked.putArticle.mockImplementation(async (article) => ({
    article: { ...article, deleted_at: null },
    conflict_rev_id: null,
  }));
  mocked.deleteArticle.mockImplementation(async () => undefined);
  mocked.restoreArticle.mockImplementation(
    async (id) => ({ ...full(id, "restored", "2026-07-01T00:00:00.000Z"), deleted_at: null }),
  );
  mocked.purgeArticle.mockImplementation(async () => undefined);
  // 迁移默认视为已完成(专测迁移的用例自行清掉)
  localStorage.setItem("mbeditor.articles.migrated", "1");
});

describe("articlesStore 本地语义(消费方零改)", () => {
  it("createArticle returns a new article with a generated id", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    expect(article.id).toMatch(/^[a-z0-9]{12}$/);
    expect(article.title).toBe("Hello");
    expect(useArticlesStore.getState().articles).toHaveLength(1);
  });

  it("时间戳钉格式:created_at/updated_at 是 ISO8601 UTC Z(后端 LWW 依赖字典序)", async () => {
    const article = await useArticlesStore.getState().createArticle("格式", "html");
    const isoZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(article.created_at).toMatch(isoZ);
    expect(article.updated_at).toMatch(isoZ);
    const updated = await useArticlesStore.getState().updateArticle(article.id, { html: "<p>x</p>" });
    expect(updated.updated_at).toMatch(isoZ);
  });

  it("updateArticle merges fields and updates updated_at", async () => {
    const article = await useArticlesStore.getState().createArticle("Hello", "html");
    const before = article.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await useArticlesStore.getState().updateArticle(article.id, { html: "<p>hi</p>" });
    expect(updated.html).toBe("<p>hi</p>");
    expect(updated.updated_at).not.toBe(before);
  });

  it("persists to localStorage under mbeditor.articles(含 pendingSync/lastSyncedAt)", async () => {
    const a = await useArticlesStore.getState().createArticle("Persist", "html");
    await waitSynced(a.id);
    const raw = localStorage.getItem("mbeditor.articles");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.articles[0].title).toBe("Persist");
    expect(parsed.state.pendingSync).toEqual([]);
    expect(parsed.state.lastSyncedAt[a.id]).toBe(a.updated_at);
  });
});

describe("写穿后端 + pendingSync", () => {
  it("createArticle 推 PUT(base=null),成功后记 lastSyncedAt=服务端回执 updated_at", async () => {
    const a = await useArticlesStore.getState().createArticle("推后端", "html");
    await waitSynced(a.id);
    expect(mocked.putArticle).toHaveBeenCalledTimes(1);
    const [sent, base] = mocked.putArticle.mock.calls[0];
    expect(sent.id).toBe(a.id);
    expect(base).toBeNull();
    expect(useArticlesStore.getState().lastSyncedAt[a.id]).toBe(a.updated_at);
  });

  it("updateArticle 的 base_updated_at 取 lastSyncedAt[id]", async () => {
    const a = await useArticlesStore.getState().createArticle("带base", "html");
    await waitSynced(a.id);
    const synced = useArticlesStore.getState().lastSyncedAt[a.id];
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>2</p>" });
    await vi.waitFor(() => expect(mocked.putArticle).toHaveBeenCalledTimes(2));
    expect(mocked.putArticle.mock.calls[1][1]).toBe(synced);
  });

  it("PUT 失败 → id 入 pendingSync 且本地内容不丢", async () => {
    mocked.putArticle.mockRejectedValue(new Error("网络连接失败"));
    const a = await useArticlesStore.getState().createArticle("失败离线", "html");
    await vi.waitFor(() => {
      expect(useArticlesStore.getState().pendingSync).toContain(a.id);
    });
    expect(useArticlesStore.getState().articles.find((x) => x.id === a.id)).toBeTruthy();
    expect(useArticlesStore.getState().lastSyncedAt[a.id]).toBeUndefined();
  });

  it("syncPending 逐篇带 base_updated_at 重推,成功后清 pendingSync", async () => {
    mocked.putArticle.mockRejectedValue(new Error("offline"));
    const a = await useArticlesStore.getState().createArticle("待补", "html");
    await vi.waitFor(() => expect(useArticlesStore.getState().pendingSync).toContain(a.id));
    mocked.putArticle.mockImplementation(async (article) => ({
      article: { ...article, deleted_at: null },
      conflict_rev_id: null,
    }));
    await useArticlesStore.getState().syncPending();
    expect(useArticlesStore.getState().pendingSync).toEqual([]);
    const lastCall = mocked.putArticle.mock.calls.at(-1)!;
    expect(lastCall[0].id).toBe(a.id);
    expect(lastCall[1]).toBeNull(); // 从未同步过 → base=null
    expect(useArticlesStore.getState().lastSyncedAt[a.id]).toBe(a.updated_at);
  });

  it("conflict_rev_id 非空 → toast「另一台设备的版本已存入历史版本」", async () => {
    const a = await useArticlesStore.getState().createArticle("冲突", "html");
    await waitSynced(a.id);
    mocked.putArticle.mockImplementation(async (article) => ({
      article: { ...article, deleted_at: null },
      conflict_rev_id: "rev42",
    }));
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>冲</p>" });
    await vi.waitFor(() => {
      expect(
        useToastStore.getState().toasts.some((t) => t.message.includes("另一台设备的版本已存入历史版本")),
      ).toBe(true);
    });
  });

  it("healthStore 红转绿 → 自动 syncPending", async () => {
    mocked.putArticle.mockRejectedValue(new Error("offline"));
    const a = await useArticlesStore.getState().createArticle("红转绿", "html");
    await vi.waitFor(() => expect(useArticlesStore.getState().pendingSync).toContain(a.id));
    mocked.putArticle.mockImplementation(async (article) => ({
      article: { ...article, deleted_at: null },
      conflict_rev_id: null,
    }));
    useHealthStore.setState({ status: "down" });
    useHealthStore.setState({ status: "ok" });
    await waitSynced(a.id);
    expect(useArticlesStore.getState().lastSyncedAt[a.id]).toBe(a.updated_at);
  });
});

describe("软删除 / 回收站", () => {
  it("deleteArticle 改软删:本地标 deleted_at、DELETE 后端、live 选择器不含", async () => {
    const a = await useArticlesStore.getState().createArticle("软删", "html");
    await waitSynced(a.id);
    await useArticlesStore.getState().deleteArticle(a.id);
    const state = useArticlesStore.getState();
    const kept = state.articles.find((x) => x.id === a.id);
    expect(kept).toBeTruthy();
    expect(kept!.deleted_at).toMatch(/Z$/);
    expect(state.currentArticleId).toBeNull();
    expect(selectLiveArticles(state)).toHaveLength(0);
    expect(selectTrashedArticles(state)).toHaveLength(1);
    await waitSynced(a.id);
    expect(mocked.deleteArticle).toHaveBeenCalledWith(a.id);
  });

  it("restoreFromTrash 清 deleted_at;服务端仍软删(PUT 回执带 deleted_at)→ 补 restore;失败入 pendingSync", async () => {
    const a = await useArticlesStore.getState().createArticle("恢复", "html");
    await waitSynced(a.id);
    await useArticlesStore.getState().deleteArticle(a.id);
    await waitSynced(a.id);
    // 服务端此刻是软删态:PUT 不冲 deleted_at,回执仍带 → 走补 restore 分支
    mocked.putArticle.mockImplementation(async (article) => ({
      article: { ...article, deleted_at: "2026-01-05T00:00:00.000Z" },
      conflict_rev_id: null,
    }));
    mocked.restoreArticle.mockRejectedValue(new Error("offline"));
    await useArticlesStore.getState().restoreFromTrash(a.id);
    const state = useArticlesStore.getState();
    expect(state.articles.find((x) => x.id === a.id)!.deleted_at).toBeNull();
    expect(selectLiveArticles(state)).toHaveLength(1);
    await vi.waitFor(() => {
      expect(mocked.restoreArticle).toHaveBeenCalledWith(a.id);
    });
    expect(useArticlesStore.getState().pendingSync).toContain(a.id);
    // 网络恢复:重放成功后出账
    mocked.restoreArticle.mockImplementation(
      async (id) => ({ ...full(id, "restored", "2026-07-01T00:00:00.000Z"), deleted_at: null }),
    );
    await useArticlesStore.getState().syncPending();
    expect(useArticlesStore.getState().pendingSync).toEqual([]);
  });

  it("purgeFromTrash 本地移除 + purge 后端 + 清 lastSyncedAt", async () => {
    const a = await useArticlesStore.getState().createArticle("彻底删", "html");
    await waitSynced(a.id);
    await useArticlesStore.getState().deleteArticle(a.id);
    await waitSynced(a.id);
    await useArticlesStore.getState().purgeFromTrash(a.id);
    await waitSynced(a.id);
    const state = useArticlesStore.getState();
    expect(state.articles.find((x) => x.id === a.id)).toBeUndefined();
    expect(state.lastSyncedAt[a.id]).toBeUndefined();
    expect(mocked.purgeArticle).toHaveBeenCalledWith(a.id);
  });

  it("purge 失败留在 pendingSync,syncPending 重放 purge", async () => {
    const a = await useArticlesStore.getState().createArticle("purge重放", "html");
    await waitSynced(a.id);
    mocked.purgeArticle.mockRejectedValue(new Error("offline"));
    await useArticlesStore.getState().purgeFromTrash(a.id);
    await vi.waitFor(() => expect(useArticlesStore.getState().pendingSync).toContain(a.id));
    mocked.purgeArticle.mockImplementation(async () => undefined);
    await useArticlesStore.getState().syncPending();
    expect(useArticlesStore.getState().pendingSync).toEqual([]);
    expect(mocked.purgeArticle).toHaveBeenLastCalledWith(a.id);
  });
});

describe("fetchArticles:真拉后端 + merge", () => {
  it("merge:pendingSync 本地为准;其余后端为准;后端有本地无→加;本地有后端无→删", async () => {
    useArticlesStore.setState({
      articles: [
        full("p1", "本地待推", "2026-01-01T00:00:00.000Z"),
        full("l1", "本地孤儿", "2026-01-02T00:00:00.000Z"),
        full("l2", "同版本", "2026-01-03T00:00:00.000Z", "<p>大字段</p>"),
        full("l3", "已过期", "2026-01-01T00:00:00.000Z"),
      ],
      pendingSync: ["p1"],
      lastSyncedAt: { l1: "2026-01-02T00:00:00.000Z" },
    });
    mocked.listArticles.mockResolvedValue([
      summary("p1", "服务端p1", "2026-02-01T00:00:00.000Z"),
      summary("s1", "服务端新增", "2026-02-02T00:00:00.000Z"),
      summary("l2", "同版本改名", "2026-01-03T00:00:00.000Z"),
      summary("l3", "服务端更新", "2026-03-01T00:00:00.000Z"),
    ]);
    await useArticlesStore.getState().fetchArticles();
    const state = useArticlesStore.getState();
    const byId = new Map(state.articles.map((x) => [x.id, x]));
    // pendingSync 的以本地为准
    expect(byId.get("p1")!.title).toBe("本地待推");
    // 本地有后端无且不在 pendingSync → 移除
    expect(byId.has("l1")).toBe(false);
    expect(state.lastSyncedAt.l1).toBeUndefined();
    // 后端有本地无 → 加入(摘要)
    expect(byId.get("s1")!.title).toBe("服务端新增");
    // 同 updated_at:摘要字段跟后端,大字段(html)保留
    const l2 = byId.get("l2") as ArticleFull;
    expect(l2.title).toBe("同版本改名");
    expect(l2.html).toBe("<p>大字段</p>");
    // 后端更新:以后端摘要为准,大字段丢弃待惰性拉
    const l3 = byId.get("l3")!;
    expect(l3.updated_at).toBe("2026-03-01T00:00:00.000Z");
    expect((l3 as ArticleFull).html).toBeUndefined();
    // 后端为准的条目记 lastSyncedAt
    expect(state.lastSyncedAt.s1).toBe("2026-02-02T00:00:00.000Z");
    expect(state.lastSyncedAt.l2).toBe("2026-01-03T00:00:00.000Z");
  });

  it("fetch 完成后自动 flush pendingSync", async () => {
    useArticlesStore.setState({
      articles: [full("p1", "待推", "2026-01-01T00:00:00.000Z")],
      pendingSync: ["p1"],
    });
    mocked.listArticles.mockResolvedValue([]);
    await useArticlesStore.getState().fetchArticles();
    await vi.waitFor(() => {
      expect(useArticlesStore.getState().pendingSync).toEqual([]);
    });
    expect(mocked.putArticle).toHaveBeenCalled();
  });

  it("后端 500 时本地缓存不丢", async () => {
    useArticlesStore.setState({ articles: [full("keep", "还在", "2026-01-01T00:00:00.000Z")] });
    mocked.listArticles.mockRejectedValue(new Error("服务器开小差了"));
    await useArticlesStore.getState().fetchArticles();
    const state = useArticlesStore.getState();
    expect(state.articles).toHaveLength(1);
    expect(state.loading).toBe(false);
  });

  it("软删文章从后端带 deleted_at 回来,live/trash 选择器分流", async () => {
    mocked.listArticles.mockResolvedValue([
      summary("live1", "活着", "2026-01-01T00:00:00.000Z"),
      summary("dead1", "已删", "2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"),
    ]);
    await useArticlesStore.getState().fetchArticles();
    const state = useArticlesStore.getState();
    expect(selectLiveArticles(state).map((x) => x.id)).toEqual(["live1"]);
    expect(selectTrashedArticles(state).map((x) => x.id)).toEqual(["dead1"]);
  });
});

describe("一次性迁移", () => {
  it("未置标志且本地有文章 → 逐篇 PUT(base=null)→ 置标志;再跑不重迁", async () => {
    localStorage.removeItem("mbeditor.articles.migrated");
    const a1 = full("m1", "迁移一", "2026-01-01T00:00:00.000Z");
    const a2 = full("m2", "迁移二", "2026-01-02T00:00:00.000Z");
    useArticlesStore.setState({ articles: [a1, a2] });
    mocked.listArticles.mockResolvedValue([
      summary("m1", "迁移一", a1.updated_at),
      summary("m2", "迁移二", a2.updated_at),
    ]);
    await useArticlesStore.getState().fetchArticles();
    expect(mocked.putArticle).toHaveBeenCalledTimes(2);
    expect(mocked.putArticle.mock.calls.every((c) => c[1] === null)).toBe(true);
    expect(localStorage.getItem("mbeditor.articles.migrated")).toBe("1");
    // 迁移后本地全文不丢(同 updated_at 保大字段)
    const m1 = useArticlesStore.getState().articles.find((x) => x.id === "m1") as ArticleFull;
    expect(m1.html).toBe("<p>正文</p>");
    // 幂等:第二次 fetch 不再迁移
    await useArticlesStore.getState().fetchArticles();
    expect(mocked.putArticle).toHaveBeenCalledTimes(2);
  });

  it("迁移某篇失败 → 该篇入 pendingSync 且标志不置(下次重试)", async () => {
    localStorage.removeItem("mbeditor.articles.migrated");
    useArticlesStore.setState({ articles: [full("mf", "迁移失败", "2026-01-01T00:00:00.000Z")] });
    mocked.putArticle.mockRejectedValue(new Error("offline"));
    mocked.listArticles.mockResolvedValue([]);
    await useArticlesStore.getState().fetchArticles();
    expect(useArticlesStore.getState().pendingSync).toContain("mf");
    expect(localStorage.getItem("mbeditor.articles.migrated")).toBeNull();
    // pendingSync 保护:merge 不把它删掉
    expect(useArticlesStore.getState().articles.find((x) => x.id === "mf")).toBeTruthy();
  });
});

describe("质量修复批:串行链 / 降级保护 / 迁移重试 / 毒丸出账", () => {
  it("同篇快速连续两次 update:推送串行,不并发 PUT、不产生假冲突", async () => {
    const a = await useArticlesStore.getState().createArticle("串行", "html");
    await waitSynced(a.id);
    const baselineCalls = mocked.putArticle.mock.calls.length;
    // 第一发 PUT 挂住,期间第二次 update 落地
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    let inFlight = 0;
    let maxInFlight = 0;
    mocked.putArticle.mockImplementation(async (article) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (mocked.putArticle.mock.calls.length === baselineCalls + 1) await gate;
      inFlight -= 1;
      return { article: { ...article, deleted_at: null }, conflict_rev_id: null };
    });
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>v1</p>" });
    // 等第一发进入 in-flight,再落第二笔编辑
    await vi.waitFor(() => expect(mocked.putArticle.mock.calls.length).toBe(baselineCalls + 1));
    await useArticlesStore.getState().updateArticle(a.id, { html: "<p>v2</p>" });
    releaseFirst();
    await waitSynced(a.id);
    await vi.waitFor(() =>
      expect(mocked.putArticle.mock.calls.length).toBeGreaterThanOrEqual(baselineCalls + 2),
    );
    expect(maxInFlight).toBe(1); // 从未并发
    // 第二发读的是最新内容,base 是第一发回执(不为 null → 无假冲突)
    const second = mocked.putArticle.mock.calls[baselineCalls + 1];
    expect(second[0].html).toBe("<p>v2</p>");
    expect(second[1]).not.toBeNull();
  });

  it("同篇同 tick 连续两次 update:排队合并成一次 PUT,推的是最新内容", async () => {
    const a = await useArticlesStore.getState().createArticle("合并", "html");
    await waitSynced(a.id);
    const baselineCalls = mocked.putArticle.mock.calls.length;
    void useArticlesStore.getState().updateArticle(a.id, { html: "<p>快1</p>" });
    void useArticlesStore.getState().updateArticle(a.id, { html: "<p>快2</p>" });
    await waitSynced(a.id);
    expect(mocked.putArticle.mock.calls.length).toBe(baselineCalls + 1);
    expect(mocked.putArticle.mock.calls[baselineCalls][0].html).toBe("<p>快2</p>");
  });

  it("降级打开(getArticle 失败)后保存:PUT 强制 base=null(后端会先落 conflict 快照)", async () => {
    useArticlesStore.setState({
      articles: [summary("dg1", "降级篇", "2026-01-01T00:00:00.000Z")],
      lastSyncedAt: { dg1: "2026-01-01T00:00:00.000Z" },
    });
    mocked.getArticle.mockRejectedValue(new Error("网络连接失败"));
    const got = await useArticlesStore.getState().fetchArticle("dg1");
    expect(got.html).toBe(""); // 降级空文
    await useArticlesStore.getState().updateArticle("dg1", { html: "<p>盲改</p>" });
    await waitSynced("dg1");
    const call = mocked.putArticle.mock.calls.at(-1)!;
    expect(call[0].id).toBe("dg1");
    expect(call[1]).toBeNull(); // 有 lastSyncedAt 也强制 null
    // 推送成功即摘除降级标记:下一次保存恢复正常 base
    await useArticlesStore.getState().updateArticle("dg1", { html: "<p>再改</p>" });
    await waitSynced("dg1");
    expect(mocked.putArticle.mock.calls.at(-1)![1]).not.toBeNull();
  });

  it("迁移部分失败重试:已成功的篇用 lastSyncedAt 作 base,不再刷垃圾 conflict", async () => {
    localStorage.removeItem("mbeditor.articles.migrated");
    const m1 = full("mr1", "成功篇", "2026-01-01T00:00:00.000Z");
    const m2 = full("mr2", "失败篇", "2026-01-02T00:00:00.000Z");
    useArticlesStore.setState({ articles: [m1, m2] });
    // 服务端列表反映迁移结果:mr1 已上去(mr2 失败不在)
    mocked.listArticles.mockResolvedValue([summary("mr1", "成功篇", m1.updated_at)]);
    mocked.putArticle.mockImplementation(async (article) => {
      if (article.id === "mr2") throw new Error("offline");
      return { article: { ...article, deleted_at: null }, conflict_rev_id: null };
    });
    await useArticlesStore.getState().fetchArticles();
    expect(localStorage.getItem("mbeditor.articles.migrated")).toBeNull();
    // 修好后端,第二次 fetch 重跑迁移
    mocked.putArticle.mockImplementation(async (article) => ({
      article: { ...article, deleted_at: null },
      conflict_rev_id: null,
    }));
    await useArticlesStore.getState().fetchArticles();
    expect(localStorage.getItem("mbeditor.articles.migrated")).toBe("1");
    // mr1 的第二次迁移 PUT:base=首轮回执(≠null),不再触发 conflict
    const mr1Calls = mocked.putArticle.mock.calls.filter((c) => c[0].id === "mr1");
    expect(mr1Calls.length).toBeGreaterThanOrEqual(2);
    expect(mr1Calls.at(-1)![1]).toBe(m1.updated_at);
  });

  it("永久 4xx(400)→ 出账不再无限重推 + toast 明示保留本机", async () => {
    mocked.putArticle.mockRejectedValue(new articlesApi.ArticlesApiError("非法文章 id", 400));
    const a = await useArticlesStore.getState().createArticle("毒丸", "html");
    await vi.waitFor(() => {
      expect(
        useToastStore.getState().toasts.some((t) => t.message.includes("已保留在本机")),
      ).toBe(true);
    });
    expect(useArticlesStore.getState().pendingSync).not.toContain(a.id);
    // 本地副本仍在
    expect(useArticlesStore.getState().articles.find((x) => x.id === a.id)).toBeTruthy();
  });

  it("软删回放 404 且本地仅摘要:无物可回放,视为已清(不永久卡死)", async () => {
    useArticlesStore.setState({
      articles: [summary("gone1", "只剩摘要", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z")],
      pendingSync: ["gone1"],
    });
    mocked.deleteArticle.mockRejectedValue(new articlesApi.ArticlesApiError("文章不存在", 404));
    await useArticlesStore.getState().syncPending();
    expect(useArticlesStore.getState().pendingSync).toEqual([]);
  });
});

describe("fetchArticle 惰性拉全文", () => {
  it("本地已有全文 → 直接返回,不打后端", async () => {
    const a = await useArticlesStore.getState().createArticle("本地全", "html");
    await waitSynced(a.id);
    mocked.getArticle.mockClear();
    const got = await useArticlesStore.getState().fetchArticle(a.id);
    expect(got.id).toBe(a.id);
    expect(mocked.getArticle).not.toHaveBeenCalled();
    expect(useArticlesStore.getState().currentArticleId).toBe(a.id);
  });

  it("本地只有摘要 → getArticle 拉全文并回灌 store + lastSyncedAt", async () => {
    useArticlesStore.setState({ articles: [summary("s1", "摘要", "2026-01-01T00:00:00.000Z")] });
    const remote = full("s1", "摘要", "2026-01-01T00:00:00.000Z", "<p>拉回来的</p>");
    mocked.getArticle.mockResolvedValue({ ...remote, deleted_at: null });
    const got = await useArticlesStore.getState().fetchArticle("s1");
    expect(got.html).toBe("<p>拉回来的</p>");
    const inStore = useArticlesStore.getState().articles.find((x) => x.id === "s1") as ArticleFull;
    expect(inStore.html).toBe("<p>拉回来的</p>");
    expect(useArticlesStore.getState().lastSyncedAt.s1).toBe("2026-01-01T00:00:00.000Z");
  });

  it("本地无、后端无 → 抛错(既有契约)", async () => {
    await expect(useArticlesStore.getState().fetchArticle("nope")).rejects.toThrow();
  });
});
