import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("renders role=switch with the checked state", () => {
    render(<Switch checked aria-label="Streaming" />);
    expect(screen.getByRole("switch", { name: "Streaming" })).toHaveAttribute("aria-checked", "true");
  });

  it("requests the next checked value on click", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Advanced" />);
    fireEvent.click(screen.getByRole("switch", { name: "Advanced" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not toggle while disabled", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={onCheckedChange} aria-label="Advanced" />);
    fireEvent.click(screen.getByRole("switch", { name: "Advanced" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
