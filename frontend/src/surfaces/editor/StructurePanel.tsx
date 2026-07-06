import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconDoc, IconList, IconImage, IconCpu, IconTerminal, IconSparkle } from "@/components/icons";
import { Segmented } from "@/components/ui";
import { useArticlesStore } from "@/stores/articlesStore";
import { toast } from "@/stores/toastStore";
import { TemplateGallery, type Template } from "@/features/editor/template-gallery";
import { EffectGallery } from "@/features/editor/effect-registry/EffectGallery";
import type { ArticleMode, EditorDraft } from "@/types";

export interface OutlineBlock {
  id: string;
  type: string;
  label: string;
  preview: string;
  depth: number;
  sourceOffset: number;
  sourceLine: number;
  previewImageIndex?: number;
  /** SVG 内部交互节点种类（契约 A / 契约 D）。 */
  svgNodeKind?: "panel" | "frame" | "timeline" | "hotspot" | "smil";
  /**
   * 该子节点在所属 <svg> 字符串内的相对偏移。
   * sourceOffset 已经是「<svg> 起点 + svgInternalOffset」的绝对值，
   * 是面向源码的绝对位置元数据(供未来代码侧定位复用)。
   */
  svgInternalOffset?: number;
  /** 所属 <svg> outline block 的 id，用于层级缩进。 */
  parentSvgId?: string;
}

const BLOCK_ICON: Record<string, (size: number) => ReactNode> = {
  hero: (size) => <IconDoc size={size} />,
  section: (size) => <IconDoc size={size} />,
  body: (size) => <IconList size={size} />,
  image: (size) => <IconImage size={size} />,
  stats: (size) => <IconCpu size={size} />,
  code: (size) => <IconTerminal size={size} />,
  // SVG 内部交互子节点（契约 D）
  panel: (size) => <IconList size={size} />,
  frame: (size) => <IconImage size={size} />,
  timeline: (size) => <IconCpu size={size} />,
  hotspot: (size) => <IconSparkle size={size} />,
  smil: (size) => <IconCpu size={size} />,
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

function lineNumberForOffset(source: string, offset: number) {
  if (offset <= 0) return 1;
  return source.slice(0, offset).split("\n").length;
}

const INLINE_SVG_RE = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;

function svgToDataUrl(svg: string): string {
  // encodeURIComponent handles non-ASCII (Chinese text inside <text> etc.);
  // btoa would throw on those. The ``utf8`` marker tells browsers to treat the
  // payload as a text SVG rather than base64.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function extractAssets(draft: EditorDraft) {
  const htmlMatches = Array.from(draft.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), (match) => match[1]);
  const markdownMatches = Array.from(draft.markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1]);
  // Inline <svg> blocks render as images in the preview iframe, so the asset
  // panel surfaces a thumbnail for each. The publish pipeline preserves the
  // native SVG subtree (nonce-placeholder substitution) when sending to WeChat
  // — it no longer rasterizes them to PNG.
  const svgMatches = Array.from(draft.html.matchAll(INLINE_SVG_RE), (match) => svgToDataUrl(match[0]));
  return Array.from(new Set([...htmlMatches, ...markdownMatches, ...svgMatches])).slice(0, 6);
}

export function buildMarkdownOutline(markdown: string): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];
  const lines = markdown.split("\n");
  const lineOffsets: number[] = [];
  let runningOffset = 0;

  lines.forEach((line) => {
    lineOffsets.push(runningOffset);
    runningOffset += line.length + 1;
  });

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (!heading) return;

    const preview = lines.slice(index + 1).find((item) => item.trim())?.trim() || "暂无内容";
    blocks.push({
      id: `md-${index}`,
      type: heading[1].length === 1 ? "hero" : "section",
      label: heading[2].trim(),
      preview,
      depth: Math.max(0, heading[1].length - 1),
      sourceOffset: lineOffsets[index] ?? 0,
      sourceLine: index + 1,
    });
  });

  if (blocks.length > 0) return blocks;

  const fallback = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (fallback.length === 0) {
    return [{
      id: "md-body",
      type: "body",
      label: "正文",
      preview: "还没开始写",
      depth: 0,
      sourceOffset: 0,
      sourceLine: 1,
    }];
  }

  return fallback.map((line, index) => ({
    id: `md-body-${index}`,
    type: "body",
    label: index === 0 ? "正文" : `段落 ${index + 1}`,
    preview: line,
    depth: 0,
    sourceOffset: markdown.indexOf(line),
    sourceLine: lineNumberForOffset(markdown, markdown.indexOf(line)),
  }));
}

