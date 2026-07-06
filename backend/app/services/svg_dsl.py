"""SVG DSL: schema + deterministic DSL -> SVG renderer (P1-4).

The LLM does NOT author raw SVG. Instead it picks effects from the
``effect_registry`` catalog and fills their slots, emitting a small JSON
document (the "DSL") that conforms to ``DSL_SCHEMA``. This module turns
that DSL back into validated, WeChat-safe HTML deterministically:

  - ``kind == "effects"``: each block is rendered via
    ``effect_registry.render_effect`` (which sanitizes + validates). All
    blocks must render clean; the concatenated html is validated as a whole.
  - ``kind == "text"``: a simple explanation card built from ``notes`` and
    passed through ``validate_html``.

Because the renderer is deterministic (no time / uuid / unsorted dumps),
the system prompt's effect catalog is stable and prompt-cacheable.
"""
from __future__ import annotations

import json
from typing import Any

from app.services.effect_registry import list_effects, render_effect
from app.services.svg_validator import validate_html

# Effect ids the DSL is allowed to reference (enum-constrains the schema).
_EFFECT_IDS = sorted(eff["id"] for eff in list_effects())


# ---------------------------------------------------------------------------
# DSL JSON Schema
# ---------------------------------------------------------------------------
# Slot maps are free-form string->string objects (slot name -> value); the
# deterministic renderer sanitizes + clamps every value, so we keep the
# schema permissive on slot contents and strict on structure.
_SLOT_MAP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": {"type": "string"},
}
_TIMING_MAP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": {"type": "number"},
}

