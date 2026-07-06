import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleFull, ArticleMode, ArticleSummary } from "@/types";
import { getRequiredSeedArticles, SEED_VERSION } from "@/seeds";
import * as articlesApi from "@/lib/articlesApi";
import { toast } from "@/stores/toastStore";
import { useHealthStore } from "@/stores/healthStore";

const SEED_FLAG_KEY = "mbeditor.articles.seeded";
const SEED_VERSION_KEY = "mbeditor.articles.seedVersion";
/** 一次性迁移标志:置位后不再把 localStorage 存量逐篇推后端。 */
const MIGRATED_FLAG_KEY = "mbeditor.articles.migrated";

function shouldSeed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SEED_FLAG_KEY) !== "1";
  } catch {
    return false;
  }
}

function markSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEED_FLAG_KEY, "1");
    window.localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
  } catch {
    /* storage unavailable — fall back to in-memory only */
  }
}

function readSeededVersion(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(SEED_VERSION_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function isMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MIGRATED_FLAG_KEY) === "1";
  } catch {
    return true;
  }
}

function markMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_FLAG_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

type ArticleUpdateData = Partial<Omit<ArticleFull, "id" | "created_at" | "updated_at">>;
type StoredArticle = ArticleSummary | ArticleFull;

function generateId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

/**
 * 落盘时间戳统一 ISO8601 UTC(尾 Z、毫秒精度)。后端 LWW 用字典序比较
 * updated_at,格式必须钉死可比 —— 不要改成 toLocaleString/自拼格式。
 */
function nowIso(): string {
  return new Date().toISOString();
}

