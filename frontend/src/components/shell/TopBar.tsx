import { useEffect } from "react";
import BrandMark from "@/components/shared/BrandMark";
import { useHealthStore } from "@/stores/healthStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import type { Route } from "@/types";

interface TopBarProps {
  route: Route;
  onNavigate: (route: Route) => void;
}

const NAV_ITEMS: { key: Route; label: string }[] = [
  { key: "list", label: "起稿台" },
  { key: "settings", label: "设置" },
];

/** Routes where the user is mid-document — show a status label, not a tab. */
const EDITING_ROUTES: Route[] = ["editor", "compose"];

export default function TopBar({ route, onNavigate }: TopBarProps) {
  const healthStatus = useHealthStore((s) => s.status);
  const startHealth = useHealthStore((s) => s.start);
  const isEditing = EDITING_ROUTES.includes(route);
  const isMobile = useIsMobile();

  // Begin the backend health poll once the chrome is mounted. start() is
  // idempotent, so a re-mount (HMR / route swap) never double-polls.
  useEffect(() => {
    startHealth();
  }, [startHealth]);

  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: "auto 1fr auto",
        gap: 20,
        height: "var(--topbar-h)",
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(to bottom, var(--surface), var(--bg))",
        position: "relative",
        zIndex: 20,
      }}
    >
      <button
        onClick={() => onNavigate("list")}
        className="flex items-center"
        style={{
          all: "unset",
          // all:"unset" 优先级高于 .flex 类,会把 display:flex/align-items 一并重置,
          // 致 logo 与「MBEditor」退回流式换行错位 —— 必须在行内补回。
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontFamily: "var(--f-display)",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          color: "var(--fg)",
        }}
        title="回起稿台"
      >
        <BrandMark size={22} />
        <span>MBEditor</span>
      </button>

      <div className="flex items-center justify-center" style={{ gap: 4 }}>
        {isEditing ? (
          <span
            style={{
              fontSize: 13,
              color: "var(--fg-3)",
              padding: "6px 14px",
            }}
          >
            编辑中
          </span>
        ) : isMobile ? null : (
          NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              style={{
                all: "unset",
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13,
                color: route === item.key ? "var(--orange-700)" : "var(--ink-soft)",
                background: route === item.key ? "var(--orange-50)" : "transparent",
                cursor: "pointer",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (route !== item.key) (e.currentTarget as HTMLElement).style.color = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                if (route !== item.key) (e.currentTarget as HTMLElement).style.color = "var(--ink-soft)";
              }}
            >
              {item.label}
            </button>
          ))
        )}
      </div>

      <div className="flex items-center" style={{ gap: 8 }}>
        <HealthDot status={healthStatus} />
      </div>
    </div>
  );
}

/**
 * F5: the "后端在线" pulse is downgraded, not deleted — it's the only visible
 * "backend is down" signal. Silent (a faint grey dot) while healthy/unknown;
 * only a sustained outage turns it into a red, clickable control.
 */
function HealthDot({ status }: { status: "ok" | "down" | "unknown" }) {
  if (status === "down") {
    return (
      <button
        data-testid="health-dot"
        title="后端不可用 — 点击查看详情"
        aria-label="后端不可用"
        style={{
          all: "unset",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontSize: 12,
          color: "var(--accent)",
        }}
        onClick={() => window.location.reload()}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            display: "inline-block",
          }}
        />
        后端不可用
      </button>
    );
  }

  // Healthy or unknown: a quiet, unobtrusive grey dot.
  return (
    <span
      data-testid="health-dot"
      aria-hidden="true"
      title="后端状态"
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--fg-5, var(--border-2))",
        display: "inline-block",
        opacity: 0.6,
      }}
    />
  );
}
