import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomTabBar from "./BottomTabBar";

describe("BottomTabBar", () => {
  it("渲染 起稿台 / 设置 两个 tab", () => {
    render(<BottomTabBar route="list" onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /起稿台/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /设置/ })).toBeInTheDocument();
  });

  it("触控目标 ≥44px(minHeight)", () => {
    render(<BottomTabBar route="list" onNavigate={vi.fn()} />);
    const tab = screen.getByRole("button", { name: /起稿台/ });
    expect(parseInt(tab.style.minHeight || "0", 10)).toBeGreaterThanOrEqual(44);
  });

  it("点击 tab 触发 onNavigate(对应 route)", () => {
    const onNavigate = vi.fn();
    render(<BottomTabBar route="list" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /设置/ }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("当前 route 的 tab 标记 aria-current", () => {
    render(<BottomTabBar route="settings" onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /设置/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /起稿台/ })).not.toHaveAttribute("aria-current");
  });

  it("uses Warm orange active chrome", () => {
    render(<BottomTabBar route="settings" onNavigate={vi.fn()} />);
    const settings = screen.getByRole("button", { name: /设置/ });
    const list = screen.getByRole("button", { name: /起稿台/ });
    expect(settings.style.color).toBe("var(--orange-700)");
    expect(settings.style.background).toBe("var(--orange-50)");
    expect(list.style.color).not.toBe("var(--orange-700)");
  });
});
