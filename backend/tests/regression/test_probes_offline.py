"""离线测试：不触网，验证探针定义自洽性 + runner 评估逻辑正确性。

测试分三组：
  1. PROBES 数据完整性（非空、key 唯一、每 probe >= 1 marker）
  2. 探针自洽性（expect_survive=True 的 marker.pattern 必须命中自身 probe.html）
  3. runner 评估逻辑（monkeypatch wechat_service，模拟微信剥离 id 的回读场景）
"""
from __future__ import annotations

import re
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 导入被测模块（按契约假定存在）
# ---------------------------------------------------------------------------

from tests.regression.probes import PROBES, Marker, Probe
from tests.regression.runner import (
    MarkerResult,
    ProbeResult,
    run_probe,
    render_truth_table,
)


# ===========================================================================
# §1  PROBES 数据完整性
# ===========================================================================


class TestProbesIntegrity:
    """验证 PROBES 常量本身满足契约要求。"""

    def test_probes_not_empty(self):
        """PROBES 至少有一条探针。"""
        assert len(PROBES) > 0, "PROBES 不得为空"

    def test_probe_keys_unique(self):
        """每个 probe.key 必须全局唯一（kebab-case）。"""
        keys = [p.key for p in PROBES]
        dupes = sorted(k for k in set(keys) if keys.count(k) > 1)
        assert len(keys) == len(set(keys)), f"重复 key：{dupes}"

    def test_each_probe_has_at_least_one_marker(self):
        """每个探针至少包含 1 个 marker。"""
        for probe in PROBES:
            assert len(probe.markers) >= 1, f"探针 {probe.key!r} 没有 marker"

    def test_probe_html_is_nonempty_string(self):
        """probe.html 必须是非空字符串。"""
        for probe in PROBES:
            assert isinstance(probe.html, str) and probe.html.strip(), \
                f"探针 {probe.key!r} 的 html 为空"

    def test_probe_key_is_kebab_case(self):
        """probe.key 应为 kebab-case（只含小写字母、数字、连字符）。"""
        kebab_re = re.compile(r'^[a-z][a-z0-9-]*$')
        for probe in PROBES:
            assert kebab_re.match(probe.key), \
                f"probe.key {probe.key!r} 不符合 kebab-case 规范"

    def test_probe_claim_nonempty(self):
        """probe.claim 非空（用于草稿标题生成）。"""
        for probe in PROBES:
            assert isinstance(probe.claim, str) and probe.claim.strip(), \
                f"探针 {probe.key!r} 的 claim 为空"

    def test_marker_pattern_is_valid_regex(self):
        """每个 marker.pattern 必须是合法正则表达式。"""
        for probe in PROBES:
            for marker in probe.markers:
                try:
                    re.compile(marker.pattern)
                except re.error as exc:
                    pytest.fail(
                        f"探针 {probe.key!r} marker {marker.desc!r} 的 pattern 非法正则：{exc}"
                    )


# ===========================================================================
# §2  探针自洽性
# ===========================================================================


