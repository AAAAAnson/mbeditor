export interface OutlineLike {
  id: string;
  sourceOffset: number;
}

/**
 * 计算插入点 offset：选中区块之后（= 下一个区块的 sourceOffset），找不到则末尾。
 *
 * 用"下一区块 offset"而非当前区块 offset：sourceOffset 指向区块"起始"，
 * 插在下一区块起始处 = 当前区块完整内容之后，符合"插入到选中区块之后"。
 */
export function computeInsertOffset(
  html: string,
  outline: OutlineLike[],
  selectedId: string,
): number {
  if (outline.length === 0) return html.length;
  const idx = outline.findIndex((b) => b.id === selectedId);
  if (idx < 0) return html.length; // 选中项不在大纲 -> 末尾
  const next = outline[idx + 1];
  if (!next) return html.length; // 选中的是最后一个 -> 末尾
  // clamp 到合法范围
  return Math.max(0, Math.min(next.sourceOffset, html.length));
}

/** 在 offset 处插入 fragment，前后补换行避免粘连。 */
export function insertAtOffset(html: string, offset: number, fragment: string): string {
  const safeOffset = Math.max(0, Math.min(offset, html.length));
  const before = html.slice(0, safeOffset);
  const after = html.slice(safeOffset);
  const sep1 = before.endsWith("\n") || before === "" ? "" : "\n";
  const sep2 = after.startsWith("\n") || after === "" ? "" : "\n";
  return `${before}${sep1}${fragment}${sep2}${after}`;
}

/** 一步到位：给定 draft.html + outline + selectedId + 片段，返回新 html。 */
export function insertEffectIntoHtml(
  html: string,
  outline: OutlineLike[],
  selectedId: string,
  fragment: string,
): string {
  const offset = computeInsertOffset(html, outline, selectedId);
  return insertAtOffset(html, offset, fragment);
}
