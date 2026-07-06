import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopBar from "./TopBar";
import { useHealthStore } from "@/stores/healthStore";
import { mockMatchMedia } from "@/test-helpers/matchMedia";

// Keep polling inert in tests — we drive `status` directly via setState.
const startSpy = vi.fn();

beforeEach(() => {
  startSpy.mockClear();
  useHealthStore.setState({ status: "unknown", start: startSpy });
});

afterEach(() => {
  cleanup();
});

describe("TopBar", () => {
  it("renders the BrandMark SVG and MBEditor wordmark", () => {
    const { container } = render(<TopBar route="list" onNavigate={() => {}} />);
    // BrandMark is an inline SVG with the brand-orange rounded square.
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("MBEditor")).toBeInTheDocument();
  });

  it("品牌按钮行内 flex 居中(all:unset 不得吞掉 display:flex 致 logo 与字错位换行)", () => {
    // 该 <button> 用行内 all:"unset" 抹掉原生按钮样式,但行内样式优先级高于
    // Tailwind 的 .flex 类 —— 若不在行内补 display/alignItems,logo 与「MBEditor」
    // 会退回块/行内流式换行看起来歪掉。className 的 flex 在此被 all:unset 击穿。
    render(<TopBar route="list" onNavigate={() => {}} />);
    const brand = screen.getByText("MBEditor").closest("button") as HTMLElement;
    expect(brand).not.toBeNull();
    expect(brand.style.display).toBe("flex");
    expect(brand.style.alignItems).toBe("center");
  });

  it("topbar height reads the shared --topbar-h token", () => {
    const { container } = render(<TopBar route="list" onNavigate={() => {}} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe("var(--topbar-h)");
  });

  it("uses Warm orange active chrome for the current desktop nav item", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    const list = screen.getByRole("button", { name: "起稿台" });
    const settings = screen.getByRole("button", { name: "设置" });
    expect(list.style.background).toBe("var(--orange-50)");
    expect(list.style.color).toBe("var(--orange-700)");
    expect(settings.style.background).toBe("transparent");
  });

  it("shows the '起稿台' and '设置' nav, not the old mono tabs", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "起稿台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    // Old developer-y tabs are gone.
    expect(screen.queryByRole("button", { name: "文章" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑器" })).not.toBeInTheDocument();
  });

  it("does not render the v5·AGENT chip", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(screen.queryByText(/AGENT/)).not.toBeInTheDocument();
  });

  it("does not render the clock chip", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    // The clock rendered a HH:MM(:SS) digit string — none should be present.
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("removes the GitHub link and the 界面 tweaks button", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(screen.queryByLabelText("在 GitHub 查看源代码")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /界面/ })).not.toBeInTheDocument();
  });

  it("navigates to list when clicking 起稿台 and settings when clicking 设置", () => {
    const onNavigate = vi.fn();
    render(<TopBar route="list" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "起稿台" }));
    expect(onNavigate).toHaveBeenCalledWith("list");

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("shows a 编辑中 status instead of a clickable editor tab while in the editor", () => {
    render(<TopBar route="editor" onNavigate={() => {}} />);
    expect(screen.getByText("编辑中")).toBeInTheDocument();
    // No "编辑器" tab to dead-end into a slug-less editor.
    expect(screen.queryByRole("button", { name: "编辑器" })).not.toBeInTheDocument();
  });

  it("shows the 编辑中 status while composing", () => {
    render(<TopBar route="compose" onNavigate={() => {}} />);
    expect(screen.getByText("编辑中")).toBeInTheDocument();
  });

  it("starts the healthStore on mount", () => {
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("renders a silent (non-red, non-clickable) health dot while healthy", () => {
    useHealthStore.setState({ status: "ok", start: startSpy });
    render(<TopBar route="list" onNavigate={() => {}} />);
    const dot = screen.getByTestId("health-dot");
    expect(dot).toBeInTheDocument();
    // Healthy: not a button (not clickable) and not painted danger red.
    expect(dot.tagName).not.toBe("BUTTON");
    expect(dot).not.toHaveTextContent("后端不可用");
  });

  it("turns the health dot into a clickable danger control when the backend is down", () => {
    useHealthStore.setState({ status: "down", start: startSpy });
    render(<TopBar route="list" onNavigate={() => {}} />);
    const dot = screen.getByTestId("health-dot");
    expect(dot.tagName).toBe("BUTTON");
  });
});

describe("TopBar 响应式", () => {
  it("窄屏(<600px,非编辑态)隐藏中间 起稿台/设置 tabs(移到底栏)", () => {
    mockMatchMedia(true);
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(screen.queryByRole("button", { name: "起稿台" })).toBeNull();
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("宽屏(>=600px)仍显示中间 tabs", () => {
    mockMatchMedia(false);
    render(<TopBar route="list" onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: "起稿台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("窄屏编辑态仍显示「编辑中」(不受隐藏影响)", () => {
    mockMatchMedia(true);
    render(<TopBar route="editor" onNavigate={() => {}} />);
    expect(screen.getByText("编辑中")).toBeInTheDocument();
  });
});
