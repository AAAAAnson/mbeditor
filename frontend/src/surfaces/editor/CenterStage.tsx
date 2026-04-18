import { useEffect, useMemo, useRef, useState } from "react";
import Seg from "@/components/ui/Seg";
import { IconArrowLeft, IconCopy, IconEye, IconSend } from "@/components/icons";
import { useUIStore } from "@/stores/uiStore";
import type { EditorDraft, EditorField } from "@/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface CenterStageProps {
  articleId?: string;
  canGoBack: boolean;
  draft: EditorDraft;
  view: string;
  setView: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  saveState: SaveState;
  selected: string;
  previewHtml: string;
  previewLoading: boolean;
  previewError: string | null;
  publishing: boolean;
  copying: boolean;
  onBack: () => void;
  onFieldChange: (field: EditorField, value: string) => void;
  onRefreshPreview: () => void;
  onCopyRichText: () => void;
  onPublish: () => void;
}

const SAVE_META: Record<SaveState, { label: string; color: string }> = {
  idle: { label: "未保存", color: "var(--fg-4)" },
  dirty: { label: "编辑中", color: "var(--warn)" },
  saving: { label: "保存中", color: "var(--info)" },
  saved: { label: "已保存", color: "var(--forest)" },
  error: { label: "保存失败", color: "var(--accent)" },
};

type PreviewResizeDirection = "width" | "height" | "both";

