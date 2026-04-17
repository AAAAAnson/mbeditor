import { usePlatform } from "@/hooks/usePlatform";
import { WORD_COUNT_TOOLTIP } from "@/utils/wordCount";

interface CommandBarProps {
  wordCount: number;
  saved: boolean;
}

export default function CommandBar({ wordCount, saved }: CommandBarProps) {
  const { mod } = usePlatform();

  return (
    <div className="h-10 bg-surface-secondary border-t border-border-primary flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-[340px] h-7 bg-surface-tertiary border border-border-secondary rounded-lg flex items-center px-2.5 gap-1.5">
          <span className="text-accent font-mono text-xs font-semibold">/</span>
          <span className="text-fg-muted text-xs truncate">
            输入 / 插入组件，按 {mod}K 打开命令面板
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-fg-muted font-mono">
          <span>
            <kbd className="text-fg-secondary">{mod}K</kbd> 命令
          </span>
          <span>
            <kbd className="text-fg-secondary">{mod}S</kbd> 保存
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3.5 text-[10px] text-fg-muted font-mono">
        <span>100%</span>
        <span title={WORD_COUNT_TOOLTIP}>{wordCount.toLocaleString()} 字</span>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              saved ? "bg-success" : "bg-warning"
            }`}
          />
          <span className={saved ? "text-success" : "text-warning"}>
            {saved ? "已保存" : "未保存"}
          </span>
        </div>
      </div>
    </div>
  );
}
