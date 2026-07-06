import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export type PublishProgressMode = "draft" | "copy";

interface Props {
  open: boolean;
  mode: PublishProgressMode;
}

// Phase labels roll forward based on elapsed time. Values are heuristics tuned
// for a typical article (0-3 SVG blocks); users with 5+ SVGs will sit on the
// later "仍在上传" phases longer, which is fine — the spinner + timer already
// signal "still alive."
interface Phase {
  atMs: number;
  text: string;
}

const DRAFT_PHASES: Phase[] = [
  { atMs: 0, text: "保存当前稿件…" },
  { atMs: 2000, text: "检查公众号兼容性…" },
  { atMs: 5000, text: "上传 <img> 到公众号素材库…" },
  { atMs: 30000, text: "外链图片较多，仍在上传…" },
  { atMs: 90000, text: "仍在上传。外链图片多或网络慢时需要更长时间。" },
];

const COPY_PHASES: Phase[] = [
  { atMs: 0, text: "净化 HTML、内联 CSS…" },
  { atMs: 2000, text: "上传 <img> 到公众号素材库…" },
  { atMs: 30000, text: "外链图片较多，仍在上传…" },
  { atMs: 90000, text: "仍在处理。" },
];

const TITLE: Record<PublishProgressMode, string> = {
  draft: "正在发送到草稿箱",
  copy: "正在生成富文本",
};

function pickPhase(phases: Phase[], elapsedMs: number): Phase {
  // Phases are ordered by atMs; walk from the end and return the first match.
  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsedMs >= phases[i].atMs) return phases[i];
  }
  return phases[0];
}

export default function PublishProgress({ open, mode }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 500);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const phases = mode === "draft" ? DRAFT_PHASES : COPY_PHASES;
  const phase = pickPhase(phases, elapsedMs);
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-progress-title"
      data-testid="publish-progress"
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1100,
        padding: 20,
        outline: "none",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          width: "min(420px, 100%)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          borderLeft: "4px solid var(--orange-500)",
          padding: "20px 22px 18px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div className="spinner" aria-hidden="true" />
          <div
            id="publish-progress-title"
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "var(--f-display)",
              letterSpacing: "0.02em",
            }}
          >
            {TITLE[mode]}
          </div>
        </div>
        <div
          data-testid="publish-progress-phase"
          style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 14, minHeight: 44 }}
        >
          {phase.text}
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily: "var(--f-mono)",
            color: "var(--fg-4)",
            display: "flex",
            justifyContent: "space-between",
            letterSpacing: "0.05em",
          }}
        >
          <span>{seconds}s</span>
          <span>请勿关闭或刷新</span>
        </div>
      </div>
    </div>
  );
}
