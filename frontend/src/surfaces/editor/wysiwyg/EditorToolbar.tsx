import { useRef, type RefObject } from "react";

interface EditorToolbarProps {
  /** The contentEditable target the toolbar formats. */
  targetRef: RefObject<HTMLElement | null>;
  /** Called after any execCommand mutation so the host can commit/sync HTML. */
  onCommit?: () => void;
  /** Insert an image (host owns upload/URL flow). */
  onPickImage?: () => void;
  disabled?: boolean;
}

const COLORS = [
  { label: "默认", value: "#1A1512" },
  { label: "朱红", value: "#C14A3A" },
  { label: "松绿", value: "#2F6F4F" },
  { label: "湖蓝", value: "#2C6E9B" },
  { label: "赭黄", value: "#9B6A2C" },
];

/**
 * 顶部常驻格式工具条(TipTap-less / contentEditable 回退方案)。
 *
 * 为什么不用 TipTap:实测 TipTap StarterKit 往返破坏微信 inline 结构
 * ——它把 <section style=…> 外壳整段丢弃、剥光 font-size/color/line-height
 * 等 inline style(只认自己的 node schema),会在每次编辑时摧毁 /publish/*
 * 依赖的微信版式。故保留既有 contentEditable 写作区,工具条直接用
 * document.execCommand 操作当前选区,不改 DOM 结构、不重序列化整篇,
 * 与现有 mergeEditedPreviewIntoSource 同步逻辑天然兼容。
 */
export default function EditorToolbar({
  targetRef,
  onCommit,
  onPickImage,
  disabled = false,
}: EditorToolbarProps) {
  // 大多数按钮靠工具条容器的 onMouseDown preventDefault 保住 contentEditable 选区。
  // 但原生 <select>(颜色)的下拉必须拿到焦点才能展开,无法 preventDefault,否则
  // 选区会塌缩。故在它 mousedown(焦点切换前)存下选区,exec 前再复原。
  const savedRangeRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const node = targetRef.current;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!node || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (node.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const node = targetRef.current;
    const range = savedRangeRef.current;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!node || !range || !sel) return;
    node.focus();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const exec = (command: string, value?: string) => {
    const node = targetRef.current;
    if (!node || disabled) return;
    node.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // execCommand is best-effort; a thrown UA quirk must not wedge the editor.
    }
    onCommit?.();
  };

  return (
    <div
      data-testid="rich-editor-toolbar"
      role="toolbar"
      aria-label="格式工具条"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
      // Keep focus in the editable target so execCommand acts on the live selection.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="加粗"
        disabled={disabled}
        onClick={() => exec("bold")}
      >
        加粗
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="斜体"
        disabled={disabled}
        onClick={() => exec("italic")}
      >
        斜体
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="下划线"
        disabled={disabled}
        onClick={() => exec("underline")}
      >
        下划线
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="标题"
        disabled={disabled}
        onClick={() => exec("formatBlock", "<h2>")}
      >
        标题
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="引用"
        disabled={disabled}
        onClick={() => exec("formatBlock", "<blockquote>")}
      >
        引用
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="列表"
        disabled={disabled}
        onClick={() => exec("insertUnorderedList")}
      >
        列表
      </button>
      <label
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <span style={{ fontSize: 12, color: "var(--fg-4)" }}>颜色</span>
        <select
          aria-label="颜色"
          disabled={disabled}
          defaultValue=""
          onMouseDown={(event) => {
            // 让原生下拉照常展开,但先记下编辑区选区(焦点马上要离开它)。
            event.stopPropagation();
            saveSelection();
          }}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return;
            restoreSelection();
            exec("foreColor", value);
            event.target.value = "";
          }}
          style={{ fontSize: 12 }}
        >
          <option value="">配色</option>
          {COLORS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="图片"
        disabled={disabled}
        onClick={() => {
          targetRef.current?.focus();
          onPickImage?.();
        }}
      >
        图片
      </button>
    </div>
  );
}
