import Editor from "@monaco-editor/react";
import LintSidebar from "@/features/editor/lint/LintSidebar";
import type { EditorDraft, EditorField } from "@/types";
import { stripUnsafeUnicode } from "../utils/unicode";
import SvgEditPanel from "../svg-panel/SvgEditPanel";
import type { SvgModel } from "../svg-panel/svgParse";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const LANGUAGE_BY_TAB: Record<string, string> = {
  html: "html",
  markdown: "markdown",
  css: "css",
  js: "javascript",
};

interface CodeDrawerProps {
  articleId?: string;
  draft: EditorDraft;
  tabs: string[];
  activeTab: string;
  setTab: (value: string) => void;
  currentCode: string;
  lineCount: number;
  selected: string;
  saveMeta: { label: string; color: string };
  wordCount: number;
  editorFontSize: number;
  onFieldChange: (field: EditorField, value: string) => void;
  showSvgPanel: boolean;
  svgModel: SvgModel | null;
  svgPatchAttr: (elementIndex: number, attr: string, value: string) => void;
  svgKey?: string;
  /** 抽屉宽度(px,可拖拽调,uiStore.codeDrawerWidth)。 */
  width: number;
  onClose: () => void;
}

export default function CodeDrawer({
  articleId,
  draft,
  tabs,
  activeTab,
  setTab,
  currentCode,
  lineCount,
  selected,
  saveMeta,
  wordCount,
  editorFontSize,
  onFieldChange,
  showSvgPanel,
  svgModel,
  svgPatchAttr,
  svgKey,
  width,
  onClose,
}: CodeDrawerProps) {
  return (
    <aside
      data-testid="code-drawer"
      data-theme="dark"
      style={{
        width: `${width}px`,
        // 视口兜底:再宽也给预览留 ~240px,不横向溢出(拖拽只改 uiStore 数值)。
        maxWidth: "calc(100vw - 240px)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderLeft: "1px solid var(--line)",
        background: "var(--bg-deep)",
      }}
    >
      <div
        data-testid="editor-code-tabs"
        style={{
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-deep)",
        }}
      >
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            style={{
              all: "unset",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              minHeight: 44,
              padding: "0 18px",
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: activeTab === item ? "var(--fg)" : "var(--fg-4)",
              background: activeTab === item ? "var(--surface)" : "transparent",
              borderRight: "1px solid var(--line)",
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
        <div style={{ flex: 1, borderBottom: "1px solid var(--line)" }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          title="收起代码抽屉"
          aria-label="收起代码抽屉"
          style={{ alignSelf: "center", marginRight: 8, minHeight: 44 }}
        >
          收起
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editor
            data-testid="code-monaco"
            language={LANGUAGE_BY_TAB[activeTab] ?? "plaintext"}
            theme="vs-dark"
            value={currentCode}
            onChange={(value) =>
              onFieldChange(activeTab as EditorField, stripUnsafeUnicode(value ?? ""))
            }
            options={{
              minimap: { enabled: false },
              fontSize: editorFontSize,
              lineNumbers: "on",
              tabSize: 2,
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        {showSvgPanel && activeTab === "html" && (
          <SvgEditPanel key={svgKey} model={svgModel} patchAttr={svgPatchAttr} />
        )}
        <LintSidebar html={draft.html} enabled={Boolean(articleId)} />
      </div>

      <div
        data-testid="editor-status-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 20px",
          borderTop: "1px solid var(--line)",
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
        <span>UTF-8 &middot; LF</span>
        <span>{draft.mode.toUpperCase()}</span>
        <span>当前位置 · {selected}</span>
        <div style={{ flex: 1 }} />
        <span>{wordCount.toLocaleString()} 字</span>
        <span>&middot; {(new Blob([draft.html + draft.css + draft.js + draft.markdown]).size / 1024).toFixed(1)}KB</span>
        <span>&middot; 文章 {articleId?.toUpperCase() ?? "未打开"}</span>
      </div>
    </aside>
  );
}
