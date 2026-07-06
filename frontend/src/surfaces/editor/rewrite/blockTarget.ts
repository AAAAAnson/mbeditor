// frontend/src/surfaces/editor/rewrite/blockTarget.ts
// 选区/光标 -> 可改写语义块的定位纯函数。与 CenterStage 的 merge 管线同粒度:
// 预览可编辑容器(preview-editable-content)的直接语义子节点即「块」。

/** 块内含 <svg> 时不可 AI 改写(v1 范围外,工具条不出现)。 */
export function blockContainsSvg(block: Element): boolean {
  if (block.tagName.toLowerCase() === "svg") return true;
  return block.querySelector("svg") !== null;
}

// 内联元素:选区落在这些标签里时继续向上爬,直到最近的块级祖先。
const INLINE_TAGS = new Set([
  "A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "DATA", "DEL", "DFN",
  "EM", "FONT", "I", "INS", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN",
  "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "WBR",
]);

/**
 * 从选区锚点 node 向上爬出内联层,取最近的块级祖先(=可改写段落)。
 *
 * 真机预览的 DOM 通常是「单根 <section> 包全篇」(publish 管线的 wechat-root
 * 信封),按「root 直接子块」定位会塌缩成整篇并被 svg 检查一票否决——所以
 * 粒度必须是段落级块(p、h1-6、li、blockquote、嵌套 section 等)。
 *
 * 返回 null 的情况:node 不在 root 内、node 就是 root、爬到 root 仍是内联
 * (文本直接躺在 root 下)、块内含 svg、块无可改写文本。
 */
export function findRewriteBlock(root: Element, node: Node | null): HTMLElement | null {
  if (!node || node === root || !root.contains(node)) return null;
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el && el !== root && INLINE_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  if (!el || el === root) return null;
  if (!(el instanceof HTMLElement)) return null;
  if (blockContainsSvg(el)) return null;
  if ((el.textContent ?? "").trim().length === 0) return null;
  return el;
}

/**
 * 用 AI 返回的纯文本替换块内容:段落间的 \n 落成 <br>,保留块元素本身
 * 及其内联样式(块内嵌套装饰 span 被拍平是 v1 已知取舍,见 spec §4.1)。
 */
export function setBlockText(block: HTMLElement, text: string): void {
  block.textContent = "";
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    block.appendChild(block.ownerDocument.createTextNode(line));
    if (i < lines.length - 1) {
      block.appendChild(block.ownerDocument.createElement("br"));
    }
  });
}
