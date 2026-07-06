// frontend/src/surfaces/editor/chat/stripChatMarkdown.ts
// 对话气泡纯文本呈现的双保险(P2 批1,spec §7):后端已被 system prompt 约束
// 「对话正文禁 markdown」,前端再兜一层——万一模型漏字,把 markdown 记号剥掉,
// 纯文本呈现(不渲染 markdown、不引库、不产生 HTML)。仅用于 assistant 气泡文本。
//
// 处理范围(保守,避免误伤正常中文标点):
//   - 行首 1-6 个 # + 空白(ATX 标题标记)→ 去掉,保留标题文字;
//   - 成对 **粗体** / *斜体* 记号 → 去掉记号,保留内容;
//   - 行内成对 `code` 反引号 → 去掉反引号,保留内容。
// 逐行处理以保留换行结构。

/** 去掉一行里成对的 ** / * / ` 记号,保留其中文字。 */
function stripInline(line: string): string {
  return line
    // **粗** —— 先处理成对双星号(非贪婪,内容非空)
    .replace(/\*\*([^\n]+?)\*\*/g, "$1")
    // *斜* —— 成对单星号(内容不含星号,避免吃掉残留双星号)
    .replace(/\*([^*\n]+?)\*/g, "$1")
    // `code` —— 成对行内反引号
    .replace(/`([^`\n]+?)`/g, "$1");
}

/** 剥离对话文本里的 markdown 记号,返回纯文本(换行结构保留)。 */
export function stripChatMarkdown(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => stripInline(line.replace(/^\s{0,3}#{1,6}\s+/, "")))
    .join("\n");
}

export default stripChatMarkdown;
