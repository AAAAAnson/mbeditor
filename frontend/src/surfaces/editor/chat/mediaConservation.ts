// frontend/src/surfaces/editor/chat/mediaConservation.ts
// 媒体守恒(H1 软加固):数一份块表里的媒体块(图片 / 内联图形)。
// checkpoint 记基线、turn_done 后再数,少于基线即提示疑似丢图(检测而非阻止)。

/** 数 kind ∈ {image, svg} 的块数量(纯函数,便于单测)。 */
export function countMediaBlocks(blocks: { kind: string }[]): number {
  return blocks.filter((b) => b.kind === "image" || b.kind === "svg").length;
}
