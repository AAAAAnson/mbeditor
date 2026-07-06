// frontend/src/surfaces/editor/history/RevisionHistory.tsx
// 历史版本共享组件(批4 C2,spec §4)。ChatPanel 内嵌(variant="inline")与
// docbar 弹层(variant="panel")共用同一份列表 + 恢复逻辑。
//
// 恢复动作序(内容安全):先把当前 html POST 一份 reason=restore_backup(恢复本身
// 可后悔;失败 toast 不阻断)→ GET 目标快照 → onRestore(html) 回写编辑器。
// 数据走 @/lib/revisionsApi(useAgentChat 内联实现是契约红线,不复用)。
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { LoadingDots } from "@/components/ui";
import { toast } from "@/stores/toastStore";
import {
  getRevision,
  listRevisions as apiListRevisions,
  postRevision,
  type RevisionMeta,
} from "@/lib/revisionsApi";

/** 快照 reason 中文化(后端固定值映射,未知值原样透出)。ChatPanel 复用此表。 */
export const REVISION_REASON_LABELS: Record<string, string> = {
  chat_turn: "对话修改前",
  ai_adopt: "AI 改稿前",
  conflict: "多端覆盖备份",
  restore_backup: "恢复前",
};

export function revisionReasonLabel(reason?: string): string {
  if (!reason) return "快照";
  return REVISION_REASON_LABELS[reason] ?? reason;
}

/** 快照时间(后端 ts 是 epoch 秒;非法/缺失时返回空串)。 */
export function revisionTimeLabel(ts?: string | number): string {
  if (ts === undefined || ts === null || ts === "") return "";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export interface RevisionHistoryProps {
  articleId: string;
  /** 取当前整篇 HTML(恢复前落 restore_backup 用)。 */
  getCurrentHtml: () => string;
  /** 回写目标快照 html 到编辑器真源。 */
  onRestore: (html: string) => void;
  /** streaming/rewriting 时禁用恢复按钮。 */
  disabled?: boolean;
  /** inline=面板内滚动区(ChatPanel);panel=docbar 弹层。 */
  variant?: "inline" | "panel";
}

export default function RevisionHistory({
  articleId,
  getCurrentHtml,
  onRestore,
  disabled = false,
  variant = "inline",
}: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<RevisionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRevisions(null);
    setError(null);
    apiListRevisions(articleId)
      .then((revs) => {
        if (alive) setRevisions(revs);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "历史版本读取失败,请稍后重试");
      });
    return () => {
      alive = false;
    };
  }, [articleId]);

  const handleRestore = async (rev: RevisionMeta) => {
    if (disabled || restoringId) return;
    setRestoringId(rev.rev_id);
    // 恢复前先把当前版本落一份 restore_backup —— 恢复本身可后悔。失败不阻断。
    try {
      await postRevision(articleId, getCurrentHtml(), "restore_backup");
    } catch {
      toast.error("备份未保存,仍继续恢复");
    }
    try {
      const full = await getRevision(articleId, rev.rev_id);
      onRestore(full.html);
      toast.success("已恢复到所选版本");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "快照恢复失败,请稍后重试");
    } finally {
      setRestoringId(null);
    }
  };

  const itemStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minHeight: variant === "panel" ? 40 : undefined,
    fontSize: 12,
  };

  let body;
  if (error !== null) {
    body = (
      <p className="chat-empty" role="alert">
        {error}
      </p>
    );
  } else if (revisions === null) {
    body = (
      <div className="chat-toolrow" role="status" aria-label="历史版本加载中">
        <LoadingDots />
        <span>正在读取历史版本…</span>
      </div>
    );
  } else if (revisions.length === 0) {
    body = <p className="chat-empty">还没有历史版本。AI 每轮修改前会自动留一份快照。</p>;
  } else {
    body = revisions.map((rev) => (
      <button
        key={rev.rev_id}
        className="btn btn-ghost btn-sm"
        disabled={disabled || restoringId !== null}
        onClick={() => void handleRestore(rev)}
        title="恢复到这份快照"
        style={itemStyle}
      >
        <span style={{ color: "var(--fg-2)" }}>{revisionReasonLabel(rev.reason)}</span>
        <span style={{ color: "var(--fg-4)", fontSize: 11 }}>{revisionTimeLabel(rev.ts)}</span>
      </button>
    ));
  }

  return (
    <div
      data-testid="revision-history"
      data-variant={variant}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      {body}
    </div>
  );
}
