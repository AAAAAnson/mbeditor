"""Agent 对话式编辑的工具层(批3,2026-07-04,spec §4)。

7 个**纯函数**工具:每个工具接 ``(doc: BlockDoc, args: dict)``,返回
``ToolOutcome{doc(新), payload(dict)}``——绝不改动入参 doc、不持任何会话
状态(会话状态由批4 的编排层管理)。payload 是直接回给 LLM 的 JSON。

设计要点:

- **写工具自动后置 T1**(spec §5):replace_block / apply_block_style /
  set_design_tokens / edit_structure 产出的新 HTML 一律过
  ``api-storage-safe`` 档 sanitize,payload 携带 {applied, repairs,
  violations};violations 非空时块**仍应用 T1 修补后的版本**(除非整块
  清洗后为空即不可救,applied=False 原块保留)——T2 回炉由 LLM 依
  fix_hint 决定是否重做该块。
- **错误不抛**:未知工具 / 参数校验失败 / 块 id 失配一律返回错误 payload
  (含 fix_hint / existing_ids),让 LLM 能看懂并自纠(DeepSeek 弱模型友好)。
- **标题定位走文本**:批2 交接已知事实——真实版式的标题是 styled section
  而非 <h1-h6>,块 kind=="heading" 在真实 AI 产文上永不触发。read_article
  的块摘要携带文本,LLM 按文本/摘要定位标题,工具层不按 kind 过滤。
- 参数全部扁平(无嵌套 object,DeepSeek 约束,spec §3);工具总数 7 ≤ 8。
"""
from __future__ import annotations

import html as html_mod
import re
from dataclasses import dataclass

import jsonschema

from app.services.block_doc import Block, BlockDoc, blocks_to_html
from app.services.block_doc import _classify  # 同仓复用启发式分类
from app.services.llm.base import ToolSpec
from app.services.sanitize_profiles import (
    API_STORAGE_SAFE,
    sanitize_html,
)
from app.services.svg_validator import (
    VALID_TRANSFORM_TYPES,
    WHITELIST_ATTRIBUTES,
)


@dataclass
class ToolOutcome:
    """一次工具调用的结果:新文档 + 回给 LLM 的 JSON payload。

    读工具的 ``doc`` 就是入参本体(未变);写工具的 ``doc`` 是全新构造的
    BlockDoc(入参绝不被改动)。
    """

    doc: BlockDoc
    payload: dict


# ---------------------------------------------------------------------------
# 内部工具函数
# ---------------------------------------------------------------------------

_TAG_STRIP_RE = re.compile(r"<[^>]*>")
_COMMENT_STRIP_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_WS_RE = re.compile(r"\s+")
_SUMMARY_LIMIT = 80

# 块根元素开标签(引号感知):组1=前导空白,组2=标签名,组3=属性串,组4=自闭斜杠
_ROOT_TAG_RE = re.compile(
    r"""^(\s*)<([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(/?)>""",
)
# 属性 token(引号感知,从头顺序扫描):组1=属性名,组2=值(引号包裹或无引号)。
# 顺序 tokenize 保证引号值内部的 "style=" 被整体 token 跳过,不会误认成 style 属性;
# 无引号值仍纳入(防御性:LLM 可能产 <p style=color:red>),合并输出统一带双引号。
_ATTR_TOKEN_RE = re.compile(
    r"""\s([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+)"""
)

# read_article 块清单总量上限(项4:1200 块级长文的清单 payload 会撑爆上下文)。
_READ_ARTICLE_BLOCK_LIMIT = 200

# 媒体守恒硬闸:统计全文 <svg>/<img> 标签数(H1 根治)。任何写工具若让此计数
# 减少,run_tool 一律拒绝——覆盖 edit_structure delete 掉媒体块、replace_block
# 重写含图块时丢内嵌 <svg>/<img> 两种删除矢量(2026-07-05 NAS 真 DeepSeek QA:
# 「克制高级」换调子会把装饰 SVG 删掉;软纪律+守恒警告不够,加确定性硬闸)。
_MEDIA_TAG_RE = re.compile(r"<\s*(?:svg|img)\b", re.IGNORECASE)


