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
import secrets


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
    "display", "vertical-align", "position", "table-layout",
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

# `table-layout: fixed` is the load-bearing fix for WeChat's preview pane
# compressing columns below their stated `width:Xpx`. Limit to the two
# spec values so a typo'd value can't sneak through the allowlist.
_ALLOWED_TABLE_LAYOUT_VALUES = frozenset({"fixed", "auto"})


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

        # Background handling: WeChat strips inline `linear-gradient(...)` and
        # rejects non-hex `background-color` values. To survive paste, derive a
        # solid hex fallback from the first color stop of any gradient and set
        # it as both the legacy `bgcolor=` attribute and `background-color`
        # style. Keep the original gradient in `background` so renderers that
        # *do* support gradients (preview, modern email) still get the nicer
        # version.
        bg_raw = td_style.pop('background', None)
        bgc_raw = td_style.get('background-color', '')
        gradient = None
        solid_hex = ''
        for candidate in (bg_raw, bgc_raw):
            if not candidate:
                continue
            cand = candidate.strip()
            m_hex = re.match(r'^#[0-9a-fA-F]{3,8}$', cand)
            if m_hex and not solid_hex:
                solid_hex = cand
                continue
            m_grad = re.match(r'(?:linear|radial|conic)-gradient\s*\(', cand, re.IGNORECASE)
            if m_grad and not gradient:
                gradient = cand
                # Pull first hex color stop out of the gradient as a fallback.
                m_stop = re.search(r'#[0-9a-fA-F]{3,8}', cand)
                if m_stop and not solid_hex:
                    solid_hex = m_stop.group(0)
        if solid_hex:
            td_style['background-color'] = solid_hex
        elif bgc_raw:
            td_style['background-color'] = bgc_raw
        if gradient:
            td_style['background'] = gradient
        bgcolor = solid_hex
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


def _inject_table_layout_fixed(html: str) -> str:
    """Force `table-layout:fixed` on tables whose author set an explicit
    pixel width on at least one direct child <td>. If the table itself
    has no width hint, also inject `width:100%` — per HTML5, fixed-layout
    on a width-less table falls back to auto, so we must give the table
    a width to honor the author's per-cell pixel widths.

    Default `table-layout:auto` lets the browser shrink any column below
    its stated `width:Xpx` to fit wider sibling content. That's what
    breaks 30px digit cells (collapsing to single-character width so
    "01" wraps to two lines) and logo-card columns (auto-shrunk to
    single-glyph min-content) in WeChat's mobile-viewport preview.

    Heuristic: any direct-child <td> with `width:Xpx` is the signal that
    the author wanted specific column widths. Tables without any
    px-width <td>, or where the author already set `table-layout`
    (any value), are left alone. Nested-table <td>s don't vote for
    their outer table's layout — only direct children count.

    The width:100% fallback only fires when the author set NO width hint
    of any kind (no `width`/`max-width`/`min-width` in style, no `width=`
    HTML attribute). If they did set one, we respect it.
    """
    try:
        from lxml import html as lxml_html
        from lxml.etree import tostring
    except Exception:
        return html
    try:
        root = lxml_html.fragment_fromstring(
            f'<div id="__tlayout_root__">{html}</div>',
            create_parent=False,
        )
    except Exception:
        return html

    table_layout_re = re.compile(r'(?:^|;)\s*table-layout\s*:')
    has_any_width_re = re.compile(r'(?:^|;)\s*(?:width|max-width|min-width)\s*:')
    td_px_width_re = re.compile(r'(?:^|;)\s*width\s*:\s*\d+\s*px')

    for table in root.iter('table'):
        style = table.get('style') or ''
        if table_layout_re.search(style):
            continue
        has_px_width_td = False
        for td in table.iter('td'):
            # Only consider tds whose nearest <table> ancestor is THIS
            # table — nested tables have their own column-width contract
            # and their <td>s should not vote for the outer table.
            anc = td.getparent()
            while anc is not None and anc.tag != 'table':
                anc = anc.getparent()
            if anc is not table:
                continue
            td_style = td.get('style') or ''
            if td_px_width_re.search(td_style):
                has_px_width_td = True
                break
        if not has_px_width_td:
            continue
        new_style = style.strip().rstrip(';').strip()
        # Without a defined table width, fixed-layout becomes a no-op.
        # When the author didn't pin a width anywhere (style or HTML
        # attr), default to filling the parent — the typical intent
        # when per-cell pixel widths are present.
        if not has_any_width_re.search(style) and not table.get('width'):
            new_style = f'width:100%; {new_style}' if new_style else 'width:100%'
        new_style = f'{new_style}; table-layout:fixed' if new_style else 'table-layout:fixed'
        table.set('style', new_style)

    parts = [root.text or '']
    for child in root:
        parts.append(tostring(child, encoding='unicode', method='html'))
    return ''.join(parts)


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
# Reject CSS values that smuggle a script-execution URL scheme inside url(...).
# Matches url( optional-quote javascript:/vbscript:/data: ), tolerating
# whitespace and HTML-entity / escape obfuscation is out of scope (the value
# has already been entity-decoded for the common &quot; case upstream). The
# bracket may be followed by single/double quote before the scheme.
_DANGEROUS_CSS_URL_RE = re.compile(
    r'''url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)\s*:''',
    re.IGNORECASE,
)


