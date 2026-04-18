import { useMemo } from "react";
import Seg from "@/components/ui/Seg";
import { IconEye, IconSend } from "@/components/icons";
import { useUIStore } from "@/stores/uiStore";
import type { EditorDraft, EditorField } from "@/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface CenterStageProps {
  articleId?: string;
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
  onFieldChange: (field: EditorField, value: string) => void;
  onRefreshPreview: () => void;
  onPublish: () => void;
}

const SAVE_META: Record<SaveState, { label: string; color: string }> = {
  idle: { label: "未保存", color: "var(--fg-4)" },
  dirty: { label: "编辑中", color: "var(--warn)" },
  saving: { label: "保存中", color: "var(--info)" },
  saved: { label: "已保存", color: "var(--forest)" },
  error: { label: "保存失败", color: "var(--accent)" },
};

export default function CenterStage({
  articleId,
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
  onFieldChange,
  onRefreshPreview,
  onPublish,
}: CenterStageProps) {
  const editorFontSize = useUIStore((state) => state.editorFontSize);
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
      ${previewLoading ? "正在生成微信预览…" : "预览将在这里出现。"}
    </div>
  `;

  const previewHint = useMemo(() => {
    if (draft.mode === "markdown") return "Markdown 会先编译为 HTML，再交给后端做微信预览。";
    if (draft.js.trim()) return "JS 会被保存，但不会参与微信预览与发布。";
    return "预览由后端完成 CSS 内联与微信兼容处理。";
  }, [draft.js, draft.mode]);

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
        <div className="caps">编辑 &middot; STAGE</div>
        <div style={{ flex: 1 }} />

        <Seg
          options={[
            { value: "code", label: "代码" },
            { value: "split", label: "分屏" },
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
          <IconEye size={12} /> {previewLoading ? "生成中" : "刷新预览"}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={onPublish}
          disabled={!articleId || publishing}
        >
          <IconSend size={12} /> {publishing ? "投递中" : "投递草稿"}
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
                maxWidth: 420,
                margin: "0 auto 14px",
                gap: 8,
              }}
            >
              <div className="caps">公众号预览 &middot; iPhone 15</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--fg-5)" }}>
                375 &times; 812
              </div>
            </div>

            <div
              style={{
                maxWidth: 420,
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
              style={{
                maxWidth: 420,
                margin: "0 auto",
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
                  Rendering...
                </div>
              )}
              <div
                style={{
                  minHeight: 520,
                  padding: "28px 22px 32px",
                  fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: "#1A1512",
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
        <span>LN {lineCount}</span>
        <span>{draft.mode.toUpperCase()}</span>
        <span>SELECTION &middot; {selected}</span>
        <div style={{ flex: 1 }} />
        <span>{wordCount.toLocaleString()} 字</span>
        <span>&middot; {(new Blob([draft.html + draft.css + draft.js + draft.markdown]).size / 1024).toFixed(1)}KB</span>
        <span>&middot; ARTICLE {articleId?.toUpperCase() ?? "NONE"}</span>
      </div>
    </div>
  );
}
