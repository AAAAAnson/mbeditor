// frontend/src/surfaces/editor/chat/highlight.ts
// 预览改动块高亮的定位纯函数(best-effort):块在 order 中的序号 → 预览 DOM
// 第 N 个子元素。真实预览是「单根 <section> 信封(wechat-root)+ 文章壳」层层
// 包裹,先剥信封链再取子元素;定位不到静默返回空。
//
// 红线:绝不为高亮往 draft.html 注入任何标记属性(id/class/data-*),
// 高亮只画在 portal 到 body 的覆盖层上,预览 DOM 一个字节不碰。

/**
 * 从预览根剥单根 section 信封链后,按序号取子元素。
 *
 * @param previewRoot 预览可编辑容器(preview-editable-content)
 * @param indexes     块序号(来自 ChangedBlockInfo.index;-1/越界跳过)
 * @param blockCount  turn_done 时的块总数:子元素数一旦等于它就停止下钻,
 *                    防止「首块恰好是 section」被误剥(>1 才可判)。
 */
export function locateBlockElements(
  previewRoot: Element,
  indexes: number[],
  blockCount?: number,
): HTMLElement[] {
  let host: Element = previewRoot;
  let safety = 6;
  while (safety-- > 0) {
    const kids = Array.from(host.children);
    if (typeof blockCount === "number" && blockCount > 1 && kids.length === blockCount) break;
    if (kids.length === 1 && kids[0].tagName === "SECTION") {
      host = kids[0];
      continue;
    }
    break;
  }
  const kids = Array.from(host.children);
  const out: HTMLElement[] = [];
  for (const i of indexes) {
    if (i < 0 || i >= kids.length) continue;
    const el = kids[i];
    if (el instanceof HTMLElement) out.push(el);
  }
  return out;
}
