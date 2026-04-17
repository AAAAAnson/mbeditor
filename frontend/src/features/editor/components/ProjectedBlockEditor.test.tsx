import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import ProjectedBlockEditor from "@/features/editor/components/ProjectedBlockEditor";
import type { MonacoEditorHandle } from "@/components/editor/MonacoEditor";

vi.mock("@/components/editor/MarkdownEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="markdown-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/editor/MonacoEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("ProjectedBlockEditor", () => {
  it("renders read-only fallback for non-editable projected blocks", () => {
    const onFallbackToLegacy = vi.fn();

    render(
      <ProjectedBlockEditor
        selectedBlock={{ id: "svg1", type: "svg", source: "<svg />" }}
        selectedBlockSummary={{
          id: "svg1",
          type: "svg",
          label: "SVG block",
          editable: false,
          editMode: "legacy-fragment",
          reason: "Projected blocks are informational only.",
        }}
        canEditSelectedBlock={false}
        blockInspectorHint="该投影块仅用于查看。"
        projectedHtmlTab="source"
        onProjectedHtmlTabChange={() => {}}
        onUpdateSelectedBlock={() => {}}
        onFallbackToLegacy={onFallbackToLegacy}
        onPasteImage={async () => {}}
        htmlEditorRef={createRef<MonacoEditorHandle>()}
        mdEditorRef={createRef<MonacoEditorHandle>()}
      />,
    );

    expect(
      screen.getByText("这个投影块当前只能在桥接视图中查看，还不能安全地回写到原始内容。"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "改为编辑原始内容" }));
    expect(onFallbackToLegacy).toHaveBeenCalled();
  });

  it("renders editable image controls and emits patches", () => {
    const onUpdateSelectedBlock = vi.fn();

    render(
      <ProjectedBlockEditor
        selectedBlock={{
          id: "img1",
          type: "image",
          src: "/images/cover.png",
          alt: "Cover",
          width: 320,
          height: 200,
        }}
        selectedBlockSummary={{
          id: "img1",
          type: "image",
          label: "cover.png",
          editable: true,
          editMode: "projected-block",
          reason: "当前图片块可安全回写。",
        }}
        canEditSelectedBlock={true}
        blockInspectorHint="当前图片块可安全回写。"
        projectedHtmlTab="source"
        onProjectedHtmlTabChange={() => {}}
        onUpdateSelectedBlock={onUpdateSelectedBlock}
        onFallbackToLegacy={() => {}}
        onPasteImage={async () => {}}
        htmlEditorRef={createRef<MonacoEditorHandle>()}
        mdEditorRef={createRef<MonacoEditorHandle>()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("/images/cover.png"), {
      target: { value: "/images/hero.png" },
    });
    expect(onUpdateSelectedBlock).toHaveBeenCalledWith({ src: "/images/hero.png" });
  });

  it("renders editable svg source surface", async () => {
    const onUpdateSelectedBlock = vi.fn();

    render(
      <ProjectedBlockEditor
        selectedBlock={{
          id: "svg1",
          type: "svg",
          source: "<svg><circle /></svg>",
        }}
        selectedBlockSummary={{
          id: "svg1",
          type: "svg",
          label: "SVG block",
          editable: true,
          editMode: "projected-block",
          reason: "当前 SVG 块可安全回写。",
        }}
        canEditSelectedBlock={true}
        blockInspectorHint="当前 SVG 块可安全回写。"
        projectedHtmlTab="source"
        onProjectedHtmlTabChange={() => {}}
        onUpdateSelectedBlock={onUpdateSelectedBlock}
        onFallbackToLegacy={() => {}}
        onPasteImage={async () => {}}
        htmlEditorRef={createRef<MonacoEditorHandle>()}
        mdEditorRef={createRef<MonacoEditorHandle>()}
      />,
    );

    const editor = await screen.findByLabelText("monaco-editor");
    fireEvent.change(editor, {
      target: { value: "<svg><rect /></svg>" },
    });
    expect(onUpdateSelectedBlock).toHaveBeenCalledWith({ source: "<svg><rect /></svg>" });
  });

  it("renders raster html/css editing surface", async () => {
    const onUpdateSelectedBlock = vi.fn();
    const onProjectedHtmlTabChange = vi.fn();

    render(
      <ProjectedBlockEditor
        selectedBlock={{
          id: "r1",
          type: "raster",
          html: "<div>Card</div>",
          css: "div{display:grid;}",
          width: 640,
        }}
        selectedBlockSummary={{
          id: "r1",
          type: "raster",
          label: "Raster block",
          editable: true,
          editMode: "projected-block",
          reason: "当前栅格块可安全回写。",
        }}
        canEditSelectedBlock={true}
        blockInspectorHint="当前栅格块可安全回写。"
        projectedHtmlTab="source"
        onProjectedHtmlTabChange={onProjectedHtmlTabChange}
        onUpdateSelectedBlock={onUpdateSelectedBlock}
        onFallbackToLegacy={() => {}}
        onPasteImage={async () => {}}
        htmlEditorRef={createRef<MonacoEditorHandle>()}
        mdEditorRef={createRef<MonacoEditorHandle>()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("640"), {
      target: { value: "720" },
    });
    expect(onUpdateSelectedBlock).toHaveBeenCalledWith({ width: 720 });
    fireEvent.click(screen.getByRole("button", { name: "CSS" }));
    expect(onProjectedHtmlTabChange).toHaveBeenCalledWith("css");
    await waitFor(() => expect(screen.getByLabelText("monaco-editor")).not.toBeNull());
  });
});