def _count_media(doc: BlockDoc) -> int:
    """全文 <svg>/<img> 标签总数(含内嵌在 section/p 等块里的)。"""
    return len(_MEDIA_TAG_RE.findall(blocks_to_html(doc)))


def _summary_of(block: Block) -> str:
    """块文本摘要(≤80 字):剥标签/注释、压空白;无文本时报块类型。"""
    text = _TAG_STRIP_RE.sub("", _COMMENT_STRIP_RE.sub("", block.html))
    text = _WS_RE.sub(" ", html_mod.unescape(text)).strip()
    if not text:
        return f"({block.kind} 块,无文本)"
    if len(text) > _SUMMARY_LIMIT:
        return text[: _SUMMARY_LIMIT - 1] + "…"
    return text


def _clone_doc(doc: BlockDoc, blocks: list[Block] | None = None,
               design_tokens: dict | None = None,
               shell_open: str | None = None,
               shell_close: str | None = None) -> BlockDoc:
    """浅克隆出新 BlockDoc(纯函数写路径专用,入参零改动)。"""
    return BlockDoc(
        shell_open=doc.shell_open if shell_open is None else shell_open,
        shell_close=doc.shell_close if shell_close is None else shell_close,
        blocks=list(doc.blocks) if blocks is None else blocks,
        design_tokens=dict(doc.design_tokens) if design_tokens is None else design_tokens,
    )


def _ids_of(doc: BlockDoc) -> list[str]:
    return [b.id for b in doc.blocks]


def _missing_ids_payload(doc: BlockDoc, missing: list[str]) -> dict:
    return {
        "error": f"块 id 不存在:{', '.join(missing)}",
        "existing_ids": _ids_of(doc),
        "fix_hint": "先调用 read_article 获取块清单,从 existing_ids 中选取正确的块 id 重试",
    }


def _classify_fragment(frag: str) -> str:
    """替换/插入的新 HTML 的 kind 启发式(复用 block_doc._classify)。"""
    seg_type = "element" if frag.lstrip().startswith("<") else "text"
    return _classify(seg_type, frag)


def _new_block_id(doc: BlockDoc) -> str:
    """确定性生成不与现存冲突的新块 id(取最大 b{n} 序号 +1)。"""
    top = 0
    for b in doc.blocks:
        m = re.fullmatch(r"b(\d+)", b.id)
        if m:
            top = max(top, int(m.group(1)))
    nid = f"b{top + 1}"
    existing = set(_ids_of(doc))
    while nid in existing:  # 防御:非 b{n} 命名也不撞
        top += 1
        nid = f"b{top + 1}"
    return nid


def _sanitize_fragment(frag: str) -> tuple[str, list[dict], list[dict]]:
    """写工具的 T1 后置:api-storage-safe 档清洗 + 记账。"""
    clean, report = sanitize_html(frag, API_STORAGE_SAFE.name)
    return clean, report["repairs"], report["violations"]


def _tag_entries(entries: list[dict], block_id: str) -> list[dict]:
    """给 repairs/violations 记账条目补上 block_id,便于 LLM 定位回炉。"""
    return [{**e, "block_id": block_id} for e in entries]


def _merge_style_into_root(frag: str, props: list[tuple[str, str]]) -> str:
    """把 CSS 声明确定性合并进块根元素的 style 属性。

    规则:既有声明保持原顺序,同名属性原位覆盖,新属性按入参顺序追加。
    块没有根元素(纯文本)时,包一层 <section style="...">。
    """
    m = _ROOT_TAG_RE.match(frag)
    style_body = "; ".join(f"{k}:{v}" for k, v in props)
    if m is None:
        return f'<section style="{style_body}">{frag}</section>'
    lead, tag, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
    sm = next(
        (t for t in _ATTR_TOKEN_RE.finditer(attrs) if t.group(1).lower() == "style"),
        None,
    )
    if sm is None:
        new_attrs = f'{attrs} style="{style_body}"'
    else:
        raw = sm.group(2)
        sm_end = sm.end()
        # 无引号值会把 attrs 末尾的自闭合 / 吞进 CSS 值,剥回去留在 attrs 里
        if raw[:1] not in ('"', "'") and raw.endswith("/") and sm_end == len(attrs):
            raw = raw[:-1]
            sm_end -= 1
        existing = raw[1:-1] if raw[:1] in ('"', "'") else raw
        decls: list[tuple[str, str]] = []
        for d in existing.split(";"):
            d = d.strip()
            if not d or ":" not in d:
                continue
            k, v = d.split(":", 1)
            decls.append((k.strip().lower(), v.strip()))
        for k, v in props:
            for i, (ek, _ev) in enumerate(decls):
                if ek == k:
                    decls[i] = (k, v)
                    break
            else:
                decls.append((k, v))
        merged = "; ".join(f"{k}:{v}" for k, v in decls)
        new_attrs = attrs[: sm.start()] + f' style="{merged}"' + attrs[sm_end:]
    rest = frag[m.end():]
    return f"{lead}<{tag}{new_attrs}{selfclose}>{rest}"


