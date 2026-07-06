// 回收站面板:列出软删文章,支持「恢复」与「彻底删除」(二次确认,明示历史
// 版本一并删除)。数据/动作全走 articlesStore(批2 已交付),本组件零新契约。
import { useMemo, useState } from "react";
import type { ArticleFull, ArticleSummary } from "@/types";
import { Dialog } from "@/components/ui";
import { IconTrash, IconWarn } from "@/components/icons";
import { selectTrashedArticles, useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { clearStoredDraft } from "@/lib/draftKey";
import { useIsMobile } from "@/hooks/useMediaQuery";

type TrashRow = ArticleSummary | ArticleFull;

function formatDeletedTime(value?: string | null) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrashPanel() {
  const allArticles = useArticlesStore((state) => state.articles);
  const trashed = useMemo(
    () => selectTrashedArticles({ articles: allArticles }),
    [allArticles],
  );
  const restoreFromTrash = useArticlesStore((state) => state.restoreFromTrash);
  const purgeFromTrash = useArticlesStore((state) => state.purgeFromTrash);
  const isMobile = useIsMobile();

  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRestore = async (article: TrashRow) => {
    if (busyId) return;
    const displayTitle = article.title || "未命名文章";
    setBusyId(article.id);
    try {
      await restoreFromTrash(article.id);
      toast.success(`已恢复「${displayTitle}」`);
    } finally {
      setBusyId(null);
    }
  };

  const handlePurgeConfirm = async () => {
    if (!purgeTarget || busyId) return;
    const { id } = purgeTarget;
    const displayTitle = purgeTarget.title || "未命名文章";
    setBusyId(id);
    try {
      await purgeFromTrash(id);
      // 彻底删除后顺手清残留草稿缓存(与列表删除同款,防孤儿草稿)。
      clearStoredDraft(id);
      toast.success(`已彻底删除「${displayTitle}」`);
    } finally {
      setBusyId(null);
      setPurgeTarget(null);
    }
  };

  return (
    <div
      data-testid="trash-panel"
      style={{
        marginTop: 16,
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        background: "var(--surface)",
        padding: isMobile ? "14px 14px 16px" : "16px 18px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="label-soft" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconTrash size={12} /> 回收站
        </span>
        <span style={{ fontSize: 12, color: "var(--fg-4)" }}>
          删除的文章会先保留在这里,可随时恢复。
        </span>
      </div>

      {trashed.length === 0 ? (
        <div
          data-testid="trash-empty"
          style={{ padding: "18px 4px 8px", color: "var(--fg-4)", fontSize: 13, lineHeight: 1.7 }}
        >
          回收站是空的。删除文章后会先放进这里,不会直接消失。
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {trashed.map((article) => {
            const displayTitle = article.title || "未命名文章";
            const busy = busyId === article.id;
            return (
              <div
                key={article.id}
                data-testid={`trash-row-${article.id}`}
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "stretch" : "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border-2)",
                  borderRadius: "var(--r-md)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--fg-2)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={displayTitle}
                  >
                    {displayTitle}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      color: "var(--fg-4)",
                    }}
                  >
                    删除于 {formatDeletedTime(article.deleted_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flex: "none" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    data-testid={`trash-restore-${article.id}`}
                    disabled={busy}
                    onClick={() => void handleRestore(article)}
                    style={isMobile ? { flex: 1 } : undefined}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid={`trash-purge-${article.id}`}
                    disabled={busy}
                    onClick={() => setPurgeTarget(article)}
                    style={isMobile ? { flex: 1 } : undefined}
                  >
                    彻底删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        title="彻底删除这篇文章?"
        icon={<IconWarn size={16} />}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="trash-purge-cancel"
              onClick={() => setPurgeTarget(null)}
              style={{ minHeight: 44 }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="trash-purge-confirm"
              onClick={() => void handlePurgeConfirm()}
              style={{ minHeight: 44 }}
            >
              彻底删除
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7 }}>
          确定要彻底删除「{purgeTarget?.title || "未命名文章"}」吗?
          删除后无法找回,历史版本也将一并删除。
        </p>
      </Dialog>
    </div>
  );
}

export default TrashPanel;
