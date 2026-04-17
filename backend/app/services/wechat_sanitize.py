"""Sanitize HTML for WeChat paste + draft-API parity.

Design goal: produce a fragment that WeChat's paste handler and the
`/cgi-bin/draft/add` server-side filter both render identically. The
approach mirrors the reference `wechat_upload.py` script pattern:

    - no <style>, <script>, <link>, class, id, data-*, on* handlers
    - section-based layout with inline-block + vertical-align for
      horizontal groups (no flex, no grid, no position:absolute)
    - every surviving `style="..."` contains only properties from an
      explicit allowlist; values for `display` and `position` are
      further constrained to WeChat-safe keywords
    - `!important`, `transform`, `animation`, `transition`,
      `backdrop-filter`, `cursor`, `user-select`, `pointer-events`,
      `will-change`, `float`, `clear`, gap, justify-*, align-*, order,
      grid-*, flex-* are dropped
    - button-like <a> elements become <table><tr><td> wrappers so they
      survive WeChat's layout rewriting
"""
import re


# ---------------------------------------------------------------------------
# Allowlists
# ---------------------------------------------------------------------------
# Derived from a real WeChat-safe reference article (~27 distinct properties)
# plus a small set of universally-supported additions.

ALLOWED_STYLE_PROPERTIES = frozenset({
    # text / typography
    "color", "font-size", "font-weight", "font-style", "font-family",
    "line-height", "letter-spacing", "text-align", "text-decoration",
    "text-indent", "text-transform", "white-space", "word-break",
    "word-wrap", "overflow-wrap",
    # box model
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "width", "height", "max-width", "min-width", "max-height", "min-height",
    # border
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-radius",
    "border-top-left-radius", "border-top-right-radius",
    "border-bottom-left-radius", "border-bottom-right-radius",
    "border-color", "border-style", "border-width",
    "border-top-color", "border-top-style", "border-top-width",
    "border-bottom-color", "border-bottom-style", "border-bottom-width",
    "border-left-color", "border-left-style", "border-left-width",
    "border-right-color", "border-right-style", "border-right-width",
    "border-collapse", "border-spacing",
    # background
    "background", "background-color", "background-image",
    "background-size", "background-position", "background-repeat",
    # layout / display
    "display", "vertical-align", "position",
    # visuals
    "opacity", "box-shadow", "box-sizing", "overflow",
    # list
    "list-style", "list-style-type", "list-style-position",
})

_ALLOWED_DISPLAY_VALUES = frozenset({
    "block", "inline", "inline-block", "none",
    "table", "table-row", "table-cell",
    "table-row-group", "table-header-group", "table-footer-group",
    "table-column", "table-column-group", "table-caption",
})

_ALLOWED_POSITION_VALUES = frozenset({"relative", "static"})


# ---------------------------------------------------------------------------
# Decoration helpers (unchanged semantics from previous revision)
# ---------------------------------------------------------------------------


def _remove_if_decorative(m: re.Match) -> str:
    """Remove an empty element if it looks purely decorative (very low opacity)."""
    full = m.group(0)
    style = re.search(r'style="([^"]*)"', full)
    if not style:
        return full
    s = style.group(1)
    opacity_m = re.search(r'opacity\s*:\s*([\d.]+)', s)
    if opacity_m and float(opacity_m.group(1)) < 0.3:
        return ''
    return full


