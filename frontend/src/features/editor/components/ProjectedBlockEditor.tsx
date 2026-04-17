import type { RefObject } from "react";
import type { MonacoEditorHandle } from "@/components/editor/MonacoEditor";
import LazyMarkdownEditor from "@/components/editor/LazyMarkdownEditor";
import LazyMonacoEditor from "@/components/editor/LazyMonacoEditor";
import EditorTabs from "@/components/editor/EditorTabs";
import type { MBDocBlockSummary, ProjectedBlockRecord } from "@/features/editor/types";

const PROJECTED_HTML_TABS = [
  { id: "source", label: "HTML" },
  { id: "css", label: "CSS" },
];

interface ProjectedBlockEditorProps {
  selectedBlock: ProjectedBlockRecord | null;
  selectedBlockSummary: MBDocBlockSummary | null;
  canEditSelectedBlock: boolean;
  blockInspectorHint: string;
  projectedHtmlTab: string;
  onProjectedHtmlTabChange: (tab: string) => void;
  onUpdateSelectedBlock: (patch: Record<string, unknown>) => void;
  onFallbackToLegacy: () => void;
  onPasteImage: (file: File) => Promise<void>;
  htmlEditorRef: RefObject<MonacoEditorHandle | null>;
  mdEditorRef: RefObject<MonacoEditorHandle | null>;
}

