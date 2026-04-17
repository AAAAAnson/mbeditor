import type {
  BlockEditorMode,
  MBDocBlockSummary,
  ProjectionFreshness,
} from "@/features/editor/types";

interface BlockInspectorProps {
  articleMode: "html" | "markdown";
  selectedBlockSummary: MBDocBlockSummary | null;
  blockEditorMode: BlockEditorMode;
  projectionFreshness: ProjectionFreshness;
  canShowProjectedMode: boolean;
  hint: string;
  onSetBlockEditorMode: (mode: BlockEditorMode) => void;
}

function getProjectionStatusLabel(projectionFreshness: ProjectionFreshness) {
  switch (projectionFreshness) {
    case "ready":
      return "已同步";
    case "syncing":
      return "同步中";
    default:
      return "待刷新";
  }
}

export default function BlockInspector({
  articleMode,
  selectedBlockSummary,
  blockEditorMode,
  projectionFreshness,
  canShowProjectedMode,
  hint,
  onSetBlockEditorMode,
}: BlockInspectorProps) {
  const projectionStatusTone =
    projectionFreshness === "ready"
      ? "text-success"
      : projectionFreshness === "syncing"
        ? "text-warning"
        : "text-fg-muted";

  return (
    <>
      <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
        <span className="font-mono text-[10px] font-semibold tracking-[1.5px] uppercase text-fg-muted">
          属性
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-accent-bg px-2 py-0.5 text-[10px] font-mono font-medium text-accent">
          {selectedBlockSummary?.type ?? (articleMode === "markdown" ? "Markdown" : "HTML")}
        </span>
      </div>

      <div className="space-y-3 border-b border-border-primary px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[1.2px] text-fg-muted">
            投影状态
          </span>
          <span className={`text-[10px] font-mono uppercase ${projectionStatusTone}`}>
            {getProjectionStatusLabel(projectionFreshness)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSetBlockEditorMode("legacy-fragment")}
            className={`rounded-md px-3 py-2 text-[11px] font-medium transition-colors ${
              blockEditorMode === "legacy-fragment"
                ? "bg-accent text-white"
                : "bg-surface-tertiary text-fg-secondary hover:text-fg-primary"
            }`}
          >
            原始
          </button>
          <button
            onClick={() => onSetBlockEditorMode("projected-block")}
            disabled={!canShowProjectedMode}
            className={`rounded-md px-3 py-2 text-[11px] font-medium transition-colors ${
              blockEditorMode === "projected-block" && canShowProjectedMode
                ? "bg-accent text-white"
                : "bg-surface-tertiary text-fg-secondary hover:text-fg-primary disabled:opacity-50"
            }`}
          >
            块编辑
          </button>
        </div>
        <div className="space-y-1">
          <div className="text-[12px] font-medium text-fg-primary">
            {selectedBlockSummary?.label ?? "原始内容"}
          </div>
          <div className="text-[11px] text-fg-muted">{hint}</div>
        </div>
      </div>
    </>
  );
}
