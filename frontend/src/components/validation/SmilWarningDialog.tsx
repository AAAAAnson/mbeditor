// 信息级预警:SVG SMIL 动画(<animate> 等)在「交互预览」能动,但发到公众号会被微信
// sanitize 成静态。在发布动作(复制到公众号 / 发草稿箱)真正执行前提示,默认可继续 ——
// 与 ValidationBlockDialog 的「硬拦·必须修复」语气区分开,不吓退小白。
import { useRef } from "react";
import { IconSparkle } from "@/components/icons";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  open: boolean;
  count: number;
  onContinue: () => void;
  onCancel: () => void;
}

export default function SmilWarningDialog({ open, count, onContinue, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, onCancel);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="smil-warning-title"
      data-testid="smil-warning-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1200,
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          width: "min(460px, 100%)",
          border: "1px solid var(--line)",
          borderLeft: "4px solid var(--warn)",
          borderRadius: "var(--r-md)",
          padding: "20px 22px 18px",
          boxShadow: "var(--shadow-lg)",
          outline: "none",
        }}
      >
        <div
          id="smil-warning-title"
          style={{
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "var(--f-display)",
            letterSpacing: "0.02em",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <IconSparkle size={16} /> 这些动画发到公众号会变静态
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 16 }}>
          检测到 {count} 处 SVG 动画。发到公众号后，微信会把它们清成静态图，动效只在「交互预览」里能看到。
          想要好看的静态版式可以直接继续；若一定要动起来，考虑改用 GIF 或视频。
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="btn btn-primary btn-sm"
            data-testid="smil-warning-continue"
            onClick={onContinue}
            autoFocus
            style={{ minHeight: 44, order: 2 }}
          >
            我知道了，继续
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ minHeight: 44, order: 1 }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
