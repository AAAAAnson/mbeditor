import type { MBDocBlockSummary, ProjectionFreshness } from "@/features/editor/types";

interface BlockListProps {
  blocks: MBDocBlockSummary[];
  selectedBlockId: string | null;
  projectionFreshness: ProjectionFreshness;
  onSelectBlock: (blockId: string) => void;
}

function getProjectionFreshnessLabel(projectionFreshness: ProjectionFreshness) {
  switch (projectionFreshness) {
    case "ready":
      return "已同步";
    case "syncing":
      return "同步中";
    default:
      return "待刷新";
  }
}

export default function BlockList({
  blocks,
  selectedBlockId,
  projectionFreshness,
  onSelectBlock,
}: BlockListProps) {
  if (!blocks.length) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1 rounded-lg border border-border-primary/70 bg-surface-tertiary/50 p-2">
      <div className="flex items-center justify-between px-1 text-[10px] font-mono uppercase tracking-[1.2px] text-fg-muted">
        <span>投影块</span>
        <span>
          {blocks.length} 个 · {getProjectionFreshnessLabel(projectionFreshness)}
        </span>
      </div>
      <div className="space-y-1">
        {blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => onSelectBlock(block.id)}
            className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] text-fg-secondary transition-colors ${
              selectedBlockId === block.id
                ? "bg-accent/10 ring-1 ring-accent/30"
                : "hover:bg-surface-secondary"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-fg-primary">
                {block.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-fg-muted">
                {block.type}
              </span>
            </div>
            <div className="truncate font-mono text-[10px] text-fg-muted">
              {block.id}
            </div>
            <div className="truncate text-[10px] text-fg-muted">
              {block.editable ? "可直接编辑" : "仅可编辑原始内容"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
