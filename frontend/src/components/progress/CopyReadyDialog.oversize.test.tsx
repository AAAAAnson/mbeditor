import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyReadyDialog from "./CopyReadyDialog";

// Keep the real splitter; only silence the splitElement console.warn for the
// oversized SVG so the test output stays clean.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // navigator.clipboard.write is unavailable in jsdom; stub it so chunk copy
  // doesn't throw on the activation path under test.
  Object.assign(navigator, {
    clipboard: { write: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Build an oversized HTML doc whose FIRST top-level element is a huge atomic
// <svg> exceeding the 250KB chunk target (un-splittable), followed by a small
// tail block. The SVG lands in chunk #1, so the chunked flow surfaces the
// oversize warning immediately (review F10).
function oversizeHtml(): string {
  const rects = Array.from({ length: 40000 }, (_, i) => `<rect id="r${i}" fill="url(#g1)"/>`).join("");
  const bigSvg =
    '<svg viewBox="0 0 10 10"><linearGradient id="g1"></linearGradient>' + rects + "</svg>";
  const tail = "<p>tail</p>";
  return bigSvg + tail;
}

describe("CopyReadyDialog oversized-SVG warning (review F10)", () => {
  it("shows the oversize warning on the chunk holding an un-splittable SVG", async () => {
    render(
      <CopyReadyDialog open html={oversizeHtml()} onClose={vi.fn()} canSendToDraft={false} />,
    );

    // Large doc → ChooseView. Enter the chunked flow.
    const splitBtn = await screen.findByRole("button", { name: /分段复制（共/ });
    fireEvent.click(splitBtn);

    await waitFor(() => {
      expect(screen.getByText(/分段复制 ·/)).toBeInTheDocument();
    });

    // Chunk #1 carries the oversized SVG → warning is visible up front.
    expect(screen.getByTestId("copy-chunk-oversize-warning")).toBeInTheDocument();
  });
});
