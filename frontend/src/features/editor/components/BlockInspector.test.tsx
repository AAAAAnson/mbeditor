import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BlockInspector from "@/features/editor/components/BlockInspector";

describe("BlockInspector", () => {
  it("renders projection status and mode toggles", () => {
    const onSetBlockEditorMode = vi.fn();

    render(
      <BlockInspector
        articleMode="html"
        selectedBlockSummary={{
          id: "html1",
          type: "html",
          label: "HTML block",
          editable: true,
          editMode: "projected-block",
          reason: "Single html block is reversible.",
        }}
        blockEditorMode="projected-block"
        projectionFreshness="ready"
        canShowProjectedMode={true}
        hint="Single html block is reversible."
        onSetBlockEditorMode={onSetBlockEditorMode}
      />,
    );

    expect(screen.getByText("投影状态")).not.toBeNull();
    expect(screen.getByText("已同步")).not.toBeNull();
    expect(screen.getByText("HTML block")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "原始" }));
    expect(onSetBlockEditorMode).toHaveBeenCalledWith("legacy-fragment");
  });

  it("disables projected mode when block mode is unavailable", () => {
    render(
      <BlockInspector
        articleMode="markdown"
        selectedBlockSummary={null}
        blockEditorMode="legacy-fragment"
        projectionFreshness="stale"
        canShowProjectedMode={false}
        hint="请选择一个投影块以查看详情。"
        onSetBlockEditorMode={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "块编辑" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("原始内容")).not.toBeNull();
  });
});
