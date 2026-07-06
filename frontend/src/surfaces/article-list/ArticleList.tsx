import { useCallback, useMemo, useState } from "react";
import type { ArticleFull, Route } from "@/types";
import { downloadExport, importFromJson } from "@/lib/export";
import { IconSearch, IconPlus, IconTrash } from "@/components/icons";
import {
  selectLiveArticles,
  selectTrashedArticles,
  useArticlesStore,
} from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { buildArticleSlug } from "@/lib/route";
import { clearStoredDraft } from "@/lib/draftKey";
import { ArticleGrid, type ArticleRow } from "./ArticleGrid";
import { TrashPanel } from "./TrashPanel";

type FilterTab = "全部" | "HTML" | "Markdown";

const FILTER_TABS: FilterTab[] = ["全部", "HTML", "Markdown"];

function extractErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败";
}

interface ArticleListProps {
  go?: (route: Route, params?: Record<string, string>) => void;
}

export function ArticleList({ go = () => {} }: ArticleListProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<FilterTab>("全部");
  const [sort, setSort] = useState("updated");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const allArticles = useArticlesStore((state) => state.articles);
  // 列表只展示活文章;软删的进回收站面板。
  const articles = useMemo(() => selectLiveArticles({ articles: allArticles }), [allArticles]);
  const trashed = useMemo(() => selectTrashedArticles({ articles: allArticles }), [allArticles]);
  const createArticle = useArticlesStore((state) => state.createArticle);
  const deleteArticle = useArticlesStore((state) => state.deleteArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);
  const replaceAll = useArticlesStore((state) => state.replaceAll);
  const defaultMode = useUIStore((state) => state.editorDefaultMode);

  const filtered = useMemo(() => {
    const normalizedQuery = q.trim().toLowerCase();
    const result = articles
      .filter((article) => {
        if (tab === "HTML" && article.mode !== "html") return false;
        if (tab === "Markdown" && article.mode !== "markdown") return false;
        if (!normalizedQuery) return true;
        return article.title.toLowerCase().includes(normalizedQuery);
      })
      .slice();

    result.sort((left, right) => {
      if (sort === "created") {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
      if (sort === "title") {
        return left.title.localeCompare(right.title, "zh-CN");
      }
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });

    return result;
  }, [articles, q, sort, tab]);

  const counts = useMemo(
    () => ({
      全部: articles.length,
      HTML: articles.filter((article) => article.mode === "html").length,
      Markdown: articles.filter((article) => article.mode === "markdown").length,
    }),
    [articles],
  );

  // Accept an article-like object rather than a bare id so we can build the
  // URL slug from a *fresh* title — looking up `articles` here would read a
  // stale snapshot just after createArticle().
  const openEditor = (article: { id: string; title: string }) => {
    setCurrentArticle(article.id);
    const slug = buildArticleSlug(article.title, article.id);
    go("editor", { articleSlug: slug });
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const article = await createArticle("未命名文章", defaultMode);
      toast.success("已创建文章");
      openEditor(article);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (article: ArticleRow) => {
    if (deletingId) return;
    const displayTitle = article.title || "未命名文章";
    const confirmed = window.confirm(`确认删除「${displayTitle}」？此操作无法撤销。`);
    if (!confirmed) return;
    setDeletingId(article.id);
    try {
      await deleteArticle(article.id);
      // 删文章后顺手清掉残留的草稿缓存(避免孤儿草稿)。
      clearStoredDraft(article.id);
      toast.success(`已删除「${displayTitle}」`);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = importFromJson(json, articles as ArticleFull[]);
        replaceAll(imported);
        toast.success(`已导入 ${imported.length - articles.length} 篇文章`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "导入失败");
      }
    };
    reader.readAsText(file);
  }, [articles, replaceAll]);

  const emptyStateTitle = articles.length === 0 ? "还没有文章" : "没有找到相关文章";
  const emptyStateBody = articles.length === 0
    ? "先创建一篇文章，创建后会显示在这里。"
    : "换个关键词或筛选条件再试试。";

  return (
    <div style={{ height: "100%", overflow: "auto", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 48px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <span className="label-soft">文章列表</span>
              <div className="hair-rule" style={{ flex: 1 }} />
              <span className="label-soft tnum">
                {articles.length} 篇
              </span>
            </div>
            <h1
              className="title-serif"
              style={{ fontSize: "clamp(32px, 8vw, 72px)", margin: "10px 0 8px", color: "var(--fg)" }}
            >
              文&nbsp;章<span style={{ color: "var(--accent)" }}>.</span>
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "var(--fg-3)",
                fontSize: 14,
                fontFamily: "var(--f-display)",
                fontStyle: "italic",
                letterSpacing: "0.01em",
              }}
            >
              专注内容，排版交给我。
            </p>
          </div>

          <div
            style={{
              textAlign: "right",
              fontFamily: "var(--f-sans)",
              fontSize: 12,
              color: "var(--fg-4)",
              lineHeight: 1.7,
            }}
          >
            <div>今天 · {new Date().toLocaleDateString("zh-CN")}</div>
            <div
              style={{
                marginTop: 8,
                color: "var(--fg-2)",
                fontSize: 14,
                fontFamily: "var(--f-display)",
              }}
            >
              一句话，帮你写出好看的公众号推文
            </div>
          </div>
        </div>

        <div
          data-testid="article-list-toolbar"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 32,
            paddingBottom: 14,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 2 }}>
            {FILTER_TABS.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className="btn btn-ghost btn-sm"
                style={{
                  color: tab === item ? "var(--fg)" : "var(--fg-4)",
                  background: tab === item ? "var(--surface-2)" : "transparent",
                  fontFamily: "var(--f-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: 11,
                  padding: "6px 10px",
                }}
              >
                {item}
                <span className="tnum" style={{ marginLeft: 4, opacity: 0.5 }}>
                  {counts[item]}
                </span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ position: "relative" }}>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索文章标题"
              style={{
                all: "unset",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                padding: "6px 10px 6px 26px",
                borderBottom: "1px solid var(--border-2)",
                color: "var(--fg-2)",
                width: 180,
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 6,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg-4)",
                display: "flex",
              }}
            >
              <IconSearch size={12} />
            </span>
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            style={{
              all: "unset",
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--fg-3)",
              padding: "6px 10px",
              border: "1px solid var(--border-2)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            <option value="updated">最近修改</option>
            <option value="created">创建时间</option>
            <option value="title">标题</option>
          </select>

          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
            <IconPlus size={12} /> {creating ? "创建中" : "新建文章"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => downloadExport(articles as ArticleFull[])}
          >
            导出备份
          </button>
          <label className="btn btn-outline btn-sm cursor-pointer">
            导入备份
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            className="btn btn-outline btn-sm"
            data-testid="trash-toggle"
            aria-expanded={trashOpen}
            onClick={() => setTrashOpen((open) => !open)}
            title="回收站:恢复或彻底删除已删文章"
          >
            <IconTrash size={12} /> 回收站
            {trashed.length > 0 && (
              <span
                className="tnum"
                data-testid="trash-count"
                style={{ marginLeft: 4, opacity: 0.7 }}
              >
                {trashed.length}
              </span>
            )}
          </button>
        </div>

        {trashOpen && <TrashPanel />}
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 48px 80px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "48px 8px 52px",
              display: "grid",
              gap: 12,
            }}
          >
            <div className="label-soft" style={{ color: "var(--fg-5)" }}>
              空列表
            </div>
            <div className="title-serif" style={{ fontSize: 32, color: "var(--fg)" }}>
              {emptyStateTitle}
            </div>
            <p
              style={{
                margin: 0,
                maxWidth: 420,
                color: "var(--fg-3)",
                lineHeight: 1.8,
                fontSize: 14,
              }}
            >
              {emptyStateBody}
            </p>
            {articles.length === 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => go("list")}>
                  从漂亮模板开始
                </button>
                <button className="btn btn-outline btn-sm" onClick={handleCreate} disabled={creating}>
                  <IconPlus size={12} /> {creating ? "创建中" : "创建空白文章"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <ArticleGrid
            articles={filtered}
            onOpen={(article) => openEditor(article)}
            onDelete={(article) => void handleDelete(article)}
            deletingId={deletingId}
          />
        )}

        <div
          onClick={handleCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 40px",
            alignItems: "center",
            gap: "8px",
            marginTop: 24,
            padding: "22px 8px",
            borderTop: "1px dashed var(--border-2)",
            cursor: "pointer",
            color: "var(--fg-4)",
            transition: "color 0.15s",
            opacity: creating ? 0.6 : 1,
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = "var(--accent)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "var(--fg-4)";
          }}
        >
          <span className="mono">+ + +</span>
          <span className="title-serif" style={{ fontSize: 20, fontStyle: "italic" }}>
            {creating ? "正在创建文章…" : "新建文章，或让助手先起草"}
          </span>
          <span>
            <IconPlus size={14} />
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 48,
            padding: "14px 8px",
            fontFamily: "var(--f-mono)",
            fontSize: 10,
            color: "var(--fg-5)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span>MBEditor · 文章列表</span>
          <span>— / —</span>
          <span>按 N 新建 · 按 / 搜索</span>
        </div>
      </div>
    </div>
  );
}

export default ArticleList;
