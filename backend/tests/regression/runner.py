"""SVG 能力真机回归 runner。

把 ``probes.py`` 里的每个探针经 ``add_draft`` API 真推到草稿箱，再用
``draft/get`` 回读微信服务端清洗后的存储 HTML，逐 marker 跑正则判定其能力
是否被保留，最后渲染成 markdown 真相表。

凭证与门禁遵循 tests/visual/infrastructure.py 的模式：
- 优先读 env WECHAT_APPID / WECHAT_APPSECRET，回退 backend/data/config.json
- 任何真实 API 调用必须先设置 env MBEDITOR_RUN_REAL_WECHAT_TESTS=1
- 草稿标题统一前缀 "[SVG-PROBE] "

注意：本 runner 只验证微信"服务端 sanitizer"的取舍，渲染层（iOS/Android
真机）的实际显示效果另需人工核验，真相表结尾会显式标注这一点。
"""

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.services import wechat_service

from .probes import PROBES, Marker, Probe

# 草稿标题统一前缀，便于真机后台辨认并批量清理
TITLE_PREFIX = "[SVG-PROBE] "

# main() 默认输出路径
DEFAULT_OUT = Path(r"D:\MBEditor\docs\research\wechat-svg-truth-table.md")


@dataclass
class MarkerResult:
    marker: Marker
    survived: bool


@dataclass
class ProbeResult:
    probe_key: str
    media_id: str | None
    error: str | None
    marker_results: list[MarkerResult]


# ---------------------------------------------------------------------------
# 凭证读取（与 tests/visual/infrastructure.py:222-232 完全一致的双层优先级）
# ---------------------------------------------------------------------------
def _load_credentials() -> tuple[str, str]:
    """优先 env，回退 backend/data/config.json（支持大小写两套键名）。"""
    import json

    appid = os.environ.get("WECHAT_APPID", "")
    appsecret = os.environ.get("WECHAT_APPSECRET", "")
    if not appid or not appsecret:
        # runner.py 位于 backend/tests/regression/，上溯 parents[2] 到 backend/
        config_path = Path(__file__).parents[2] / "data" / "config.json"
        if config_path.exists():
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            appid = cfg.get("appid", "") or cfg.get("WECHAT_APPID", "")
            appsecret = cfg.get("appsecret", "") or cfg.get("WECHAT_APPSECRET", "")
    return appid, appsecret


def _extract_stored_html(draft: dict) -> str:
    """从 draft/get 返回的草稿 dict 取微信存储后的正文 HTML。

    微信 draft/get 的图文条目在 ``news_item`` 数组里，正文字段是 ``content``。
    """
    items = draft.get("news_item") or []
    if not items:
        return ""
    return items[0].get("content", "") or ""


# ---------------------------------------------------------------------------
# 单探针执行
# ---------------------------------------------------------------------------
def run_probe(
    probe: Probe,
    *,
    appid: str,
    appsecret: str,
    cleanup: bool = False,
    thumb_media_id: str = "",
) -> ProbeResult:
    """推一个探针 → 回读 → 逐 marker 判定。

    所有微信 API 异常都捕获进 ``ProbeResult.error``，绝不向外抛出，
    以保证 ``run_all`` 整批不被单个探针中断。
    """
    media_id: str | None = None
    try:
        result = wechat_service.create_draft(
            appid=appid,
            appsecret=appsecret,
            title=TITLE_PREFIX + probe.key,
            html=probe.html,
            thumb_media_id=thumb_media_id,
        )
        media_id = result["media_id"]

        draft = wechat_service.get_draft(media_id, appid=appid, appsecret=appsecret)
        stored_html = _extract_stored_html(draft)

        marker_results: list[MarkerResult] = []
        for marker in probe.markers:
            survived = bool(re.search(marker.pattern, stored_html))
            marker_results.append(MarkerResult(marker=marker, survived=survived))

        return ProbeResult(
            probe_key=probe.key,
            media_id=media_id,
            error=None,
            marker_results=marker_results,
        )
    except Exception as exc:  # noqa: BLE001 — 真机批量回归不因单探针失败而中断
        return ProbeResult(
            probe_key=probe.key,
            media_id=media_id,
            error=f"{type(exc).__name__}: {exc}",
            marker_results=[],
        )
    finally:
        # cleanup 即便回读/判定阶段抛错也要尽量删掉草稿，避免污染草稿箱
        if cleanup and media_id:
            try:
                wechat_service.delete_draft(media_id, appid=appid, appsecret=appsecret)
            except Exception:  # noqa: BLE001 — 清理失败不影响结论
                pass