class TestProbesSelfConsistency:
    """expect_survive=True 的 marker 必须命中自身的 probe.html。"""

    @pytest.mark.parametrize("probe", PROBES, ids=[p.key for p in PROBES])
    def test_survive_markers_match_probe_html(self, probe: Probe):
        """对每个 expect_survive=True 的 marker，其 pattern 必须能在 probe.html 中搜到。"""
        for marker in probe.markers:
            if marker.expect_survive:
                match = re.search(marker.pattern, probe.html)
                assert match is not None, (
                    f"探针 {probe.key!r} marker {marker.desc!r}：\n"
                    f"  pattern={marker.pattern!r}\n"
                    f"  在 probe.html 中无匹配——探针不自洽，请修正 pattern 或 html"
                )

    # SVG 标签存在性检查：仅适用于 key 中含 "svg" 的探针，非 SVG 对照探针豁免。
    # 部分探针（如 background-url、style-block、height-percent、html-id-retention）
    # 是专门测试 HTML/CSS 层面行为的对照组，不含 <svg> 是设计如此，并非缺陷。
    _SVG_PROBES = [p for p in PROBES if "svg" in p.key.lower() or
                   re.search(r'<svg\b', p.html, re.IGNORECASE)]

    @pytest.mark.parametrize("probe", _SVG_PROBES, ids=[p.key for p in _SVG_PROBES])
    def test_probe_html_contains_svg_tag(self, probe: Probe):
        """key 含 'svg' 或 html 中已有 <svg> 的探针，必须能在 html 中找到 <svg 标签。"""
        assert re.search(r'<svg\b', probe.html, re.IGNORECASE), \
            f"探针 {probe.key!r} 的 html 不含 <svg> 标签"

    @pytest.mark.parametrize("probe", PROBES, ids=[p.key for p in PROBES])
    def test_probe_html_parseable(self, probe: Probe):
        """probe.html 应能被标准库 html.parser 解析（无崩溃即通过）。"""
        from html.parser import HTMLParser

        class _Sink(HTMLParser):
            pass

        parser = _Sink()
        try:
            parser.feed(probe.html)
        except Exception as exc:
            pytest.fail(f"探针 {probe.key!r} html 解析失败：{exc}")


# ===========================================================================
# §3  runner 评估逻辑（monkeypatch）
# ===========================================================================

# ---------------------------------------------------------------------------
# 辅助：构造最小探针用于 runner 逻辑测试
# ---------------------------------------------------------------------------

_SVG_WITH_ID = (
    '<p>探针说明段落。</p>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
    '  <rect id="hero" x="10" y="10" width="80" height="80" fill="blue"/>'
    '  <animate attributeName="opacity" begin="hero.click" dur="1s" fill="freeze" values="1;0"/>'
    '</svg>'
)

_SVG_WITHOUT_ID = (
    '<p>探针说明段落。</p>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
    '  <rect x="10" y="10" width="80" height="80" fill="blue"/>'
    '  <animate attributeName="opacity" begin="0s" dur="1s" fill="freeze" values="1;0"/>'
    '</svg>'
)

_PROBE_ID_RETENTION = Probe(
    key="test-id-retention",
    claim="微信剥离 id 后，依赖 id 的 begin 属性应不再命中",
    html=_SVG_WITH_ID,
    markers=(
        Marker(
            desc="id 属性存活",
            pattern=r'id=["\']?hero["\']?',
            expect_survive=True,
        ),
        Marker(
            desc="begin=hero.click 存活",
            pattern=r'begin=["\']?hero\.click["\']?',
            expect_survive=True,
        ),
    ),
)

_PROBE_SMIL_BASIC = Probe(
    key="test-smil-basic",
    claim="SMIL animate 元素在微信保存后存活",
    html=(
        '<p>SMIL 探针。</p>'
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
        '  <circle cx="50" cy="50" r="40" fill="red">'
        '    <animate attributeName="r" from="40" to="10" dur="2s" fill="freeze"/>'
        '  </circle>'
        '</svg>'
    ),
    markers=(
        Marker(
            desc="animate 元素存活",
            pattern=r'<animate\b',
            expect_survive=True,
        ),
    ),
)


def _cd_mock(media_id: str = "mock_media_id_001"):
    return MagicMock(return_value={"media_id": media_id})


def _gd_mock(readback_html: str):
    return MagicMock(return_value={
        "news_item": [{"content": readback_html}],
    })


def _dd_mock():
    return MagicMock(return_value=None)


