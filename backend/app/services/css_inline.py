import re

from premailer import transform

# Base styles matching the preview iframe - ensures WYSIWYG between preview and publish.
# NOTE: font-family intentionally omitted. WeChat on mobile uses its own PingFang/system
# font stack; setting a quoted family here triggers nested-quote bugs when premailer
# inlines the CSS onto a style="..." attribute (inner quotes break the HTML parser).
WECHAT_BASE_CSS = """
body, section.wechat-root {
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    word-wrap: break-word;
    word-break: break-all;
}
img { border-radius: 8px; max-width: 100% !important; box-sizing: border-box; }
pre, pre code { white-space: pre-wrap; word-break: break-word; word-wrap: break-word; overflow-x: auto; }
"""

# Block-bearing at-rules WeChat can't use once inlined. Removed with a
# brace-counting scanner because regexes cannot handle nested blocks
# (@media inside @media, @supports inside @media, ...). A naive one-level
# regex leaves the outer rule's tail behind as GLOBAL rules — e.g. a
# mobile-only `display:none` escaping its media query and hiding content
# everywhere — and the stray `}` it leaves makes cssutils silently drop
# every rule that follows.
_BLOCK_AT_RULE_RE = re.compile(
    r'@(?:media|supports|container|keyframes|-webkit-keyframes|-moz-keyframes'
    r'|-o-keyframes|document|-moz-document|layer|scope|font-feature-values)\b',
    re.IGNORECASE,
)

_PSEUDO_SELECTOR_RE = re.compile(
    r'::?(?:hover|focus|active|visited|before|after'
    r'|first-child|last-child|nth-child\([^)]*\))',
    re.IGNORECASE,
)


def _strip_block_at_rules(css: str) -> str:
    """Remove block-bearing at-rules (handles arbitrary nesting)."""
    out: list[str] = []
    i = 0
    while True:
        m = _BLOCK_AT_RULE_RE.search(css, i)
        if not m:
            out.append(css[i:])
            break
        out.append(css[i:m.start()])
        j = m.end()
        # Find the rule's prelude end: either a block `{` or a statement `;`
        # (e.g. `@layer a, b;`).
        while j < len(css) and css[j] not in '{;':
            j += 1
        if j >= len(css):
            break
        if css[j] == ';':
            i = j + 1
            continue
        depth = 1
        j += 1
        while j < len(css) and depth:
            if css[j] == '{':
                depth += 1
            elif css[j] == '}':
                depth -= 1
            j += 1
        i = j
    return ''.join(out)


def _drop_pseudo_selectors(css: str) -> str:
    """Remove pseudo-class selectors WITHOUT killing their non-pseudo siblings.

    `a, a:hover { color:#07C160 }` must keep the rule for the plain `a`
    selector; deleting the whole rule silently unstyles every link. Runs
    after `_strip_block_at_rules`, so no nested braces remain.
    """
    def repl(m: re.Match) -> str:
        selectors, body = m.group(1), m.group(2)
        kept = [s for s in selectors.split(',') if not _PSEUDO_SELECTOR_RE.search(s)]
        if not kept:
            return ''
        return ','.join(kept) + '{' + body + '}'

    return re.sub(r'([^{}]+)\{([^{}]*)\}', repl, css)


def strip_wechat_unsupported_css(css: str) -> str:
    """Remove CSS features that cannot be inlined or WeChat doesn't support."""
    css = re.sub(r'@import\s+url\([^)]*\)\s*;?', '', css)
    css = re.sub(r"@import\s+['\"][^'\"]*['\"]\s*;?", '', css)
    css = _strip_block_at_rules(css)
    css = _drop_pseudo_selectors(css)
    return css


def _extract_document_body(html: str) -> tuple[str, str]:
    """Reduce a full HTML document to its body content.

    Returns ``(content, body_style)``. ``body_style`` carries the original
    <body>'s inline style (plus a legacy ``bgcolor`` mapped to
    ``background-color``) so page-level backgrounds survive the wrap —
    feeding a full document into the nested premailer wrapper otherwise
    deletes the inner <body> along with its attributes, and a stray
    <!DOCTYPE> makes premailer raise and skip CSS inlining entirely.

    Fragments (no <body>) pass through unchanged apart from dropping any
    <head> block / <html> wrapper tags.
    """
    html = re.sub(r'<!DOCTYPE[^>]*>', '', html, flags=re.IGNORECASE)

    body_m = re.search(r'<body([^>]*)>(.*)</body>', html, re.DOTALL | re.IGNORECASE)
    if not body_m:
        html = re.sub(r'<head[^>]*>.*?</head>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'</?html[^>]*>', '', html, flags=re.IGNORECASE)
        return html, ''

    attrs, content = body_m.group(1), body_m.group(2)
    style_m = (
        re.search(r'style\s*=\s*"([^"]*)"', attrs, re.IGNORECASE)
        or re.search(r"style\s*=\s*'([^']*)'", attrs, re.IGNORECASE)
    )
    body_style = style_m.group(1).strip().rstrip(';') if style_m else ''
    bgcolor_m = re.search(r'bgcolor\s*=\s*["\']?([^"\'\s>]+)', attrs, re.IGNORECASE)
    if bgcolor_m and 'background' not in body_style:
        bg_decl = f'background-color:{bgcolor_m.group(1)}'
        body_style = f'{body_style}; {bg_decl}' if body_style else bg_decl
    return content, body_style


def inline_css(html: str, css: str = "") -> str:
    """Extract embedded <style>, combine with separate CSS, clean, then inline."""
    style_blocks = re.findall(
        r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE,
    )
    html_body = re.sub(
        r'<style[^>]*>.*?</style>', '', html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    html_body, body_style = _extract_document_body(html_body)

    parts = [WECHAT_BASE_CSS, css.strip()] + [b.strip() for b in style_blocks]
    all_css = "\n".join(p for p in parts if p)
    all_css = strip_wechat_unsupported_css(all_css)
    # The original <body> no longer exists once we re-wrap, so retarget
    # author rules written against `body` at the wechat-root wrapper.
    all_css = re.sub(r'(^|[,{}\s])body\b', r'\1section.wechat-root', all_css)

    root_attrs = ' class="wechat-root"'
    if body_style:
        root_attrs += f' style="{body_style}"'
    html_body = f'<section{root_attrs}>{html_body}</section>'
    if all_css.strip():
        html_body = f"<style>{all_css}</style>{html_body}"

    full = f"<html><head><meta charset='utf-8'></head><body>{html_body}</body></html>"
    try:
        result = transform(
            full,
            remove_classes=True,
            keep_style_tags=False,
            strip_important=False,
            cssutils_logging_level="CRITICAL",
        )
    except Exception:
        result = f"<html><body>{html_body}</body></html>"

    match = re.search(r"<body[^>]*>(.*)</body>", result, re.DOTALL)
    return match.group(1).strip() if match else result