def _normalize_style_declarations(
    style_body: str,
    *,
    neutralize_layout_tricks: bool = True,
    keep_opacity_zero: bool = False,
) -> tuple[str, bool]:
    """Apply cross-declaration rewrites that predate the allowlist.

    Returns ``(normalized, hide_absolute)``. ``hide_absolute`` is True when
    the original style had ``position:absolute|fixed`` - the caller should
    then prepend ``display:none`` so the element disappears instead of
    overlapping flow content.

    When ``neutralize_layout_tricks`` is False (generic/web profile) the
    opacity:0->1 rewrite and the absolute/fixed hide are skipped — those are
    WeChat-paste workarounds that would corrupt a faithful web preview.
    """
    s = style_body
    # 1. Hide elements that were absolutely/fixed positioned (layout trick)
    hide_absolute = (
        bool(re.search(r'position\s*:\s*(?:absolute|fixed)\b', s))
        if neutralize_layout_tricks
        else False
    )
    if neutralize_layout_tricks and not keep_opacity_zero:
        # 2. opacity:0 -> opacity:1 (fix authoring mistakes that would hide content)
        # 批3:api-storage-safe 档置 keep_opacity_zero=True 跳过本改写——真值表
        # docs/research/wechat-svg-truth-table.md 61-62 行实测 API 存储层保留
        # opacity:0 淡入起手态。
        s = re.sub(r'opacity\s*:\s*0(?:\.0+)?\s*(?=;|$)', 'opacity:1', s)
    # 3. background:<solid color> -> background-color:<solid color>
    #    (leaves linear-gradient / radial-gradient / url() alone)
    s = _BACKGROUND_SOLID_RE.sub(r'background-color:\1\2', s)
    # 4. 0.5px -> 1px (sub-pixel borders are invisible after paste)
    s = _SUBPIXEL_RE.sub('1px', s)
    return s, hide_absolute


def _filter_style_declarations(
    style_body: str,
    *,
    allowed_properties: frozenset = ALLOWED_STYLE_PROPERTIES,
    allowed_display: frozenset = _ALLOWED_DISPLAY_VALUES,
    allowed_position: frozenset = _ALLOWED_POSITION_VALUES,
) -> str:
    """Enforce the positive property + value allowlist. Drops !important."""
    keep: list[str] = []
    for decl in style_body.split(';'):
        decl = decl.strip()
        if not decl or ':' not in decl:
            continue
        prop, value = decl.split(':', 1)
        prop = prop.strip().lower()
        value = value.strip()
        if prop not in allowed_properties:
            continue
        value = _IMPORTANT_RE.sub('', value).strip()
        if not value:
            continue
        # Security floor: never let a CSS value smuggle a script-execution
        # URL scheme via url(javascript:...) / url(vbscript:...) / url(data:).
        # This mirrors strip_dangerous's href/src guard but for inline style
        # property values (background:url(...), filter:url(...), etc.). Applies
        # to EVERY profile — the generic profile is more permissive about WHICH
        # properties survive (filter/backdrop-filter), so the guard matters more
        # there, but the WeChat path inherits the same floor.
        if _DANGEROUS_CSS_URL_RE.search(value):
            continue
        if prop == 'display' and value.lower() not in allowed_display:
            continue
        if prop == 'position' and value.lower() not in allowed_position:
            continue
        if prop == 'table-layout' and value.lower() not in _ALLOWED_TABLE_LAYOUT_VALUES:
            continue
        keep.append(f'{prop}:{value}')
    return '; '.join(keep)


