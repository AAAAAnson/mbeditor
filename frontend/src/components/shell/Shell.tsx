import { useState } from "react";
import TopBar from "./TopBar";
import SideRail from "./SideRail";
import TweaksPanel from "./TweaksPanel";
import { useTheme } from "@/hooks/useTheme";
import type { Route } from "@/types";

interface ShellProps {
  children: (
    route: Route,
    params: Record<string, string>,
    navigate: (r: Route, params?: Record<string, string>) => void,
  ) => React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const [route, setRoute] = useState<Route>("list");
  const [params, setParams] = useState<Record<string, string>>({});

  useTheme();

  const navigate = (r: Route, p?: Record<string, string>) => {
    setRoute(r);
    if (p) setParams(p);
    else setParams({});
  };

  return (
    <div className="grid" style={{ gridTemplateRows: "44px 1fr", height: "100vh", background: "var(--bg)" }}>
      <TopBar route={route} onNavigate={navigate} />
      <div className="flex" style={{ minHeight: 0 }}>
        <SideRail route={route} onNavigate={navigate} />
        <div className="flex-1" style={{ minWidth: 0, minHeight: 0 }}>
          {children(route, params, navigate)}
        </div>
      </div>
      <TweaksPanel />
    </div>
  );
}

export { type Route };
