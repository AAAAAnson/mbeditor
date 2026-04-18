import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./TopBar";
import SideRail from "./SideRail";
import TweaksPanel from "./TweaksPanel";
import { useTheme } from "@/hooks/useTheme";
import type { Route } from "@/types";

interface NavigationState {
  route: Route;
  params: Record<string, string>;
  idx: number;
}

interface HistoryState extends NavigationState {
  __mbeditor: true;
}

export interface NavigationControls {
  navigate: (route: Route, params?: Record<string, string>) => void;
  goBack: () => void;
  canGoBack: boolean;
}

const DEFAULT_NAVIGATION_STATE: NavigationState = {
  route: "list",
  params: {},
  idx: 0,
};

function isRoute(value: unknown): value is Route {
  return value === "list" || value === "editor" || value === "settings";
}

function normalizeParams(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
    if (typeof item === "string") acc[key] = item;
    return acc;
  }, {});
}

function sameParams(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function readHistoryState(value: unknown): NavigationState | null {
  if (!value || typeof value !== "object") return null;

  const state = value as Partial<HistoryState>;
  if (state.__mbeditor !== true || !isRoute(state.route) || typeof state.idx !== "number") {
    return null;
  }

  return {
    route: state.route,
    params: normalizeParams(state.params),
    idx: state.idx,
  };
}

function toHistoryState(state: NavigationState): HistoryState {
  return { __mbeditor: true, ...state };
}

interface ShellProps {
  children: (
    route: Route,
    params: Record<string, string>,
    navigation: NavigationControls,
  ) => React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const initialState = typeof window === "undefined"
    ? DEFAULT_NAVIGATION_STATE
    : readHistoryState(window.history.state) ?? DEFAULT_NAVIGATION_STATE;
  const [navigationState, setNavigationState] = useState<NavigationState>(initialState);
  const navigationStateRef = useRef(initialState);

  useTheme();

  const applyNavigationState = useCallback((nextState: NavigationState) => {
    navigationStateRef.current = nextState;
    setNavigationState(nextState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentState = readHistoryState(window.history.state) ?? DEFAULT_NAVIGATION_STATE;
    if (!readHistoryState(window.history.state)) {
      window.history.replaceState(toHistoryState(currentState), "");
    }
    applyNavigationState(currentState);

    const handlePopState = (event: PopStateEvent) => {
      const nextState = readHistoryState(event.state) ?? DEFAULT_NAVIGATION_STATE;
      if (!readHistoryState(event.state)) {
        window.history.replaceState(toHistoryState(nextState), "");
      }
      applyNavigationState(nextState);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyNavigationState]);

  const navigate = useCallback((route: Route, params?: Record<string, string>) => {
    const nextParams = params ? { ...params } : {};
    const currentState = navigationStateRef.current;

    if (currentState.route === route && sameParams(currentState.params, nextParams)) {
      return;
    }

    const nextState: NavigationState = {
      route,
      params: nextParams,
      idx: currentState.idx + 1,
    };

    if (typeof window !== "undefined") {
      window.history.pushState(toHistoryState(nextState), "");
    }
    applyNavigationState(nextState);
  }, [applyNavigationState]);

  const goBack = useCallback(() => {
    const currentState = navigationStateRef.current;

    if (typeof window !== "undefined" && currentState.idx > 0) {
      window.history.back();
      return;
    }

    if (currentState.route === DEFAULT_NAVIGATION_STATE.route && sameParams(currentState.params, DEFAULT_NAVIGATION_STATE.params)) {
      return;
    }

    if (typeof window !== "undefined") {
      window.history.replaceState(toHistoryState(DEFAULT_NAVIGATION_STATE), "");
    }
    applyNavigationState(DEFAULT_NAVIGATION_STATE);
  }, [applyNavigationState]);

  const navigation: NavigationControls = {
    navigate,
    goBack,
    canGoBack: navigationState.idx > 0,
  };

  return (
    <div className="grid" style={{ gridTemplateRows: "44px 1fr", height: "100vh", background: "var(--bg)" }}>
      <TopBar route={navigationState.route} onNavigate={navigate} />
      <div className="flex" style={{ minHeight: 0 }}>
        <SideRail route={navigationState.route} onNavigate={navigate} />
        <div className="flex-1" style={{ minWidth: 0, minHeight: 0 }}>
          {children(navigationState.route, navigationState.params, navigation)}
        </div>
      </div>
      <TweaksPanel />
    </div>
  );
}

export { type Route };
