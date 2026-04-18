import { useEffect, useMemo, type ReactNode } from "react";
import { IconDoc, IconList, IconImage, IconCpu, IconTerminal } from "@/components/icons";
import Seg from "@/components/ui/Seg";
import type { ArticleMode, EditorDraft } from "@/types";

interface OutlineBlock {
  id: string;
  type: string;
  label: string;
  preview: string;
  depth: number;
}

const BLOCK_ICON: Record<string, (size: number) => ReactNode> = {
  hero: (size) => <IconDoc size={size} />,
  section: (size) => <IconDoc size={size} />,
  body: (size) => <IconList size={size} />,
  image: (size) => <IconImage size={size} />,
  stats: (size) => <IconCpu size={size} />,
  code: (size) => <IconTerminal size={size} />,
};

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAssets(draft: EditorDraft) {
  const htmlMatches = Array.from(draft.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (match) => match[1]);
  const markdownMatches = Array.from(draft.markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1]);
  return Array.from(new Set([...htmlMatches, ...markdownMatches])).slice(0, 6);
}

function buildMarkdownOutline(markdown: string): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];
  const lines = markdown.split("\n");

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (!heading) return;

    const preview = lines.slice(index + 1).find((item) => item.trim())?.trim() || "空段落";
    blocks.push({
      id: `md-${index}`,
      type: heading[1].length === 1 ? "hero" : "section",
      label: heading[2].trim(),
      preview,
      depth: Math.max(0, heading[1].length - 1),
    });
  });

  if (blocks.length > 0) return blocks;

  const fallback = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (fallback.length === 0) {
    return [{ id: "md-body", type: "body", label: "正文", preview: "Markdown 内容待补充", depth: 0 }];
  }

  return fallback.map((line, index) => ({
    id: `md-body-${index}`,
    type: "body",
    label: index === 0 ? "正文" : `段落 ${index + 1}`,
    preview: line,
    depth: 0,
  }));
}

function buildHtmlOutline(html: string): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];
  const headingMatches = Array.from(html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi));

  headingMatches.forEach((match, index) => {
    const level = Number(match[1]);
    const label = stripHtml(match[2]) || `标题 ${index + 1}`;
    blocks.push({
      id: `html-heading-${index}`,
      type: level === 1 ? "hero" : "section",
      label,
      preview: label,
      depth: Math.max(0, level - 1),
    });
  });

  const imageMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi));
  imageMatches.slice(0, 2).forEach((_, index) => {
    blocks.push({
      id: `html-image-${index}`,
      type: "image",
      label: `Image ${index + 1}`,
      preview: "嵌入图片素材",
      depth: 1,
    });
  });

  if (blocks.length > 0) return blocks;

  const text = stripHtml(html);
  if (!text) {
    return [{ id: "html-body", type: "body", label: "正文", preview: "HTML 内容待补充", depth: 0 }];
  }

  return text
    .split(/(?<=[。！？.!?])/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((item, index) => ({
      id: `html-body-${index}`,
      type: index === 0 ? "hero" : "body",
      label: index === 0 ? "导语" : `段落 ${index + 1}`,
      preview: item,
      depth: 0,
    }));
}

function countWords(draft: EditorDraft) {
  const source = draft.mode === "markdown" ? draft.markdown : stripHtml(draft.html);
  return source.replace(/\s+/g, "").length;
}

interface StructurePanelProps {
  articleId?: string;
  draft: EditorDraft;
  selected: string;
  setSelected: (id: string) => void;
  onTitleChange: (title: string) => void;
  onModeChange: (mode: ArticleMode) => void;
}

export default function StructurePanel({
  articleId,
  draft,
  selected,
  setSelected,
  onTitleChange,
  onModeChange,
}: StructurePanelProps) {
  const outline = useMemo(
    () => (draft.mode === "markdown" ? buildMarkdownOutline(draft.markdown) : buildHtmlOutline(draft.html)),
    [draft.html, draft.markdown, draft.mode],
  );

  const assets = useMemo(() => extractAssets(draft), [draft.html, draft.markdown]);
  const wordCount = useMemo(() => countWords(draft), [draft]);

  useEffect(() => {
    if (outline.length === 0) {
      if (selected !== "body") setSelected("body");
      return;
    }

    const exists = outline.some((block) => block.id === selected);
    if (!exists) setSelected(outline[0].id);
  }, [outline, selected, setSelected]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-deep)",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--border)" }}>
        <div className="caps" style={{ marginBottom: 8 }}>
          文件 · FILE
        </div>
        <input
          value={draft.title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="未命名文章"
          style={{
            all: "unset",
            width: "100%",
            fontFamily: "var(--f-display)",
            fontSize: 20,
            lineHeight: 1.25,
            color: "var(--fg)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Seg
            options={[
              { value: "html", label: "HTML" },
              { value: "markdown", label: "MD" },
            ]}
            value={draft.mode}
            onChange={(value) => onModeChange(value as ArticleMode)}
          />
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--fg-5)", letterSpacing: "0.1em" }}
          >
            {articleId ? articleId.toUpperCase() : "NO ARTICLE"}
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 12px 8px", borderBottom: "1px solid var(--border)", overflow: "auto", flex: "0 1 auto" }}>
        <div className="caps" style={{ padding: "0 8px 10px" }}>
          结构 · OUTLINE
        </div>
        <div>
          {outline.map((block, index) => {
            const icon = BLOCK_ICON[block.type] || ((size: number) => <IconDoc size={size} />);
            const active = selected === block.id;

            return (
              <div
                key={block.id}
                onClick={() => setSelected(block.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  paddingLeft: 8 + block.depth * 14,
                  borderRadius: 4,
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-3)",
                  cursor: "pointer",
                  transition: "background 0.12s",
                  position: "relative",
                }}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.background = "var(--surface)";
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.background = "transparent";
                }}
              >
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      left: -1,
                      top: 6,
                      bottom: 6,
                      width: 2,
                      background: "var(--accent)",
                      borderRadius: 2,
                    }}
                  />
                )}
                <span
                  className="mono tnum"
                  style={{ fontSize: 9, color: "var(--fg-5)", width: 16 }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                {icon(12)}
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: active ? "var(--fg)" : "var(--fg-2)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {block.label}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      color: "var(--fg-5)",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {block.preview}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "14px 20px 14px" }}>
        <div className="caps" style={{ marginBottom: 10 }}>
          素材 · ASSETS
        </div>

        {assets.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border-2)",
              borderRadius: 6,
              padding: "18px 14px",
              color: "var(--fg-4)",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            当前稿件里还没有图片素材。
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {assets.map((asset, index) => (
              <div
                key={`${asset}-${index}`}
                title={asset}
                style={{
                  aspectRatio: "1",
                  borderRadius: 4,
                  position: "relative",
                  overflow: "hidden",
                  backgroundImage: `linear-gradient(180deg, rgba(20,16,19,0.12), rgba(20,16,19,0.48)), url("${asset}")`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                  border: "1px solid var(--border-2)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 4,
                    bottom: 2,
                    fontFamily: "var(--f-mono)",
                    fontSize: 8,
                    color: "#fff8",
                    letterSpacing: "0.1em",
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--fg-5)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{outline.length} BLOCKS</span>
        <span>&middot; &middot; &middot;</span>
        <span>{wordCount.toLocaleString()} 字</span>
      </div>
    </div>
  );
}
