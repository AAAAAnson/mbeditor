import { IconList, IconEdit, IconSettings } from "@/components/icons";
import type { Route } from "@/types";

interface SideRailProps {
  route: Route;
  onNavigate: (route: Route) => void;
}

const ITEMS: { key: Route; icon: (s: number) => React.ReactNode; label: string }[] = [
  { key: "list", icon: (s) => <IconList size={s} />, label: "文章" },
  { key: "editor", icon: (s) => <IconEdit size={s} />, label: "编辑器" },
];

export default function SideRail({ route, onNavigate }: SideRailProps) {
  return (
    <div
      className="flex flex-col items-center shrink-0"
      style={{
        padding: "12px 0",
        gap: 4,
        width: 52,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-deep)",
      }}
    >
      {ITEMS.map((item) => {
        const active = route === item.key;
        return (
          <button
            key={item.key}
            title={item.label}
            onClick={() => onNavigate(item.key)}
            className={`rail-btn ${active ? "active" : ""}`}
            style={{
              all: "unset",
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--r-sm)",
              color: active ? "var(--fg)" : "var(--fg-4)",
              background: active ? "var(--surface-2)" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.color = "var(--fg-2)";
                (e.currentTarget as HTMLElement).style.background = "var(--surface)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.color = "var(--fg-4)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }
            }}
          >
            {active && (
              <span
                style={{
                  position: "absolute",
                  left: -11,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: "var(--accent)",
                  borderRadius: 2,
                }}
              />
            )}
            {item.icon(16)}
          </button>
        );
      })}
      {/* Settings button pinned above the label */}
      <button
        title="设置"
        onClick={() => onNavigate("settings")}
        className={`rail-btn ${route === "settings" ? "active" : ""}`}
        style={{
          all: "unset",
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--r-sm)",
          color: route === "settings" ? "var(--fg)" : "var(--fg-4)",
          background: route === "settings" ? "var(--surface-2)" : "transparent",
          cursor: "pointer",
          transition: "all 0.15s",
          position: "relative",
          marginTop: "auto",
        }}
        onMouseEnter={(e) => {
          if (route !== "settings") {
            (e.currentTarget as HTMLElement).style.color = "var(--fg-2)";
            (e.currentTarget as HTMLElement).style.background = "var(--surface)";
          }
        }}
        onMouseLeave={(e) => {
          if (route !== "settings") {
            (e.currentTarget as HTMLElement).style.color = "var(--fg-4)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }
        }}
      >
        {route === "settings" && (
          <span
            style={{
              position: "absolute",
              left: -11,
              top: 8,
              bottom: 8,
              width: 2,
              background: "var(--accent)",
              borderRadius: 2,
            }}
          />
        )}
        <IconSettings size={16} />
      </button>
      <div
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontFamily: "var(--f-mono)",
          fontSize: 9,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--fg-5)",
          paddingBottom: 8,
        }}
      >
        MBEDITOR &middot; 2026
      </div>
    </div>
  );
}
