import type { ArticleFull, ArticleSummary } from "@/types";
import { IconArrowRight, IconTrash, IconEdit, IconCloudOff } from "@/components/icons";
import { Tag } from "@/components/ui";
import { useArticlesStore } from "@/stores/articlesStore";
import { COVER_TONES, coverVariantKey, type CoverVariant } from "@/lib/coverTone";
import { useIsMobile } from "@/hooks/useMediaQuery";

type StatusTone = "" | "gold" | "forest";
export type ArticleRow = ArticleSummary | ArticleFull;

function isArticleFull(article: ArticleRow): article is ArticleFull {
  return "html" in article;
}

function coverVariantForArticle(article: ArticleRow): CoverVariant {
  const seed = article.id.charCodeAt(article.id.length - 1) || 0;
  return coverVariantKey(article.cover, seed);
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

function CoverBand({ variant }: { variant: CoverVariant }) {
  const v = COVER_TONES[variant];
  return (
    <div
      aria-hidden
      style={{
        height: 74,
        borderTopLeftRadius: "var(--r-xl)",
        borderTopRightRadius: "var(--r-xl)",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${v.from}, ${v.to})`,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 14px, ${v.stripe}1f 14px, ${v.stripe}1f 15px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 12,
          fontFamily: "var(--f-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: v.stripe,
          opacity: 0.9,
        }}
      >
        MB
      </div>
    </div>
  );
}

interface ArticleCardProps {
  article: ArticleRow;
  onOpen: (article: ArticleRow) => void;
  onDelete: (article: ArticleRow) => void;
  onRename?: (article: ArticleRow) => void;
  deleting?: boolean;
}

function ArticleCard({ article, onOpen, onDelete, onRename, deleting = false }: ArticleCardProps) {
  const status = articleStatus(article);
  const wordCount = estimateWords(article);
  const displayTitle = article.title || "未命名文章";
  // 写后端失败/进行中的文章挂在 pendingSync:给「未同步」小徽标提示,
  // 连接恢复后 articlesStore 自动补同步、徽标随之消失。
  const unsynced = useArticlesStore((state) => state.pendingSync.includes(article.id));

  return (
    <div
      data-testid={`article-card-${article.id}`}
      onClick={() => onOpen(article)}
      className="article-card slide-up"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: "0 10px 24px -18px rgba(58,42,34,0.32)",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-3px)";
        event.currentTarget.style.boxShadow = "0 16px 34px -16px rgba(214,90,50,0.34)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.boxShadow = "0 10px 24px -18px rgba(58,42,34,0.32)";
      }}
    >
      <CoverBand variant={coverVariantForArticle(article)} />

      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Tag tone={article.mode === "markdown" ? "info" : "orange"}>{article.mode}</Tag>
          <Tag tone={status.tone === "forest" ? "success" : "warning"}>{status.label}</Tag>
          {unsynced && (
            <span
              data-testid={`unsynced-badge-${article.id}`}
              title="将在连接恢复后自动同步"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginLeft: "auto",
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                letterSpacing: "0.04em",
                color: "var(--fg-4)",
                border: "1px solid var(--border-2)",
                borderRadius: 999,
                padding: "2px 8px",
                whiteSpace: "nowrap",
                flex: "none",
              }}
            >
              <IconCloudOff size={11} /> 未同步
            </span>
          )}
        </div>

        <h4
          className="title-serif"
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.4,
            color: "var(--fg)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {displayTitle}
        </h4>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: "var(--fg-4)",
          }}
        >
          <span>{formatLedgerTime(article.updated_at)}</span>
          <span className="tnum">{wordCount === null ? "—" : `${wordCount.toLocaleString()} 字`}</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            color: "var(--fg-4)",
          }}
        >
          {onRename && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={`重命名文章 ${displayTitle}`}
              data-testid={`rename-article-${article.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onRename(article);
              }}
              style={{ padding: 6, minWidth: 0, color: "var(--fg-4)" }}
              title="重命名"
            >
              <IconEdit size={13} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm article-card-delete"
            aria-label={`删除文章 ${displayTitle}`}
            data-testid={`delete-article-${article.id}`}
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(article);
            }}
            style={{
              padding: 6,
              minWidth: 0,
              color: "var(--fg-4)",
              opacity: deleting ? 0.4 : 0.7,
              transition: "color 0.15s, opacity 0.15s",
            }}
            title={deleting ? "删除中…" : "删除文章"}
          >
            <IconTrash size={13} />
          </button>
          <span style={{ color: "var(--accent)", display: "flex" }}>
            <IconArrowRight size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

export interface ArticleGridProps {
  articles: ArticleRow[];
  onOpen: (article: ArticleRow) => void;
  onDelete: (article: ArticleRow) => void;
  /** Optional inline rename trigger; when omitted the rename action is hidden. */
  onRename?: (article: ArticleRow) => void;
  /** id of the article whose delete is currently in-flight (disables its button). */
  deletingId?: string | null;
}

/**
 * Responsive card grid for the article list. Columns auto-fill via
 * minmax/clamp so it reflows down to a single column on narrow screens —
 * no fixed pixel ledger (keeps a path open for mobile).
 */
export function ArticleGrid({ articles, onOpen, onDelete, onRename, deletingId }: ArticleGridProps) {
  const isMobile = useIsMobile();
  return (
    <div
      data-testid="article-grid"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr"
          : "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
        gap: "clamp(14px, 2vw, 20px)",
        alignItems: "stretch",
      }}
    >
      {articles.map((article) => (
        <ArticleCard
          key={article.id}
          article={article}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          deleting={deletingId === article.id}
        />
      ))}
    </div>
  );
}

export default ArticleGrid;