/** 一条 SVG 内部交互子节点的中间表示（尚未补绝对 sourceOffset）。 */
interface SvgChildNode {
  kind: NonNullable<OutlineBlock["svgNodeKind"]>;
  label: string;
  preview: string;
  /** 在 <svg> 字符串内的相对偏移（该子节点起始标签处）。 */
  internalOffset: number;
}

/**
 * 解析单个 inline <svg> 字符串，按契约 D 的 DOM 特征抽取内部交互节点。
 * 返回的 internalOffset 是子节点在 svg 字符串内的相对偏移；
 * 调用方负责加上 <svg> 的 match.index 写成绝对 sourceOffset（契约 A）。
 *
 * 定位策略：DOMParser 负责结构识别，偏移则在原始 svg 源串里用稳定锚点
 * （开标签 + id / begin 属性原文）顺序扫描得到，避免序列化与源码不一致。
 */
function parseSvgInteractiveNodes(svg: string): SvgChildNode[] {
  if (typeof DOMParser === "undefined") return [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  } catch {
    return [];
  }
  if (doc.querySelector("parsererror")) return [];
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return [];

  const nodes: SvgChildNode[] = [];
  // cursor 保证同一种锚点重复出现时按文档序定位，不会都指向第一个。
  let cursor = 0;
  const locate = (anchor: string): number => {
    const at = svg.indexOf(anchor, cursor);
    if (at === -1) return -1;
    cursor = at + 1;
    return at;
  };

  const firstText = (el: Element): string => {
    const t = el.querySelector("text");
    return (t?.textContent ?? "").trim();
  };

  const pushPanelLike = (el: Element, kind: "panel" | "frame") => {
    const id = el.getAttribute("id") ?? "";
    const anchor = `id="${id}"`;
    // 统一走 locate（从共享 cursor 起扫，未命中返回 -1），与其它分支一致，
    // 避免「从 0 起的 indexOf 守卫」与「从 cursor 起的 locate」给出不同位置。
    const tagAt = locate(anchor);
    // 把偏移退回到该 <g 开标签的 '<'，让 textarea 光标停在元素开头。
    let offset = tagAt;
    if (tagAt > -1) {
      const lt = svg.lastIndexOf("<g", tagAt);
      if (lt > -1) offset = lt;
    }
    const text = firstText(el);
    nodes.push({
      kind,
      label: text || id || (kind === "panel" ? "面板" : "帧"),
      preview: `<g id="${id}">`,
      internalOffset: Math.max(0, offset),
    });
  };

  // 1) 带 id 的 <g> → panel / frame / hotspot
  Array.from(root.querySelectorAll("g[id]")).forEach((g) => {
    const id = (g.getAttribute("id") ?? "").toLowerCase();
    if (!id) return;
    if (id.endsWith("btn")) {
      const rawId = g.getAttribute("id") ?? "";
      const anchor = `id="${rawId}"`;
      const tagAt = locate(anchor);
      let offset = tagAt;
      if (tagAt > -1) {
        const lt = svg.lastIndexOf("<g", tagAt);
        if (lt > -1) offset = lt;
      }
      nodes.push({
        kind: "hotspot",
        label: rawId,
        preview: "点击热区",
        internalOffset: Math.max(0, offset),
      });
      return;
    }
    pushPanelLike(g, id.startsWith("frame") ? "frame" : "panel");
  });

  // 2) <rect id="...btn"> → hotspot
  Array.from(root.querySelectorAll("rect[id]")).forEach((rect) => {
    const id = rect.getAttribute("id") ?? "";
    if (!id.toLowerCase().endsWith("btn")) return;
    const anchor = `id="${id}"`;
    const tagAt = locate(anchor);
    let offset = tagAt;
    if (tagAt > -1) {
      const lt = svg.lastIndexOf("<rect", tagAt);
      if (lt > -1) offset = lt;
    }
    nodes.push({
      kind: "hotspot",
      label: id,
      preview: "点击热区",
      internalOffset: Math.max(0, offset),
    });
  });

  // 3) SMIL 时间轴：<animate> / <animateTransform> / <set> 带 begin
  Array.from(root.querySelectorAll("animate, animateTransform, set")).forEach((el) => {
    const begin = el.getAttribute("begin");
    if (!begin) return;
    const dur = el.getAttribute("dur");
    const tag = el.nodeName; // animate / animateTransform / set（大小写跟随源）
    const anchor = `begin="${begin}"`;
    const tagAt = locate(anchor);
    let offset = tagAt;
    if (tagAt > -1) {
      const lt = svg.lastIndexOf("<", tagAt);
      if (lt > -1) offset = lt;
    }
    const label = dur ? `${begin} · ${dur}` : begin;
    nodes.push({
      kind: "smil",
      label,
      preview: `<${tag} begin="${begin}"${dur ? ` dur="${dur}"` : ""}>`,
      internalOffset: Math.max(0, offset),
    });
  });

  // 4) 时间轴锚点：<circle> + 相邻 <text>（可能无 id），按 cx 升序
  const circles = Array.from(root.querySelectorAll("circle"));
  if (circles.length >= 2) {
    const withX = circles
      .map((c) => ({ c, cx: Number.parseFloat(c.getAttribute("cx") ?? "NaN") }))
      .filter((item) => Number.isFinite(item.cx))
      .sort((a, b) => a.cx - b.cx);
    withX.forEach(({ c, cx }, i) => {
      // 相邻 <text>：取紧随其后的 sibling text，否则用序号。
      let labelText = "";
      let sib = c.nextElementSibling;
      while (sib) {
        if (sib.nodeName.toLowerCase() === "text") {
          labelText = (sib.textContent ?? "").trim();
          break;
        }
        sib = sib.nextElementSibling;
      }
      const anchor = `cx="${c.getAttribute("cx")}"`;
      const tagAt = locate(anchor);
      let offset = tagAt;
      if (tagAt > -1) {
        const lt = svg.lastIndexOf("<circle", tagAt);
        if (lt > -1) offset = lt;
      }
      nodes.push({
        kind: "timeline",
        label: labelText || `节点 ${i + 1}`,
        preview: `锚点 cx=${cx}`,
        internalOffset: Math.max(0, offset),
      });
    });
  }

  // 按在源串内的位置排序，让大纲顺序贴合阅读顺序。
  return nodes.sort((a, b) => a.internalOffset - b.internalOffset);
}

