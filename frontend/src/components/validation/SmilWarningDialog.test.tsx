import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SmilWarningDialog from "./SmilWarningDialog";

afterEach(() => cleanup());

describe("SmilWarningDialog", () => {
  it("open=false 时不渲染", () => {
    render(<SmilWarningDialog open={false} count={2} onContinue={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId("smil-warning-dialog")).toBeNull();
  });

  it("显示动画数量与「变静态」提示,点继续触发 onContinue", () => {
    const onContinue = vi.fn();
    render(<SmilWarningDialog open count={3} onContinue={onContinue} onCancel={vi.fn()} />);
    expect(screen.getByText(/检测到 3 处/)).toBeInTheDocument();
    expect(screen.getByText(/会变静态/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("smil-warning-continue"));
    expect(onContinue).toHaveBeenCalled();
  });

  it("点取消触发 onCancel", () => {
    const onCancel = vi.fn();
    render(<SmilWarningDialog open count={1} onContinue={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("traps focus and treats Escape as cancel", async () => {
    const onCancel = vi.fn();
    render(<SmilWarningDialog open count={1} onContinue={vi.fn()} onCancel={onCancel} />);

    await waitFor(() => expect(screen.getByTestId("smil-warning-continue")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
