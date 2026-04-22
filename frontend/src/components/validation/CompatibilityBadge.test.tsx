import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompatibilityBadge from "./CompatibilityBadge";

const postSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  default: { post: postSpy, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const emptyStats = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

beforeEach(() => {
  postSpy.mockReset();
});

function mockReport(issues = 0, warnings = 0) {
  postSpy.mockResolvedValue({
    data: {
      code: 0,
      message: "ok",
      data: {
        issues: Array.from({ length: issues }, (_, i) => ({ line: i + 1, rule: "r", message: `m${i}`, suggestion: "s" })),
        warnings: Array.from({ length: warnings }, (_, i) => ({ line: i + 1, rule: "w", message: `w${i}`, suggestion: "s" })),
        stats: emptyStats,
      },
    },
  });
}

describe("CompatibilityBadge", () => {
  it("shows '✓ 兼容' when html empty (no API call)", () => {
    render(<CompatibilityBadge html="" debounceMs={0} />);
    const badge = screen.getByTestId("compat-badge");
    expect(badge.textContent).toContain("兼容");
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("calls /wechat/validate after debounce and shows clean tone", async () => {
    mockReport(0, 0);
    render(<CompatibilityBadge html="<p>hi</p>" debounceMs={0} />);
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith("/wechat/validate", { html: "<p>hi</p>" }));
    await waitFor(() => {
      const badge = screen.getByTestId("compat-badge");
      expect(badge.getAttribute("data-tone")).toBe("ok");
    });
  });

  it("shows issue tone when issues > 0", async () => {
    mockReport(2, 0);
    render(<CompatibilityBadge html="<script>x</script>" debounceMs={0} />);
    await waitFor(() => {
      const badge = screen.getByTestId("compat-badge");
      expect(badge.getAttribute("data-tone")).toBe("issue");
      expect(badge.textContent).toContain("2 违规");
    });
  });

  it("shows warn tone when only warnings", async () => {
    mockReport(0, 3);
    render(<CompatibilityBadge html="<svg/>" debounceMs={0} />);
    await waitFor(() => {
      const badge = screen.getByTestId("compat-badge");
      expect(badge.getAttribute("data-tone")).toBe("warn");
      expect(badge.textContent).toContain("3 警告");
    });
  });

  it("shows error tone on API failure", async () => {
    postSpy.mockRejectedValue(new Error("net"));
    render(<CompatibilityBadge html="<p>x</p>" debounceMs={0} />);
    await waitFor(() => {
      const badge = screen.getByTestId("compat-badge");
      expect(badge.getAttribute("data-tone")).toBe("error");
    });
  });

  it("opens read-only dialog on click when findings exist", async () => {
    mockReport(1, 0);
    render(<CompatibilityBadge html="<script>x</script>" debounceMs={0} />);
    await waitFor(() => expect(screen.getByTestId("compat-badge").getAttribute("data-tone")).toBe("issue"));
    fireEvent.click(screen.getByTestId("compat-badge"));
    expect(screen.getByTestId("validation-dialog")).toBeTruthy();
    // Read-only mode: ignore-and-push button must NOT render.
    expect(screen.queryByTestId("validation-ignore-push")).toBeNull();
    expect(screen.getByTestId("validation-cancel").textContent).toContain("关闭");
  });

  it("badge is disabled when no findings and not loading", async () => {
    mockReport(0, 0);
    render(<CompatibilityBadge html="<p>x</p>" debounceMs={0} />);
    await waitFor(() => expect(screen.getByTestId("compat-badge").getAttribute("data-tone")).toBe("ok"));
    expect((screen.getByTestId("compat-badge") as HTMLButtonElement).disabled).toBe(true);
  });

  it("debounces rapid html changes into one request", async () => {
    vi.useFakeTimers();
    mockReport(0, 0);
    const { rerender } = render(<CompatibilityBadge html="a" debounceMs={500} />);
    rerender(<CompatibilityBadge html="ab" debounceMs={500} />);
    rerender(<CompatibilityBadge html="abc" debounceMs={500} />);
    expect(postSpy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy).toHaveBeenCalledWith("/wechat/validate", { html: "abc" });
  });
});
