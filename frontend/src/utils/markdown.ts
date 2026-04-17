import { Marked } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("xml", xml);

const WX_THEMES: Record<string, Record<string, string>> = {
  default: {
    h1: "font-size:24px;font-weight:bold;margin:20px 0 10px;color:#333;",
    h2: "font-size:20px;font-weight:bold;margin:18px 0 8px;color:#333;border-bottom:1px solid #eee;padding-bottom:6px;",
    h3: "font-size:18px;font-weight:bold;margin:16px 0 6px;color:#333;",
    p: "margin:8px 0;line-height:1.8;font-size:16px;color:#333;",
    blockquote: "border-left:4px solid #E8553A;padding:10px 16px;margin:12px 0;background:#f9f9f9;color:#666;",
    code_inline: "background:#f3f4f6;padding:2px 6px;border-radius:3px;font-size:14px;color:#e83e8c;font-family:Menlo,Monaco,monospace;",
    code_block: "background:#1e1e1e;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.6;",
    a: "color:#576b95;text-decoration:none;",
    img: "max-width:100%;border-radius:4px;margin:8px 0;",
    ul: "padding-left:24px;margin:8px 0;",
    ol: "padding-left:24px;margin:8px 0;",
    li: "margin:4px 0;line-height:1.8;font-size:16px;color:#333;",
    strong: "font-weight:bold;color:#333;",
    em: "font-style:italic;color:#555;",
    table: "border-collapse:collapse;width:100%;margin:12px 0;",
    th: "border:1px solid #ddd;padding:8px 12px;background:#f5f5f5;font-weight:bold;text-align:left;font-size:14px;",
    td: "border:1px solid #ddd;padding:8px 12px;font-size:14px;",
    hr: "border:none;border-top:1px solid #eee;margin:16px 0;",
  },
  elegant: {
    h1: "font-size:24px;font-weight:bold;margin:24px 0 12px;color:#2c3e50;text-align:center;",
    h2: "font-size:20px;font-weight:bold;margin:20px 0 10px;color:#2c3e50;",
    h3: "font-size:17px;font-weight:bold;margin:16px 0 8px;color:#2c3e50;",
    p: "margin:10px 0;line-height:2;font-size:15px;color:#3f3f3f;letter-spacing:0.5px;",
    blockquote: "border-left:3px solid #2c3e50;padding:12px 20px;margin:16px 0;background:#fafbfc;color:#666;font-style:italic;",
    code_inline: "background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:13px;color:#c7254e;",
    code_block: "background:#282c34;padding:16px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.6;",
    a: "color:#1a73e8;text-decoration:none;border-bottom:1px solid #1a73e8;",
    img: "max-width:100%;border-radius:6px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);",
    ul: "padding-left:24px;margin:10px 0;",
    ol: "padding-left:24px;margin:10px 0;",
    li: "margin:6px 0;line-height:1.9;font-size:15px;color:#3f3f3f;",
    strong: "font-weight:bold;color:#2c3e50;",
    em: "font-style:italic;color:#666;",
    table: "border-collapse:collapse;width:100%;margin:16px 0;",
    th: "border:1px solid #ddd;padding:10px 14px;background:#f8f9fa;font-weight:600;text-align:left;font-size:14px;",
    td: "border:1px solid #ddd;padding:10px 14px;font-size:14px;",
    hr: "border:none;border-top:1px solid #e0e0e0;margin:20px 0;",
  },
};

export function getThemeNames(): string[] {
  return Object.keys(WX_THEMES);
}

export function renderMarkdown(md: string, theme: string = "default"): string {
  const styles = WX_THEMES[theme] || WX_THEMES.default;

  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const tag = `h${depth}`;
        const style = styles[tag] || styles.h3;
        return `<${tag} style="${style}">${text}</${tag}>`;
      },
      paragraph({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<p style="${styles.p}">${text}</p>`;
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        return `<blockquote style="${styles.blockquote}">${body}</blockquote>`;
      },
      code({ text, lang }) {
        let highlighted = text;
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(text, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(text).value;
        }
        return `<pre style="${styles.code_block}"><code style="color:#abb2bf;font-family:Menlo,Monaco,monospace;">${highlighted}</code></pre>`;
      },
      codespan({ text }) {
        return `<code style="${styles.code_inline}">${text}</code>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<a href="${href}" style="${styles.a}">${text}</a>`;
      },
      image({ href, text }) {
        return `<img src="${href}" alt="${text}" style="${styles.img}" />`;
      },
      strong({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<strong style="${styles.strong}">${text}</strong>`;
      },
      em({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<em style="${styles.em}">${text}</em>`;
      },
      table(token) {
        const ths = token.header.map(h => `<th style="${styles.th}">${this.parser.parseInline(h.tokens)}</th>`).join("");
        const trs = token.rows.map(row =>
          `<tr>${row.map(cell => `<td style="${styles.td}">${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`
        ).join("");
        return `<table style="${styles.table}"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
      },
      hr() {
        return `<hr style="${styles.hr}" />`;
      },
    },
  });

  return marked.parse(md) as string;
}
