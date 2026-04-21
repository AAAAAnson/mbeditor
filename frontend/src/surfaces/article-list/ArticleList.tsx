import { useMemo, useState } from "react";
import type { ArticleFull, ArticleSummary, Route } from "@/types";
import { IconSearch, IconPlus, IconArrowRight, IconTrash } from "@/components/icons";
import Chip from "@/components/shared/Chip";
import { useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

type StatusTone = "" | "gold" | "forest";
type CoverVariant = "warm" | "terminal" | "paper" | "neon" | "earth" | "swiss";
type ArticleRow = ArticleSummary | ArticleFull;
type FilterTab = "全部" | "HTML" | "Markdown";

const COVER_VARIANTS: Record<CoverVariant, { from: string; to: string; stripe: string }> = {
  warm: { from: "#C14A3A", to: "#8A3B2E", stripe: "#D97860" },
  terminal: { from: "#1A1714", to: "#2A2225", stripe: "#C4A76C" },
  paper: { from: "#F0E8D8", to: "#C4A76C", stripe: "#8A6D5B" },
  neon: { from: "#7588B8", to: "#3D3730", stripe: "#C4A76C" },
  earth: { from: "#8A6D5B", to: "#C89458", stripe: "#F0E8D8" },
  swiss: { from: "#141013", to: "#302629", stripe: "#F0E8D8" },
};

const GRID_COLS = "48px 72px 1fr 160px 120px 80px 72px";
const FILTER_TABS: FilterTab[] = ["全部", "HTML", "Markdown"];
const COVER_KEYS = Object.keys(COVER_VARIANTS) as CoverVariant[];

function isArticleFull(article: ArticleRow): article is ArticleFull {
  return "html" in article;
}

function coverVariantForArticle(article: ArticleRow): CoverVariant {
  if (article.cover && article.cover in COVER_VARIANTS) return article.cover as CoverVariant;
  const seed = article.id.charCodeAt(article.id.length - 1) || 0;
  return COVER_KEYS[seed % COVER_KEYS.length];
}

function formatLedgerTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";

  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStamp(article: ArticleRow) {
  const date = new Date(article.created_at);
  const year = Number.isNaN(date.getTime()) ? "0000" : `${date.getFullYear()}`.slice(-2);
  const month = Number.isNaN(date.getTime()) ? "00" : `${date.getMonth() + 1}`.padStart(2, "0");
  return `MB-${year}${month}-${article.id.slice(-3).toUpperCase()}`;
}

function estimateWords(article: ArticleRow) {
  if (!isArticleFull(article)) return null;

  const source = article.mode === "markdown"
    ? article.markdown
    : article.html.replace(/<[^>]+>/g, " ");
  const text = source.replace(/\s+/g, "");
  return text.length || 0;
}

function articleStatus(article: ArticleRow) {
  const created = new Date(article.created_at).getTime();
  const updated = new Date(article.updated_at).getTime();

  if (Number.isNaN(created) || Number.isNaN(updated)) return { label: "草稿", tone: "gold" as StatusTone };
  if (updated - created > 60_000) return { label: "已保存", tone: "forest" as StatusTone };
  return { label: "新建", tone: "gold" as StatusTone };
}

function extractErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "请求失败";
}