def _fix_button_anchors(html: str) -> str:
    """Convert styled <a> buttons to <table><tr><td bgcolor> pattern."""
    pattern = re.compile(r'<a\s+([^>]*?)>(.*?)</a>', re.DOTALL)
    button_props = (
        'background', 'background-color', 'padding',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border-radius', 'border', 'border-top', 'border-right',
        'border-bottom', 'border-left', 'text-align',
    )
    text_props = (
        'color', 'font-size', 'font-weight', 'font-family',
        'letter-spacing', 'line-height', 'text-decoration',
    )

    def _parse_style(s: str) -> dict:
        out = {}
        for part in s.split(';'):
            part = part.strip()
            if not part or ':' not in part:
                continue
            k, v = part.split(':', 1)
            out[k.strip().lower()] = v.strip()
        return out

    def _render_style(d: dict) -> str:
        return '; '.join(f'{k}:{v}' for k, v in d.items() if v)

    def _looks_like_button(d: dict) -> bool:
        return bool(
            d.get('display', '').startswith('inline-block')
            or d.get('background-color')
            or (d.get('background') or '').lstrip().startswith('#')
            or 'padding' in d
            or 'border-radius' in d
        )

    def _wrap(m: re.Match) -> str:
        attrs = m.group(1)
        inner = m.group(2).strip()
        if not re.search(r'href="([^"]*)"', attrs):
            return m.group(0)

        a_style_m = re.search(r'style="([^"]*)"', attrs)
        a_style = _parse_style(a_style_m.group(1) if a_style_m else '')

        child_style: dict = {}
        text_content = inner
        child_m = re.match(r'^<(section|span|div)\s+([^>]*?)>(.*)</\1>$', inner, re.DOTALL)
        if child_m:
            cs_m = re.search(r'style="([^"]*)"', child_m.group(2))
            if cs_m:
                child_style = _parse_style(cs_m.group(1))
                text_content = child_m.group(3).strip()

        combined = {**a_style, **child_style}
        if not _looks_like_button(combined):
            return m.group(0)

        td_style = {k: v for k, v in combined.items() if k in button_props}
        text_style = {k: v for k, v in combined.items() if k in text_props}
        for k, v in text_style.items():
            if k != 'text-decoration':
                td_style[k] = v
        a_new_style = dict(text_style)
        a_new_style.setdefault('text-decoration', 'none')
        a_new_style.setdefault('display', 'inline-block')

        bg = td_style.pop('background', None)
        if bg and not td_style.get('background-color'):
            td_style['background-color'] = bg
        bgc_val = td_style.get('background-color', '')
        bgcolor = bgc_val if re.match(r'^#[0-9a-fA-F]{3,8}$', bgc_val) else ''
        align = td_style.pop('text-align', 'center')
        td_style.setdefault('text-align', align)

        td_attrs = f'align="{align}"'
        if bgcolor:
            td_attrs += f' bgcolor="{bgcolor}"'
        td_attrs += f' style="{_render_style(td_style)}"'
        a_attrs_new = re.sub(r'\s*style="[^"]*"', '', attrs).strip()
        a_attrs_new += f' style="{_render_style(a_new_style)}"'

        return (
            f'<table cellpadding="0" cellspacing="0" border="0" '
            f'align="{align}" style="margin:14px auto; border-collapse:separate">'
            f'<tbody><tr><td {td_attrs}>'
            f'<a {a_attrs_new}>{text_content}</a>'
            f'</td></tr></tbody></table>'
        )

    return pattern.sub(_wrap, html)


def _collapse_nested_sections(html: str) -> str:
    """Collapse chains of <section> wrappers with no meaningful attrs."""
    try:
        from lxml import html as lxml_html
        from lxml.etree import tostring
    except Exception:
        return html
    try:
        root = lxml_html.fragment_fromstring(
            f'<div id="__collapse_root__">{html}</div>',
            create_parent=False,
        )
    except Exception:
        return html

    for _ in range(20):
        changed = False
        for sec in list(root.iter('section')):
            parent = sec.getparent()
            if parent is None:
                continue
            if any(sec.get(a) for a in ('style', 'align', 'class', 'id', 'bgcolor')):
                continue
            if (sec.text or '').strip():
                continue
            if len(sec) != 1:
                continue
            only = sec[0]
            if only.tag != 'section':
                continue
            if (only.tail or '').strip():
                continue
            only.tail = (only.tail or '') + (sec.tail or '')
            idx = list(parent).index(sec)
            parent.remove(sec)
            parent.insert(idx, only)
            changed = True
        if not changed:
            break

    parts = [root.text or '']
    for child in root:
        parts.append(tostring(child, encoding='unicode', method='html'))
    return ''.join(parts)


# ---------------------------------------------------------------------------
# Style declaration filter - the new core gate
# ---------------------------------------------------------------------------


_BACKGROUND_SOLID_RE = re.compile(
    r'background\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))\s*(;|$)'
)
_SUBPIXEL_RE = re.compile(r'(?<!\d)0\.5px')
_IMPORTANT_RE = re.compile(r'\s*!important\s*$', re.IGNORECASE)


def _normalize_style_declarations(style_body: str) -> tuple[str, bool]:
    """Apply cross-declaration rewrites that predate the allowlist.

    Returns ``(normalized, hide_absolute)``. ``hide_absolute`` is True when
    the original style had ``position:absolute|fixed`` - the caller should
    then prepend ``display:none`` so the element disappears instead of
    overlapping flow content.
    """
    s = style_body
    # 1. Hide elements that were absolutely/fixed positioned (layout trick)
    hide_absolute = bool(re.search(r'position\s*:\s*(?:absolute|fixed)\b', s))
    # 2. opacity:0 -> opacity:1 (fix authoring mistakes that would hide content)
    s = re.sub(r'opacity\s*:\s*0(?:\.0+)?\s*(?=;|$)', 'opacity:1', s)
    # 3. background:<solid color> -> background-color:<solid color>
    #    (leaves linear-gradient / radial-gradient / url() alone)
    s = _BACKGROUND_SOLID_RE.sub(r'background-color:\1\2', s)
    # 4. 0.5px -> 1px (sub-pixel borders are invisible after paste)
    s = _SUBPIXEL_RE.sub('1px', s)
    return s, hide_absolute


def _filter_style_declarations(style_body: str) -> str:
    """Enforce the positive property + value allowlist. Drops !important."""
    keep: list[str] = []
    for decl in style_body.split(';'):
        decl = decl.strip()
        if not decl or ':' not in decl:
            continue
        prop, value = decl.split(':', 1)
        prop = prop.strip().lower()
        value = value.strip()
        if prop not in ALLOWED_STYLE_PROPERTIES:
            continue
        value = _IMPORTANT_RE.sub('', value).strip()
        if not value:
            continue
        if prop == 'display' and value.lower() not in _ALLOWED_DISPLAY_VALUES:
            continue
        if prop == 'position' and value.lower() not in _ALLOWED_POSITION_VALUES:
            continue
        keep.append(f'{prop}:{value}')
    return '; '.join(keep)