# ---------------------------------------------------------------------------
# 整批执行
# ---------------------------------------------------------------------------
def run_all(
    probes: tuple[Probe, ...] | None = None,
    *,
    appid: str,
    appsecret: str,
    cleanup: bool = False,
    sleep_s: float = 1.0,
) -> list[ProbeResult]:
    """逐个跑全部探针，带 sleep_s 限速与进度打印。

    封面缩略图只上传一次、全批共用：create_draft 不传 thumb_media_id 时
    每篇都会往素材库塞一张永久素材（material/add_material），整批 31 探针
    会留下 31 份垃圾素材且 delete_draft 不会清理它们。
    """
    probes = probes if probes is not None else PROBES
    total = len(probes)
    results: list[ProbeResult] = []

    # 共享封面：整批只上传一份永久素材；cleanup 时连素材一起删
    shared_thumb = ""
    try:
        cover = wechat_service._generate_default_cover("SVG-PROBE")
        shared_thumb = wechat_service.upload_thumb_to_wechat(
            cover, "svg_probe_cover.jpg", appid=appid, appsecret=appsecret
        )
        print(f"共享封面素材已上传 thumb_media_id={shared_thumb}", flush=True)
    except Exception as exc:  # noqa: BLE001 — 失败则退回每篇自动生成
        print(f"共享封面上传失败（退回每篇自动封面）：{exc}", flush=True)

    for idx, probe in enumerate(probes, start=1):
        print(f"[{idx}/{total}] 探针 {probe.key} ...", flush=True)
        res = run_probe(
            probe,
            appid=appid,
            appsecret=appsecret,
            cleanup=cleanup,
            thumb_media_id=shared_thumb,
        )
        if res.error:
            print(f"    -> 错误：{res.error}", flush=True)
        else:
            survived = sum(1 for m in res.marker_results if m.survived)
            print(
                f"    -> 完成 media_id={res.media_id} "
                f"标记存活 {survived}/{len(res.marker_results)}",
                flush=True,
            )
        results.append(res)
        # 末个探针后无需再 sleep
        if idx < total and sleep_s > 0:
            time.sleep(sleep_s)

    # 清理共享封面素材（草稿都删完后才可删素材，否则草稿引用悬空也无妨——
    # 探针草稿本身就是一次性的）
    if cleanup and shared_thumb:
        try:
            wechat_service.delete_material(shared_thumb, appid=appid, appsecret=appsecret)
            print("共享封面素材已清理", flush=True)
        except Exception as exc:  # noqa: BLE001 — 清理失败不影响结论
            print(f"共享封面素材清理失败（可手动到素材库删除）：{exc}", flush=True)
    return results


# ---------------------------------------------------------------------------
# 真相表渲染
# ---------------------------------------------------------------------------
def _conclusion(marker: Marker, survived: bool, errored: bool) -> str:
    """单 marker 结论：allowed / stripped / error。

    - error：该探针整体 API 失败，无法判定
    - allowed：存活情况与 expect_survive 一致（能力按预期被微信允许/保留）
    - stripped：未存活（能力被微信剥离）
    """
    if errored:
        return "error"
    if survived:
        return "allowed"
    return "stripped"


