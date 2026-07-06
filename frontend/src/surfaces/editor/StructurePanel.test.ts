import { describe, expect, it } from "vitest";
import { buildHtmlOutline, buildMarkdownOutline } from "./StructurePanel";

describe("StructurePanel outline builders", () => {
  it("extracts markdown headings with source metadata", () => {
    const outline = buildMarkdownOutline("# 总标题\n\n## 第一部分\n正文\n\n### 细节展开");

    expect(outline.map((block) => block.label)).toEqual(["总标题", "第一部分", "细节展开"]);
    expect(outline.map((block) => block.sourceLine)).toEqual([1, 3, 6]);
    expect(outline[1]?.sourceOffset).toBeGreaterThan(outline[0]?.sourceOffset ?? -1);
  });

  it("extracts html headings and image blocks with navigation metadata", () => {
    const outline = buildHtmlOutline(
      "<h1>总标题</h1>\n<p>导语</p>\n<h2>第一部分</h2>\n<p><img src=\"/images/demo.png\" alt=\"演示图\"></p>",
    );

    expect(outline.map((block) => block.label)).toEqual(["总标题", "第一部分", "图片 1"]);
    expect(outline[0]?.sourceLine).toBe(1);
    expect(outline[1]?.sourceLine).toBe(3);
    expect(outline[2]?.previewImageIndex).toBe(0);
  });

  it("treats inline <svg> blocks as image outline entries", () => {
    const outline = buildHtmlOutline(
      "<h1>标题</h1>\n<svg width=\"100\" height=\"50\"><rect fill=\"red\"/></svg>",
    );

    expect(outline.map((block) => block.label)).toEqual(["标题", "图片 1"]);
    expect(outline[1]?.preview).toBe("内联 SVG");
    expect(outline[1]?.type).toBe("image");
  });

  it("does not append svg children for a plain non-interactive svg", () => {
    const outline = buildHtmlOutline(
      "<h1>标题</h1>\n<svg width=\"100\" height=\"50\"><rect fill=\"red\"/></svg>",
    );

    // Only heading + image block, no svgNodeKind entries.
    expect(outline).toHaveLength(2);
    expect(outline.some((block) => block.svgNodeKind)).toBe(false);
  });

  it("parses inline svg interactive nodes as nested outline children", () => {
    const svg =
      '<svg width="200" height="120">' +
      '<g id="panel1"><text>第一节</text>' +
      '<set attributeName="visibility" to="visible" begin="tab1btn.click"/>' +
      "</g>" +
      '<animate attributeName="opacity" begin="0s" dur="1s"/>' +
      "</svg>";
    const html = `<h1>标题</h1>\n${svg}`;
    const outline = buildHtmlOutline(html);

    const imageBlock = outline.find((block) => block.type === "image");
    expect(imageBlock).toBeTruthy();
    expect(imageBlock?.preview).toBe("内联 SVG");

    const children = outline.filter((block) => block.parentSvgId === imageBlock?.id);
    expect(children.length).toBeGreaterThanOrEqual(2);

    const panel = children.find((block) => block.svgNodeKind === "panel");
    expect(panel).toBeTruthy();
    expect(panel?.label).toContain("第一节");
    expect(panel?.depth).toBe(2);

    const smilNodes = children.filter((block) => block.svgNodeKind === "smil");
    // 两个 SMIL 节点：<set begin="tab1btn.click"> 与 <animate begin="0s" dur="1s">。
    expect(smilNodes.length).toBeGreaterThanOrEqual(2);
    expect(smilNodes.some((block) => block.label.includes("tab1btn.click"))).toBe(true);
    const animateNode = smilNodes.find((block) => block.label.includes("0s"));
    expect(animateNode).toBeTruthy();
    // label 取 begin（含 dur）
    expect(animateNode?.label).toContain("0s");
    expect(animateNode?.label).toContain("1s");
    const smil = animateNode;

    // 绝对 sourceOffset = svg 的 match.index + 子节点相对偏移；
    // html.slice(sourceOffset) 应以该子节点起始标签开头。
    const svgIndex = html.indexOf(svg);
    children.forEach((child) => {
      expect(child.sourceOffset).toBe(svgIndex + (child.svgInternalOffset ?? -1));
    });

    expect(panel && html.slice(panel.sourceOffset).startsWith("<g")).toBe(true);
    expect(smil && html.slice(smil.sourceOffset).startsWith("<animate")).toBe(true);
  });

  it("detects hotspot rect/g ids and timeline circle anchors", () => {
    const svg =
      '<svg width="200" height="120">' +
      '<rect id="maskbtn" x="0" y="0" width="40" height="40"/>' +
      '<circle cx="10" cy="60" r="4"/><text>步骤一</text>' +
      '<circle cx="80" cy="60" r="4"/><text>步骤二</text>' +
      "</svg>";
    const outline = buildHtmlOutline(`<svg>seed</svg>\n${svg}`);

    const kinds = outline.map((block) => block.svgNodeKind).filter(Boolean);
    expect(kinds).toContain("hotspot");
    expect(kinds).toContain("timeline");

    const hotspot = outline.find((block) => block.svgNodeKind === "hotspot");
    expect(hotspot?.label).toBe("maskbtn");

    const timelines = outline.filter((block) => block.svgNodeKind === "timeline");
    expect(timelines.map((block) => block.label)).toEqual(["步骤一", "步骤二"]);
  });
});
