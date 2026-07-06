import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Shell from "./Shell";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

function ShellHarness() {
  return (
    <Shell>
      {(route, params, navigation) => (
        <div>
          <div data-testid="route">{route}:{params.articleSlug ?? ""}</div>
          <div data-testid="section">{params.section ?? ""}</div>
          <div data-testid="back-state">{navigation.canGoBack ? "yes" : "no"}</div>
          <button onClick={() => navigation.navigate("editor", { articleSlug: "draft-1-3f2a" })}>
            Open editor
          </button>
          <button onClick={() => navigation.navigate("settings", { section: "aiengine" })}>
            Open settings
          </button>
          <button onClick={() => navigation.replaceParams({ articleSlug: "renamed-3f2a" })}>
            Rename
          </button>
          <button onClick={navigation.goBack}>Back</button>
        </div>
      )}
    </Shell>
  );
}

describe("Shell navigation", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("pushes editor navigation into history with a URL path and handles popstate", () => {
    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("list:");
    expect(screen.getByTestId("back-state")).toHaveTextContent("no");
    expect(window.location.pathname).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));

    expect(screen.getByTestId("route")).toHaveTextContent("editor:draft-1-3f2a");
    expect(screen.getByTestId("back-state")).toHaveTextContent("yes");
    expect(window.location.pathname).toBe("/a/draft-1-3f2a");
    expect(window.history.state).toMatchObject({
      __mbeditor: true,
      route: "editor",
      params: { articleSlug: "draft-1-3f2a" },
      idx: 1,
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", {
        state: {
          __mbeditor: true,
          route: "list",
          params: {},
          idx: 0,
        },
      }));
    });

    expect(screen.getByTestId("route")).toHaveTextContent("list:");
    expect(screen.getByTestId("back-state")).toHaveTextContent("no");
  });

  it("falls back to the article list when there is no in-app history", () => {
    window.history.replaceState({
      __mbeditor: true,
      route: "editor",
      params: { articleSlug: "draft-1-3f2a" },
      idx: 0,
    }, "", "/a/draft-1-3f2a");

    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("editor:draft-1-3f2a");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByTestId("route")).toHaveTextContent("list:");
    expect(window.location.pathname).toBe("/");
    expect(window.history.state).toMatchObject({
      __mbeditor: true,
      route: "list",
      params: {},
      idx: 0,
    });
  });

  it("initializes from the URL pathname on a direct link", () => {
    window.history.replaceState(null, "", "/a/some-article-3f2a");

    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("editor:some-article-3f2a");
    // Direct link → no in-app history, back button disabled.
    expect(screen.getByTestId("back-state")).toHaveTextContent("no");
  });

  it("replaceParams updates the URL without growing history", () => {
    render(<ShellHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));

    const idxAfterPush = (window.history.state as { idx: number }).idx;

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(screen.getByTestId("route")).toHaveTextContent("editor:renamed-3f2a");
    expect(window.location.pathname).toBe("/a/renamed-3f2a");
    // Same idx — replaceState doesn't grow the stack.
    expect((window.history.state as { idx: number }).idx).toBe(idxAfterPush);
  });

  it("recognizes the compose route from history state", () => {
    window.history.replaceState({
      __mbeditor: true,
      route: "compose",
      params: {},
      idx: 1,
    }, "", "/new");

    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("compose:");
    expect(window.location.pathname).toBe("/new");
  });

  it("keeps compose route across a popstate carrying compose state", () => {
    render(<ShellHarness />);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", {
        state: { __mbeditor: true, route: "compose", params: {}, idx: 1 },
      }));
    });
    expect(screen.getByTestId("route")).toHaveTextContent("compose:");
  });
});

describe("Shell layout (single column, no side rail)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("does not render the SideRail brand mark", () => {
    render(<ShellHarness />);
    // The vertical "MBEditor · 2026" mark lived only in SideRail.
    expect(screen.queryByText(/MBEditor · 2026/)).not.toBeInTheDocument();
  });

  it("renders content directly under the topbar without a rail wrapper", () => {
    const { container } = render(<ShellHarness />);
    // Single-column shell: the content row holds exactly the children, with
    // no preceding side-rail sibling. The route marker is the first/only
    // content node in its row.
    const routeNode = screen.getByTestId("route");
    const contentRow = routeNode.parentElement?.parentElement;
    expect(contentRow).not.toBeNull();
    // No rail nav buttons (文章/编辑器/设置 icon buttons) inside the shell row.
    expect(within(contentRow as HTMLElement).queryByTitle("文章")).toBeNull();
    expect(within(contentRow as HTMLElement).queryByTitle("设置")).toBeNull();
    expect(within(contentRow as HTMLElement).queryByTitle("编辑器")).toBeNull();
  });

  it("sizes the topbar row from --topbar-h", () => {
    const { container } = render(<ShellHarness />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.gridTemplateRows).toBe("var(--topbar-h, 44px) 1fr");
  });

  it("passes settings section params through to children (deep-link)", () => {
    render(<ShellHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(screen.getByTestId("route")).toHaveTextContent("settings:");
    expect(screen.getByTestId("section")).toHaveTextContent("aiengine");
  });

  it("recovers the settings section from ?section= on a fresh page load", () => {
    // Direct link / full-page refresh: history.state is null, the section
    // lives only in the query string. readInitialState must parse it.
    window.history.replaceState(null, "", "/settings?section=aiengine");

    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("settings:");
    expect(screen.getByTestId("section")).toHaveTextContent("aiengine");
  });

  it("recovers the settings section from ?section= on a popstate without state", () => {
    render(<ShellHarness />);

    act(() => {
      window.history.replaceState(null, "", "/settings?section=voice");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(screen.getByTestId("route")).toHaveTextContent("settings:");
    expect(screen.getByTestId("section")).toHaveTextContent("voice");
  });
});

describe("Shell responsive (bottom tab)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("窄屏 + 非编辑路由(list)渲染 BottomTabBar", () => {
    mockMatchMedia(true);
    const { container } = render(<ShellHarness />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.gridTemplateRows).toBe("var(--topbar-h, 44px) 1fr auto");
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  });

  it("窄屏 + 编辑路由(editor)不渲染 BottomTabBar(有自带返回)", () => {
    mockMatchMedia(true);
    render(<ShellHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
    expect(screen.getByTestId("route")).toHaveTextContent("editor:draft-1-3f2a");
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  });

  it("宽屏不渲染 BottomTabBar", () => {
    mockMatchMedia(false);
    render(<ShellHarness />);
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  });
});
