import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ValidationBlockDialog from "./ValidationBlockDialog";

const report = {
  issues: [{ line: 1, rule: "script-tag", message: "不能用 script", suggestion: "删除 script" }],
  warnings: [],
  stats: {
    svg_count: 0,
    animate_count: 0,
    animate_transform_count: 0,
    set_count: 0,
    anchor_count: 0,
  },
};

describe("ValidationBlockDialog", () => {
  it("traps focus and closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ValidationBlockDialog open report={report} action="copy" onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId("validation-block-close")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
