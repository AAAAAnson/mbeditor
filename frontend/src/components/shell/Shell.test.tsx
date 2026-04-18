import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Shell from "./Shell";

function ShellHarness() {
  return (
    <Shell>
      {(route, params, navigation) => (
        <div>
          <div data-testid="route">{route}:{params.articleId ?? ""}</div>
          <div data-testid="back-state">{navigation.canGoBack ? "yes" : "no"}</div>
          <button onClick={() => navigation.navigate("editor", { articleId: "draft-1" })}>
            Open editor
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

  it("pushes editor navigation into history and handles popstate", () => {
    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("list:");
    expect(screen.getByTestId("back-state")).toHaveTextContent("no");

    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));

    expect(screen.getByTestId("route")).toHaveTextContent("editor:draft-1");
    expect(screen.getByTestId("back-state")).toHaveTextContent("yes");
    expect(window.history.state).toMatchObject({
      __mbeditor: true,
      route: "editor",
      params: { articleId: "draft-1" },
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
      params: { articleId: "draft-1" },
      idx: 0,
    }, "", "/editor");

    render(<ShellHarness />);

    expect(screen.getByTestId("route")).toHaveTextContent("editor:draft-1");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByTestId("route")).toHaveTextContent("list:");
    expect(window.history.state).toMatchObject({
      __mbeditor: true,
      route: "list",
      params: {},
      idx: 0,
    });
  });
});
