import BrandLogo from "@/components/shared/BrandLogo";
import Chip from "@/components/shared/Chip";
import Pulse from "@/components/shared/Pulse";
import { IconTweak, IconGithub } from "@/components/icons";
import { useClock } from "@/hooks/useClock";
import { useUIStore } from "@/stores/uiStore";
import type { Route } from "@/types";

const GITHUB_REPO_URL = "https://github.com/AAAAAnson/mbeditor";

interface TopBarProps {
  route: Route;
  onNavigate: (route: Route) => void;
}

const NAV_ITEMS: { key: Route; label: string }[] = [
  { key: "list", label: "文章" },
  { key: "editor", label: "编辑器" },
];

export default function TopBar({ route, onNavigate }: TopBarProps) {
  const time = useClock();
  const setTweaksOpen = useUIStore((s) => s.setTweaksOpen);
  const tweaksOpen = useUIStore((s) => s.tweaksOpen);

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
          <Pulse size={6} />后端在线
        </Chip>
        <Chip className="mono tnum" style={{ color: "var(--fg-3)" }}>{time}</Chip>
        <a
          className="btn btn-ghost btn-sm"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          aria-label="在 GitHub 查看源代码"
        >
          <IconGithub size={13} />
        </a>
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
