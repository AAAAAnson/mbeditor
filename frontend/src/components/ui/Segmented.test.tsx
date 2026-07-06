import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

describe("Segmented", () => {
  const options = [
    { value: "write", label: "Write" },
    { value: "preview", label: "Preview", icon: <span data-testid="preview-icon" /> },
  ];

  it("renders tab semantics for options", () => {
    render(<Segmented options={options} value="write" onChange={vi.fn()} ariaLabel="Mode" />);
    expect(screen.getByRole("tablist", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("preview-icon")).toBeInTheDocument();
  });

  it("calls onChange when another option is clicked", () => {
    const onChange = vi.fn();
    render(<Segmented options={options} value="write" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("does not fire onChange when clicking the current option", () => {
    const onChange = vi.fn();
    render(<Segmented options={options} value="write" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Write" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
