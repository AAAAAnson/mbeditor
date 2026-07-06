import { IconList, IconSettings } from "@/components/icons";
import type { Route } from "@/types";

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
}

const TABS: { key: Route; label: string; Icon: typeof IconList }[] = [
  { key: "list", label: "起稿台", Icon: IconList },
  { key: "settings", label: "设置", Icon: IconSettings },
];

/**
 * 移动底部导航(<600px 时由 Shell 在非编辑路由挂载)。仅 2 个目的地,
 * 底栏双大按钮比汉堡更省一次点击;触控目标 ≥44px。色值走 CSS 变量,
 * paddingBottom 留 iPhone 底部安全区。
 */
export default function BottomTabBar({ route, onNavigate }: Props) {
  return (
    <nav
      aria-label="主导航"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map(({ key, label, Icon }) => {
        const active = route === key;
        return (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            aria-current={active ? "page" : undefined}
            style={{
              all: "unset",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              minHeight: 52,
              cursor: "pointer",
              fontSize: 11,
              color: active ? "var(--orange-700)" : "var(--ink-soft)",
              background: active ? "var(--orange-50)" : "transparent",
              borderRadius: 12,
            }}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