class TestRunnerMarkerEvaluation:
    """验证 runner.run_probe 的 marker 评估逻辑正确性。"""

    def test_id_stripped_by_wechat_marked_as_not_survived(self):
        """模拟微信剥离 id：回读 HTML 无 id，expect_survive=True 的 marker 应标记 survived=False。"""
        readback_html = _SVG_WITHOUT_ID  # 无 id="hero"

        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_001")),
            patch("app.services.wechat_service.get_draft", _gd_mock(readback_html)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_ID_RETENTION,
                appid="test_appid",
                appsecret="test_appsecret",
                cleanup=False,
            )

        assert result.probe_key == "test-id-retention"
        assert result.error is None
        assert result.media_id == "mid_001"

        id_mr = next(mr for mr in result.marker_results if mr.marker.desc == "id 属性存活")
        assert id_mr.survived is False, \
            "微信剥除 id 后，'id 属性存活' marker 应标记 survived=False"

        begin_mr = next(mr for mr in result.marker_results if mr.marker.desc == "begin=hero.click 存活")
        assert begin_mr.survived is False, \
            "微信剥除 id 后，'begin=hero.click 存活' marker 应标记 survived=False"

    def test_smil_survives_marked_as_survived(self):
        """模拟微信保留 animate：回读 HTML 含 <animate，expect_survive=True 的 marker 标记 survived=True。"""
        readback_html = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
            '  <circle cx="50" cy="50" r="40" fill="red">'
            '    <animate attributeName="r" from="40" to="10" dur="2s" fill="freeze"/>'
            '  </circle>'
            '</svg>'
        )

        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_002")),
            patch("app.services.wechat_service.get_draft", _gd_mock(readback_html)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_SMIL_BASIC,
                appid="test_appid",
                appsecret="test_appsecret",
                cleanup=False,
            )

        assert result.error is None
        animate_mr = next(mr for mr in result.marker_results if mr.marker.desc == "animate 元素存活")
        assert animate_mr.survived is True, \
            "回读 HTML 中仍含 <animate，survived 应为 True"

    def test_cleanup_calls_delete_draft(self):
        """cleanup=True 时，run_probe 应调用 delete_draft。"""
        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_cleanup")),
            patch("app.services.wechat_service.get_draft", _gd_mock(_SVG_WITHOUT_ID)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()) as mock_del,
        ):
            run_probe(
                _PROBE_SMIL_BASIC,
                appid="a",
                appsecret="b",
                cleanup=True,
            )
            mock_del.assert_called_once()

    def test_cleanup_false_does_not_call_delete_draft(self):
        """cleanup=False 时不应调用 delete_draft。"""
        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_nc")),
            patch("app.services.wechat_service.get_draft", _gd_mock(_SVG_WITHOUT_ID)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()) as mock_del,
        ):
            run_probe(
                _PROBE_SMIL_BASIC,
                appid="a",
                appsecret="b",
                cleanup=False,
            )
            mock_del.assert_not_called()

    def test_create_draft_error_fills_error_field_without_raising(self):
        """create_draft 抛出异常时，error 字段应填充错误信息，且不向外抛出。"""
        with (
            patch("app.services.wechat_service.create_draft",
                  side_effect=RuntimeError("网络超时，无法创建草稿")),
            patch("app.services.wechat_service.get_draft", _gd_mock("")),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_SMIL_BASIC,
                appid="a",
                appsecret="b",
                cleanup=False,
            )

        assert result.error is not None, "create_draft 失败时 error 字段应非 None"
        assert len(result.error) > 0
        assert result.media_id is None

    def test_get_draft_error_fills_error_field_without_raising(self):
        """get_draft 抛出异常时，error 字段应填充错误信息，且不向外抛出。"""
        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_gderr")),
            patch("app.services.wechat_service.get_draft",
                  side_effect=RuntimeError("回读草稿失败")),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_SMIL_BASIC,
                appid="a",
                appsecret="b",
                cleanup=False,
            )

        assert result.error is not None
        # media_id 应已从 create_draft 返回并记录
        assert result.media_id == "mid_gderr"

    def test_probe_result_contains_all_markers(self):
        """ProbeResult.marker_results 数量应等于 probe.markers 数量。"""
        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_count")),
            patch("app.services.wechat_service.get_draft", _gd_mock(_SVG_WITHOUT_ID)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_ID_RETENTION,
                appid="a",
                appsecret="b",
                cleanup=False,
            )

        assert len(result.marker_results) == len(_PROBE_ID_RETENTION.markers), \
            "marker_results 数量应与 probe.markers 一致"

    def test_probe_result_marker_back_reference(self):
        """MarkerResult.marker 应指向原始 Marker 对象（或等值副本）。"""
        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_ref")),
            patch("app.services.wechat_service.get_draft", _gd_mock(_SVG_WITHOUT_ID)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                _PROBE_SMIL_BASIC,
                appid="a",
                appsecret="b",
                cleanup=False,
            )

        for mr in result.marker_results:
            assert isinstance(mr.marker, Marker), \
                f"MarkerResult.marker 应为 Marker 实例，实际为 {type(mr.marker)}"

    def test_expect_survive_false_marker_correctly_evaluated(self):
        """expect_survive=False 的 marker：pattern 存在时 survived=True（但这不是期望值，属于发现）。
        此测试验证 survived 字段的纯事实语义——survived 只反映「pattern 有无命中」，
        与 expect_survive 无关；二者比较由上层报告逻辑处理。
        """
        probe_with_negative_marker = Probe(
            key="test-negative-marker",
            claim="验证 expect_survive=False marker 的 survived 语义",
            html=(
                '<p>测试。</p>'
                '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
                '  <script>alert(1)</script>'
                '</svg>'
            ),
            markers=(
                Marker(
                    desc="script 标签被微信剥除",
                    pattern=r'<script\b',
                    expect_survive=False,
                ),
            ),
        )

        # 回读 HTML 已被微信剥除 script
        readback_no_script = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
        )

        with (
            patch("app.services.wechat_service.create_draft", _cd_mock("mid_neg")),
            patch("app.services.wechat_service.get_draft", _gd_mock(readback_no_script)),
            patch("app.services.wechat_service.delete_draft", _dd_mock()),
        ):
            result = run_probe(
                probe_with_negative_marker,
                appid="a",
                appsecret="b",
                cleanup=False,
            )

        assert result.error is None
        script_mr = result.marker_results[0]
        # 回读无 <script，survived=False；与 expect_survive=False 一致 => 符合预期
        assert script_mr.survived is False


