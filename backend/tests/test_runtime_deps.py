"""回归守卫:BYOK LLM provider 层 import 的第三方运行时依赖,必须都在
``requirements.txt`` 里。

为什么:后端 Docker 镜像装依赖用的是 ``requirements.txt``(``pip install -r
requirements.txt``),不是 ``pyproject.toml``。曾经 ``jsonschema`` 只写进
pyproject 没进 requirements,导致部署容器 ``import jsonschema`` 失败 ->
``openai_compat`` provider import 挂 -> ``build_provider`` 抛 ImportError ->
``/settings/llm/test`` 吞成「未知的 provider」、整个 BYOK DeepSeek 写作链在
生产静默不可用。此测试把「代码 import 的运行时依赖」与「容器实际会装的清单」
对齐,堵住这类静默缺依赖。
"""
from __future__ import annotations

from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _requirement_names() -> set[str]:
    """requirements.txt 里声明的包名(小写、去版本/extras 标记)。"""
    text = (_BACKEND_ROOT / "requirements.txt").read_text(encoding="utf-8")
    names: set[str] = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # 去掉 extras（uvicorn[standard]）与版本约束（typer>=0.12,<1.0）。
        name = line.split("[", 1)[0]
        for sep in (">=", "<=", "==", "~=", ">", "<", "!="):
            name = name.split(sep, 1)[0]
        names.add(name.strip().lower())
    return names


# BYOK provider 层在 import 时就需要的第三方模块（import 失败即 provider 不可
# 构造）。键=import 名，值=对应 PyPI 包名（此处相同）。
_PROVIDER_RUNTIME_DEPS = {
    "httpx": "httpx",
    "jsonschema": "jsonschema",
}


def test_provider_runtime_deps_declared_in_requirements():
    declared = _requirement_names()
    missing = {pkg for pkg in _PROVIDER_RUNTIME_DEPS.values() if pkg not in declared}
    assert not missing, (
        f"BYOK provider 层 import 的运行时依赖未写进 requirements.txt: {sorted(missing)}。"
        " Docker 后端镜像装依赖用 requirements.txt,漏了会导致容器 import 失败、"
        " build_provider 静默抛 ImportError(整个 BYOK 写作链不可用)。"
    )


def test_openai_compat_provider_is_importable():
    """openai_compat 模块顶层 import 必须成功(httpx + jsonschema 都在)。"""
    from app.services.llm.providers.openai_compat import OpenAICompatProvider  # noqa: F401
