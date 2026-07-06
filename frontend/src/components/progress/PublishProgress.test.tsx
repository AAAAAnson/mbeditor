import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublishProgress from "./PublishProgress";

describe("PublishProgress", () => {
  it("focuses the busy dialog and ignores Escape", async () => {
    render(<PublishProgress open mode="copy" />);

    const dialog = screen.getByTestId("publish-progress");
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByTestId("publish-progress")).toBeInTheDocument();
  });
});