def _apply_shell_background(shell_open: str, shell_close: str, value: str) -> tuple[str, str]:
    """确定性把 background-color 设进信封壳开标签(注入/替换)。

    壳为空(无信封:多顶层元素/裸文本)时,按最小壳
    ``<section style="background-color:VALUE;">`` 包裹,并补 ``</section>`` 闭壳,
    保住 ``blocks_to_html = shell_open + blocks + shell_close``。
    非空壳仅操作开标签的 style 属性,复用 ``_merge_style_into_root``(对 open-only
    片段 rest 为空,返回改写后的开标签),故往返不变量不破。
    """
    val = value.strip()
    if not shell_open.strip():
        return f'<section style="background-color:{val};">', "</section>"
    new_open = _merge_style_into_root(shell_open, [("background-color", val)])
    return new_open, shell_close


# apply_block_style 的扁平参数 -> CSS 属性;True = 数值型入参自动补 px。
_STYLE_PARAMS: list[tuple[str, str, bool]] = [
    ("font_size", "font-size", True),
    ("line_height", "line-height", False),
    ("letter_spacing", "letter-spacing", True),
    ("color", "color", False),
    ("background", "background", False),
    ("text_align", "text-align", False),
    ("margin_top", "margin-top", True),
    ("margin_bottom", "margin-bottom", True),
]


def _css_value(value, px_when_number: bool) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        num = int(value) if float(value).is_integer() else value
        return f"{num}px" if px_when_number else str(num)
    return str(value).strip()


# ---------------------------------------------------------------------------
# 7 个工具实现(全部 (doc, args) -> ToolOutcome)
# ---------------------------------------------------------------------------


def _tool_read_article(doc: BlockDoc, args: dict) -> ToolOutcome:
    """块清单(id/kind/≤80 字文本摘要)+ 全文统计(大 HTML 摘要压缩)。"""
    full = blocks_to_html(doc)
    text_total = _WS_RE.sub(
        " ", _TAG_STRIP_RE.sub("", _COMMENT_STRIP_RE.sub("", full))
    ).strip()
    payload = {
        "blocks": [
            {"id": b.id, "kind": b.kind, "summary": _summary_of(b)}
            for b in doc.blocks
        ],
        "stats": {
            "block_count": len(doc.blocks),
            "char_count": len(full),
            "text_char_count": len(text_total),
        },
    }
    if len(doc.blocks) > _READ_ARTICLE_BLOCK_LIMIT:
        payload["blocks"] = payload["blocks"][:_READ_ARTICLE_BLOCK_LIMIT]
        payload["truncated"] = True
        payload["note"] = (
            f"文章共 {len(doc.blocks)} 块,仅返回前 {_READ_ARTICLE_BLOCK_LIMIT} "
            "块摘要;其余请用 read_blocks 按 id 分页读取"
        )
    if doc.design_tokens:
        payload["design_tokens"] = dict(doc.design_tokens)
    return ToolOutcome(doc=doc, payload=payload)


def _tool_read_blocks(doc: BlockDoc, args: dict) -> ToolOutcome:
    """按 ids 取块完整 html。任一 id 失配则整体报错并附现存 id 清单。"""
    ids = args["ids"]
    by_id = {b.id: b for b in doc.blocks}
    missing = [i for i in ids if i not in by_id]
    if missing:
        return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, missing))
    return ToolOutcome(doc=doc, payload={
        "blocks": [
            {"id": i, "kind": by_id[i].kind, "html": by_id[i].html}
            for i in ids
        ],
    })


