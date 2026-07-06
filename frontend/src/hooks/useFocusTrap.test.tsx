import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function TrapFixture({ active = true, onEscape = vi.fn() }: { active?: boolean; onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active, onEscape);

  return (
    <div>
      <button>outside</button>
      <div ref={ref} tabIndex={-1}>
        <button>first</button>
        <button>second</button>
      </div>
    </div>
  );
}

function RestoreFixture({ showTrap }: { showTrap: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, showTrap);

  return (
    <div>
      <button>before</button>
      {showTrap && (
        <div ref={ref} tabIndex={-1}>
          <button>first</button>
          <button>second</button>
        </div>
      )}
    </div>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFocusTrap", () => {
  it("focuses the first focusable element when activated", async () => {
    render(<TrapFixture />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
    });
  });

  it("keeps Tab focus inside the trap", async () => {
    render(<TrapFixture />);

    await waitFor(() => expect(screen.getByRole("button", { name: "first" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "second" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "second" })).toHaveFocus();
  });

  it("calls onEscape for Escape", async () => {
    const onEscape = vi.fn();
    render(<TrapFixture onEscape={onEscape} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "first" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("restores the previous focus on unmount", async () => {
    const { rerender } = render(<RestoreFixture showTrap={false} />);
    screen.getByRole("button", { name: "before" }).focus();
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();

    rerender(<RestoreFixture showTrap />);
    await waitFor(() => expect(screen.getByRole("button", { name: "first" })).toHaveFocus());
    rerender(<RestoreFixture showTrap={false} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
    });
  });
});