export default function CenterStage({
  articleId,
  canGoBack,
  draft,
  view,
  setView,
  tab,
  setTab,
  saveState,
  selected,
  previewHtml,
  previewLoading,
  previewError,
  publishing,
  copying,
  onBack,
  onFieldChange,
  onRefreshPreview,
  onCopyRichText,
  onPublish,
}: CenterStageProps) {
  const editorFontSize = useUIStore((state) => state.editorFontSize);
  const editorPreviewWidth = useUIStore((state) => state.editorPreviewWidth);
  const editorPreviewHeight = useUIStore((state) => state.editorPreviewHeight);
  const setEditorPreviewSize = useUIStore((state) => state.setEditorPreviewSize);
  const resetEditorPreviewSize = useUIStore((state) => state.resetEditorPreviewSize);
  const previewResizeRef = useRef<{
    direction: PreviewResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [previewResizeDirection, setPreviewResizeDirection] = useState<PreviewResizeDirection | null>(null);
  const tabs = draft.mode === "markdown"
    ? ["markdown", "css", "js"]
    : ["html", "css", "js"];

  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const saveMeta = SAVE_META[saveState];
  const showCode = view === "code" || view === "split";
  const showPreview = view === "preview" || view === "split";
  const codeLineHeight = editorFontSize <= 12 ? 1.65 : editorFontSize >= 16 ? 1.8 : 1.75;

  const currentCode = activeTab === "html"
    ? draft.html
    : activeTab === "markdown"
      ? draft.markdown
      : activeTab === "css"
        ? draft.css
        : draft.js;

  const lineCount = currentCode.split("\n").length;
  const visibleSource = draft.mode === "markdown" ? draft.markdown : draft.html.replace(/<[^>]*>/g, " ");
  const wordCount = visibleSource.replace(/\s+/g, "").length;
  const previewBody = previewHtml || `
    <div style="padding: 36px 18px; text-align: center; color: #8a7e6e; font-size: 13px; line-height: 1.8;">
      ${previewLoading ? "正在生成预览…" : "这里会显示预览内容。"}
    </div>
  `;

  const previewHint = useMemo(() => {
    if (draft.mode === "markdown") return "Markdown 会先转成 HTML，再生成公众号预览。";
    if (draft.js.trim()) return "JS 会保留下来，但不会出现在公众号预览和草稿里。";
    return "预览内容已经按公众号兼容规则处理。";
  }, [draft.js, draft.mode]);
  const previewFrameLabel = `${editorPreviewWidth} × ${editorPreviewHeight}`;

  useEffect(() => {
    if (!previewResizeDirection) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = previewResizeDirection === "width"
      ? "ew-resize"
      : previewResizeDirection === "height"
        ? "ns-resize"
        : "nwse-resize";
    document.body.style.userSelect = "none";

    const updatePreviewSize = (clientX: number, clientY: number) => {
      const dragState = previewResizeRef.current;
      if (!dragState) return;

      const deltaX = clientX - dragState.startX;
      const deltaY = clientY - dragState.startY;

      setEditorPreviewSize({
        width: dragState.direction === "width" || dragState.direction === "both"
          ? dragState.startWidth + deltaX
          : dragState.startWidth,
        height: dragState.direction === "height" || dragState.direction === "both"
          ? dragState.startHeight + deltaY
          : dragState.startHeight,
      });
    };

    const stopResizing = () => {
      previewResizeRef.current = null;
      setPreviewResizeDirection(null);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updatePreviewSize(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updatePreviewSize(touch.clientX, touch.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", stopResizing);
    window.addEventListener("touchcancel", stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopResizing);
      window.removeEventListener("touchcancel", stopResizing);
    };
  }, [previewResizeDirection, setEditorPreviewSize]);

  const startPreviewResize = (direction: PreviewResizeDirection, clientX: number, clientY: number) => {
    previewResizeRef.current = {
      direction,
      startX: clientX,
      startY: clientY,
      startWidth: editorPreviewWidth,
      startHeight: editorPreviewHeight,
    };
    setPreviewResizeDirection(direction);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div className="caps">编辑器</div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          title={canGoBack ? "返回上一页" : "返回稿库"}
        >
          <IconArrowLeft size={12} /> {canGoBack ? "返回上一页" : "返回稿库"}
        </button>
        <div style={{ flex: 1 }} />

        <Seg
          options={[
            { value: "code", label: "编辑" },
            { value: "split", label: "分栏" },
            { value: "preview", label: "预览" },
          ]}
          value={view}
          onChange={setView}
        />

        <span className="chip" style={{ color: saveMeta.color }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: saveMeta.color,
            }}
          />
          {saveMeta.label}
        </span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setView("preview");
            onRefreshPreview();
          }}
          disabled={!articleId || previewLoading}
        >
          <IconEye size={12} /> {previewLoading ? "更新中" : "更新预览"}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={onCopyRichText}
          disabled={!articleId || copying}
        >
          <IconCopy size={12} /> {copying ? "复制中" : "复制富文本"}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={onPublish}
          disabled={!articleId || publishing}
        >
          <IconSend size={12} /> {publishing ? "发送中" : "发到草稿箱"}
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showCode && (
          <div
            style={{
              flex: showPreview ? 1 : 2,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              borderRight: showPreview ? "1px solid var(--border)" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-deep)",
              }}
            >
              {tabs.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  style={{
                    all: "unset",
                    padding: "8px 18px",
                    fontFamily: "var(--f-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: activeTab === item ? "var(--fg)" : "var(--fg-4)",
                    background: activeTab === item ? "var(--surface)" : "transparent",
                    borderRight: "1px solid var(--border)",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {item}
                  {activeTab === item && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -1,
                        height: 2,
                        background: "var(--accent)",
                      }}
                    />
                  )}
                </button>
              ))}
              <div style={{ flex: 1, borderBottom: "1px solid var(--border)" }} />
              <div
                style={{
                  padding: "8px 16px",
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  color: "var(--fg-5)",
                  letterSpacing: "0.1em",
                }}
              >
                UTF-8 &middot; LF &middot; {selected}
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-deep)" }}>
              <div
                style={{
                  padding: "14px 8px 14px 14px",
                  fontFamily: "var(--f-mono)",
                  fontSize: editorFontSize,
                  lineHeight: codeLineHeight,
                  color: "var(--fg-5)",
                  userSelect: "none",
                  textAlign: "right",
                  minWidth: 36,
                  overflow: "hidden",
                }}
              >
                {Array.from({ length: lineCount }, (_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <textarea
                value={currentCode}
                onChange={(event) => onFieldChange(activeTab as EditorField, event.target.value)}
                spellCheck={false}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  resize: "none",
                  background: "transparent",
                  color: "var(--fg-2)",
                  fontFamily: "var(--f-mono)",
                  fontSize: editorFontSize,
                  lineHeight: codeLineHeight,
                  padding: "14px 20px 14px 8px",
                  overflow: "auto",
                  tabSize: 2,
                  whiteSpace: "pre",
                }}
              />
            </div>
          </div>
        )}

        {showPreview && (
          <div
            className="dots-bg"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--bg-deep)",
              padding: "32px 28px",
              overflow: "auto",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                maxWidth: 720,
                margin: "0 auto 14px",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div className="caps">公众号预览</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  当前尺寸 {previewFrameLabel}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                  拖右边或下边调整大小
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={resetEditorPreviewSize}
                >
                  还原尺寸
                </button>
              </div>
            </div>

            <div
              style={{
                width: Math.min(editorPreviewWidth, 640),
                maxWidth: "100%",
                margin: "0 auto 12px",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "rgba(20,16,19,0.72)",
                color: "var(--fg-4)",
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                lineHeight: 1.7,
              }}
            >
              {previewHint}
            </div>

            <div
              data-testid="preview-frame-shell"
              style={{
                width: editorPreviewWidth,
                height: editorPreviewHeight,
                margin: "0 auto",
                position: "relative",
                maxWidth: "100%",
              }}
            >
              <div
                data-testid="preview-frame"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "var(--r-md)",
                  overflow: "hidden",
                  boxShadow: "0 24px 48px -24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.1)",
                  background: "#FAF6EB",
                  position: "relative",
                }}
              >
                {previewLoading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(250,246,235,0.72)",
                      display: "grid",
                      placeItems: "center",
                      zIndex: 1,
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      color: "#8A7E6E",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    正在更新预览…
                  </div>
                )}
                <div
                  style={{
                    height: "100%",
                    padding: "28px 22px 32px",
                    fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: "#1A1512",
                    overflow: "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {previewError ? (
                    <div
                      style={{
                        padding: "24px 18px",
                        borderRadius: 12,
                        border: "1px solid rgba(193,74,58,0.24)",
                        background: "rgba(193,74,58,0.08)",
                        color: "#8A3B2E",
                      }}
                    >
                      {previewError}
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: previewBody }} />
                  )}
                </div>
              </div>
              <div
                data-testid="preview-resize-right"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("width", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("width", touch.clientX, touch.clientY);
                }}
                style={{
                  position: "absolute",
                  top: 10,
                  right: -6,
                  bottom: 10,
                  width: 12,
                  cursor: "ew-resize",
                }}
              />
              <div
                data-testid="preview-resize-bottom"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("height", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("height", touch.clientX, touch.clientY);
                }}
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: -6,
                  height: 12,
                  cursor: "ns-resize",
                }}
              />
              <button
                type="button"
                aria-label="拖动调整预览大小"
                data-testid="preview-resize-corner"
                onMouseDown={(event) => {
                  event.preventDefault();
                  startPreviewResize("both", event.clientX, event.clientY);
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  startPreviewResize("both", touch.clientX, touch.clientY);
                }}
                style={{
                  all: "unset",
                  position: "absolute",
                  right: -8,
                  bottom: -8,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                  cursor: "nwse-resize",
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-deep)",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--fg-4)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: saveMeta.color }}>&bull; {saveMeta.label}</span>
        <span>行 {lineCount}</span>
        <span>{draft.mode.toUpperCase()}</span>
        <span>当前位置 · {selected}</span>
        <div style={{ flex: 1 }} />
        <span>{wordCount.toLocaleString()} 字</span>
        <span>&middot; {(new Blob([draft.html + draft.css + draft.js + draft.markdown]).size / 1024).toFixed(1)}KB</span>
        <span>&middot; 文章 {articleId?.toUpperCase() ?? "未打开"}</span>
      </div>
    </div>
  );
}
