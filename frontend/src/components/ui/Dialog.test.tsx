import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function DialogFixture({ open = true, onClose = vi.fn() }: { open?: boolean; onClose?: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm"
      footer={
        <>
          <button>Cancel</button>
          <button>Delete</button>
        </>
      }
    >
      <p>Delete this draft?</p>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("does not render when closed", () => {
    render(<DialogFixture open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders accessible dialog semantics when open", () => {
    render(<DialogFixture />);
    const dialog = screen.getByRole("dialog", { name: "Confirm" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Delete this draft?")).toBeInTheDocument();
  });

  it("closes on Escape and overlay click, but not on inner click", () => {
    const onClose = vi.fn();
    const { container } = render(<DialogFixture onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog", { name: "Confirm" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".mb-overlay") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab focus inside dialog controls", async () => {
    render(<DialogFixture />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
