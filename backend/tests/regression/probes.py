"""微信 SVG 能力真机回归探针定义（probes.py）

本模块是 add_draft 真机回归套件的「探针库」。每个探针是一段可独立成篇的
正文 HTML（探针 SVG + 一行中文说明），由 runner.py 经 add_draft 推到微信草稿
箱，再用 get_draft 把微信清洗后的 HTML 回读，对每个 Marker 的正则做 re.search，
据此判定某项 SVG 能力在微信侧是否「存活」。

目标断言来源：docs/research/svg-capability-research.md §2.2「高可信但 uncertain」
清单——这些断言此前缺少经 add_draft API 路径的实测证据，本套件就是把它们从
uncertain 升/降级为 confirmed 的工具。

------------------------------------------------------------------------
探针设计原则
------------------------------------------------------------------------
1. 一探针一断言：每个 Probe 只验证一个独立能力，互不依赖、互不污染。
   失败时能精确定位是哪条能力被微信干掉。

2. 魔法值隔离：每个探针使用专属的、全局唯一的「魔法值」——独特颜色
   （如 #a1b2c3 而非常见的 #ff0000）、独特坐标（如 x="137"）、独特 id
   （如 probe-grad-7a3）。这样 marker 的正则只会命中探针 SVG 本身，
   绝不会误匹配中文说明文字，也不会误匹配微信注入的样板代码 / data-*
   属性 / 包裹节点。

3. pattern 特异性：每个 pattern 都尽量绑定「魔法值 + 结构关键字」（例如
   绑定到 fill="url(#probe-grad-7a3)" 整体，而非裸的 url(# 片段），避免宽松匹配。

4. 大小写策略：默认大小写敏感。但微信 / premailer / lxml 经常把驼峰属性
   名小写化（attributeName -> attributename，linearGradient -> lineargradient
   等），凡涉及驼峰标签 / 属性的 marker 一律加 `(?i)`，否则会因大小写假阴性。

5. expect_survive 语义：
   - True  = 「若该魔法值在回读 HTML 上存活，则证明微信允许此能力」。
             离线自检（runner / 单测）会要求：这类 marker 的 pattern 必须
             能在它自己的 html 上匹配成功（保证探针本身写对了）。
   - False = 「预期被微信剥离」。这类 marker 用于反向确认：若它竟然存活，
             说明研究报告的「会被剥」断言需要复核。这类 pattern 不要求能在
             原始 html 上匹配（它描述的往往是微信注入物 / 改写后形态）。

6. 自检友好：所有 expect_survive=True 的 marker，其 pattern 都在本文件对应
   探针的原始 html 上可匹配——这是离线 sanity check 的硬约束，新增探针务必
   遵守，否则真机判定无意义（连出厂态都不含该特征）。

------------------------------------------------------------------------
契约（被 runner.py 依赖，勿改签名 / 字段名）
------------------------------------------------------------------------
    Marker(desc, pattern, expect_survive)
    Probe(key, claim, html, markers)
    PROBES: tuple[Probe, ...]
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Marker:
    """单条存活判定标记。

    desc            : 该标记验证什么（中文）。
    pattern         : 在回读 HTML 上跑 re.search 的正则（默认大小写敏感；
                      涉及驼峰名时在 pattern 内自带 (?i)）。
    expect_survive  : True=若存活则该能力被微信允许；False=预期被剥。
    """

    desc: str
    pattern: str
    expect_survive: bool


@dataclass(frozen=True)
class Probe:
    """单个能力探针。

    key     : kebab-case 唯一键，如 "svg-id-retention"。
    claim   : 对应研究报告中的断言（中文概括）。
    html    : 完整可独立成篇的正文 HTML（探针 SVG + 一段中文说明）。
    markers : 该探针的全部判定标记。
    """

    key: str
    claim: str
    html: str
    markers: tuple[Marker, ...]


# ---------------------------------------------------------------------------
# 小工具：统一包裹成「一段说明 + 探针」的正文片段。
# 说明文字与魔法值故意不重叠，确保 marker 不会命中说明文字。
# ---------------------------------------------------------------------------
def _section(note: str, body: str) -> str:
    return (
        '<section style="margin:16px 0;">'
        f'<p style="font-size:14px;color:#333;line-height:1.7;">{note}</p>'
        f"{body}"
        "</section>"
    )


# ===========================================================================
# 探针定义
# ===========================================================================

PROBES: tuple[Probe, ...] = (
    # ---- 1. SVG 内部 id 保留 ----------------------------------------------
    Probe(
        key="svg-id-retention",
        claim="§2.2 id 被全量剥离（confirmed）——验证 <svg> 子树内的 id 是否被微信剥除",
        html=_section(
            "探针一：检测 SVG 内部元素的 id 属性在微信草稿中是否被保留。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect id="probe-svgid-9f2" x="11" y="13" width="80" height="40" '
            'fill="#a1b2c3"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="SVG 内 rect 的专属 id=probe-svgid-9f2 是否存活",
                pattern=r'id="probe-svgid-9f2"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 2. HTML（非 SVG）id 保留 -----------------------------------------
    Probe(
        key="html-id-retention",
        claim="§2.2 id 剥离是否同样作用于普通 HTML 元素（对照组）",
        html=_section(
            "探针二：检测普通 HTML 元素（span）的 id 在微信草稿中是否被保留。",
            '<span id="probe-htmlid-4c8" style="color:#b2c3d4;">'
            "标记锚点</span>",
        ),
        markers=(
            Marker(
                desc="HTML span 的专属 id=probe-htmlid-4c8 是否存活",
                pattern=r'id="probe-htmlid-4c8"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 3. linearGradient + fill=url(#id) --------------------------------
    Probe(
        key="linear-gradient-fill-url",
        claim="§2.3 SVG 渐变须 id 引用——id 被剥则 fill=url(#) 悬空失效",
        html=_section(
            "探针三：检测 linearGradient 定义及 fill=url(#id) 引用是否成对存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            "<defs>"
            '<linearGradient id="probe-grad-7a3" x1="0" y1="0" x2="1" y2="0">'
            '<stop offset="0%" stop-color="#c3d4e5"/>'
            '<stop offset="100%" stop-color="#5e4d3c"/>'
            "</linearGradient>"
            "</defs>"
            '<rect x="13" y="11" width="170" height="38" '
            'fill="url(#probe-grad-7a3)"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="linearGradient 定义（含专属 id）是否存活",
                pattern=r'(?i)<lineargradient[^>]*id="probe-grad-7a3"',
                expect_survive=True,
            ),
            Marker(
                desc="fill=url(#probe-grad-7a3) 引用是否存活",
                pattern=r'fill="url\(#probe-grad-7a3\)"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 4. filter + url(#) ------------------------------------------------
    Probe(
        key="filter-url-reference",
        claim="§2.3 SVG 滤镜须 id 引用——id 被剥则 filter=url(#) 失效",
        html=_section(
            "探针四：检测 SVG <filter> 定义及 filter=url(#id) 引用是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            "<defs>"
            '<filter id="probe-filter-2b9" x="-20%" y="-20%" '
            'width="140%" height="140%">'
            '<feGaussianBlur in="SourceGraphic" stdDeviation="2.7"/>'
            "</filter>"
            "</defs>"
            '<circle cx="97" cy="41" r="23" fill="#d4e5f6" '
            'filter="url(#probe-filter-2b9)"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<filter> 定义（含专属 id）是否存活",
                pattern=r'(?i)<filter[^>]*id="probe-filter-2b9"',
                expect_survive=True,
            ),
            Marker(
                desc="filter=url(#probe-filter-2b9) 引用是否存活",
                pattern=r'filter="url\(#probe-filter-2b9\)"',
                expect_survive=True,
            ),
            Marker(
                desc="feGaussianBlur 专属 stdDeviation=2.7 是否存活",
                pattern=r'(?i)<fegaussianblur[^>]*stddeviation="2\.7"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 5. clipPath -------------------------------------------------------
    Probe(
        key="clip-path-reference",
        claim="§2.2/2.3 clip-path 须 id 引用；FORBIDDEN_CSS_PROPERTIES 含 clip-path",
        html=_section(
            "探针五：检测 <clipPath> 定义及 clip-path=url(#id) 引用是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            "<defs>"
            '<clipPath id="probe-clip-5d1">'
            '<circle cx="71" cy="39" r="29"/>'
            "</clipPath>"
            "</defs>"
            '<rect x="0" y="0" width="200" height="80" fill="#e5f6a7" '
            'clip-path="url(#probe-clip-5d1)"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<clipPath> 定义（含专属 id）是否存活",
                pattern=r'(?i)<clippath[^>]*id="probe-clip-5d1"',
                expect_survive=True,
            ),
            Marker(
                desc="clip-path=url(#probe-clip-5d1) 引用是否存活",
                pattern=r'clip-path="url\(#probe-clip-5d1\)"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 6. mask -----------------------------------------------------------
    Probe(
        key="mask-reference",
        claim="§2.3 mask 须 id 引用；FORBIDDEN_CSS_PROPERTIES 含 mask",
        html=_section(
            "探针六：检测 <mask> 定义及 mask=url(#id) 引用是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            "<defs>"
            '<mask id="probe-mask-8e4">'
            '<rect x="0" y="0" width="200" height="80" fill="#ffffff"/>'
            '<circle cx="103" cy="37" r="21" fill="#000000"/>'
            "</mask>"
            "</defs>"
            '<rect x="0" y="0" width="200" height="80" fill="#f6a7b8" '
            'mask="url(#probe-mask-8e4)"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<mask> 定义（含专属 id）是否存活",
                pattern=r'(?i)<mask[^>]*id="probe-mask-8e4"',
                expect_survive=True,
            ),
            Marker(
                desc="mask=url(#probe-mask-8e4) 引用是否存活",
                pattern=r'mask="url\(#probe-mask-8e4\)"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 7. <use href> -----------------------------------------------------
    Probe(
        key="use-href-reference",
        claim="§2.3 <use> 须 id 引用——id 被剥则 <use> 失效",
        html=_section(
            "探针七：检测 <use href=#id> 复用机制是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            "<defs>"
            '<rect id="probe-use-3f7" width="40" height="40" fill="#a7b8c9"/>'
            "</defs>"
            '<use href="#probe-use-3f7" x="17" y="9"/>'
            '<use href="#probe-use-3f7" x="113" y="9"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="被复用元素的专属 id=probe-use-3f7 是否存活",
                pattern=r'id="probe-use-3f7"',
                expect_survive=True,
            ),
            Marker(
                desc="<use href=#probe-use-3f7> 引用是否存活",
                pattern=r'(?i)<use[^>]*href="#probe-use-3f7"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 8. <animate> ------------------------------------------------------
    Probe(
        key="animate-element",
        claim="§2.2 SMIL animate 保留——SMIL 是唯一动画通道",
        html=_section(
            "探针八：检测 SMIL <animate> 基础动画标签是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="19" y="13" width="40" height="34" fill="#b8c9da">'
            '<animate attributeName="opacity" from="0" to="1" '
            'dur="1.7s" begin="0s" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                # 用 [\s>] 而非裸 \b 收尾：显式排除 <animateTransform>/<animateMotion>
                # （两者均以 <animate 开头）。注：\b 在 e→T 间本就无词边界、不会误命中，
                # 此处改写仅为让「只匹配纯 <animate> 元素」的意图在 pattern 上自证。
                desc="<animate> 标签（须排除 animateTransform/Motion）是否存活",
                pattern=r"(?i)<animate[\s>]",
                expect_survive=True,
            ),
            Marker(
                desc="animate 的专属 dur=1.7s 是否存活（确认非空壳）",
                pattern=r'dur="1\.7s"',
                expect_survive=True,
            ),
            Marker(
                desc="attributeName=opacity（注意微信可能小写化）是否存活",
                pattern=r'(?i)attributename="opacity"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 9. <animateTransform> --------------------------------------------
    Probe(
        key="animate-transform-element",
        claim="§2.2 SMIL animateTransform 保留（白名单 attributeName=transform）",
        html=_section(
            "探针九：检测 SMIL <animateTransform> 变换动画是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<rect x="83" y="29" width="34" height="34" fill="#c9daeb">'
            '<animateTransform attributeName="transform" type="rotate" '
            'from="0 100 46" to="360 100 46" dur="2.3s" begin="0s" '
            'repeatCount="indefinite"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<animateTransform> 标签（微信可能小写化）是否存活",
                pattern=r"(?i)<animatetransform\b",
                expect_survive=True,
            ),
            Marker(
                desc="animateTransform 专属 dur=2.3s 是否存活",
                pattern=r'dur="2\.3s"',
                expect_survive=True,
            ),
            Marker(
                desc="type=rotate 是否存活",
                pattern=r'(?i)type="rotate"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 10. <animateMotion> path 内联 ------------------------------------
    Probe(
        key="animate-motion-inline-path",
        claim="§2.2 animateMotion 须用 path 内联（id 被剥则 mpath 不可用，推断）",
        html=_section(
            "探针十：检测 <animateMotion> 内联 path 运动路径是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<circle cx="0" cy="0" r="7" fill="#daebfc">'
            '<animateMotion path="M13,17 Q100,71 187,23" dur="2.9s" '
            'begin="0s" repeatCount="indefinite"/>'
            "</circle>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<animateMotion> 标签（微信可能小写化）是否存活",
                pattern=r"(?i)<animatemotion\b",
                expect_survive=True,
            ),
            Marker(
                desc="内联 path 专属路径数据 M13,17 Q100,71 是否存活",
                pattern=r'path="M13,17 Q100,71 187,23"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 11. <mpath>（id 引用，预期失效） ---------------------------------
    Probe(
        key="mpath-reference",
        claim="§2.2 mpath 引用 id——id 被剥则 mpath 失效（推断为不可用）",
        html=_section(
            "探针十一：检测 <animateMotion> 经 <mpath href=#id> 引用外部 path 是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            "<defs>"
            '<path id="probe-mpath-6a2" d="M11,19 Q100,73 189,21"/>'
            "</defs>"
            '<circle cx="0" cy="0" r="7" fill="#ebfcad">'
            '<animateMotion dur="3.1s" begin="0s" repeatCount="indefinite">'
            '<mpath href="#probe-mpath-6a2"/>'
            "</animateMotion>"
            "</circle>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="被引用 path 的专属 id=probe-mpath-6a2 是否存活",
                pattern=r'id="probe-mpath-6a2"',
                expect_survive=True,
            ),
            Marker(
                desc="<mpath href=#probe-mpath-6a2> 引用是否存活",
                pattern=r'(?i)<mpath[^>]*href="#probe-mpath-6a2"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 12. <set> ---------------------------------------------------------
    Probe(
        key="set-element",
        claim="§2.2 SMIL set 保留（白名单 attributeName=visibility）",
        html=_section(
            "探针十二：检测 SMIL <set> 离散赋值标签是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="23" y="11" width="44" height="38" fill="#fcadbe" '
            'visibility="hidden">'
            '<set attributeName="visibility" to="visible" begin="1.3s"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                # 绑定「<set 标签 + 魔法值 attributeName=visibility」为单一特异 pattern，
                # 避免对裸 <set> 标签名单独匹配（虽 \b 已排除 charset/offset/settings，
                # 但绑魔法值符合本库 pattern 特异性原则，且能确认是探针自身的 set）。
                desc="<set attributeName=visibility> 标签是否存活",
                pattern=r'(?i)<set\b[^>]*attributename="visibility"',
                expect_survive=True,
            ),
            Marker(
                desc="set 专属 begin=1.3s 是否存活",
                pattern=r'begin="1\.3s"',
                expect_survive=True,
            ),
            Marker(
                desc="attributeName=visibility（微信可能小写化）是否存活",
                pattern=r'(?i)attributename="visibility"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 13. begin="click" -------------------------------------------------
    Probe(
        key="begin-click",
        claim="§2.2 begin=click 点击触发在 2024-2026 仍有效（uncertain）",
        html=_section(
            "探针十三：检测 begin=click 点击触发动画是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="29" y="13" width="48" height="34" fill="#adbecf">'
            '<animate attributeName="opacity" from="1" to="0" dur="4.1s" '
            'begin="click" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="begin=click 触发声明是否存活",
                pattern=r'begin="click"',
                expect_survive=True,
            ),
            Marker(
                desc="承载 click 的 animate 专属 dur=4.1s 是否存活",
                pattern=r'dur="4\.1s"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 14. begin="click+2s" ---------------------------------------------
    Probe(
        key="begin-click-offset",
        claim="§2.2 begin=click+偏移 复合触发是否存活（uncertain，格式细节敏感）",
        html=_section(
            "探针十四：检测 begin=click+2s 带时间偏移的点击触发是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="31" y="11" width="46" height="36" fill="#becfd0">'
            '<animate attributeName="opacity" from="1" to="0" dur="4.3s" '
            'begin="click+2s" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="begin=click+2s 复合触发是否完整存活",
                pattern=r'begin="click\+2s"',
                expect_survive=True,
            ),
            Marker(
                desc="承载偏移触发的 animate 专属 dur=4.3s 是否存活",
                pattern=r'dur="4\.3s"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 15. begin="某id.click"（id 同步，预期受 id 剥离影响） -------------
    Probe(
        key="begin-id-click",
        claim="§2.2 begin=id.click 跨元素触发——依赖 id，id 被剥则失效",
        html=_section(
            "探针十五：检测 begin=id.click 跨元素同步触发是否存活（依赖 id 保留）。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect id="probe-trigger-9c3" x="13" y="13" width="34" '
            'height="34" fill="#cfd0e1"/>'
            '<rect x="113" y="13" width="34" height="34" fill="#d0e1f2">'
            '<animate attributeName="opacity" from="0" to="1" dur="4.7s" '
            'begin="probe-trigger-9c3.click" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="触发源元素的专属 id=probe-trigger-9c3 是否存活",
                pattern=r'id="probe-trigger-9c3"',
                expect_survive=True,
            ),
            Marker(
                desc="begin=probe-trigger-9c3.click 跨元素引用是否存活",
                pattern=r'begin="probe-trigger-9c3\.click"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 16. pointer-events:none 样式 -------------------------------------
    Probe(
        key="pointer-events-none-style",
        claim="§2.3 pointer-events 穿透热区——style 白名单不含则被剥（uncertain 真机）",
        html=_section(
            "探针十六：检测行内 style 内 pointer-events:none 是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="17" y="13" width="166" height="34" fill="#e1f2a3" '
            'style="pointer-events:none;"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="style 内 pointer-events:none 是否存活",
                pattern=r"pointer-events\s*:\s*none",
                expect_survive=True,
            ),
            Marker(
                desc="承载该样式的专属 fill=#e1f2a3 是否存活（定位元素）",
                pattern=r'fill="#e1f2a3"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 17. stroke-dasharray 属性（降级 warning，预期被剥） ---------------
    Probe(
        key="stroke-dasharray-attr",
        claim="§2.2 stroke-dasharray 被多源实测保存时被剥——应降级 warning",
        html=_section(
            "探针十七：检测 stroke-dasharray 属性是否存活（研究报告判其可能被微信剥离）。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<line x1="13" y1="31" x2="187" y2="31" stroke="#f2a3b4" '
            'stroke-width="4" stroke-dasharray="7 13"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                # 预期被剥：expect_survive=False，故不要求在原始 html 上匹配存活语义；
                # 但此 pattern 在原始 html 上确实可匹配，真机若仍命中=能力存活=断言需复核。
                desc="stroke-dasharray=7 13 专属值是否存活（预期被微信剥离）",
                pattern=r'stroke-dasharray="7 13"',
                expect_survive=False,
            ),
            Marker(
                desc="承载 dasharray 的 line（专属 stroke=#f2a3b4）是否存活",
                pattern=r'stroke="#f2a3b4"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 18. style 内 fill/stroke/transform ------------------------------
    Probe(
        key="style-fill-stroke-transform",
        claim="§2.2/2.3 style 里 fill/stroke/transform 被白名单剥除（站内）/真机存疑",
        html=_section(
            "探针十八：检测行内 style 内的 fill / stroke / transform 着色与变换是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<rect x="61" y="21" width="38" height="38" '
            'style="fill:#a3b4c5;stroke:#b4c5d6;stroke-width:3;'
            'transform:translate(17px,7px);"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="style 内 fill:#a3b4c5 是否存活",
                pattern=r"fill\s*:\s*#a3b4c5",
                expect_survive=True,
            ),
            Marker(
                desc="style 内 stroke:#b4c5d6 是否存活",
                pattern=r"stroke\s*:\s*#b4c5d6",
                expect_survive=True,
            ),
            Marker(
                desc="style 内 transform:translate(17px,7px) 是否存活",
                pattern=r"transform\s*:\s*translate\(\s*17px\s*,\s*7px\s*\)",
                expect_survive=True,
            ),
        ),
    ),
    # ---- 19. background:url() 带引号（预期整条被过滤） --------------------
    Probe(
        key="background-url-quoted",
        claim="§2.1 background:url() 加引号→整条样式被过滤（confirmed，反例对照）",
        html=_section(
            "探针十九：检测行内 style 内带引号的 background:url('...') 是否存活（报告判其会整条被剥）。",
            # 锚点 color 故意放在【独立的相邻 <p>】里，而非与 background 同 style——
            # 避免「微信若整条 style 过滤则 color 也消失」这一未验证的声明级剥离假设
            # 干扰结论。本探针只判定 background:url(带引号) 这一件事是否被剥。
            '<section style="background:url(&quot;https://mmbiz.qpic.cn/probe_q9z7.png&quot;);'
            'height:48px;">带引号背景探针锚点</section>'
            '<p style="color:#c5d6e7;">带引号背景探针存活锚点段落</p>',
        ),
        markers=(
            Marker(
                # 预期被剥：微信对带引号 url() 会过滤整条 background 声明。
                desc="带引号 background:url(...probe_q9z7...) 是否存活（预期被剥）",
                pattern=r"background\s*:\s*url\(\s*['\"].*probe_q9z7",
                expect_survive=False,
            ),
            Marker(
                # 独立 <p> 上的锚点：证明整篇草稿确实推送/回读成功（排除「整段都没了」
                # 这种 false negative），与 background 声明的剥离粒度解耦。
                desc="独立锚点段落 color:#c5d6e7 是否存活（证明探针整体回读成功）",
                pattern=r"color\s*:\s*#c5d6e7",
                expect_survive=True,
            ),
        ),
    ),
    # ---- 20. background:url() 不带引号（预期存活） ------------------------
    Probe(
        key="background-url-unquoted",
        claim="§2.1 background:url() 无引号→保留（confirmed，正例对照）",
        html=_section(
            "探针二十：检测行内 style 内无引号的 background:url(...) 是否存活（应保留）。",
            '<section style="background:url(https://mmbiz.qpic.cn/probe_u4w8.png);'
            'height:48px;color:#d6e7f8;">无引号背景探针锚点</section>',
        ),
        markers=(
            Marker(
                desc="无引号 background:url(...probe_u4w8...) 是否存活",
                pattern=r"background\s*:\s*url\(\s*[^'\"][^)]*probe_u4w8",
                expect_survive=True,
            ),
        ),
    ),
    # ---- 21. <style> 块（预期整体被剥） -----------------------------------
    Probe(
        key="style-block",
        claim="§2.1 <style> 被整体剥离（confirmed）——CSS animation 不可用",
        html=_section(
            "探针二十一：检测正文内 <style> 块是否被微信整体剥离（含其 @keyframes 与选择器）。"
            "若整篇因含 style 被 48001 拒绝，下方独立锚点段落也会一并消失，"
            "据此可区分「style 被剥」与「整篇被拒」。",
            '<style>.probe-style-z3k7{color:#e7f8a9;animation:probeSpin 2s linear infinite;}'
            "@keyframes probeSpin{to{transform:rotate(360deg);}}</style>"
            '<p class="probe-style-z3k7">style 块探针锚点</p>'
            # 不依赖 <style> 的独立存活锚点：用普通行内 color 声明（confirmed 保留），
            # 用于区分「<style> 被剥但正文留存」与「整篇含 style 被 48001 拒绝、回读为空」。
            '<p style="color:#3b9c7a;">style 探针独立存活锚点</p>',
        ),
        markers=(
            Marker(
                # 预期被剥：<style> 整体应被微信删除。
                desc="<style> 块内专属选择器 .probe-style-z3k7 是否存活（预期被剥）",
                pattern=r"\.probe-style-z3k7\s*\{",
                expect_survive=False,
            ),
            Marker(
                desc="@keyframes probeSpin 是否存活（预期被剥）",
                pattern=r"@keyframes\s+probeSpin",
                expect_survive=False,
            ),
            Marker(
                # 独立锚点存活=整篇成功推送/回读，<style> 两条 expect_survive=False
                # 的「被剥」结论才有效；若此锚点也丢=整篇被拒，需把上面两条判为 error 复核。
                desc="独立锚点段落 color:#3b9c7a 是否存活（区分被剥 vs 整篇被拒）",
                pattern=r"color\s*:\s*#3b9c7a",
                expect_survive=True,
            ),
        ),
    ),
    # ---- 22. height 百分比（预期失效） ------------------------------------
    Probe(
        key="height-percent",
        claim="§2.2 百分比单位在 height 失效，须 px/vw/vh（uncertain）",
        html=_section(
            "探针二十二：检测元素 height 使用百分比单位是否被保留（报告判其在 height 上失效）。",
            '<section style="height:43%;background:#f8a9ba;">'
            "高度百分比探针锚点</section>",
        ),
        markers=(
            Marker(
                desc="height:43% 百分比专属值是否存活（预期失效/被改写）",
                pattern=r"height\s*:\s*43%",
                expect_survive=False,
            ),
            Marker(
                desc="同声明 background:#f8a9ba 是否存活（定位元素仍在）",
                pattern=r"background\s*:\s*#f8a9ba",
                expect_survive=True,
            ),
        ),
    ),
    # ---- 23. svg width:100%（预期存活） -----------------------------------
    Probe(
        key="svg-width-100",
        claim="§2.2 svg 自身 width:100% 自适应可用（uncertain，证据最弱）",
        html=_section(
            "探针二十三：检测 <svg> 自身 style 内 width:100% 自适应是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" '
            'style="width:100%;height:auto;">'
            '<rect x="11" y="13" width="178" height="34" fill="#a9bacb"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="svg style 内 width:100% 是否存活",
                pattern=r"width\s*:\s*100%",
                expect_survive=True,
            ),
            Marker(
                desc="承载该样式的 svg 专属 fill=#a9bacb 是否存活",
                pattern=r'fill="#a9bacb"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 24. 外链 <image> -------------------------------------------------
    Probe(
        key="external-image",
        claim="§2.2 <image> 须 mmbiz 链接 + 显式 width/height（uncertain，证据停在 2020）",
        html=_section(
            "探针二十四：检测 SVG 内 <image> 外链（mmbiz）+ 显式宽高是否存活。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<image href="https://mmbiz.qpic.cn/probe_img_k7m2.png" '
            'x="19" y="11" width="83" height="57"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<image> 标签是否存活",
                pattern=r"(?i)<image\b",
                expect_survive=True,
            ),
            Marker(
                desc="image 专属外链 probe_img_k7m2 是否存活",
                pattern=r"probe_img_k7m2\.png",
                expect_survive=True,
            ),
            Marker(
                desc="image 显式 width=83（专属值）是否存活",
                pattern=r'width="83"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 25. 嵌套 svg（预期不可用/被剥） ----------------------------------
    Probe(
        key="nested-svg",
        claim="§2.2 SVG 不可嵌套 SVG（uncertain，证据停在 2020）",
        html=_section(
            "探针二十五：检测 <svg> 内嵌套 <svg> 是否被保留（报告判其不可嵌套）。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<rect x="0" y="0" width="200" height="80" fill="#bacbdc"/>'
            '<svg x="51" y="17" width="80" height="46" viewBox="0 0 80 46">'
            '<circle cx="40" cy="23" r="19" fill="#cbdced"/>'
            "</svg>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="内层嵌套 svg 的专属 fill=#cbdced 是否存活（预期内层被剥/扁平化）",
                pattern=r'fill="#cbdced"',
                expect_survive=False,
            ),
            Marker(
                desc="外层 svg 专属 fill=#bacbdc 是否存活（外层应保留）",
                pattern=r'fill="#bacbdc"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 26. opacity:0 起手样式 -------------------------------------------
    Probe(
        key="opacity-zero-start-style",
        claim="§P0-4 sanitize 的 opacity:0→1 改写毁掉淡入初始态——验证 opacity:0 起手是否保留",
        html=_section(
            "探针二十六：检测 style 内 opacity:0 起手（淡入动画初始态）是否被保留而非被改写。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="17" y="13" width="166" height="34" fill="#dceffe" '
            'style="opacity:0;">'
            '<animate attributeName="opacity" from="0" to="1" dur="5.9s" '
            'begin="0s" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="style 内 opacity:0 起手态是否被保留（未被改写为 1）",
                pattern=r"opacity\s*:\s*0(?![.\d])",
                expect_survive=True,
            ),
            Marker(
                desc="承载淡入的 animate 专属 dur=5.9s 是否存活",
                pattern=r'dur="5\.9s"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 27. restart="never" 属性（§2.2 iOS 端差，前置条件可回读检测） ------
    Probe(
        key="animate-restart-never",
        claim="§2.2 iOS：restart=never 无效——回读检测该属性是否在服务端被保留（前置条件）",
        html=_section(
            "探针二十七：检测 SMIL animate 的 restart=never 属性是否被微信服务端保留。"
            "iOS 真机上 restart=never 是否生效须人工核验，本探针仅验证其能否活到回读 HTML。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="21" y="13" width="42" height="34" fill="#7ad3c1">'
            '<animate attributeName="opacity" from="0" to="1" dur="6.1s" '
            'begin="click" restart="never" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="restart=never 属性是否存活到回读 HTML（iOS 行为另需真机核验）",
                pattern=r'(?i)restart="never"',
                expect_survive=True,
            ),
            Marker(
                desc="承载该属性的 animate 专属 dur=6.1s 是否存活（确认非空壳）",
                pattern=r'dur="6\.1s"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 28. <g> 标签 style + transform-origin（§2.2 iOS 端差，可回读前置条件）-
    Probe(
        key="g-style-transform-origin",
        claim="§2.2 iOS：<g> 的 style 失效须改 transform 属性 / transform-origin 异常"
        "——回读检测 <g> 的 style 与 transform-origin 是否被服务端剥离/改写（前置条件）",
        html=_section(
            "探针二十八：检测 <g> 分组标签的行内 style（含 transform 与 transform-origin）"
            "是否被微信服务端保留。iOS 上 <g> style 失效 / transform-origin 异常须真机核验，"
            "本探针仅判定这些声明能否活到回读 HTML——若被服务端剥离即已能解释 iOS 失效。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" '
            'viewBox="0 0 200 80">'
            '<g style="transform:translate(13px,9px);transform-origin:23px 17px;">'
            '<rect x="0" y="0" width="44" height="38" fill="#9c5ad3"/>'
            "</g>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="<g> 的 style 内 transform:translate(13px,9px) 是否存活",
                pattern=r"transform\s*:\s*translate\(\s*13px\s*,\s*9px\s*\)",
                expect_survive=True,
            ),
            Marker(
                desc="<g> 的 style 内 transform-origin:23px 17px 是否存活（iOS 上异常须真机核验）",
                pattern=r"transform-origin\s*:\s*23px\s+17px",
                expect_survive=True,
            ),
            Marker(
                desc="承载样式的 <g> 内 rect 专属 fill=#9c5ad3 是否存活（定位分组未被整体剥）",
                pattern=r'fill="#9c5ad3"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 29. animate 带 values/keyTimes + 尾随分号（§2.2 分号致失效） --------
    Probe(
        key="animate-values-keytimes-semicolon",
        claim="§2.2 分号等格式细节致 animate 失效——尾随分号致 values/keyTimes 长度错配；"
        "回读检测尾随分号是否被服务端保留（保留=跨端解析 bug 的诱因仍在）",
        html=_section(
            "探针二十九：检测 animate 的 values 与 keyTimes 属性串【尾随分号】是否被服务端保留。"
            "尾随分号会使 values/keyTimes 解析出多一个空项、长度错配，是 SMIL 失效诱因。"
            "本探针判定分号是否活到回读 HTML（机制为跨端解析 bug，非服务端整段过滤）。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="19" y="13" width="40" height="34" fill="#d37a9c">'
            '<animate attributeName="opacity" '
            'values="0;0.5;1;" keyTimes="0;0.5;1;" dur="6.7s" '
            'begin="0s" fill="freeze"/>'
            "</rect>"
            "</svg>",
        ),
        markers=(
            Marker(
                desc="values 串带尾随分号 0;0.5;1; 是否被原样保留（保留则解析 bug 诱因仍在）",
                pattern=r'(?i)values="0;0\.5;1;"',
                expect_survive=True,
            ),
            Marker(
                desc="keyTimes 串带尾随分号 0;0.5;1; 是否被原样保留",
                pattern=r'(?i)keytimes="0;0\.5;1;"',
                expect_survive=True,
            ),
            Marker(
                desc="承载属性的 animate 专属 dur=6.7s 是否存活",
                pattern=r'dur="6\.7s"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 30. stroke / rx / ry 独立属性（§2.2 报告第43行：误杀需复核） ------
    Probe(
        key="stroke-rx-ry-attrs",
        claim="§2.2 stroke/rx/ry 被白名单误杀需复核（报告第43行，对照 T/CASME 1609—2024）"
        "——回读检测三者作为独立 SVG 属性在微信侧是否保留（区分站内 validator 误杀 vs 微信剥除）",
        html=_section(
            "探针三十：检测 stroke（独立属性，非 style 值）、rx、ry 三个属性是否被微信服务端保留。"
            "研究报告判其可能被站内 validator 误杀，本探针验证微信侧本身是否剥除——"
            "若微信侧保留则证实是站内误杀，应放开白名单。",
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" '
            'viewBox="0 0 200 60">'
            '<rect x="17" y="11" width="166" height="38" rx="9" ry="7" '
            'fill="#5ad37a" stroke="#7a5ad3" stroke-width="3"/>'
            "</svg>",
        ),
        markers=(
            Marker(
                desc="stroke 独立属性 stroke=#7a5ad3 是否存活（区分站内误杀 vs 微信剥除）",
                pattern=r'stroke="#7a5ad3"',
                expect_survive=True,
            ),
            Marker(
                desc="rx=9 圆角属性是否存活",
                pattern=r'rx="9"',
                expect_survive=True,
            ),
            Marker(
                desc="ry=7 圆角属性是否存活",
                pattern=r'ry="7"',
                expect_survive=True,
            ),
        ),
    ),
    # ---- 31. position:absolute + transform 百分比位移（§2.2 须 px/vw/vh） --
    Probe(
        key="position-and-transform-percent",
        claim="§2.2 position 删除 / transform 位移须 px 而非百分比（uncertain，同组遗漏两条）"
        "——回读检测 position:absolute 是否被删、transform:translate(百分比) 是否被剥/改写",
        html=_section(
            "探针三十一：检测 position:absolute 声明与 transform:translate(百分比) 位移是否被微信保留。"
            "报告判 position 会被删、transform 位移须用 px 而非百分比（百分比失效）。"
            "本探针用独立 fill 色锚点确认元素整体留存，再分别判定两条声明的存活。",
            '<section style="position:absolute;transform:translate(37%,19%);'
            'background:#d35a7a;height:40px;">position 与百分比位移探针锚点</section>',
        ),
        markers=(
            Marker(
                desc="position:absolute 声明是否存活（预期被微信删除）",
                pattern=r"position\s*:\s*absolute",
                expect_survive=False,
            ),
            Marker(
                desc="transform:translate(37%,19%) 百分比位移是否存活（预期失效/被剥改写）",
                pattern=r"transform\s*:\s*translate\(\s*37%\s*,\s*19%\s*\)",
                expect_survive=False,
            ),
            Marker(
                desc="独立锚点 background:#d35a7a 是否存活（证明元素整体留存，剥离判定有效）",
                pattern=r"background\s*:\s*#d35a7a",
                expect_survive=True,
            ),
        ),
    ),
)