def _tool_replace_block(doc: BlockDoc, args: dict) -> ToolOutcome:
    """整块替换 html(弱模型友好,不做 diff)。自动后置 T1 清洗 + 记账。"""
    bid = args["block_id"]
    if bid not in set(_ids_of(doc)):
        return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, [bid]))
    clean, repairs, violations = _sanitize_fragment(args["html"])
    if not clean.strip() and args["html"].strip():
        # 整块不可救(清洗后为空):原块保留,applied=False。
        return ToolOutcome(doc=doc, payload={
            "applied": False,
            "block_id": bid,
            "repairs": _tag_entries(repairs, bid),
            "violations": _tag_entries(violations, bid),
            "error": "新 html 清洗后为空(整块不可救),原块已保留",
            "fix_hint": "按 violations 里的 fix_hint 重写该块后再调 replace_block",
        })
    blocks = [
        Block(id=b.id, kind=_classify_fragment(clean), html=clean)
        if b.id == bid else b
        for b in doc.blocks
    ]
    return ToolOutcome(doc=_clone_doc(doc, blocks=blocks), payload={
        "applied": True,
        "block_id": bid,
        "repairs": _tag_entries(repairs, bid),
        "violations": _tag_entries(violations, bid),
    })


def _tool_apply_block_style(doc: BlockDoc, args: dict) -> ToolOutcome:
    """批量把扁平样式参数确定性合并进各块根元素 style,后置 T1 清洗。"""
    ids: list[str] = args["block_ids"]
    by_id = {b.id: b for b in doc.blocks}
    missing = [i for i in ids if i not in by_id]
    if missing:
        return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, missing))
    props = [
        (css, _css_value(args[arg], px))
        for arg, css, px in _STYLE_PARAMS
        if arg in args and args[arg] is not None
    ]
    if not props:
        return ToolOutcome(doc=doc, payload={
            "error": "未提供任何样式参数",
            "fix_hint": "至少传一个样式参数,如 font_size / line_height / color / text_align",
        })
    repairs: list[dict] = []
    violations: list[dict] = []
    skipped: list[str] = []
    target = set(ids)
    blocks: list[Block] = []
    for b in doc.blocks:
        if b.id not in target:
            blocks.append(b)
            continue
        merged = _merge_style_into_root(b.html, props)
        clean, reps, vios = _sanitize_fragment(merged)
        repairs += _tag_entries(reps, b.id)
        violations += _tag_entries(vios, b.id)
        if not clean.strip() and merged.strip():
            blocks.append(b)  # 不可救:原块保留
            skipped.append(b.id)
            continue
        blocks.append(Block(id=b.id, kind=b.kind, html=clean))
    return ToolOutcome(doc=_clone_doc(doc, blocks=blocks), payload={
        "applied": True,
        "block_ids": ids,
        "skipped_block_ids": skipped,
        "repairs": repairs,
        "violations": violations,
    })


# set_design_tokens 支持的扁平 token 名(色板/字阶/行距/间距)。
_TOKEN_KEYS = (
    "primary_color", "accent_color", "text_color", "background_color",
    "heading_font_size", "body_font_size", "line_height", "paragraph_spacing",
)
# token -> 确定性应用到 text 块根元素的基础排版 CSS。
_TOKEN_BASE_CSS: list[tuple[str, str, bool]] = [
    ("text_color", "color", False),
    ("body_font_size", "font-size", True),
    ("line_height", "line-height", False),
    ("paragraph_spacing", "margin-bottom", True),
]


