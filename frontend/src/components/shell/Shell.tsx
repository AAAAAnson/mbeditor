import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./TopBar";
import BottomTabBar from "./BottomTabBar";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { parsePath, pathForRoute } from "@/lib/route";
import type { Route } from "@/types";

/** 编辑/写作流自带「← 返回起稿台」,窄屏无需再叠底栏。 */
const BOTTOM_TAB_HIDDEN_ROUTES: Route[] = ["editor", "compose"];

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
  replaceParams: (params: Record<string, string>) => void;
  goBack: () => void;
  canGoBack: boolean;
}

const DEFAULT_NAVIGATION_STATE: NavigationState = {
  route: "list",
  params: {},
  idx: 0,
};

function isRoute(value: unknown): value is Route {
  return (
    value === "list" ||
    value === "editor" ||
    value === "settings" ||
    value === "compose" ||
    value === "welcome"
  );
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

// On a fresh tab / direct link, history.state is null and the URL pathname
// is the only signal. On in-app pushState navigations we have both. Prefer
// history.state when present (it carries our idx counter for back-button
// logic) and fall back to parsing the URL.
function readInitialState(): NavigationState {
  if (typeof window === "undefined") return DEFAULT_NAVIGATION_STATE;
  const fromHistory = readHistoryState(window.history.state);
  if (fromHistory) return fromHistory;
  // Include the query string so deep-links like /settings?section=aiengine
  // survive a fresh tab / full-page reload (history.state is null then).
  const parsed = parsePath(window.location.pathname + window.location.search);
  return { route: parsed.route, params: parsed.params, idx: 0 };
}

interface ShellProps {
  children: (
    route: Route,
    params: Record<string, string>,
    navigation: NavigationControls,
  ) => React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const initialState = readInitialState();
  const [navigationState, setNavigationState] = useState<NavigationState>(initialState);
  const navigationStateRef = useRef(initialState);

  useTheme();

  const applyNavigationState = useCallback((nextState: NavigationState) => {
    navigationStateRef.current = nextState;
    setNavigationState(nextState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Sync history.state and the URL pathname with whatever we resolved as
    // the initial state. This covers two cases:
    //  - direct link to /a/<slug>: history.state is null but pathname is set
    //  - fresh / SSR boot: both default to /
    const currentState = readHistoryState(window.history.state) ?? readInitialState();
    const desiredPath = pathForRoute(currentState.route, currentState.params);
    const needsHistoryStateWrite = !readHistoryState(window.history.state);
    const needsPathWrite = window.location.pathname !== desiredPath;
    if (needsHistoryStateWrite || needsPathWrite) {
      window.history.replaceState(toHistoryState(currentState), "", desiredPath);
    }
    applyNavigationState(currentState);

    const handlePopState = (event: PopStateEvent) => {
      // Prefer the state object the browser carried with this entry; fall
      // back to re-parsing the pathname if it's missing (e.g. user typed a
      // new URL directly into the address bar without a reload).
      const fromHistory = readHistoryState(event.state);
      const nextState = fromHistory ?? (() => {
        const parsed = parsePath(window.location.pathname + window.location.search);
        return { route: parsed.route, params: parsed.params, idx: navigationStateRef.current.idx };
      })();
      if (!fromHistory) {
        window.history.replaceState(toHistoryState(nextState), "", pathForRoute(nextState.route, nextState.params));
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
      window.history.pushState(toHistoryState(nextState), "", pathForRoute(route, nextParams));
    }
    applyNavigationState(nextState);
  }, [applyNavigationState]);

  const replaceParams = useCallback((params: Record<string, string>) => {
    // Used when a derived URL field changes (e.g. an article's title was
    // renamed and the slug needs to update) — we want to keep the URL in
    // sync without growing the history stack.
    const nextParams = { ...params };
    const currentState = navigationStateRef.current;
    if (sameParams(currentState.params, nextParams)) return;
    const nextState: NavigationState = { ...currentState, params: nextParams };
    if (typeof window !== "undefined") {
      window.history.replaceState(toHistoryState(nextState), "", pathForRoute(nextState.route, nextParams));
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
      window.history.replaceState(toHistoryState(DEFAULT_NAVIGATION_STATE), "", "/");
    }
    applyNavigationState(DEFAULT_NAVIGATION_STATE);
  }, [applyNavigationState]);

  const navigation: NavigationControls = {
    navigate,
    replaceParams,
    goBack,
    canGoBack: navigationState.idx > 0,
  };

  const isMobile = useIsMobile();
  const showBottomTab = isMobile && !BOTTOM_TAB_HIDDEN_ROUTES.includes(navigationState.route);

  return (
    <div
      className="grid"
      style={{
        // [topbar][content](+[bottomtab] on mobile) column. Row sizing via CSS
        // var so the topbar height stays themeable / overridable per breakpoint.
        gridTemplateRows: showBottomTab
          ? "var(--topbar-h, 44px) 1fr auto"
          : "var(--topbar-h, 44px) 1fr",
        height: "100vh",
        minHeight: 0,
        background: "var(--bg)",
      }}
    >
      <TopBar route={navigationState.route} onNavigate={navigate} />
      <div className="flex-1" style={{ minWidth: 0, minHeight: 0 }}>
        {children(navigationState.route, navigationState.params, navigation)}
      </div>
      {showBottomTab && <BottomTabBar route={navigationState.route} onNavigate={navigate} />}
    </div>
  );
}

export { type Route };