DSL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["effects", "text"]},
        "notes": {"type": "string"},
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "effect_id": {"type": "string", "enum": _EFFECT_IDS},
                    "text_slots": _SLOT_MAP_SCHEMA,
                    "image_slots": _SLOT_MAP_SCHEMA,
                    "color_slots": _SLOT_MAP_SCHEMA,
                    "timing_params": _TIMING_MAP_SCHEMA,
                },
                "required": ["effect_id"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["kind"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------
def build_effect_catalog_block() -> str:
    """Render the effect catalog as deterministic JSON for the system prompt.

    ``sort_keys=True`` is mandatory: any nondeterminism here permanently
    misses the prompt cache (silent invalidator audit).
    """
    return json.dumps(
        list_effects(), ensure_ascii=False, sort_keys=True, indent=2
    )


_LLM_SYSTEM_PROMPT_HEADER = """你是微信公众号交互 SVG 积木的「编排者」。你**不直接写 SVG**，而是从下面的「可用积木目录」里挑选 effect_id 并填槽，输出一段 JSON。系统会用确定性渲染器把你的 JSON 变成微信安全的 SVG，再过校验器。

# 输出契约（必须严格遵守 schema）

- 顶层 `kind` 取值 `"effects"` 或 `"text"`。
- `kind="effects"`：给出 `blocks` 数组，每个 block 含 `effect_id`（必须是目录里的 id）+ 可选 `text_slots` / `image_slots` / `color_slots`（都是「槽位名 → 字符串值」的对象）+ 可选 `timing_params`（「参数名 → 数字」）。槽位名必须用目录里给出的 name（如 SLOT_TAB1_LABEL）。未填的槽位会用默认值。多个 block 会按顺序拼接。
- `kind="text"`：当用户意图不适合任何积木时，给出 `notes` 文字说明（中文），系统会渲染成一张说明卡。

# 硬性约束（渲染器会强制，但请配合）

1. 颜色写死十六进制（如 `#1B2235`），不要用 CSS 变量。
2. 图片槽位若填，必须是 https 链接；不确定就留空（会回退成纯色占位）。
3. 文案用中文，口语、具体；全文感叹号不超过 2 个。
4. 只输出 JSON，不要 Markdown 代码围栏、不要额外解释。

# 可用积木目录

"""


def LLM_SYSTEM_PROMPT() -> str:
    """Stable, cache-friendly system prompt for the LLM (DSL) path."""
    return _LLM_SYSTEM_PROMPT_HEADER + build_effect_catalog_block()


# ---------------------------------------------------------------------------
# Deterministic DSL -> SVG renderer
# ---------------------------------------------------------------------------
def _render_text_card(notes: str) -> str:
    """Build a self-contained explanation card (whitelist-safe SVG)."""
    safe = (notes or "（无说明）").strip()[:120]
    # Escape the full XML special set (matching effect_registry.sanitize_text)
    # for defence-in-depth: quotes are not exploitable in text-node content
    # today, but keeping the escape complete means this stays safe if the
    # value is ever moved into an attribute value.
    safe = safe.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    safe = safe.replace('"', "&quot;").replace("'", "&#39;")
    # Wrap to two display lines at ~26 chars for readability.
    line1 = safe[:26]
    line2 = safe[26:52]
    return (
        '<section style="margin:24px 0;">'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" '
        'style="display:block;width:100%;height:auto;">'
        '<rect x="0" y="0" width="600" height="200" rx="14" ry="14" fill="#F1F5F9"/>'
        '<rect x="0" y="0" width="600" height="48" rx="14" ry="14" fill="#6366F1"/>'
        '<text x="24" y="32" fill="#FFFFFF" font-size="18" font-weight="700">'
        'AI 说明</text>'
        '<g opacity="0">'
        '<animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze"/>'
        f'<text x="24" y="100" fill="#1E293B" font-size="16">{line1}</text>'
        f'<text x="24" y="134" fill="#1E293B" font-size="16">{line2}</text>'
        '</g>'
        '</svg>'
        '</section>'
    )


def render_dsl(dsl: dict[str, Any]) -> dict[str, Any]:
    """Render a DSL document to validated html.

    Returns a dict with ``status`` ("ok" | "failed"), ``html``, ``report``
    (validator report — ``issues`` non-empty drives the retry), and
    ``warnings``.
    """
    kind = dsl.get("kind")

    if kind == "text":
        html = _render_text_card(dsl.get("notes", ""))
        report = validate_html(html)
        warnings = [{"kind": "validator", **w} for w in report["warnings"]]
        if report["issues"]:
            return {"status": "failed", "html": "", "report": report, "warnings": warnings}
        return {"status": "ok", "html": html, "report": report, "warnings": warnings}

    # kind == "effects" (default / only other allowed value).
    blocks = dsl.get("blocks") or []
    if not blocks:
        # Nothing to render — treat as a clean failure with a feedback hint.
        report = {
            "issues": [
                {
                    "line": 0,
                    "rule": "empty-dsl",
                    "message": "DSL 没有任何积木块",
                    "suggestion": "给出至少一个 blocks[*].effect_id，或改用 kind=text",
                }
            ],
            "warnings": [],
            "stats": {},
        }
        return {"status": "failed", "html": "", "report": report, "warnings": []}

    rendered_parts: list[str] = []
    merged_warnings: list[dict[str, Any]] = []
    for block in blocks:
        out = render_effect(
            block.get("effect_id"),
            text_slots=block.get("text_slots"),
            image_slots=block.get("image_slots"),
            color_slots=block.get("color_slots"),
            timing_params=block.get("timing_params"),
        )
        if out["status"] != "ok":
            # Surface the failing block's report (carries issues for feedback).
            # render_effect returns report=None for unknown effect ids; build a
            # synthetic issue so the retry feedback has something to act on.
            report = out.get("report")
            if not report:
                report = {
                    "issues": [
                        {
                            "line": 0,
                            "rule": "unknown-effect",
                            "message": out.get("message", "未知效果 id"),
                            "suggestion": "改用目录里存在的 effect_id",
                        }
                    ],
                    "warnings": [],
                    "stats": {},
                }
            return {
                "status": "failed",
                "html": "",
                "report": report,
                "warnings": out.get("warnings", []),
            }
        rendered_parts.append(out["html"])
        merged_warnings.extend(out.get("warnings", []))

    html = "\n".join(rendered_parts)
    # Validate the concatenated whole — guarantees every returned html passes.
    report = validate_html(html)
    final_warnings = [{"kind": "validator", **w} for w in report["warnings"]]
    if report["issues"]:
        return {"status": "failed", "html": "", "report": report, "warnings": final_warnings}
    return {"status": "ok", "html": html, "report": report, "warnings": final_warnings}