def _tool_set_design_tokens(doc: BlockDoc, args: dict) -> ToolOutcome:
    """存全文设计 token 进 doc 元数据,并把基础排版确定性应用到 text 块根。

    payload 回完整 token 表,供 LLM 在后续块级改写(replace_block)中引用
    (如强调色用 primary_color)。非 text 块(image/svg/divider/raw)不动。
    """
    incoming = {
        k: _css_value(args[k], False) if not isinstance(args[k], (int, float))
        else args[k]
        for k in _TOKEN_KEYS if k in args and args[k] is not None
    }
    if not incoming:
        return ToolOutcome(doc=doc, payload={
            "error": "未提供任何设计 token",
            "fix_hint": f"至少传一个 token:{', '.join(_TOKEN_KEYS)}",
        })
    tokens = {**doc.design_tokens, **{
        k: _css_value(v, k in ("body_font_size", "heading_font_size", "paragraph_spacing"))
        for k, v in incoming.items()
    }}
    base_props = [
        (css, _css_value(args[key], px))
        for key, css, px in _TOKEN_BASE_CSS
        if key in args and args[key] is not None
    ]
    repairs: list[dict] = []
    violations: list[dict] = []
    skipped: list[str] = []
    blocks: list[Block] = []
    for b in doc.blocks:
        if b.kind != "text" or not base_props:
            blocks.append(b)
            continue
        merged = _merge_style_into_root(b.html, base_props)
        clean, reps, vios = _sanitize_fragment(merged)
        repairs += _tag_entries(reps, b.id)
        violations += _tag_entries(vios, b.id)
        if not clean.strip() and merged.strip():
            blocks.append(b)
            skipped.append(b.id)
            continue
        blocks.append(Block(id=b.id, kind=b.kind, html=clean))
    new_shell_open, new_shell_close = doc.shell_open, doc.shell_close
    if incoming.get("background_color"):
        new_shell_open, new_shell_close = _apply_shell_background(
            doc.shell_open, doc.shell_close, str(incoming["background_color"])
        )
    return ToolOutcome(
        doc=_clone_doc(doc, blocks=blocks, design_tokens=tokens,
                       shell_open=new_shell_open, shell_close=new_shell_close),
        payload={
            "applied": True,
            "tokens": dict(tokens),
            "skipped_block_ids": skipped,
            "repairs": repairs,
            "violations": violations,
        },
    )


def _tool_edit_structure(doc: BlockDoc, args: dict) -> ToolOutcome:
    """增/删/移块。op=insert_after|delete|move;锚点 "start" 表示文首。"""
    op = args["op"]
    bid = args["block_id"]
    ids = _ids_of(doc)

    if op == "insert_after":
        new_html = args.get("html")
        if not new_html or not str(new_html).strip():
            return ToolOutcome(doc=doc, payload={
                "error": "insert_after 缺少 html 参数",
                "fix_hint": "传入要插入的块 HTML(html 参数)后重试",
            })
        if bid != "start" and bid not in ids:
            return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, [bid]))
        clean, repairs, violations = _sanitize_fragment(str(new_html))
        if not clean.strip():
            return ToolOutcome(doc=doc, payload={
                "applied": False,
                "repairs": repairs,
                "violations": violations,
                "error": "插入的 html 清洗后为空,未插入",
                "fix_hint": "按 violations 里的 fix_hint 重写后再插入",
            })
        nid = _new_block_id(doc)
        nb = Block(id=nid, kind=_classify_fragment(clean), html=clean)
        blocks = list(doc.blocks)
        pos = 0 if bid == "start" else ids.index(bid) + 1
        blocks.insert(pos, nb)
        return ToolOutcome(doc=_clone_doc(doc, blocks=blocks), payload={
            "applied": True,
            "op": op,
            "new_block_id": nid,
            "repairs": _tag_entries(repairs, nid),
            "violations": _tag_entries(violations, nid),
        })

    if op == "delete":
        if bid not in ids:
            return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, [bid]))
        blocks = [b for b in doc.blocks if b.id != bid]
        return ToolOutcome(doc=_clone_doc(doc, blocks=blocks), payload={
            "applied": True, "op": op, "block_id": bid,
            "repairs": [], "violations": [],
        })

    if op == "move":
        target = args.get("target_id")
        if not target:
            return ToolOutcome(doc=doc, payload={
                "error": "move 缺少 target_id 参数",
                "fix_hint": '传 target_id(移动到该块之后;传 "start" 表示移到文首)',
            })
        if bid not in ids:
            return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, [bid]))
        if target != "start" and target not in ids:
            return ToolOutcome(doc=doc, payload=_missing_ids_payload(doc, [target]))
        if target == bid:
            return ToolOutcome(doc=doc, payload={
                "error": "target_id 不能等于 block_id 自身",
                "fix_hint": "选择另一个块作为移动锚点",
            })
        moving = next(b for b in doc.blocks if b.id == bid)
        rest = [b for b in doc.blocks if b.id != bid]
        pos = 0 if target == "start" else [b.id for b in rest].index(target) + 1
        rest.insert(pos, moving)
        return ToolOutcome(doc=_clone_doc(doc, blocks=rest), payload={
            "applied": True, "op": op, "block_id": bid,
            "repairs": [], "violations": [],
        })

    return ToolOutcome(doc=doc, payload={
        "error": f"未知的 op:{op}",
        "fix_hint": "op 只支持 insert_after / delete / move",
    })


