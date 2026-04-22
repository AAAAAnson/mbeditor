import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ValidationDialog from "./ValidationDialog";
import type { ValidationReport } from "./types";

const emptyStats = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

function buildReport(partial: Partial<ValidationReport> = {}): ValidationReport {
  return {
    issues: partial.issues ?? [],
    warnings: partial.warnings ?? [],
    stats: partial.stats ?? emptyStats,
  };
}

describe("ValidationDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ValidationDialog
        open={false}
        report={buildReport({ issues: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
        pushing={false}
        onCancel={() => undefined}
        onIgnoreAndPush={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when report is null", () => {
    const { container } = render(
      <ValidationDialog open={true} report={null} pushing={false} onCancel={() => undefined} onIgnoreAndPush={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists issues and warnings separately", () => {
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        onIgnoreAndPush={() => undefined}
        report={buildReport({
          issues: [{ line: 3, rule: "forbidden-tag", message: "has script", suggestion: "remove" }],
          warnings: [{ line: 5, rule: "svg-xmlns", message: "missing xmlns", suggestion: "add it" }],
        })}
      />,
    );
    expect(screen.getByTestId("validation-dialog")).toBeTruthy();
    expect(screen.getAllByTestId("validation-issue")).toHaveLength(1);
    expect(screen.getAllByTestId("validation-warning")).toHaveLength(1);
    expect(screen.getByText(/has script/)).toBeTruthy();
    expect(screen.getByText(/missing xmlns/)).toBeTruthy();
  });

  it("calls onCancel when '去修改' clicked", () => {
    const onCancel = vi.fn();
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={onCancel}
        onIgnoreAndPush={() => undefined}
        report={buildReport({ warnings: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    fireEvent.click(screen.getByTestId("validation-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onIgnoreAndPush when '忽略并推送' clicked", () => {
    const onIgnoreAndPush = vi.fn();
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        onIgnoreAndPush={onIgnoreAndPush}
        report={buildReport({ issues: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    fireEvent.click(screen.getByTestId("validation-ignore-push"));
    expect(onIgnoreAndPush).toHaveBeenCalledOnce();
  });

  it("disables buttons while pushing", () => {
    render(
      <ValidationDialog
        open
        pushing={true}
        onCancel={() => undefined}
        onIgnoreAndPush={() => undefined}
        report={buildReport({ issues: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    expect((screen.getByTestId("validation-cancel") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("validation-ignore-push") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows '仍然推送' label when only warnings exist", () => {
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        onIgnoreAndPush={() => undefined}
        report={buildReport({ warnings: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    expect(screen.getByTestId("validation-ignore-push").textContent).toContain("仍然推送");
  });

  it("shows '忽略并推送' label when issues exist", () => {
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        onIgnoreAndPush={() => undefined}
        report={buildReport({ issues: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    expect(screen.getByTestId("validation-ignore-push").textContent).toContain("忽略并推送");
  });

  it("read-only mode (no onIgnoreAndPush) hides push button and renames cancel to 关闭", () => {
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        report={buildReport({ issues: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    expect(screen.queryByTestId("validation-ignore-push")).toBeNull();
    expect(screen.getByTestId("validation-cancel").textContent).toContain("关闭");
  });

  it("renders custom title when provided", () => {
    render(
      <ValidationDialog
        open
        pushing={false}
        onCancel={() => undefined}
        title="实时报告"
        report={buildReport({ warnings: [{ line: 1, rule: "r", message: "m", suggestion: "s" }] })}
      />,
    );
    expect(screen.getByText("实时报告")).toBeTruthy();
  });
});