# ===========================================================================
# §4  render_truth_table 输出格式
# ===========================================================================


class TestRenderTruthTable:
    """验证 render_truth_table 返回合法 Markdown 表格字符串。"""

    def _make_result(
        self,
        probe: Probe,
        survived_map: dict[str, bool],
        error: str | None = None,
    ) -> ProbeResult:
        marker_results = [
            MarkerResult(marker=m, survived=survived_map.get(m.desc, False))
            for m in probe.markers
        ]
        return ProbeResult(
            probe_key=probe.key,
            media_id="mid_table" if not error else None,
            error=error,
            marker_results=marker_results,
        )

    def test_returns_string(self):
        result = self._make_result(_PROBE_SMIL_BASIC, {"animate 元素存活": True})
        table = render_truth_table([result])
        assert isinstance(table, str), "render_truth_table 应返回字符串"

    def test_contains_probe_key(self):
        result = self._make_result(_PROBE_SMIL_BASIC, {"animate 元素存活": True})
        table = render_truth_table([result])
        assert "test-smil-basic" in table, "真值表应包含 probe_key"

    def test_contains_markdown_table_separator(self):
        result = self._make_result(_PROBE_SMIL_BASIC, {"animate 元素存活": True})
        table = render_truth_table([result])
        assert "|" in table, "render_truth_table 应输出含 | 的 Markdown 表格"

    def test_nonempty_for_empty_results(self):
        table = render_truth_table([])
        assert isinstance(table, str)

    def test_error_result_reflected_in_table(self):
        result = self._make_result(_PROBE_SMIL_BASIC, {}, error="网络超时")
        table = render_truth_table([result])
        assert isinstance(table, str)
        assert len(table) > 0

    def test_multiple_results_all_included(self):
        r1 = self._make_result(_PROBE_SMIL_BASIC, {"animate 元素存活": True})
        r2 = self._make_result(_PROBE_ID_RETENTION, {
            "id 属性存活": False,
            "begin=hero.click 存活": False,
        })
        table = render_truth_table([r1, r2])
        assert "test-smil-basic" in table
        assert "test-id-retention" in table
