import BrandLogo from "@/components/shared/BrandLogo";
import Chip from "@/components/shared/Chip";
import Pulse from "@/components/shared/Pulse";
import { IconTweak } from "@/components/icons";
import { useClock } from "@/hooks/useClock";
import { useUIStore } from "@/stores/uiStore";
import type { Route } from "@/types";

interface TopBarProps {
  route: Route;
  onNavigate: (route: Route) => void;
}

const NAV_ITEMS: { key: Route; label: string }[] = [
  { key: "list", label: "文章" },
  { key: "editor", label: "编辑器" },
];

function backendLabel() {
  if (typeof window === "undefined") return "127.0.0.1:7072";

  const { hostname, port } = window.location;
  if (port === "5173") return `${hostname}:8000`;
  if (port === "7073") return `${hostname}:7072`;
  return `${hostname}:7072`;
}

export default function TopBar({ route, onNavigate }: TopBarProps) {
  const time = useClock();
  const setTweaksOpen = useUIStore((s) => s.setTweaksOpen);
  const tweaksOpen = useUIStore((s) => s.tweaksOpen);
  const apiHost = backendLabel();

  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: "auto 1fr auto",
        gap: 20,
        height: 44,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(to bottom, var(--surface), var(--bg))",
        position: "relative",
        zIndex: 20,
      }}
    >
      <BrandLogo size={18} />

      <div
        className="flex items-center justify-center"
        style={{
          gap: 2,
          fontFamily: "var(--f-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            style={{
              all: "unset",
              padding: "6px 14px",
              borderRadius: 6,
              color: route === item.key ? "var(--fg)" : "var(--fg-4)",
              background: route === item.key ? "var(--surface-2)" : "transparent",
              cursor: "pointer",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (route !== item.key) (e.target as HTMLElement).style.color = "var(--fg-2)";
            }}
            onMouseLeave={(e) => {
              if (route !== item.key) (e.target as HTMLElement).style.color = "var(--fg-4)";
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="flex items-center"
        style={{
          gap: 8,
          fontFamily: "var(--f-mono)",
          fontSize: 11,
        }}
      >
        <Chip tone="forest" style={{ gap: 8 }}>
          <Pulse size={6} />后端在线 &middot; {apiHost}
        </Chip>
        <Chip className="mono tnum" style={{ color: "var(--fg-3)" }}>{time}</Chip>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setTweaksOpen(!tweaksOpen)}
          title="界面设置"
        >
          <IconTweak size={13} /> 界面
        </button>
      </div>
    </div>
  );
}
