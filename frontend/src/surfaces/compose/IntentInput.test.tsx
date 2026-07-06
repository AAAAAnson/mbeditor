import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import IntentInput from "./IntentInput";

describe("IntentInput Warm screen", () => {
  it("fills a whole seed and focuses textarea when an inspiration capsule is clicked", () => {
    const onChange = vi.fn();

    render(<IntentInput value="" onChange={onChange} onSubmit={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /带娃日记/ }));

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("带娃"));
    expect(screen.getByLabelText("一句话意图")).toHaveFocus();
  });

  it("submits with Ctrl/Cmd+Enter only when text exists", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<IntentInput value="" onChange={() => {}} onSubmit={onSubmit} />);

    fireEvent.keyDown(screen.getByLabelText("一句话意图"), { key: "Enter", ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<IntentInput value="想写一篇读书笔记" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByLabelText("一句话意图"), { key: "Enter", ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
