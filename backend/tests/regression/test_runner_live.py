"""真机 live 测试：需要 MBEDITOR_RUN_REAL_WECHAT_TESTS=1 才运行。

该模块调用真实微信草稿箱 API，会在公众号草稿箱创建 [SVG-PROBE] 草稿并回读，
cleanup=True 时自动删除。请务必使用测试公众号，勿在生产号上运行。

运行方式：
    cd backend
    MBEDITOR_RUN_REAL_WECHAT_TESTS=1 python -m pytest tests/regression/test_runner_live.py -v

凭证配置（二选一）：
    1. 环境变量：WECHAT_APPID / WECHAT_APPSECRET
    2. backend/data/config.json：{"appid": "...", "appsecret": "..."}
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# 整模块门禁：未设 MBEDITOR_RUN_REAL_WECHAT_TESTS=1 时跳过全部测试
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.skipif(
    os.environ.get("MBEDITOR_RUN_REAL_WECHAT_TESTS") != "1",
    reason=(
        "真机测试已跳过。设置环境变量 MBEDITOR_RUN_REAL_WECHAT_TESTS=1 以启用。\n"
        "警告：这将在你的微信公众号草稿箱中创建 [SVG-PROBE] 草稿。"
    ),
)


# ===========================================================================
# 凭证加载（与 tests/visual/infrastructure.py:219-232 完全一致的模式）
# ===========================================================================


def _load_credentials() -> tuple[str, str]:
    """读取 appid/appsecret，优先 env，回退 data/config.json。"""
    appid = os.environ.get("WECHAT_APPID", "")
    appsecret = os.environ.get("WECHAT_APPSECRET", "")
    if not appid or not appsecret:
        # test_runner_live.py 位于 backend/tests/regression/，上溯 parents[2] 到 backend/
        # （与 runner.py:61 一致；parents[3] 会错误解析到项目根 D:\MBEditor）
        config_path = Path(__file__).parents[2] / "data" / "config.json"
        if config_path.exists():
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            appid = cfg.get("appid", "") or cfg.get("WECHAT_APPID", "")
            appsecret = cfg.get("appsecret", "") or cfg.get("WECHAT_APPSECRET", "")
    return appid, appsecret


# ===========================================================================
# 被测模块
# ===========================================================================

from tests.regression.probes import PROBES
from tests.regression.runner import ProbeResult, MarkerResult, run_all


# ===========================================================================
# Fixture
# ===========================================================================


@pytest.fixture(scope="module")
def credentials() -> tuple[str, str]:
    """返回 (appid, appsecret)，若无凭证则跳过。"""
    appid, appsecret = _load_credentials()
    if not appid or not appsecret:
        pytest.skip("未找到微信凭证（env 或 data/config.json），跳过 live 测试")
    return appid, appsecret


@pytest.fixture(scope="module")
def live_results(credentials) -> list[ProbeResult]:
    """运行前两条探针（PROBES[:2]），cleanup=True，返回结果列表。

    scope=module：整个模块只跑一次真实 API 调用，节省配额。
    """
    appid, appsecret = credentials
    results = run_all(
        PROBES[:2],
        appid=appid,
        appsecret=appsecret,
        cleanup=True,
        sleep_s=1.5,
    )
    return results


# ===========================================================================
# 结构断言（不断言具体 survived 值，只验证返回结构正确性）
# ===========================================================================


class TestRunAllReturnStructure:
    """验证 run_all 返回的结构满足契约，不对「微信是否保留某特性」做硬断言。"""

    def test_returns_list(self, live_results: list[ProbeResult]):
        """run_all 返回值应为 list。"""
        assert isinstance(live_results, list), \
            f"run_all 应返回 list，实际类型：{type(live_results)}"

    def test_result_count_matches_probes(self, live_results: list[ProbeResult]):
        """结果数量应等于传入的探针数量（PROBES[:2]）。"""
        probe_count = min(2, len(PROBES))
        assert len(live_results) == probe_count, (
            f"期望 {probe_count} 条结果，实际得到 {len(live_results)} 条"
        )

    def test_each_result_is_probe_result(self, live_results: list[ProbeResult]):
        """每条结果应为 ProbeResult 实例。"""
        for r in live_results:
            assert isinstance(r, ProbeResult), \
                f"结果项应为 ProbeResult，实际为 {type(r)}"

    def test_probe_keys_match_input(self, live_results: list[ProbeResult]):
        """结果的 probe_key 应与 PROBES[:2] 的 key 一一对应（顺序可不同）。"""
        expected_keys = {p.key for p in PROBES[:2]}
        actual_keys = {r.probe_key for r in live_results}
        assert actual_keys == expected_keys, (
            f"probe_key 不匹配。期望：{expected_keys}，实际：{actual_keys}"
        )

    def test_successful_results_have_media_id(self, live_results: list[ProbeResult]):
        """无 error 的结果必须有 media_id 字符串。"""
        for r in live_results:
            if r.error is None:
                assert isinstance(r.media_id, str) and r.media_id, \
                    f"probe {r.probe_key!r} 无 error 但 media_id 为空：{r.media_id!r}"

    def test_each_result_has_marker_results_list(self, live_results: list[ProbeResult]):
        """每条结果的 marker_results 应为 list。"""
        for r in live_results:
            assert isinstance(r.marker_results, list), \
                f"probe {r.probe_key!r} 的 marker_results 不是 list"

    def test_marker_results_count_matches_probe_markers(self, live_results: list[ProbeResult]):
        """无 error 的结果，marker_results 数量应与对应 probe.markers 一致。"""
        probe_map = {p.key: p for p in PROBES[:2]}
        for r in live_results:
            if r.error is None:
                probe = probe_map[r.probe_key]
                assert len(r.marker_results) == len(probe.markers), (
                    f"probe {r.probe_key!r}：期望 {len(probe.markers)} 个 marker_results，"
                    f"实际 {len(r.marker_results)} 个"
                )

    def test_each_marker_result_is_marker_result(self, live_results: list[ProbeResult]):
        """marker_results 中每项应为 MarkerResult 实例。"""
        for r in live_results:
            for mr in r.marker_results:
                assert isinstance(mr, MarkerResult), \
                    f"probe {r.probe_key!r} 中有非 MarkerResult 项：{type(mr)}"

    def test_marker_result_survived_is_bool(self, live_results: list[ProbeResult]):
        """MarkerResult.survived 应为 bool。"""
        for r in live_results:
            for mr in r.marker_results:
                assert isinstance(mr.survived, bool), (
                    f"probe {r.probe_key!r} marker {mr.marker.desc!r} 的 survived "
                    f"不是 bool：{mr.survived!r}"
                )

    def test_error_results_have_none_or_empty_marker_results(self, live_results: list[ProbeResult]):
        """有 error 的结果，marker_results 可为空列表（因无法回读），或仍有部分结果。
        此处只验证类型正确，不要求特定数量。
        """
        for r in live_results:
            if r.error is not None:
                assert isinstance(r.marker_results, list), \
                    f"probe {r.probe_key!r} error 时 marker_results 应为 list"

    def test_no_unexpected_exceptions_surfaced(self, live_results: list[ProbeResult]):
        """run_all 不应向外抛出异常（所有错误应封装在 ProbeResult.error）。
        此测试通过「能拿到 live_results」隐式验证——若 run_all 抛异常，fixture 就失败了。
        """
        # 能执行到此处即说明 run_all 未抛出
        assert True


# ===========================================================================
# 真值表输出测试
# ===========================================================================


class TestTruthTableOutput:
    """验证 render_truth_table 对真实结果的输出可读性。"""

    def test_truth_table_is_printable(self, live_results: list[ProbeResult]):
        """render_truth_table 对真实结果不崩溃，输出非空字符串。"""
        from tests.regression.runner import render_truth_table

        table = render_truth_table(live_results)
        assert isinstance(table, str) and len(table) > 0, \
            "render_truth_table 应返回非空字符串"

    def test_truth_table_contains_all_probe_keys(self, live_results: list[ProbeResult]):
        """真值表应包含所有 probe_key。"""
        from tests.regression.runner import render_truth_table

        table = render_truth_table(live_results)
        for r in live_results:
            assert r.probe_key in table, \
                f"真值表中缺少 probe_key {r.probe_key!r}"