export function buildHtmlOutline(html: string): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];
  const headingMatches = Array.from(html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi));

  headingMatches.forEach((match, index) => {
    const level = Number(match[1]);
    const label = stripHtml(match[2]) || `标题 ${index + 1}`;
    const sourceOffset = match.index ?? 0;
    blocks.push({
      id: `html-heading-${index}`,
      type: level === 1 ? "hero" : "section",
      label,
      preview: label,
      depth: Math.max(0, level - 1),
      sourceOffset,
      sourceLine: lineNumberForOffset(html, sourceOffset),
    });
  });

  const imageLikeMatches = [
    ...Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)),
    ...Array.from(html.matchAll(INLINE_SVG_RE)),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  imageLikeMatches.slice(0, 2).forEach((match, index) => {
    const sourceOffset = match.index ?? 0;
    const isSvg = match[0].toLowerCase().startsWith("<svg");
    const imageId = `html-image-${index}`;
    blocks.push({
      id: imageId,
      type: "image",
      label: `图片 ${index + 1}`,
      preview: isSvg ? "内联 SVG" : "已插入图片",
      depth: 1,
      sourceOffset,
      sourceLine: lineNumberForOffset(html, sourceOffset),
      previewImageIndex: index,
    });

    if (!isSvg) return;
    // 叠加 SVG 内部交互子节点（契约 A/D）。原 image block 保留不动。
    const svgSource = match[0];
    parseSvgInteractiveNodes(svgSource).forEach((child, childIndex) => {
      // sourceOffset = <svg> 在 html 中的绝对偏移 + 子节点在 svg 内的相对偏移，
      // 作为源码绝对位置元数据保留(当前大纲跳转只定位预览侧)。
      const childOffset = sourceOffset + child.internalOffset;
      blocks.push({
        id: `${imageId}-svg-${childIndex}`,
        type: child.kind,
        label: child.label,
        preview: child.preview,
        depth: 2,
        sourceOffset: childOffset,
        sourceLine: lineNumberForOffset(html, childOffset),
        svgNodeKind: child.kind,
        svgInternalOffset: child.internalOffset,
        parentSvgId: imageId,
      });
    });
  });

  if (blocks.length > 0) return blocks;

  const text = stripHtml(html);
  if (!text) {
    return [{
      id: "html-body",
      type: "body",
      label: "正文",
      preview: "还没开始写",
      depth: 0,
      sourceOffset: 0,
      sourceLine: 1,
    }];
  }

  return text
    .split(/(?<=[。！？.!?])/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((item, index) => {
      const sourceOffset = Math.max(0, html.indexOf(item));
      return {
        id: `html-body-${index}`,
        type: index === 0 ? "hero" : "body",
        label: index === 0 ? "开头" : `段落 ${index + 1}`,
        preview: item,
        depth: 0,
        sourceOffset,
        sourceLine: lineNumberForOffset(html, sourceOffset),
      };
    });
}