# list_capabilities:从 svg_validator 白名单 + 真值表编译的合法能力枚举。
# 真值表 = docs/research/wechat-svg-truth-table.md(2026-06-13 add_draft 回读)。
_CAPABILITY_TOPICS = ("svg_animation", "style_properties", "forbidden", "structure")


def _capabilities_payload(topic: str | None) -> dict:
    rp = API_STORAGE_SAFE.render_profile
    caps = {
        "svg_animation": {
            "attribute_whitelist": sorted(WHITELIST_ATTRIBUTES),
            "transform_types": sorted(VALID_TRANSFORM_TYPES),
            "smil_elements": [
                "animate", "animateTransform", "set",
                "animateMotion(路径须内联 path 属性,勿用 mpath 引用 id)",
            ],
            "triggers": [
                'begin="click"(同元素自触发,真值表 33-34 行实测存活)',
                'begin="click+2s"(复合偏移,真值表 35-36 行实测存活)',
            ],
            "notes": [
                "SMIL 全家桶在微信存活(真值表 20-38 行),是唯一动画通道",
                "元素 id 会被微信全量剥离(真值表 7-8 行):渐变/滤镜/use/mpath/跨元素触发等一切依赖 id 引用的写法都会悬空失效,一律改为内联/自触发",
                "<style> 块整体被删(真值表 49-51 行):@keyframes/CSS animation 不可用",
            ],
        },
        "style_properties": {
            "allowed_properties": sorted(rp.allowed_style_properties),
            "allowed_display": sorted(rp.allowed_display_values),
            "allowed_position": sorted(rp.allowed_position_values),
            "notes": [
                "opacity:0 起手态在 api-storage-safe 档保留(真值表 61-62 行),可做 SMIL 淡入初始态",
                "pointer-events 在 api-storage-safe 档放行(真值表 39-40 行)",
                "白名单外属性会被 T1 剥除并记入 violations(带 fix_hint)",
            ],
        },
        "forbidden": {
            "rules": [
                "JavaScript 全禁:<script>、on* 事件处理器一律被删",
                "<style> 块整体被删,只有内联 style 属性存活",
                "元素 id 属性被微信全量剥离,依赖 id 的引用(url(#)/href=#/begin=id.click)全部悬空",
                "CSS animation/transition 不可用(依赖 <style>),动画只能用 SVG SMIL",
                "position:absolute/fixed 渲染层失效,元素会被 T1 隐藏",
                "transform(CSS)会被剥,动画位移改用 animateTransform",
                "flex/grid 布局会被剥,横排改用 inline-block + vertical-align 或 table",
                "clip-path/mask/backdrop-filter/mix-blend-mode 会被剥",
                "iframe/embed/video/audio/canvas 等嵌入媒体被整段删除",
                "图片必须走 mmbiz.qpic.cn 图床,外链渲染层防盗链不显示",
                "<a> 外链仅 mp.weixin.qq.com 域合法,SVG 内不支持 <a>",
            ],
        },
        "structure": {
            "block_kinds": ["text", "heading", "image", "svg", "divider", "raw"],
            "notes": [
                "真实版式的标题通常是 styled section 而非 <h1-h6>,kind 多为 text:定位标题请看 read_article 的文本摘要,勿按 kind 过滤",
                "块按 id 寻址(read_article 返回清单);写工具会自动清洗并回报 repairs/violations",
                "整篇是单根 section 信封 + 顺序块;工具只操作块,信封由系统保管",
            ],
        },
    }
    if topic is None:
        return {"topics": list(_CAPABILITY_TOPICS), **caps}
    return caps[topic]