export default function ProjectedBlockEditor({
  selectedBlock,
  selectedBlockSummary,
  canEditSelectedBlock,
  blockInspectorHint,
  projectedHtmlTab,
  onProjectedHtmlTabChange,
  onUpdateSelectedBlock,
  onFallbackToLegacy,
  onPasteImage,
  htmlEditorRef,
  mdEditorRef,
}: ProjectedBlockEditorProps) {
  if (!selectedBlock || !selectedBlockSummary) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
        请选择一个投影块以查看和编辑。
      </div>
    );
  }

  if (!canEditSelectedBlock) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm text-fg-primary">
          这个投影块当前只能在桥接视图中查看，还不能安全地回写到原始内容。
        </div>
        <div className="text-xs text-fg-muted">{blockInspectorHint}</div>
        <button
          onClick={onFallbackToLegacy}
          className="rounded-md bg-surface-tertiary px-3 py-2 text-xs font-medium text-fg-primary transition-colors hover:bg-border-primary"
        >
          改为编辑原始内容
        </button>
      </div>
    );
  }

  switch (selectedBlock.type) {
    case "markdown":
      return (
        <>
          <div className="h-9 border-b border-border-primary bg-surface-secondary flex items-center px-4 text-xs text-fg-muted font-mono">
            投影 Markdown 块
          </div>
          <div className="flex-1">
            <LazyMarkdownEditor
              ref={mdEditorRef}
              value={typeof selectedBlock.source === "string" ? selectedBlock.source : ""}
              onChange={(value) => onUpdateSelectedBlock({ source: value })}
              onPasteImage={onPasteImage}
            />
          </div>
        </>
      );
    case "html":
      return (
        <>
          <EditorTabs
            activeTab={projectedHtmlTab}
            onTabChange={onProjectedHtmlTabChange}
            tabs={PROJECTED_HTML_TABS}
          />
          <div className="flex-1">
            <LazyMonacoEditor
              ref={htmlEditorRef}
              value={
                projectedHtmlTab === "css"
                  ? typeof selectedBlock.css === "string"
                    ? selectedBlock.css
                    : ""
                  : typeof selectedBlock.source === "string"
                    ? selectedBlock.source
                    : ""
              }
              onChange={(value) =>
                onUpdateSelectedBlock(
                  projectedHtmlTab === "css" ? { css: value } : { source: value },
                )
              }
              language={projectedHtmlTab === "css" ? "css" : "html"}
              onPasteImage={onPasteImage}
            />
          </div>
        </>
      );
    case "svg":
      return (
        <>
          <div className="h-9 border-b border-border-primary bg-surface-secondary flex items-center px-4 text-xs text-fg-muted font-mono">
            投影 SVG 块
          </div>
          <div className="flex-1">
            <LazyMonacoEditor
              ref={htmlEditorRef}
              value={typeof selectedBlock.source === "string" ? selectedBlock.source : ""}
              onChange={(value) => onUpdateSelectedBlock({ source: value })}
              language="html"
            />
          </div>
        </>
      );
    case "image":
      return (
        <div className="space-y-4 p-5 text-sm text-fg-primary">
          <div>
            <label className="mb-1 block text-xs font-mono uppercase tracking-[1.2px] text-fg-muted">
              图片地址
            </label>
            <input
              value={typeof selectedBlock.src === "string" ? selectedBlock.src : ""}
              onChange={(e) => onUpdateSelectedBlock({ src: e.target.value })}
              className="w-full rounded-md border border-border-primary bg-surface-tertiary px-3 py-2 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono uppercase tracking-[1.2px] text-fg-muted">
              替代文本
            </label>
            <input
              value={typeof selectedBlock.alt === "string" ? selectedBlock.alt : ""}
              onChange={(e) => onUpdateSelectedBlock({ alt: e.target.value })}
              className="w-full rounded-md border border-border-primary bg-surface-tertiary px-3 py-2 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase tracking-[1.2px] text-fg-muted">
                宽度
              </label>
              <input
                type="number"
                value={typeof selectedBlock.width === "number" ? selectedBlock.width : ""}
                onChange={(e) =>
                  onUpdateSelectedBlock({
                    width: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-md border border-border-primary bg-surface-tertiary px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase tracking-[1.2px] text-fg-muted">
                高度
              </label>
              <input
                type="number"
                value={typeof selectedBlock.height === "number" ? selectedBlock.height : ""}
                onChange={(e) =>
                  onUpdateSelectedBlock({
                    height: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-md border border-border-primary bg-surface-tertiary px-3 py-2 outline-none"
              />
            </div>
          </div>
        </div>
      );
    case "raster":
      return (
        <>
          <div className="space-y-3 border-b border-border-primary bg-surface-secondary px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted font-mono">投影栅格块</span>
              <span className="text-[10px] uppercase font-mono text-warning">回退模式</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase tracking-[1.2px] text-fg-muted">
                宽度
              </label>
              <input
                type="number"
                value={typeof selectedBlock.width === "number" ? selectedBlock.width : ""}
                onChange={(e) =>
                  onUpdateSelectedBlock({
                    width: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded-md border border-border-primary bg-surface-tertiary px-3 py-2 outline-none"
              />
            </div>
          </div>
          <EditorTabs
            activeTab={projectedHtmlTab}
            onTabChange={onProjectedHtmlTabChange}
            tabs={PROJECTED_HTML_TABS}
          />
          <div className="flex-1">
            <LazyMonacoEditor
              ref={htmlEditorRef}
              value={
                projectedHtmlTab === "css"
                  ? typeof selectedBlock.css === "string"
                    ? selectedBlock.css
                    : ""
                  : typeof selectedBlock.html === "string"
                    ? selectedBlock.html
                    : ""
              }
              onChange={(value) =>
                onUpdateSelectedBlock(
                  projectedHtmlTab === "css" ? { css: value } : { html: value },
                )
              }
              language={projectedHtmlTab === "css" ? "css" : "html"}
              onPasteImage={onPasteImage}
            />
          </div>
        </>
      );
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-sm text-fg-primary">
            这个投影块已经出现在桥接视图中，但当前还不支持直接编辑。
          </div>
          <div className="text-xs text-fg-muted">{blockInspectorHint}</div>
          <button
            onClick={onFallbackToLegacy}
            className="rounded-md bg-surface-tertiary px-3 py-2 text-xs font-medium text-fg-primary transition-colors hover:bg-border-primary"
          >
            改为编辑原始内容
          </button>
        </div>
      );
  }
}