def _process_style_attribute(m: re.Match) -> str:
    """End-to-end style-attribute processor: normalize then allowlist-gate."""
    normalized, hide_absolute = _normalize_style_declarations(m.group(1))
    filtered = _filter_style_declarations(normalized)
    if hide_absolute:
        filtered = f'display:none; {filtered}' if filtered else 'display:none'
    return f'style="{filtered}"' if filtered else ''


# ---------------------------------------------------------------------------
# Top-level sanitizer
# ---------------------------------------------------------------------------


def sanitize_for_wechat(html: str) -> str:
    """Post-process inlined HTML for WeChat paste + draft-API parity.

    Pipeline:
        1. strip <style>/<script>/<input>/<label>/contenteditable
        2. strip classes, ids, data-*, on* handlers
        3. convert <a>-buttons to <table><tr><td>
        4. rename <div> to <section> (WeChat's expected block tag)
        5. normalize quotes and table chrome
        6. apply the style-attribute allowlist gate
        7. convert <pre> code blocks to section/code display
        8. drop decorative empty elements
        9. collapse redundant nested sections
    """
    html = re.sub(r'\s*contenteditable="[^"]*"', '', html)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<input\s[^>]*>\s*', '', html)
    html = re.sub(r'<label\b[^>]*>(.*?)</label>', r'\1', html, flags=re.DOTALL)
    html = re.sub(r'\s+class="[^"]*"', "", html)
    html = re.sub(r"\s+class='[^']*'", "", html)
    html = re.sub(r'\s+data-[\w-]+="[^"]*"', "", html)
    html = re.sub(r'\s+id="[^"]*"', "", html)
    html = re.sub(r'\s+on\w+="[^"]*"', "", html)

    html = _fix_button_anchors(html)
    html = re.sub(r'<div\b', '<section', html)
    html = re.sub(r'</div>', '</section>', html)
    html = re.sub(r"style='([^']*)'", r'style="\1"', html)
    html = re.sub(r'(<table\b[^>]*?)\s+bgcolor="[^"]*"', r'\1', html)
    html = re.sub(r'(<tr\b[^>]*?)\s+bgcolor="[^"]*"', r'\1', html)

    def _td_border_fix(m: re.Match) -> str:
        head = m.group(0)
        style_m = re.search(r'style="([^"]*)"', head)
        if style_m:
            inner = style_m.group(1)
            if re.search(r'(?:^|;)\s*border\s*:', inner):
                return head
            new_inner = ('border:0; ' + inner.strip()).strip().strip(';').strip()
            return head.replace(style_m.group(0), f'style="{new_inner}"')
        return head[:-1] + ' style="border:0">'

    html = re.sub(r'<td\b[^>]*>', _td_border_fix, html)
    html = re.sub(
        r'<(\w+)\s+style="[^"]*position\s*:\s*absolute[^"]*"\s*>\s*</\1>',
        '',
        html,
    )

    # Core style allowlist gate - replaces the old blacklist-only _fix_style.
    html = re.sub(r'style="([^"]*)"', _process_style_attribute, html)
    html = re.sub(r'\s+style="\s*"', '', html)

    def _convert_pre_block(m: re.Match) -> str:
        pre_attrs = m.group(1) or ""
        content = m.group(2)
        bg = "#0d1117"
        fg = "#e6edf3"
        bg_match = re.search(r'background(?:-color)?\s*:\s*([^;]+)', pre_attrs)
        if bg_match:
            bg = bg_match.group(1).strip()
        fg_match = re.search(r'(?:^|;)\s*color\s*:\s*([^;]+)', pre_attrs)
        if fg_match:
            fg = fg_match.group(1).strip()

        import html as html_mod

        inner = re.sub(r'<[^>]+>', '', content)
        inner = html_mod.unescape(inner)
        formatted = '<br>'.join(
            html_mod.escape(line).replace(' ', '&nbsp;')
            for line in inner.split('\n')
        )
        return (
            f'<section style="background-color:{bg};border-radius:8px;'
            f'padding:16px;margin:18px 0;overflow:hidden;">'
            f'<code style="color:{fg};font-size:12px;line-height:1.6;'
            f'font-family:Menlo,Monaco,Courier New,monospace;'
            f'display:block;white-space:normal;word-break:break-all;">'
            f'{formatted}</code></section>'
        )

    html = re.sub(r'<pre([^>]*)>(.*?)</pre>', _convert_pre_block, html, flags=re.DOTALL)
    html = re.sub(r'<(\w+)(?:\s+[^>]*)?\s*>\s*</\1>', _remove_if_decorative, html)
    html = _collapse_nested_sections(html)
    html = re.sub(r'\n\s*\n', '\n', html)
    return html.strip()
