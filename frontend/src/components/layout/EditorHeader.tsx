import { Link, useNavigate } from "react-router-dom";
import { Code, LayoutGrid, Columns2, Eye, Send, Settings } from "lucide-react";

interface EditorHeaderProps {
  title: string;
  mode: "html" | "markdown";
  viewMode: "code" | "split" | "preview";
  onViewModeChange: (mode: "code" | "split" | "preview") => void;
  onPreview: () => void;
  onPublish: () => void;
}

const viewModes = [
  { key: "code" as const, label: "代码", icon: Code },
  { key: "split" as const, label: "可视化", icon: LayoutGrid },
  { key: "preview" as const, label: "分屏", icon: Columns2 },
];

export default function EditorHeader({
  title,
  viewMode,
  onViewModeChange,
  onPreview,
  onPublish,
}: EditorHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="h-[52px] bg-bg-primary border-b border-border-primary px-4 flex items-center justify-between shrink-0">
      {/* Left: Logo + Breadcrumb */}
      <div className="flex items-center gap-3.5">
        <Link
          to="/"
          className="text-fg-primary font-bold text-[17px] tracking-tight"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          MBEditor
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-border-secondary select-none">›</span>
          <span className="text-xs text-fg-secondary truncate max-w-[200px]">
            {title}
          </span>
        </div>
      </div>

      {/* Center: View mode tabs */}
      <div className="flex items-center bg-surface-secondary border border-border-primary rounded-lg p-[3px] gap-0.5">
        {viewModes.map(({ key, label, icon: Icon }) => {
          const isActive = viewMode === key;
          return (
            <button
              key={key}
              onClick={() => onViewModeChange(key)}
              className={`flex items-center gap-[5px] py-[5px] px-3.5 rounded-[6px] text-xs font-medium transition-all ${
                isActive
                  ? "bg-accent text-white shadow"
                  : "text-fg-muted hover:text-fg-secondary"
              }`}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Preview + Publish + Avatar */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPreview}
          className="flex items-center gap-1.5 border border-border-secondary rounded-lg py-1.5 px-3 text-fg-secondary hover:text-fg-primary hover:border-border-primary transition-colors"
        >
          <Eye size={13} />
          <span className="text-xs">预览</span>
        </button>

        <button
          onClick={onPublish}
          className="flex items-center gap-1.5 bg-accent text-white rounded-lg py-1.5 px-3.5 shadow-glow hover:brightness-110 transition-all"
        >
          <Send size={13} />
          <span className="text-xs font-semibold">发布</span>
        </button>

        <button
          onClick={() => navigate("/settings")}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg-primary hover:bg-surface-hover transition-colors"
          title="设置"
        >
          <Settings size={16} />
        </button>

        <div
          className="w-7 h-7 rounded-full shrink-0"
          style={{
            background: "linear-gradient(135deg, #E8553A, #C9923E)",
          }}
        />
      </div>
    </header>
  );
}