def _tool_list_capabilities(doc: BlockDoc, args: dict) -> ToolOutcome:
    """按 topic 查询合法能力枚举(不传 topic 返回全部)。"""
    topic = args.get("topic")
    if topic is not None and topic not in _CAPABILITY_TOPICS:
        return ToolOutcome(doc=doc, payload={
            "error": f"未知 topic:{topic}",
            "topics": list(_CAPABILITY_TOPICS),
            "fix_hint": "从 topics 中选择一个,或不传 topic 获取全部能力清单",
        })
    return ToolOutcome(doc=doc, payload=_capabilities_payload(topic))


# ---------------------------------------------------------------------------
# ToolSpec(JSON Schema,参数扁平)+ dispatcher
# ---------------------------------------------------------------------------

_SIZE_TYPE = {"type": ["string", "number"]}


def _schema(properties: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="read_article",
        description="读取全文结构:返回块清单(id/kind/文本摘要≤80字)与全文统计。定位标题/段落请看摘要文本(标题通常是 styled section,kind 不是 heading)。",
        parameters=_schema({}, []),
    ),
    ToolSpec(
        name="read_blocks",
        description="按块 id 列表读取块的完整 HTML(改写前先读原文)。",
        parameters=_schema(
            {"ids": {"type": "array", "items": {"type": "string"},
                     "description": "要读取的块 id 列表,如 [\"b1\",\"b3\"]"}},
            ["ids"],
        ),
    ),
    ToolSpec(
        name="replace_block",
        description="整块替换指定块的 HTML。系统会自动做微信合规清洗并回报 repairs(已等价修补)与 violations(被剥除项,含中文修复指令);violations 非空时已应用修补后版本,可按 fix_hint 重写该块。",
        parameters=_schema(
            {
                "block_id": {"type": "string", "description": "目标块 id"},
                "html": {"type": "string", "description": "新的块 HTML(内联 style,勿用 <style> 块/JS)"},
            },
            ["block_id", "html"],
        ),
    ),
    ToolSpec(
        name="apply_block_style",
        description="按结构化参数批量修改块样式(合并进块根元素的 style,确定性、不重写内容)。适合改字号/行距/颜色/对齐/间距。",
        parameters=_schema(
            {
                "block_ids": {"type": "array", "items": {"type": "string"},
                              "description": "目标块 id 列表"},
                "font_size": {**_SIZE_TYPE, "description": "字号,如 \"17px\" 或 17"},
                "line_height": {**_SIZE_TYPE, "description": "行高,如 \"1.8\""},
                "letter_spacing": {**_SIZE_TYPE, "description": "字间距,如 \"1px\""},
                "color": {"type": "string", "description": "文字颜色,如 \"#3d3a34\""},
                "background": {"type": "string", "description": "背景色,如 \"#faf6f0\""},
                "text_align": {"type": "string", "description": "对齐:left/center/right/justify"},
                "margin_top": {**_SIZE_TYPE, "description": "块上间距,如 \"16px\""},
                "margin_bottom": {**_SIZE_TYPE, "description": "块下间距,如 \"16px\""},
            },
            ["block_ids"],
        ),
    ),
    ToolSpec(
        name="set_design_tokens",
        description="设定全文设计 token(色板/字阶/行距/间距),存入文档元数据并把基础排版(正文字号/行高/颜色/段距)确定性应用到所有正文块;返回完整 token 表供后续块级改写引用。",
        parameters=_schema(
            {
                "primary_color": {"type": "string", "description": "主色,如 \"#b45309\""},
                "accent_color": {"type": "string", "description": "强调色"},
                "text_color": {"type": "string", "description": "正文颜色(会应用到正文块)"},
                "background_color": {"type": "string", "description": "页面底色"},
                "heading_font_size": {**_SIZE_TYPE, "description": "标题字阶,如 \"20px\""},
                "body_font_size": {**_SIZE_TYPE, "description": "正文字号(会应用到正文块)"},
                "line_height": {**_SIZE_TYPE, "description": "正文行高(会应用到正文块)"},
                "paragraph_spacing": {**_SIZE_TYPE, "description": "段间距(会应用到正文块 margin-bottom)"},
            },
            [],
        ),
    ),
    ToolSpec(
        name="edit_structure",
        description="调整文章结构:insert_after(在指定块后插入新块,block_id 传 \"start\" 表示文首)/ delete(删除块)/ move(把块移到 target_id 之后,target_id 传 \"start\" 表示移到文首)。",
        parameters=_schema(
            {
                "op": {"type": "string", "enum": ["insert_after", "delete", "move"],
                       "description": "操作类型"},
                "block_id": {"type": "string",
                             "description": "目标块 id(insert_after 时为锚点块,可传 \"start\")"},
                "html": {"type": "string", "description": "insert_after 时要插入的块 HTML"},
                "target_id": {"type": "string",
                              "description": "move 时的锚点块 id(移到其后),可传 \"start\""},
            },
            ["op", "block_id"],
        ),
    ),
    ToolSpec(
        name="list_capabilities",
        description="查询微信排版的合法能力枚举(编译自实测真值表与白名单):svg_animation(SMIL 白名单)/ style_properties(样式白名单)/ forbidden(必死清单)/ structure(块模型说明)。拿不准写法时先查这里。",
        parameters=_schema(
            # 有意不写 enum:未知 topic 由工具自身返回含 topics 清单的错误
            # payload(比 jsonschema 的英文报错对 LLM 更可自纠)。
            {"topic": {"type": "string",
                       "description": "能力主题,可选值:svg_animation / style_properties / forbidden / structure;不传返回全部"}},
            [],
        ),
    ),
]

