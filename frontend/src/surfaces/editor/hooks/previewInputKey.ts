import type { EditorDraft } from "@/types";
import { buildSavePayload } from "../services/editorApi";

/**
 * 「公众号效果」预览输入的字段指纹。
 *
 * 预览经 POST /publish/preview 往返,后端只吃 {html, css}(见 editorApi.refreshPreview),
 * 所以只有 html(markdown 模式下由 markdown 编译派生)与 css 会改变预览结果;改 js / title /
 * author / digest 都不影响预览。auto-refresh effect 依赖此 key(而非整个 draft 对象),
 * 把「哪些改动会刷新预览」收敛成一条可解释规则,并消除「改 JS 也白打一次 /publish/preview」。
 */
export function previewInputKey(draft: EditorDraft): string {
  const html = buildSavePayload(draft).html ?? "";
  const css = draft.css ?? "";
  // 长度前缀让 html/css 边界无歧义(html="a"+css="b" 不会与 html="ab"+css="" 同 key)。
  return `${html.length}:${html}|${css}`;
}
