import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BlockList from "@/features/editor/components/BlockList";

describe("BlockList", () => {
  it("renders projected blocks and selection state", () => {
    const onSelectBlock = vi.fn();

    render(
      <BlockList
        blocks={[
          {
            id: "b1",
            type: "markdown",
            label: "Intro",
            editable: true,
            editMode: "projected-block",
            reason: "Single markdown block is reversible.",
          },
          {
            id: "b2",
            type: "svg",
            label: "Chart",
            editable: false,
            editMode: "legacy-fragment",
            reason: "Projected blocks are informational only.",
          },
        ]}
        selectedBlockId="b1"
        projectionFreshness="ready"
        onSelectBlock={onSelectBlock}
      />,
    );

    expect(screen.getByText("投影块")).not.toBeNull();
    expect(screen.getByText("2 个 · 已同步")).not.toBeNull();
    expect(screen.getByText("Intro")).not.toBeNull();
    expect(screen.getByText("可直接编辑")).not.toBeNull();
    expect(screen.getByText("仅可编辑原始内容")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Chart/i }));
    expect(onSelectBlock).toHaveBeenCalledWith("b2");
  });

  it("renders nothing when there are no projected blocks", () => {
    const { container } = render(
      <BlockList
        blocks={[]}
        selectedBlockId={null}
        projectionFreshness="stale"
        onSelectBlock={() => {}}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
