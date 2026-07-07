/**
 * 文章背景 = 最外层 <section>(block_doc 的信封壳)的 background-color。
 * 与后端 agent_tools._apply_shell_background 语义对齐:注入/替换/清除都只碰
 * 最外层 section 的 style,不动内容块;无信封时设背景会包一层 section。
 * 纯字符串操作、零网络,BYOK 无后端也可用。
 */
const OUTER_SECTION_OPEN = /^(\s*)<section\b([^>]*)>/i;

function parseStyle(
  attrs: string,
): { style: string; before: string; after: string } | null {
  const m = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
  if (!m) return null;
  const idx = m.index ?? 0;
  return { style: m[1], before: attrs.slice(0, idx), after: attrs.slice(idx + m[0].length) };
}

function readDecls(style: string): [string, string][] {
  return style
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.includes(":"))
    .map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] as [string, string];
    });
}

function writeDecls(decls: [string, string][]): string {
  return decls.map(([k, v]) => `${k}:${v}`).join(";") + (decls.length ? ";" : "");
}

export function getArticleBackground(html: string): string | null {
  const m = html.match(OUTER_SECTION_OPEN);
  if (!m) return null;
  const parsed = parseStyle(m[2]);
  if (!parsed) return null;
  const hit = readDecls(parsed.style).find(([k]) => k === "background-color");
  return hit ? hit[1] : null;
}

export function setArticleBackground(html: string, color: string): string {
  const val = color.trim();
  const m = html.match(OUTER_SECTION_OPEN);
  if (!m) return `<section style="background-color:${val};">${html}</section>`;
  const [full, lead, attrs] = m;
  const rest = html.slice(full.length);
  const parsed = parseStyle(attrs);
  if (!parsed) {
    return `${lead}<section${attrs} style="background-color:${val};">${rest}`;
  }
  const decls = readDecls(parsed.style);
  const idx = decls.findIndex(([k]) => k === "background-color");
  if (idx >= 0) decls[idx] = ["background-color", val];
  else decls.push(["background-color", val]);
  const newAttrs = `${parsed.before} style="${writeDecls(decls)}"${parsed.after}`;
  return `${lead}<section${newAttrs}>${rest}`;
}

export function clearArticleBackground(html: string): string {
  const m = html.match(OUTER_SECTION_OPEN);
  if (!m) return html;
  const [full, lead, attrs] = m;
  const rest = html.slice(full.length);
  const parsed = parseStyle(attrs);
  if (!parsed) return html;
  const decls = readDecls(parsed.style).filter(([k]) => k !== "background-color");
  const newAttrs = `${parsed.before} style="${writeDecls(decls)}"${parsed.after}`;
  return `${lead}<section${newAttrs}>${rest}`;
}