def _process_style_attribute(m: re.Match) -> str:
    """End-to-end style-attribute processor: normalize then allowlist-gate.

    Kept as the WeChat-default callback (used directly by the legacy
    ``re.sub`` call sites and by the back-compat path). Profile-aware
    processing goes through :func:`_make_style_processor`.
    """
    normalized, hide_absolute = _normalize_style_declarations(m.group(1))
    filtered = _filter_style_declarations(normalized)
    if hide_absolute:
        filtered = f'display:none; {filtered}' if filtered else 'display:none'
    return f'style="{filtered}"' if filtered else ''


def _make_style_processor(profile):
    """Build a ``re.sub`` callback that gates styles via ``profile``."""
    def _proc(m: re.Match) -> str:
        normalized, hide_absolute = _normalize_style_declarations(
            m.group(1),
            neutralize_layout_tricks=profile.neutralize_layout_tricks,
            keep_opacity_zero=getattr(profile, 'keep_opacity_zero', False),
        )
        filtered = _filter_style_declarations(
            normalized,
            allowed_properties=profile.allowed_style_properties,
            allowed_display=profile.allowed_display_values,
            allowed_position=profile.allowed_position_values,
        )
        if hide_absolute:
            filtered = f'display:none; {filtered}' if filtered else 'display:none'
        return f'style="{filtered}"' if filtered else ''
    return _proc


# ---------------------------------------------------------------------------
# SVG subtree protection
# ---------------------------------------------------------------------------
#
# The whole pipeline is string/regex based and was authored for the HTML
# subset WeChat accepts. SVG, however, has its own contract: `id` references
# (`fill="url(#g1)"`, `begin="hero.click"`), SVG-only style properties
# (`fill`/`stroke`/`stroke-width`/`stop-color`/`transform`/`pointer-events`/
# `cursor`), and animation initial states (`opacity:0` on an entering element)
# are all load-bearing INSIDE an <svg> subtree. The global id strip
# (`re.sub(r'\s+id="..."')`), the style allowlist gate, and the
# `opacity:0 -> opacity:1` rewrite would each shred those.
#
# Rather than thread an "am I in an SVG?" flag through every regex callback,
# we excise each top-level <svg>...</svg> subtree up front, swap in an inert
# placeholder token, run the existing HTML pipeline untouched, then splice the
# original SVG markup back in verbatim at the end. Nested <svg> elements are
# carried along inside their outermost parent, so a single excision protects
# the entire tree. SVG-OUTSIDE HTML keeps its current cleaning behavior.

_SVG_OPEN_RE = re.compile(r'<svg\b', re.IGNORECASE)

# The placeholder must survive lxml's fragment parser intact (used by the
# table-layout / nested-section passes), so it has to be valid text — no NUL
# bytes, no angle brackets. An HTML comment is inert, never matches the
# pipeline's element/style/id regexes, and round-trips through lxml verbatim.
#
# SECURITY (review F2): the placeholder MUST be UNGUESSABLE per invocation.
# A fixed token (``SVG_SANITIZE_PLACEHOLDER_0``) lets a user type that exact
# comment in the article body; ``_restore_svg_subtrees`` would then splice the
# (unsanitized in the old design) SVG fragment into that arbitrary position,
# duplicating it / injecting content. A random nonce minted on every call to
# ``sanitize_for_wechat`` cannot be predicted and therefore cannot be injected.
_SVG_PLACEHOLDER_PREFIX = 'SVG_SANITIZE_PLACEHOLDER'

# on* event handlers (both quote styles + unquoted) inside an SVG subtree.
_SVG_ON_HANDLER_RE = re.compile(
    r'''\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)''',
    re.IGNORECASE,
)
# <script>...</script> nested in an SVG subtree (WeChat strips it, but the
# fragment is written to the clipboard and may be pasted into a JS-capable
# editor — so we strip it here too).
_SVG_SCRIPT_RE = re.compile(
    r'<script\b[^>]*>.*?</script>', re.IGNORECASE | re.DOTALL,
)
_SVG_SCRIPT_OPEN_RE = re.compile(r'</?script\b[^>]*>', re.IGNORECASE)


