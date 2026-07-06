import { marked } from "marked";

/**
 * Compile markdown to HTML synchronously.
 */
export function compileMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false });
  return typeof rendered === "string" ? rendered : "";
}

/**
 * Normalize markdown text: fix whitespace, line endings, etc.
 */
export function normalizeMarkdownText(value: string): string {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n");
}

/**
 * Escape markdown special characters for inline text.
 */
export function escapeMarkdownText(value: string): string {
  return normalizeMarkdownText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]])/g, "\\$1")
    .replace(/^(#{1,6}|\>|\-|\+|\d+\.)\s/gm, "\\$&");
}
