import { describe, expect, it } from "vitest";

import { blockContainsSvg, findRewriteBlock, setBlockText } from "./blockTarget";

function makeRoot(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("findRewriteBlock — 爬出内联层取最近块级祖先(段落粒度)", () => {
  it("climbs out of inline nodes to the nearest block ancestor (the <p>, not the wrapper)", () => {
    const root = makeRoot('<section><p>甲 <strong>重点</strong></p></section>');
    const strong = root.querySelector("strong")!;
    expect(findRewriteBlock(root, strong)).toBe(root.querySelector("p"));
  });

  it("单根巨型 section 包全篇(真机预览形态):段内选中仍定位到该段 <p>", () => {
    // 复现 2026-07-04 真机 QA 逮到的形态:publish 管线单根信封 + 内含 svg
    const root = makeRoot(
      "<section><svg viewBox='0 0 1 1'></svg><p>正文第一段</p><p>正文第二段</p></section>",
    );
    const p1 = root.querySelectorAll("p")[0]!;
    expect(findRewriteBlock(root, p1.firstChild)).toBe(p1);
  });

  it("accepts a text node anchor (caret inside a paragraph)", () => {
    const root = makeRoot("<p>只有文字</p>");
    const textNode = root.querySelector("p")!.firstChild!;
    expect(findRewriteBlock(root, textNode)).toBe(root.querySelector("p"));
  });

  it("returns the element itself when it is a block", () => {
    const root = makeRoot("<p>直接子块</p>");
    expect(findRewriteBlock(root, root.querySelector("p")!)).toBe(root.querySelector("p"));
  });

  it("returns null for root itself / node outside root / null / 文本直接躺 root 下", () => {
    const root = makeRoot("<p>x</p>");
    const outside = document.createElement("p");
    document.body.appendChild(outside);
    expect(findRewriteBlock(root, root)).toBeNull();
    expect(findRewriteBlock(root, outside)).toBeNull();
    expect(findRewriteBlock(root, null)).toBeNull();
    const root2 = makeRoot("裸文本<span>内联</span>");
    expect(findRewriteBlock(root2, root2.querySelector("span")!.firstChild)).toBeNull();
  });

  it("returns null when the block contains an svg (v1 范围外)", () => {
    const root = makeRoot("<section><figure>图<svg viewBox='0 0 1 1'></svg></figure></section>");
    const svg = root.querySelector("svg")!;
    expect(findRewriteBlock(root, svg)).toBeNull();
    expect(findRewriteBlock(root, root.querySelector("figure")!)).toBeNull();
  });

  it("returns null for a block with no rewritable text", () => {
    const root = makeRoot("<p>   </p>");
    expect(findRewriteBlock(root, root.querySelector("p")!)).toBeNull();
  });
});

describe("blockContainsSvg", () => {
  it("detects svg root and nested svg", () => {
    const root = makeRoot("<svg></svg>");
    expect(blockContainsSvg(root.firstElementChild!)).toBe(true);
    const root2 = makeRoot("<div><span><svg></svg></span></div>");
    expect(blockContainsSvg(root2.firstElementChild!)).toBe(true);
    const root3 = makeRoot("<p>纯文字</p>");
    expect(blockContainsSvg(root3.firstElementChild!)).toBe(false);
  });
});

describe("setBlockText — 纯文本落块,\\n 转 <br>", () => {
  it("replaces content and keeps the block element", () => {
    const root = makeRoot('<p style="color:red"><em>旧</em>文</p>');
    const p = root.querySelector("p")!;
    setBlockText(p, "新文案");
    expect(p.textContent).toBe("新文案");
    expect(p.getAttribute("style")).toBe("color:red");
    expect(p.querySelector("em")).toBeNull(); // 装饰内联被拍平(v1 取舍)
  });

  it("turns newlines into <br>", () => {
    const root = makeRoot("<p>旧</p>");
    const p = root.querySelector("p")!;
    setBlockText(p, "第一行\n第二行");
    expect(p.querySelectorAll("br")).toHaveLength(1);
    expect(p.textContent).toBe("第一行第二行");
  });
});