def _make_svg_placeholder_re(nonce: str) -> re.Pattern:
    return re.compile(
        rf'<!--{_SVG_PLACEHOLDER_PREFIX}_{re.escape(nonce)}_(\d+)-->'
    )


def _sanitize_svg_fragment(svg: str) -> str:
    """Strip script execution vectors from an SVG subtree while preserving its
    presentation contract (ids, fill/stroke/transform styles, animation initial
    states). Only ``on*`` handlers and ``<script>`` elements are removed — see
    review finding F1: the subtree protection must not become an XSS bypass for
    HTML that later lands on the system clipboard / in ``process-for-copy``'s
    ``html`` response field."""
    svg = _SVG_SCRIPT_RE.sub('', svg)
    # Drop any unbalanced/leftover <script> open or close tags too.
    svg = _SVG_SCRIPT_OPEN_RE.sub('', svg)
    svg = _SVG_ON_HANDLER_RE.sub('', svg)
    return svg


def _scan_tag_end(html: str, lt: int, n: int) -> int:
    """Return the index just past the end of the tag starting at ``lt`` (a
    ``<``), skipping over quoted attribute values so a literal ``>`` (or
    ``</svg>``, review finding F3) inside an attribute can't be mistaken for
    the tag end. Returns -1 if the tag never closes (truncated input)."""
    i = lt + 1
    while i < n:
        c = html[i]
        if c == '"' or c == "'":
            close = html.find(c, i + 1)
            if close == -1:
                return -1
            i = close + 1
            continue
        if c == '>':
            return i + 1
        i += 1
    return -1


def _extract_svg_subtrees(html: str, nonce: str) -> tuple[str, list[str]]:
    """Replace each top-level ``<svg>...</svg>`` subtree with a placeholder.

    Returns ``(html_with_placeholders, svg_fragments)``. ``svg_fragments[i]``
    is the (script/on*-sanitized) markup the i-th placeholder stands for.
    Nested ``<svg>`` elements are absorbed into their outermost ancestor (depth
    counting), so one placeholder covers a whole tree. Unbalanced / unclosed
    ``<svg>`` (e.g. truncated input) is left in place untouched.

    This is a SINGLE forward pass (review finding F5): we walk every tag once,
    maintaining the nesting depth of open ``<svg>`` elements on a counter and
    remembering where the current top-level subtree began. The old design
    re-scanned the tail once per stray ``<svg>`` (O(k*n)); this is O(n).

    The scan is attribute-aware for EVERY tag it walks (review finding F3): a
    literal ``</svg>`` (or ``>``) embedded in any descendant's attribute value
    sits inside a quoted run and is skipped, so it can't prematurely close the
    subtree.
    """
    fragments: list[str] = []
    out: list[str] = []
    n = len(html)
    lower = html.lower()
    emitted = 0          # everything in html[:emitted] is already in ``out``
    i = 0
    depth = 0
    subtree_start = -1   # start of the current top-level <svg> subtree
    while i < n:
        lt = html.find('<', i)
        if lt == -1:
            break
        is_svg_open = lower.startswith('<svg', lt) and (
            lt + 4 >= n or not (html[lt + 4].isalnum() or html[lt + 4] in '-_:')
        )
        is_svg_close = lower.startswith('</svg', lt)
        tag_end = _scan_tag_end(html, lt, n)
        if tag_end == -1:
            # Truncated final tag: nothing more can balance; stop scanning.
            break
        if is_svg_open:
            tag = html[lt:tag_end]
            self_closing = tag.rstrip().rstrip('>').rstrip().endswith('/')
            if depth == 0 and not self_closing:
                subtree_start = lt
                depth = 1
            elif depth == 0 and self_closing:
                # A top-level <svg .../> with no children — protect it whole.
                out.append(html[emitted:lt])
                fragments.append(_sanitize_svg_fragment(html[lt:tag_end]))
                out.append(
                    f'<!--{_SVG_PLACEHOLDER_PREFIX}_{nonce}_{len(fragments) - 1}-->'
                )
                emitted = tag_end
            elif depth > 0 and not self_closing:
                depth += 1
            # nested self-closing svg: depth unchanged
        elif is_svg_close and depth > 0:
            depth -= 1
            if depth == 0:
                out.append(html[emitted:subtree_start])
                fragments.append(
                    _sanitize_svg_fragment(html[subtree_start:tag_end])
                )
                out.append(
                    f'<!--{_SVG_PLACEHOLDER_PREFIX}_{nonce}_{len(fragments) - 1}-->'
                )
                emitted = tag_end
                subtree_start = -1
        i = tag_end
    out.append(html[emitted:])
    return ''.join(out), fragments


