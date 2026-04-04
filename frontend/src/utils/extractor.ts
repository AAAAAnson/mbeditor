/**
 * 从混合内容中智能提取 HTML。
 * 支持：纯 HTML、Python 脚本中的 HTML 字符串、JS/TS 中的模板字符串等。
 * 核心逻辑：找到最大的 HTML 片段，忽略代码包装。
 */

/**
 * 从任意文本中提取 HTML 内容。
 * 如果输入本身就是 HTML，直接返回。
 * 如果是 Python/JS 等代码包裹的 HTML，提取其中的 HTML 部分。
 */
export function extractHTML(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // 1. 如果已经是纯 HTML（以 < 开头，包含 HTML 标签），直接返回
  if (looksLikeHTML(trimmed)) {
    return trimmed;
  }

  // 2. 尝试从 Python 三引号字符串中提取: """...""" 或 '''...'''
  const tripleQuotePatterns = [
    /"""([\s\S]*?)"""/g,
    /'''([\s\S]*?)'''/g,
  ];
  for (const pattern of tripleQuotePatterns) {
    const matches = [...trimmed.matchAll(pattern)];
    for (const match of matches) {
      const content = match[1].trim();
      if (looksLikeHTML(content)) {
        return content;
      }
    }
  }

  // 3. 尝试从 JS 模板字符串中提取: `...`
  const backtickPattern = /`([\s\S]*?)`/g;
  const backtickMatches = [...trimmed.matchAll(backtickPattern)];
  for (const match of backtickMatches) {
    const content = match[1].trim();
    if (looksLikeHTML(content)) {
      return content;
    }
  }

  // 4. 尝试从普通引号字符串中提取（单行或拼接的多行）
  //    例如: content = "<section>...</section>"
  const quotePattern = /"((?:[^"\\]|\\.)*)"/g;
  const quoteMatches = [...trimmed.matchAll(quotePattern)];
  let longestHTML = "";
  for (const match of quoteMatches) {
    const content = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
    if (looksLikeHTML(content) && content.length > longestHTML.length) {
      longestHTML = content;
    }
  }
  if (longestHTML) return longestHTML;

  // 5. 最后兜底：扫描所有行，找到包含 HTML 标签的连续块
  const htmlBlock = extractHTMLBlock(trimmed);
  if (htmlBlock) return htmlBlock;

  // 6. 什么都没找到，原样返回
  return trimmed;
}

/** 检查字符串是否看起来像 HTML */
function looksLikeHTML(s: string): boolean {
  const trimmed = s.trim();
  // 必须以 < 开头（可能前面有空白）且包含闭合标签
  if (!trimmed.startsWith("<")) return false;
  // 至少包含一个常见的 HTML 标签
  return /<\/(section|div|p|h[1-6]|span|table|article|body|html|head|ul|ol|blockquote|a|strong|em|pre|code|figure|header|footer|main|nav)\s*>/i.test(trimmed);
}

/** 从混合文本中提取连续的 HTML 行块 */
function extractHTMLBlock(text: string): string | null {
  const lines = text.split("\n");
  let bestBlock = "";
  let currentBlock = "";
  let inBlock = false;

  for (const line of lines) {
    const trimLine = line.trim();
    if (trimLine.startsWith("<") || (inBlock && (trimLine.startsWith("</") || trimLine === "" || /style=/.test(trimLine)))) {
      currentBlock += line + "\n";
      inBlock = true;
    } else {
      if (currentBlock.length > bestBlock.length && looksLikeHTML(currentBlock.trim())) {
        bestBlock = currentBlock;
      }
      currentBlock = "";
      inBlock = false;
    }
  }
  // 检查最后一个块
  if (currentBlock.length > bestBlock.length && looksLikeHTML(currentBlock.trim())) {
    bestBlock = currentBlock;
  }

  return bestBlock.trim() || null;
}
