"""块模型纯函数:HTML <-> BlockDoc 的无损切分与拼接。

设计依据(spec §2,2026-07-04 rewrite 真机 QA 已知事实):
AI 产出的文章 HTML 通常是**单根 <section> 信封包全篇**,子级才是真块;
模板段落可能是嵌套 section。本模块把整篇 HTML 切成「信封壳 + 顺序块」:

- 单根信封:开/闭标签(连同信封外的首尾空白)进 ``shell_open``/``shell_close``,
  信封的直接子节点逐个成块;
- 无信封:shell 为空串,顶层节点逐个成块。

**硬不变量:``blocks_to_html(html_to_blocks(h)) == h`` 逐字节相等。**
为此切分只在原字符串上定位边界、按下标切片,绝不经 DOM 序列化重写
(bs4 会规范化属性/空白,不能用);块 kind 分类只读切片、不改内容。
块 id 按顺序确定性生成(b1, b2, ...),不用随机/时间。

注意:这里的 Block/BlockDoc 是 agent 对话编辑的会话文档模型,与
``app.models.mbdoc`` 的 MBDoc 块体系无关(那是持久化/渲染体系)。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Block:
    """一个顺序块:id 确定性、kind 为启发式分类、html 为原文切片。"""

    id: str
    kind: str  # "heading" | "text" | "image" | "svg" | "divider" | "raw"
    html: str


@dataclass
class BlockDoc:
    """整篇文档 = 信封开壳 + 顺序块 + 信封闭壳(无信封时壳为空串)。

    ``design_tokens``(批3 新增,可选):agent 工具 set_design_tokens 存放的
    全文设计 token(色板/字阶/行距/间距)。默认空 dict,不参与
    ``blocks_to_html`` 拼接——往返不变量与既有行为零改。
    """

    shell_open: str = ""
    shell_close: str = ""
    blocks: list[Block] = field(default_factory=list)
    design_tokens: dict = field(default_factory=dict)


# HTML 空元素(无闭合标签)
_VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
# 原始文本元素:内容不含子标签,直到对应闭合标签为止整段跳过
_RAWTEXT_TAGS = {"script", "style", "textarea", "title", "xmp"}

_TAG_NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9:_-]*")

# 分段类型:element / text / comment / decl / raw(无法解析的碎片,原样保留)
_Segment = tuple  # (type, start, end, inner)  inner=(istart, iend) 仅完整闭合的 element 有


def _scan_tag_end(html: str, i: int, end: int) -> tuple[int, bool] | None:
    """从 ``i``(指向 ``<``)扫到本标签的 ``>``,尊重引号内的 ``>``/``<``。

    返回 (``>`` 之后的下标, 是否自闭合);找不到 ``>`` 返回 None(畸形)。
    """
    j = i
    quote = ""
    while j < end:
        c = html[j]
        if quote:
            if c == quote:
                quote = ""
        elif c in "\"'":
            quote = c
        elif c == ">":
            return j + 1, html[j - 1] == "/"
        j += 1
    return None


def _find_rawtext_close(html: str, start: int, end: int, name: str) -> tuple[int, int] | None:
    """在 [start, end) 内找 ``</name>``(大小写不敏感),返回 (闭标签起, 闭标签止)。"""
    m = re.compile(r"</" + re.escape(name) + r"\s*>", re.IGNORECASE).search(html, start, end)
    if not m:
        return None
    return m.start(), m.end()


def _scan_element(html: str, i: int, end: int, name: str) -> _Segment:
    """从 ``i``(指向 ``<name``)扫出整个元素的边界(含嵌套/rawtext/void)。

    返回 ("element", start, end, inner);未闭合到 EOF 时 inner=None
    (照样切到末尾保住往返,但不参与信封判定)。
    """
    opened = _scan_tag_end(html, i, end)
    if opened is None:
        # 连开标签的 > 都没有:整段当 raw 保留
        return ("raw", i, end, None)
    tag_end, self_closing = opened
    if self_closing or name in _VOID_TAGS:
        return ("element", i, tag_end, None)
    if name in _RAWTEXT_TAGS:
        close = _find_rawtext_close(html, tag_end, end, name)
        if close is None:
            return ("element", i, end, None)
        return ("element", i, close[1], (tag_end, close[0]))

    # 一般元素:全栈跟踪嵌套(容忍 <div><p></div> 这类错位闭合)
    stack = [name]
    j = tag_end
    while j < end:
        lt = html.find("<", j)
        if lt == -1 or lt >= end:
            break
        if html.startswith("<!--", lt):
            c = html.find("-->", lt + 4)
            if c == -1 or c + 3 > end:
                break
            j = c + 3
            continue
        if html.startswith("</", lt):
            m = _TAG_NAME_RE.match(html, lt + 2)
            gt = html.find(">", lt)
            if gt == -1 or gt >= end:
                break
            if m:
                nm = m.group(0).lower()
                if nm in stack:
                    while stack and stack[-1] != nm:
                        stack.pop()
                    stack.pop()
                    if not stack:
                        return ("element", i, gt + 1, (tag_end, lt))
                # 栈里没有的游离闭标签:忽略,继续扫
            j = gt + 1
            continue
        m = _TAG_NAME_RE.match(html, lt + 1)
        if m:
            nm = m.group(0).lower()
            opened2 = _scan_tag_end(html, lt, end)
            if opened2 is None:
                break
            t_end, selfc = opened2
            if nm in _RAWTEXT_TAGS and not selfc:
                close = _find_rawtext_close(html, t_end, end, nm)
                if close is None:
                    break
                j = close[1]
                continue
            if not selfc and nm not in _VOID_TAGS:
                stack.append(nm)
            j = t_end
            continue
        if html.startswith("<!", lt) or html.startswith("<?", lt):
            gt = html.find(">", lt)
            if gt == -1 or gt >= end:
                break
            j = gt + 1
            continue
        # 孤立 '<':当文本继续
        j = lt + 1
    # 扫到 EOF 仍未闭合:切到末尾,inner=None(不算合格信封)
    return ("element", i, end, None)


def _scan_segments(html: str, start: int, end: int) -> list[_Segment]:
    """把 [start, end) 切成首尾相接的分段(严格铺满区间,保住往返)。"""
    segs: list[_Segment] = []
    i = start
    while i < end:
        c = html[i]
        if c == "<":
            if html.startswith("<!--", i):
                close = html.find("-->", i + 4)
                if close == -1 or close + 3 > end:
                    segs.append(("raw", i, end, None))
                    break
                segs.append(("comment", i, close + 3, None))
                i = close + 3
                continue
            if html.startswith("<!", i) or html.startswith("<?", i):
                gt = html.find(">", i)
                if gt == -1 or gt >= end:
                    segs.append(("raw", i, end, None))
                    break
                segs.append(("decl", i, gt + 1, None))
                i = gt + 1
                continue
            m = _TAG_NAME_RE.match(html, i + 1)
            if m:
                seg = _scan_element(html, i, end, m.group(0).lower())
                segs.append(seg)
                i = seg[2]
                continue
            if html.startswith("</", i):
                # 顶层游离闭标签:原样保留为 raw
                gt = html.find(">", i)
                seg_end = end if (gt == -1 or gt >= end) else gt + 1
                segs.append(("raw", i, seg_end, None))
                i = seg_end
                continue
            # 孤立 '<':按文本处理(落到下面的文本分支)
        nxt = html.find("<", i + 1 if c == "<" else i)
        if nxt == -1 or nxt > end:
            nxt = end
        segs.append(("text", i, nxt, None))
        i = nxt
    return segs


_HEADING_RE = re.compile(r"<h[1-6][\s/>]")
_IMG_RE = re.compile(r"<img[\s/>]")
_SVG_RE = re.compile(r"<svg[\s/>]")
_HR_RE = re.compile(r"<hr[\s/>]")
_COMMENT_STRIP_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_TAG_STRIP_RE = re.compile(r"<[^>]*>")


def _classify(seg_type: str, frag: str) -> str:
    """启发式分类(只读切片,绝不改写)。"""
    if seg_type in ("comment", "decl", "raw"):
        return "raw"
    if seg_type == "text":
        return "text"
    low = frag.lower()
    if _HEADING_RE.search(low):
        return "heading"
    if _IMG_RE.search(low):
        return "image"
    if _SVG_RE.search(low):
        return "svg"
    if _HR_RE.search(low):
        return "divider"
    # 剥标签后仍有可见文本 -> text;纯结构/装饰空壳 -> raw
    text = _TAG_STRIP_RE.sub("", _COMMENT_STRIP_RE.sub("", frag))
    return "text" if text.strip() else "raw"


def _segs_to_block_htmls(html: str, segs: list[_Segment]) -> tuple[list[tuple[str, str]], str]:
    """分段 -> (kind, html 切片) 列表。

    块间的纯空白文本并入前一个块的尾部(首块之前的并入返回值第二项
    ``pending`` 前缀),保证拼接零丢字节、又不产生噪音空白块。
    """
    out: list[tuple[str, str]] = []
    pending = ""
    for seg_type, s, e, _inner in segs:
        frag = html[s:e]
        if seg_type == "text" and not frag.strip():
            if out:
                kind, prev = out[-1]
                out[-1] = (kind, prev + frag)
            else:
                pending += frag
            continue
        out.append((_classify(seg_type, frag), frag))
    if pending and out:
        kind, first = out[0]
        out[0] = (kind, pending + first)
        pending = ""
    return out, pending


def html_to_blocks(html: str) -> BlockDoc:
    """整篇 HTML -> BlockDoc(信封检测 + 顺序切块,无损)。"""
    if not html:
        return BlockDoc(shell_open="", shell_close="", blocks=[])

    n = len(html)
    segs = _scan_segments(html, 0, n)
    elements = [s for s in segs if s[0] == "element"]
    others_all_ws = all(
        s[0] == "text" and not html[s[1]:s[2]].strip()
        for s in segs
        if s[0] != "element"
    )

    shell_open = ""
    shell_close = ""
    if len(elements) == 1 and elements[0][3] is not None and others_all_ws:
        # 单根信封:壳 = 首空白 + 开标签 / 闭标签 + 尾空白;子级重扫成块
        inner_start, inner_end = elements[0][3]
        shell_open = html[:inner_start]
        shell_close = html[inner_end:]
        child_segs = _scan_segments(html, inner_start, inner_end)
        pairs, pending = _segs_to_block_htmls(html, child_segs)
        if pending:
            # 信封内只有空白:并入开壳,保住往返
            shell_open += pending
    else:
        pairs, pending = _segs_to_block_htmls(html, segs)
        if pending:
            # 整篇只有空白/无块:整体作为一个 raw 块保留
            pairs = [("raw", pending)]

    blocks = [
        Block(id=f"b{i + 1}", kind=kind, html=frag)
        for i, (kind, frag) in enumerate(pairs)
    ]
    return BlockDoc(shell_open=shell_open, shell_close=shell_close, blocks=blocks)


def blocks_to_html(doc: BlockDoc) -> str:
    """BlockDoc -> 整篇 HTML(确定性拼接,与切分互为逆运算)。"""
    return doc.shell_open + "".join(b.html for b in doc.blocks) + doc.shell_close