function emptyArticle(id: string, title: string, mode: ArticleMode): ArticleFull {
  const ts = nowIso();
  return {
    id,
    title,
    mode,
    cover: "",
    created_at: ts,
    updated_at: ts,
    html: "",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

/** 是否已有全文(服务端摘要不带 html;有 html 字段即视为全量)。 */
function isFullArticle(article: StoredArticle): article is ArticleFull {
  return typeof (article as ArticleFull).html === "string";
}

/** 活文章(未软删)。展示处(首页/列表/slug 匹配)一律走它,回收站走 trashed。 */
export function selectLiveArticles<S extends { articles: StoredArticle[] }>(state: S): StoredArticle[] {
  return state.articles.filter((a) => !a.deleted_at);
}

export function selectTrashedArticles<S extends { articles: StoredArticle[] }>(state: S): StoredArticle[] {
  return state.articles.filter((a) => Boolean(a.deleted_at));
}

const CONFLICT_TOAST = "另一台设备的版本已存入历史版本";

interface ArticlesState {
  articles: StoredArticle[];
  currentArticleId: string | null;
  loading: boolean;
  /** 真·首次打开(从未 seed 过且本地无文章):由 rehydrate 置位。**只读语义**——
   *  HomeSurface 只读它来软化首访引导文案,不再据此重定向(首页空/满由
   *  articles.length 判定,避开 rehydrate 微任务落地的竞态)。瞬态、不持久化;
   *  刷新后归 false(此时已 markSeeded,不再是首访)。 */
  firstVisit: boolean;
  /** 待补同步的文章 id(写后端失败/进行中)。persist,重启后继续补。 */
  pendingSync: string[];
  /** 每篇最后一次从服务端确认的 updated_at → 下次 PUT 的 base_updated_at。 */
  lastSyncedAt: Record<string, string>;

  fetchArticles: () => Promise<void>;
  fetchArticle: (id: string) => Promise<ArticleFull>;
  createArticle: (title: string, mode: ArticleMode) => Promise<ArticleFull>;
  updateArticle: (id: string, data: ArticleUpdateData) => Promise<ArticleFull>;
  deleteArticle: (id: string) => Promise<void>;
  restoreFromTrash: (id: string) => Promise<void>;
  purgeFromTrash: (id: string) => Promise<void>;
  syncPending: () => Promise<void>;
  setCurrentArticle: (id: string | null) => void;
  replaceAll: (articles: ArticleFull[]) => void;
}

/** syncPending 单飞闸:避免「写成功→flush」与手动/红转绿触发并发重推。 */
let syncInFlight = false;
/** 迁移单飞闸:两个并发 fetchArticles 不许双跑迁移。 */
let migrateInFlight: Promise<void> | null = null;

/**
 * 降级打开的文章 id(getArticle 失败、以空大字段伪全文返回)。此类文章
 * 的本地 html 不可信:推送时强制 base=null,逼后端先落 conflict 快照再
 * 接受写入 —— 原文永远能从历史版本找回。getArticle 成功即摘除。
 */
const degradedIds = new Set<string>();

function errStatus(err: unknown): number | null {
  if (err instanceof articlesApi.ArticlesApiError) return err.code;
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return typeof status === "number" ? status : null;
}

function isNotFound(err: unknown): boolean {
  return errStatus(err) === 404;
}

/** 永久性客户端错误(400/413/422 等):重试永远失败,不许滞留 pendingSync 毒丸。 */
function isPermanentClientError(err: unknown): boolean {
  const status = errStatus(err);
  return (
    status !== null && status >= 400 && status < 500 &&
    status !== 404 && status !== 408 && status !== 429
  );
}

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => {
      /** 进 pendingSync(写发起时即标记:保护 merge 期间的 in-flight 写)。 */
      const markPending = (id: string) => {
        set((state) =>
          state.pendingSync.includes(id) ? {} : { pendingSync: [...state.pendingSync, id] },
        );
      };

      const clearPending = (id: string, syncedAt?: string) => {
        set((state) => ({
          pendingSync: state.pendingSync.filter((x) => x !== id),
          lastSyncedAt: syncedAt
            ? { ...state.lastSyncedAt, [id]: syncedAt }
            : state.lastSyncedAt,
        }));
      };

      /**
       * 把 id 的本地状态推到后端(按本地形态选动作)。成功返回 true 并出
       * pendingSync;失败(网络/5xx)返回 false 并保持在 pendingSync。
       */
      const pushToBackend = async (id: string): Promise<boolean> => {
        const state = get();
        const article = state.articles.find((a) => a.id === id);
        try {
          if (!article) {
            // 本地已无此篇而 id 仍挂账 → 只能是 purge 待回放
            try {
              await articlesApi.purgeArticle(id);
            } catch (err) {
              if (!isNotFound(err)) throw err; // 服务端本来就没有 → 视为已清
            }
            clearPending(id);
            return true;
          }
          if (article.deleted_at) {
            // 软删回放;离线新建后直接删的文章服务端还没有 → 先 PUT 再 DELETE
            try {
              await articlesApi.deleteArticle(id);
            } catch (err) {
              if (isNotFound(err) && isFullArticle(article)) {
                await articlesApi.putArticle(article, state.lastSyncedAt[id] ?? null);
                await articlesApi.deleteArticle(id);
              } else if (isNotFound(err)) {
                // 服务端没有、本地又只剩摘要:无物可回放,视为已清
                clearPending(id);
                return true;
              } else {
                throw err;
              }
            }
            clearPending(id, article.updated_at);
            return true;
          }
          if (isFullArticle(article)) {
            // 降级打开的文章本地大字段不可信 → base=null 逼后端先落 conflict 快照
            const base = degradedIds.has(id) ? null : state.lastSyncedAt[id] ?? null;
            const result = await articlesApi.putArticle(article, base);
            degradedIds.delete(id);
            if (result.conflict_rev_id) toast.info(CONFLICT_TOAST);
            // PUT 不冲服务端软删态;本地是活的而服务端软删 → 补一记 restore
            if (result.article?.deleted_at) {
              await articlesApi.restoreArticle(id);
            }
            clearPending(id, result.article?.updated_at ?? article.updated_at);
            return true;
          }
          // 摘要级的活文章还挂账 → 只能是恢复待回放
          await articlesApi.restoreArticle(id);
          clearPending(id, article.updated_at);
          return true;
        } catch (err) {
          if (isPermanentClientError(err)) {
            // 永久性 4xx:重试不会好,出账防毒丸;本地副本仍在,等用户改动再推
            clearPending(id);
            toast.error("文章同步被服务器拒绝,已保留在本机");
            return false;
          }
          markPending(id);
          return false;
        }
      };

      /**
       * per-id 推送串行链:同一篇的推送严格排队(防两个并发 PUT 响应乱序
       * 把旧内容留在服务端、或第二个 PUT 拿陈旧 base 触发假冲突)。排队中的
       * 推送只保留一个待跑位(latest-wins:pushToBackend 执行时读最新 state)。
       */
      const pushChains = new Map<string, Promise<boolean>>();
      const pushQueued = new Set<string>();

      const schedulePush = (id: string): Promise<boolean> => {
        if (pushQueued.has(id)) {
          return pushChains.get(id) ?? Promise.resolve(false);
        }
        pushQueued.add(id);
        const prev = pushChains.get(id) ?? Promise.resolve(true);
        const run = () => {
          pushQueued.delete(id);
          return pushToBackend(id);
        };
        const next = prev.then(run, run);
        pushChains.set(id, next);
        void next.finally(() => {
          if (pushChains.get(id) === next && !pushQueued.has(id)) {
            pushChains.delete(id);
          }
        });
        return next;
      };

      /** 写动作后的异步推送;成功后顺手 flush 积压(计划:任一写成功后触发)。 */
      const writeThrough = (id: string) => {
        void (async () => {
          const ok = await schedulePush(id);
          if (ok && get().pendingSync.length > 0) {
            void get().syncPending();
          }
        })();
      };

      /**
       * 一次性迁移:标志未置且本地有全文文章 → 逐篇 PUT。base 取 lastSyncedAt
       * (部分失败重试时,已成功的篇用服务端回执作 base → 不再刷垃圾 conflict
       * 快照);单飞闸防并发 fetchArticles 双跑。
       */
      const migrateLocalOnce = async () => {
        if (isMigrated()) return;
        if (migrateInFlight) return migrateInFlight;
        migrateInFlight = (async () => {
          const fulls = get().articles.filter(isFullArticle);
          let allOk = true;
          for (const article of fulls) {
            try {
              const base = get().lastSyncedAt[article.id] ?? null;
              const result = await articlesApi.putArticle(article, base);
              clearPending(article.id, result.article?.updated_at ?? article.updated_at);
            } catch {
              allOk = false;
              markPending(article.id);
            }
          }
          if (allOk) markMigrated();
        })();
        try {
          await migrateInFlight;
        } finally {
          migrateInFlight = null;
        }
      };

      return {
        articles: [],
        currentArticleId: null,
        loading: false,
        firstVisit: false,
        pendingSync: [],
        lastSyncedAt: {},

        fetchArticles: async () => {
          set({ loading: true });
          try {
            await migrateLocalOnce();
            const server = await articlesApi.listArticles(true);
            set((state) => {
              const pending = new Set(state.pendingSync);
              const localById = new Map(state.articles.map((a) => [a.id, a] as const));
              const next: StoredArticle[] = [];
              const lastSyncedAt = { ...state.lastSyncedAt };
              for (const remote of server) {
                const local = localById.get(remote.id);
                localById.delete(remote.id);
                if (pending.has(remote.id)) {
                  // 本地为准(随后 syncPending 推上去);本地已 purge 的不复活
                  if (local) next.push(local);
                  continue;
                }
                if (local && isFullArticle(local) && local.updated_at === remote.updated_at) {
                  // 同版本:保留本地大字段(GET 列表不含 html),摘要字段跟服务端
                  next.push({ ...local, ...remote });
                } else {
                  // 服务端为准。旧本地全文丢弃 → 打开时 fetchArticle 惰性拉全文
                  next.push({ ...remote });
                }
                lastSyncedAt[remote.id] = remote.updated_at;
              }
              for (const [id, local] of localById) {
                if (pending.has(id)) {
                  next.push(local);
                } else {
                  // 本地有、服务端无且不挂账 → 其它端已彻底删除
                  delete lastSyncedAt[id];
                }
              }
              next.sort((a, b) =>
                a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0,
              );
              const currentGone =
                state.currentArticleId !== null &&
                !next.some((a) => a.id === state.currentArticleId);
              return {
                articles: next,
                lastSyncedAt,
                currentArticleId: currentGone ? null : state.currentArticleId,
              };
            });
          } catch {
            // 后端不可用:保留本地缓存(离线可用),等补同步触发点重试
          } finally {
            set({ loading: false });
          }
          void get().syncPending();
        },

        fetchArticle: async (id) => {
          const found = get().articles.find((a) => a.id === id);
          if (found && isFullArticle(found)) {
            set({ currentArticleId: id });
            return found;
          }
          try {
            const remote = await articlesApi.getArticle(id);
            degradedIds.delete(id);
            set((state) => {
              const exists = state.articles.some((a) => a.id === id);
              return {
                articles: exists
                  ? state.articles.map((a) => (a.id === id ? { ...a, ...remote } : a))
                  : [remote, ...state.articles],
                currentArticleId: id,
                lastSyncedAt: { ...state.lastSyncedAt, [id]: remote.updated_at },
              };
            });
            return get().articles.find((a) => a.id === id) as ArticleFull;
          } catch (err) {
            if (found) {
              // 拉全文失败但本地有摘要:降级返回(大字段空),编辑器仍能打开。
              // 标记降级:此篇后续推送强制 base=null(后端先落 conflict 快照),
              // 用户在空文上保存也不会把服务端原文无痕清掉。
              degradedIds.add(id);
              set({ currentArticleId: id });
              return {
                html: "",
                css: "",
                js: "",
                markdown: "",
                author: "",
                digest: "",
                ...found,
              } as ArticleFull;
            }
            throw err instanceof Error ? err : new Error(`Article ${id} not found`);
          }
        },

        createArticle: async (title, mode) => {
          const article = emptyArticle(generateId(), title, mode);
          set((state) => ({
            articles: [article, ...state.articles],
            currentArticleId: article.id,
            pendingSync: state.pendingSync.includes(article.id)
              ? state.pendingSync
              : [...state.pendingSync, article.id],
          }));
          writeThrough(article.id);
          return article;
        },

        updateArticle: async (id, data) => {
          const existing = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
          if (!existing) {
            throw new Error(`Article ${id} not found`);
          }
          const merged: ArticleFull = {
            ...existing,
            ...data,
            id: existing.id,
            created_at: existing.created_at,
            updated_at: nowIso(),
          };
          set((state) => ({
            articles: state.articles.map((a) => (a.id === id ? merged : a)),
            currentArticleId: id,
            pendingSync: state.pendingSync.includes(id)
              ? state.pendingSync
              : [...state.pendingSync, id],
          }));
          writeThrough(id);
          return merged;
        },

        deleteArticle: async (id) => {
          set((state) => ({
            articles: state.articles.map((a) =>
              a.id === id ? { ...a, deleted_at: nowIso() } : a,
            ),
            currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
            pendingSync: state.pendingSync.includes(id)
              ? state.pendingSync
              : [...state.pendingSync, id],
          }));
          writeThrough(id);
        },

        restoreFromTrash: async (id) => {
          set((state) => ({
            articles: state.articles.map((a) => (a.id === id ? { ...a, deleted_at: null } : a)),
            pendingSync: state.pendingSync.includes(id)
              ? state.pendingSync
              : [...state.pendingSync, id],
          }));
          writeThrough(id);
        },

        purgeFromTrash: async (id) => {
          set((state) => {
            const lastSyncedAt = { ...state.lastSyncedAt };
            delete lastSyncedAt[id];
            return {
              articles: state.articles.filter((a) => a.id !== id),
              currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
              lastSyncedAt,
              pendingSync: state.pendingSync.includes(id)
                ? state.pendingSync
                : [...state.pendingSync, id],
            };
          });
          writeThrough(id);
        },

        syncPending: async () => {
          if (syncInFlight) return;
          const ids = [...get().pendingSync];
          if (ids.length === 0) return;
          syncInFlight = true;
          try {
            for (const id of ids) {
              await schedulePush(id);
            }
          } finally {
            syncInFlight = false;
          }
        },

        setCurrentArticle: (id) => set({ currentArticleId: id }),

        replaceAll: (articles) => {
          // 全量替换(导入):全部挂账重推,由服务端 LWW 兜冲突
          set({
            articles,
            currentArticleId: null,
            pendingSync: articles.map((a) => a.id),
          });
          void get().syncPending();
        },
      };
    },
    {
      name: "mbeditor.articles",
      partialize: (state) => ({
        articles: state.articles,
        pendingSync: state.pendingSync,
        lastSyncedAt: state.lastSyncedAt,
      }),
      onRehydrateStorage: () => (state) => {
        // zustand persist 在 rehydrate 回调里 setState 不会触发 persist 的写回。
        // 用 queueMicrotask 推到下一 tick：此时 rehydrate 已完成，setState 会
        // 正常走 partialize → localStorage 写回，React 组件也会重新订阅。
        const firstTime = shouldSeed();
        const currentArticles = state?.articles ?? useArticlesStore.getState().articles;

        if (firstTime) {
          if (currentArticles.length > 0) {
            markSeeded();
            return;
          }
          // 真·首访(从未 seed、本地无文章):不预灌模板进列表,只标记首访供
          // HomeSurface 软化引导文案;空 store 时 HomeSurface 自渲染模板墙,模板
          // 改为点选「套个好看模板」时才建文章。
          queueMicrotask(() => {
            useArticlesStore.setState({ firstVisit: true });
            markSeeded();
          });
          return;
        }

        if (readSeededVersion() < SEED_VERSION) {
          // 版本滞后时 REQUIRED_SEED_IDS 里的文章**强制**用最新内容覆盖，
          // 保证 demo 文章内容始终跟着前端构建走（否则老用户拿到的是旧版 HTML）。
          const required = getRequiredSeedArticles();
          queueMicrotask(() => {
            const current = useArticlesStore.getState().articles;
            const byId = new Map(current.map((a) => [a.id, a] as const));
            for (const seed of required) byId.set(seed.id, seed);
            const next = Array.from(byId.values());
            // Ensure the demo article leads the list on fresh sync
            next.sort((a, b) => {
              const ai = required.findIndex((s) => s.id === a.id);
              const bi = required.findIndex((s) => s.id === b.id);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return 0;
            });
            // seed 覆盖属本地权威写:挂账推后端,同时防 fetch merge 把
            // 「服务端还没有的新 seed」当其它端已删而移除。
            const prevPending = useArticlesStore.getState().pendingSync;
            const pendingSync = Array.from(
              new Set([...prevPending, ...required.map((s) => s.id)]),
            );
            useArticlesStore.setState({ articles: next, pendingSync });
            markSeeded();
          });
        }
      },
    }
  )
);

// 补同步触发点之三:后端红转绿(healthStore 轮询恢复)→ 自动 flush 积压。
// healthStore 本体零改:纯订阅(prev/next 状态由 zustand subscribe 提供)。
useHealthStore.subscribe((state, prev) => {
  if (
    prev.status === "down" &&
    state.status === "ok" &&
    useArticlesStore.getState().pendingSync.length > 0
  ) {
    void useArticlesStore.getState().syncPending();
  }
});