def render_truth_table(results: list[ProbeResult], *, run_date: str | None = None) -> str:
    """渲染 markdown 真相表。

    列：探针 | 断言 | 标记 | 提交时 | 回读后 | 结论。
    其中"提交时"恒为 ✅（探针 HTML 一定带该能力），"回读后"表示回读 HTML 上
    该 marker 的正则是否命中。运行日期由调用方传入，缺省留占位。
    """
    # 建立 probe_key -> claim 的映射，便于按结果回填断言原文
    claim_by_key = {p.key: p.claim for p in PROBES}

    date_str = run_date or "<运行日期占位：由调用方传入>"
    lines: list[str] = []
    lines.append("# 微信 SVG 能力真相表（add_draft 真机回读）")
    lines.append("")
    lines.append(f"运行日期：{date_str}")
    lines.append("")
    lines.append("| 探针 | 断言 | 标记 | 提交时 | 回读后 | 结论 |")
    lines.append("| --- | --- | --- | --- | --- | --- |")

    for res in results:
        claim = claim_by_key.get(res.probe_key, "")
        errored = res.error is not None
        if errored or not res.marker_results:
            # 整探针失败：单独一行标注错误信息
            err_text = res.error or "无回读标记"
            lines.append(
                f"| `{res.probe_key}` | {_esc(claim)} | （{_esc(err_text)}） "
                f"| ✅ | ⚠️ | error |"
            )
            continue

        for i, mr in enumerate(res.marker_results):
            # 同一探针多 marker 时，探针/断言列只在首行展示，其余留空避免重复
            probe_cell = f"`{res.probe_key}`" if i == 0 else ""
            claim_cell = _esc(claim) if i == 0 else ""
            readback = "✅" if mr.survived else "❌"
            conclusion = _conclusion(mr.marker, mr.survived, errored=False)
            lines.append(
                f"| {probe_cell} | {claim_cell} | {_esc(mr.marker.desc)} "
                f"| ✅ | {readback} | {conclusion} |"
            )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(
        "> 说明：`allowed` 表示该能力在微信服务端清洗后仍保留于存储 HTML；"
        "`stripped` 表示被微信剥离；`error` 表示该探针 API 调用失败、无法判定。"
    )
    lines.append("")
    lines.append(
        "> **本表仅验证服务端 sanitizer（即 `draft/get` 回读到的存储 HTML），"
        "渲染层（iOS / Android 真机）的实际显示效果另需人工核验。**"
    )
    lines.append("")
    return "\n".join(lines)


def _esc(text: str) -> str:
    """转义 markdown 表格里会破坏列结构的竖线与换行。"""
    return text.replace("|", "\\|").replace("\n", " ")


# ---------------------------------------------------------------------------
# CLI 入口：python -m tests.regression（backend 为 cwd）
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tests.regression",
        description="把 SVG 探针真推微信草稿箱并回读，产出能力真相表。",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="回读后删除草稿（避免污染草稿箱）",
    )
    parser.add_argument(
        "--only",
        metavar="KEY",
        default=None,
        help="只跑指定 key 的单个探针",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"真相表输出路径（默认 {DEFAULT_OUT}）",
    )
    args = parser.parse_args()

    # 门禁：真机调用必须显式开启
    if os.environ.get("MBEDITOR_RUN_REAL_WECHAT_TESTS") != "1":
        print(
            "拒绝运行：本命令会向微信真机推送草稿，需先设置环境变量 "
            "MBEDITOR_RUN_REAL_WECHAT_TESTS=1 以确认。",
            file=sys.stderr,
        )
        return 2

    appid, appsecret = _load_credentials()
    if not appid or not appsecret:
        print(
            "拒绝运行：未找到公众号凭证。请设置 env WECHAT_APPID / WECHAT_APPSECRET，"
            "或在 backend/data/config.json 中配置 appid / appsecret。",
            file=sys.stderr,
        )
        return 2

    # 探针筛选
    if args.only:
        probes = tuple(p for p in PROBES if p.key == args.only)
        if not probes:
            keys = ", ".join(p.key for p in PROBES)
            print(f"未找到探针 key={args.only}；可选：{keys}", file=sys.stderr)
            return 2
    else:
        probes = PROBES

    print(f"开始回归：{len(probes)} 个探针，cleanup={args.cleanup}", flush=True)
    results = run_all(
        probes,
        appid=appid,
        appsecret=appsecret,
        cleanup=args.cleanup,
    )

    table = render_truth_table(results, run_date=date.today().isoformat())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(table, encoding="utf-8")
    print(f"真相表已写入：{args.out}", flush=True)

    # 有任一探针报错则以非零退出，便于 CI 感知
    errored = sum(1 for r in results if r.error)
    if errored:
        print(f"完成：{errored}/{len(results)} 个探针报错。", flush=True)
        return 1
    print("完成：全部探针执行成功。", flush=True)
    return 0