function CoverTile({ variant }: { variant: CoverVariant }) {
  const v = COVER_VARIANTS[variant];
  return (
    <div
      style={{
        width: 56,
        height: 72,
        borderRadius: 4,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${v.from}, ${v.to})`,
        position: "relative",
        flexShrink: 0,
        boxShadow: "0 4px 10px -4px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 10px, ${v.stripe}22 10px, ${v.stripe}22 11px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 5,
          right: 5,
          bottom: 5,
          height: 6,
          background: v.stripe,
          opacity: 0.85,
          borderRadius: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 5,
          top: 6,
          fontFamily: "var(--f-mono)",
          fontSize: 7,
          letterSpacing: 0.5,
          color: v.stripe,
          opacity: 0.85,
        }}
      >
        MB
      </div>
    </div>
  );
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

  const articles = useArticlesStore((state) => state.articles);
  const createArticle = useArticlesStore((state) => state.createArticle);
  const deleteArticle = useArticlesStore((state) => state.deleteArticle);
  const setCurrentArticle = useArticlesStore((state) => state.setCurrentArticle);
  const defaultMode = useUIStore((state) => state.editorDefaultMode);
  const density = useUIStore((state) => state.density);
  const rowPadding = density === "compact" ? "14px 8px" : density === "spacious" ? "24px 8px" : "18px 8px";

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

  const openEditor = (id: string) => {
    setCurrentArticle(id);
    go("editor", { articleId: id });
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const article = await createArticle("未命名文章", defaultMode);
      toast.success("已创建文章");
      openEditor(article.id);
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
      toast.success(`已删除「${displayTitle}」`);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

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
              <span className="caps">文章列表</span>
              <div className="hair-rule" style={{ flex: 1 }} />
              <span className="caps tnum">
                {articles.length.toString().padStart(3, "0")} / 篇
              </span>
            </div>
            <h1
              className="title-serif"
              style={{ fontSize: 72, margin: "10px 0 8px", color: "var(--fg)" }}
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
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              color: "var(--fg-4)",
              lineHeight: 1.7,
            }}
          >
            <div>今天 · {new Date().toLocaleDateString("zh-CN")}</div>
            <div>
              支持 · <span style={{ color: "var(--gold)" }}>CLAUDE · CODEX · OPENCLAW</span>
            </div>
            <div>接口 · :7072/api/v1/articles</div>
            <div
              style={{
                marginTop: 8,
                color: "var(--fg-2)",
                fontSize: 14,
                fontFamily: "var(--f-display)",
              }}
            >
              已连接本地服务
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
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
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 48px 80px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLS,
            alignItems: "center",
            padding: "10px 8px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span className="caps">№</span>
          <span className="caps">封面</span>
          <span className="caps">标题</span>
          <span className="caps">作者</span>
          <span className="caps">状态</span>
          <span className="caps tnum">字数</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <div
            style={{
              padding: "48px 8px 52px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gap: 12,
            }}
          >
            <div className="caps" style={{ color: "var(--fg-5)" }}>
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
              <div>
                <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
                  <IconPlus size={12} /> {creating ? "创建中" : "创建第一篇"}
                </button>
              </div>
            )}
          </div>
        )}

        {filtered.map((article, index) => {
          const status = articleStatus(article);
          const wordCount = estimateWords(article);

          return (
            <div
              key={article.id}
              onClick={() => openEditor(article.id)}
              className="article-row slide-up"
              style={{
                display: "grid",
                gridTemplateColumns: GRID_COLS,
                alignItems: "center",
                gap: "8px",
                padding: rowPadding,
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                transition: "background 0.15s",
                animationDelay: `${index * 30}ms`,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              <div className="mono tnum" style={{ color: "var(--fg-4)", fontSize: 11 }}>
                {String(index + 1).padStart(3, "0")}
              </div>

              <CoverTile variant={coverVariantForArticle(article)} />

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <span className="mono" style={{ color: "var(--fg-5)", fontSize: 10 }}>
                    {formatStamp(article)}
                  </span>
                  <Chip tone={article.mode === "markdown" ? "info" : "accent"}>{article.mode}</Chip>
                </div>
                <div
                  className="title-serif"
                  style={{
                    fontSize: 22,
                    color: "var(--fg)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {article.title || "未命名文章"}
                </div>
              </div>

              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                <div>作者 · {isArticleFull(article) && article.author ? article.author : "MBEditor"}</div>
                <div style={{ color: "var(--fg-4)", marginTop: 2 }}>{formatLedgerTime(article.updated_at)}</div>
              </div>

              <Chip tone={status.tone}>{status.label}</Chip>

              <div className="mono tnum" style={{ color: "var(--fg-3)", fontSize: 12 }}>
                {wordCount === null ? "—" : wordCount.toLocaleString()}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 10,
                  color: "var(--fg-4)",
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm article-row-delete"
                  aria-label={`删除文章 ${article.title || "未命名文章"}`}
                  data-testid={`delete-article-${article.id}`}
                  disabled={deletingId === article.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(article);
                  }}
                  style={{
                    padding: 6,
                    minWidth: 0,
                    color: "var(--fg-4)",
                    opacity: deletingId === article.id ? 0.4 : 0.65,
                    transition: "color 0.15s, opacity 0.15s",
                  }}
                  onMouseEnter={(event) => {
                    if (deletingId === article.id) return;
                    event.currentTarget.style.color = "var(--accent)";
                    event.currentTarget.style.opacity = "1";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.color = "var(--fg-4)";
                    event.currentTarget.style.opacity = deletingId === article.id ? "0.4" : "0.65";
                  }}
                  title={deletingId === article.id ? "删除中…" : "删除文章"}
                >
                  <IconTrash size={13} />
                </button>
                <IconArrowRight size={14} />
              </div>
            </div>
          );
        })}

        <div
          onClick={handleCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 40px",
            alignItems: "center",
            gap: "8px",
            padding: "22px 8px",
            borderBottom: "1px dashed var(--border-2)",
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