def _restore_svg_subtrees(html: str, fragments: list[str], nonce: str) -> str:
    """Splice the sanitized SVG markup back in for each placeholder token.

    Only placeholders carrying *this invocation's* random ``nonce`` match, so a
    user who types a fixed placeholder-shaped comment in the article body cannot
    trigger a splice (review finding F2)."""
    if not fragments:
        return html

    def _sub(m: re.Match) -> str:
        idx = int(m.group(1))
        return fragments[idx] if 0 <= idx < len(fragments) else ''

    return _make_svg_placeholder_re(nonce).sub(_sub, html)


# ---------------------------------------------------------------------------
# Top-level sanitizer
# ---------------------------------------------------------------------------


def sanitize_for_wechat(html: str) -> str:
    """Post-process inlined HTML for WeChat paste + draft-API parity.

    Thin wrapper over :func:`sanitize_with_profile` bound to the WeChat
    profile. Kept as a stable 1-line entry point so every existing caller and
    the 500-test suite see byte-for-byte identical output (guarded by the
    wechat-equivalence regression in ``tests/test_render_profiles.py``).
    """
    from app.services.render_profiles import WECHAT_PROFILE

    return sanitize_with_profile(html, WECHAT_PROFILE)


def sanitize_with_profile(html: str, profile) -> str:
    """Profile-aware HTML sanitizer.

    Runs the SAME string/regex pipeline as the historical
    ``sanitize_for_wechat`` but gates each narrowing step on ``profile``'s
    flags and uses ``profile.allowed_*`` for the style gate. The
    script/style/on*/iframe security floor is ALWAYS applied regardless of
    profile.

    Pipeline (steps marked [floor] always run; others are profile-gated):
        1. [floor] strip <style>/<script>/<input>/<label>/contenteditable
        2. strip classes, ids, data-*  ;  [floor] strip on* handlers
        3. convert <a>-buttons to <table><tr><td>
        4. rename <div> to <section> (WeChat's expected block tag)
        5. normalize quotes and table chrome
        6. apply the style-attribute allowlist gate (profile allowlists)
        7. convert <pre> code blocks to section/code display
        8. drop decorative empty elements
        9. collapse redundant nested sections

    SVG subtrees are excised to inert placeholders before step 1 and spliced
    back verbatim after step 9 (profile-independent — SVG safety is a hard
    contract enforced later by SvgRenderer/svg_validator).
    """
    # Mint an unguessable per-invocation nonce so a user can't inject the
    # placeholder comment to splice SVG content into an arbitrary position.
    _svg_nonce = secrets.token_hex(8)
    html, _svg_fragments = _extract_svg_subtrees(html, _svg_nonce)
    html = re.sub(r'\s*contenteditable="[^"]*"', '', html)
    # --- security floor: scripts/styles/head/embeds/form controls ---
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Head/metadata tags must never reach the clipboard fragment: a full-
    # document input leaks <meta>/<title>/<link> through premailer's body
    # extraction, and a surviving <title> renders its text as stray prose
    # after paste. (<base> rewrites every relative URL; equally dangerous.)
    html = re.sub(r'<title[^>]*>.*?</title>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<(?:meta|link|base)\b[^>]*/?>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</?(?:html|head|body)\b[^>]*>', '', html, flags=re.IGNORECASE)
    # WeChat rejects embeds and form controls outright — drop the subtree so
    # a broken player box doesn't survive as an empty styled shell.
    html = re.sub(
        r'<(iframe|embed|object|video|audio|canvas)\b[^>]*>.*?</\1>',
        '', html, flags=re.DOTALL | re.IGNORECASE,
    )
    html = re.sub(r'<(?:iframe|embed|source|track)\b[^>]*/?>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<input\s[^>]*>\s*', '', html)
    html = re.sub(r'<label\b[^>]*>(.*?)</label>', r'\1', html, flags=re.DOTALL)
    # --- profile-gated attribute stripping ---
    if profile.strip_class_id:
        html = re.sub(r'\s+class="[^"]*"', "", html)
        html = re.sub(r"\s+class='[^']*'", "", html)
    if profile.strip_data_attrs:
        html = re.sub(r'\s+data-[\w-]+="[^"]*"', "", html)
    if profile.strip_class_id:
        html = re.sub(r'\s+id="[^"]*"', "", html)
        # F4: single-quoted ids reach the gate before lxml normalizes quotes, so
        # strip both forms here (the SVG subtree is already excised, so this only
        # touches plain HTML ids).
        html = re.sub(r"\s+id='[^']*'", "", html)
    # [floor] on* handlers are stripped for every profile. Allow whitespace
    # around the '=' (onclick = "...") so the render floor is as strong as
    # strip_dangerous's import floor.
    html = re.sub(r'\s+on\w+\s*=\s*"[^"]*"', "", html)
    html = re.sub(r"\s+on\w+\s*=\s*'[^']*'", "", html)
    html = re.sub(r"\s+on\w+\s*=\s*[^\s>]+", "", html)

    if profile.convert_button_anchors:
        html = _fix_button_anchors(html)
    if profile.rename_div_to_section:
        html = re.sub(r'<div\b', '<section', html)
        html = re.sub(r'</div>', '</section>', html)
    if profile.rename_semantic_tags:
        # WeChat's paste handler / draft ingest UNWRAPS HTML5 semantic wrappers
        # (<article>, <main>, <header>, ...): children survive but the tag and
        # its style attribute are dropped. Rename to <section>, which WeChat
        # treats as its native block container.
        _SEMANTIC_TAGS = (
            'article', 'main', 'header', 'footer', 'aside', 'nav',
            'hgroup', 'figure', 'figcaption', 'form', 'button',
        )
        for _tag in _SEMANTIC_TAGS:
            html = re.sub(rf'<{_tag}\b', '<section', html, flags=re.IGNORECASE)
            html = re.sub(rf'</{_tag}\s*>', '</section>', html, flags=re.IGNORECASE)
    # XHTML namespace declarations ride along on <article xmlns="..."> style
    # exports; they are meaningless inline and confuse WeChat's parser. Only
    # the XHTML namespace is removed — SVG elements keep their xmlns.
    html = re.sub(r'\s+xmlns="http://www\.w3\.org/1999/xhtml"', '', html)
    html = re.sub(r"\s+xmlns='http://www\.w3\.org/1999/xhtml'", '', html)
    # Normalize single-quoted style attrs (lxml emits them when the value
    # contains double quotes, e.g. font-family:"PingFang SC"). The inner
    # double quotes MUST be converted to single quotes — substituting them
    # into a double-quoted attribute verbatim truncates the attribute and
    # destroys every declaration in it.
    html = re.sub(
        r"style='([^']*)'",
        lambda m: 'style="' + m.group(1).replace('"', "'") + '"',
        html,
    )
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

    if profile.rename_div_to_section:
        # The td border-zeroing is a WeChat-table workaround; keep it tied to
        # the same profile that does WeChat structural rewrites.
        html = re.sub(r'<td\b[^>]*>', _td_border_fix, html)
    if profile.neutralize_layout_tricks:
        html = re.sub(
            r'<(\w+)\s+style="[^"]*position\s*:\s*absolute[^"]*"\s*>\s*</\1>',
            '',
            html,
        )

    # Core style allowlist gate (profile-parameterized).
    html = re.sub(r'style="([^"]*)"', _make_style_processor(profile), html)
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

    if profile.convert_pre_blocks:
        html = re.sub(r'<pre([^>]*)>(.*?)</pre>', _convert_pre_block, html, flags=re.DOTALL)
    html = re.sub(r'<(\w+)(?:\s+[^>]*)?\s*>\s*</\1>', _remove_if_decorative, html)
    if profile.inject_table_layout_fixed:
        html = _inject_table_layout_fixed(html)
    if profile.collapse_nested_sections:
        html = _collapse_nested_sections(html)
    html = re.sub(r'\n\s*\n', '\n', html)
    html = _restore_svg_subtrees(html, _svg_fragments, _svg_nonce)
    return html.strip()