export function buildOutlineFromDraft(draft: EditorDraft) {
  return draft.mode === "markdown" ? buildMarkdownOutline(draft.markdown) : buildHtmlOutline(draft.html);
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
  onSelectBlock?: (block: OutlineBlock) => void;
  onTitleChange: (title: string) => void;
  onModeChange: (mode: ArticleMode) => void;
  /**
   * 可选：当模板画廊插入 HTML 时调用。
   * - 若父组件提供：优先走父组件的本地 draft 更新路径（不触发刷新）
   * - 若未提供：StructurePanel 会直接走 articlesStore.updateArticle，然后清掉
   *   sessionStorage 里的 draft 并 reload，让 EditorSurface 重新拉出新 html
   */
  onInsertHtml?: (html: string) => void;
  /** 区块级插入效果 SVG（插到选中区块之后，不覆盖正文） */
  onInsertEffectHtml?: (html: string) => void;
}

/** 与 EditorSurface 里 `draftStorageKey` 保持一致，避免插入后旧草稿把新 html 顶回去 */
const DRAFT_STORAGE_PREFIX = "mbeditor.editorDraft.";

export default function StructurePanel({
  articleId,
  draft,
  selected,
  setSelected,
  onSelectBlock,
  onTitleChange,
  onModeChange,
  onInsertHtml,
  onInsertEffectHtml,
}: StructurePanelProps) {
  const updateArticle = useArticlesStore((state) => state.updateArticle);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [effectGalleryOpen, setEffectGalleryOpen] = useState(false);

  const outline = useMemo(() => buildOutlineFromDraft(draft), [draft]);

  const assets = useMemo(() => extractAssets(draft), [draft.html, draft.markdown]);
  const wordCount = useMemo(() => countWords(draft), [draft]);

  const handleInsertTemplate = async (template: Template) => {
    // 优先走父组件 —— 如果 EditorSurface 有一天把 onInsertHtml 接上，插入
    // 就是一次局部 state 更新，体验最丝滑（无刷新、无竞态）。
    if (onInsertHtml) {
      onInsertHtml(template.html);
      setTemplateGalleryOpen(false);
      toast.success(`已插入模板 ${template.title}`);
      return;
    }

    // Fallback —— 没接 callback 时直接改 store。为了不被 EditorSurface 里
    // sessionStorage 里残留的旧 draft 顶回去，插入前先把 draft key 清掉，
    // 再 reload 让 EditorSurface 从 articlesStore 重新拉最新 html。
    if (!articleId) {
      toast.error("未打开文章，无法插入模板");
      return;
    }

    try {
      await updateArticle(articleId, { html: template.html, mode: "html" });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${articleId}`);
        } catch {
          /* sessionStorage unavailable — ignore */
        }
      }
      setTemplateGalleryOpen(false);
      toast.success(`已插入模板 ${template.title}`);
      if (typeof window !== "undefined") {
        // 给 toast 一帧显示的时间再 reload，避免用户看不到提示
        window.setTimeout(() => window.location.reload(), 160);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "插入失败";
      toast.error(message);
    }
  };

  useEffect(() => {
    if (outline.length === 0) {
      if (selected !== "body") setSelected("body");
      return;
    }

    const exists = outline.some((block) => block.id === selected);
    if (!exists) setSelected(outline[0].id);
  }, [outline, selected, setSelected]);

  return (
    <>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--line)",
        background: "var(--bg-deep)",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--line)" }}>
        <div className="caps" style={{ marginBottom: 8 }}>
          当前文章
        </div>
        <input
          value={draft.title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="请输入标题"
          style={{
            all: "unset",
            display: "block",
            boxSizing: "border-box",
            width: "100%",
            minHeight: 32,
            fontFamily: "var(--f-display)",
            fontSize: 20,
            lineHeight: 1.25,
            color: "var(--fg)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Segmented
            roleType="buttons"
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
            {articleId ? articleId.toUpperCase() : "未打开"}
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 12px 8px", borderBottom: "1px solid var(--border)", overflow: "auto", flex: "0 1 auto" }}>
        <div className="caps" style={{ padding: "0 8px 10px" }}>
          内容大纲
        </div>
        <div>
          {outline.map((block, index) => {
            const icon = BLOCK_ICON[block.type] || ((size: number) => <IconDoc size={size} />);
            const active = selected === block.id;

            return (
              <div
                key={block.id}
                onClick={() => {
                  setSelected(block.id);
                  onSelectBlock?.(block);
                }}
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

      <div style={{ padding: "12px 20px 6px", borderBottom: "1px solid var(--line)" }}>
        <div className="caps" style={{ marginBottom: 8 }}>
          模板
        </div>
        <button
          type="button"
          onClick={() => setTemplateGalleryOpen(true)}
          className="btn btn-outline btn-sm"
          style={{
            width: "100%",
            justifyContent: "center",
            marginBottom: 8,
            minHeight: 44,
          }}
          title="从 5 个生产级 WeChat-SVG 模板中挑一个插入当前文章"
        >
          <IconSparkle size={12} />
          插入模板
        </button>
        {onInsertEffectHtml && (
          <button
            type="button"
            onClick={() => setEffectGalleryOpen(true)}
            className="btn btn-outline btn-sm"
            style={{
              width: "100%",
              justifyContent: "center",
              marginBottom: 8,
              minHeight: 44,
            }}
            title="从 8 个交互效果配方中填槽生成，插入到选中区块之后"
          >
            <IconSparkle size={12} />
            插入效果
          </button>
        )}
        <div
          className="mono"
          style={{ fontSize: 9, color: "var(--fg-5)", letterSpacing: "0.08em", lineHeight: 1.5 }}
        >
          模板覆盖正文 · 效果插入到选中区块之后
        </div>
      </div>

      <div style={{ padding: "14px 20px 14px" }}>
        <div className="caps" style={{ marginBottom: 10 }}>
          图片
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
            这篇文章还没有图片。
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
          borderTop: "1px solid var(--line)",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--fg-5)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{outline.length} 个区块</span>
        <span>&middot; &middot; &middot;</span>
        <span>{wordCount.toLocaleString()} 字</span>
      </div>
    </div>

    <TemplateGallery
      open={templateGalleryOpen}
      currentHtmlLength={draft.html.length}
      onClose={() => setTemplateGalleryOpen(false)}
      onInsert={handleInsertTemplate}
    />

    {onInsertEffectHtml && (
      <EffectGallery
        open={effectGalleryOpen}
        onClose={() => setEffectGalleryOpen(false)}
        onInsert={(html) => {
          onInsertEffectHtml(html);
          setEffectGalleryOpen(false);
        }}
      />
    )}
    </>
  );
}