_HANDLERS = {
    "read_article": _tool_read_article,
    "read_blocks": _tool_read_blocks,
    "replace_block": _tool_replace_block,
    "apply_block_style": _tool_apply_block_style,
    "set_design_tokens": _tool_set_design_tokens,
    "edit_structure": _tool_edit_structure,
    "list_capabilities": _tool_list_capabilities,
}
_SPEC_BY_NAME = {s.name: s for s in TOOL_SPECS}


def run_tool(name: str, doc: BlockDoc, args: dict) -> ToolOutcome:
    """统一调度:校验工具名与参数 schema,再分发到具体工具。

    任何失败(未知工具/参数非法/工具内部异常)都返回错误 payload 而不抛,
    让 LLM 能读懂错误并自纠(spec §4)。
    """
    spec = _SPEC_BY_NAME.get(name)
    if spec is None:
        return ToolOutcome(doc=doc, payload={
            "error": f"未知工具:{name}",
            "available_tools": [s.name for s in TOOL_SPECS],
            "fix_hint": "从 available_tools 中选择正确的工具名重试",
        })
    try:
        jsonschema.validate(args, spec.parameters)
    except jsonschema.ValidationError as exc:
        return ToolOutcome(doc=doc, payload={
            "error": f"参数校验失败:{exc.message}",
            "fix_hint": "对照工具参数说明修正参数类型/取值后重试",
        })
    try:
        outcome = _HANDLERS[name](doc, args)
    except Exception as exc:  # 防御:工具层绝不向编排层抛异常
        return ToolOutcome(doc=doc, payload={
            "error": f"工具执行失败:{type(exc).__name__}",
            "fix_hint": "检查参数取值是否合理后重试;若持续失败请换一种改法",
        })
    # 媒体守恒硬闸(H1 根治):写工具改了文档且让 <svg>/<img> 总数变少 → 拒绝,
    # 回原 doc,让模型换个不丢图的改法(换调子/改版式只该改文字与样式)。读工具
    # doc 不变(outcome.doc is doc),不进此闸。
    if outcome.doc is not doc:
        removed = _count_media(doc) - _count_media(outcome.doc)
        if removed > 0:
            return ToolOutcome(doc=doc, payload={
                "error": f"该操作会删除 {removed} 个图片/图形(image/svg),已拒绝",
                "fix_hint": "换调子/改版式必须原样保留所有图片、SVG 和分隔,"
                            "只改文字与内联样式;请保留原块里的 <svg>/<img> 后重试",
            })
    return outcome
