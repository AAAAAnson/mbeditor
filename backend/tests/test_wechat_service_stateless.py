# backend/tests/test_wechat_service_stateless.py
import time

import httpx
import pytest

from app.services import wechat_service


@pytest.fixture(autouse=True)
def _reset_cache():
    wechat_service._token_cache.clear()
    yield
    wechat_service._token_cache.clear()


def _mock_stable_token(monkeypatch, token_value: str = "tok-A", expires_in: int = 7200):
    calls = {"n": 0}

    def fake_post(url, json=None, timeout=None, **_):
        calls["n"] += 1
        request = httpx.Request("POST", url, json=json)
        return httpx.Response(
            200,
            json={"access_token": token_value, "expires_in": expires_in},
            request=request,
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    return calls


def test_get_access_token_accepts_credentials_as_arguments(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    token = wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert token == "tok-A"
    assert calls["n"] == 1


def test_token_cache_is_keyed_by_appid(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-shared")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 1, "second call for same appid must use cache"

    wechat_service.get_access_token(appid="wxB", appsecret="secretB")
    assert calls["n"] == 2, "different appid must trigger a new fetch"


def test_force_refresh_bypasses_cache(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA", force_refresh=True)
    assert calls["n"] == 2


def test_missing_credentials_raise(monkeypatch):
    _mock_stable_token(monkeypatch)
    from app.core.exceptions import AppError

    with pytest.raises(AppError):
        wechat_service.get_access_token(appid="", appsecret="")


def test_expired_token_is_refreshed(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A", expires_in=10)
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    # Force expiry
    wechat_service._token_cache["wxA"]["expires_at"] = time.time() - 1
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 2


def test_load_config_and_save_config_are_removed():
    assert not hasattr(wechat_service, "load_config")
    assert not hasattr(wechat_service, "save_config")
    assert not hasattr(wechat_service, "_wx_image_cache")


def test_settings_only_expose_max_upload_size():
    from app.core.config import settings
    # Public attrs exposed by Settings
    attrs = {k for k in dir(settings) if not k.startswith("_") and k.isupper()}
    assert "MAX_UPLOAD_SIZE" in attrs
    assert "IMAGES_DIR" not in attrs
    assert "ARTICLES_DIR" not in attrs
    assert "MBDOCS_DIR" not in attrs
    assert "CONFIG_FILE" not in attrs


def test_wechat_call_uses_stored_gateway(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    from app.services import gateway as gw
    gw._reset_caches()
    gw.save_stored(gw.GatewayConfig(True, "https-gateway", "https://gw:8443", "TKN", ""))
    seen = {}

    def fake_post(url, json=None, files=None, timeout=None, **kw):
        seen["url"] = url
        seen["headers"] = kw.get("headers")
        return httpx.Response(
            200,
            json={"access_token": "a", "expires_in": 7200},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("httpx.post", fake_post)
    wechat_service._token_cache.clear()
    wechat_service.get_access_token(appid="wx", appsecret="s", force_refresh=True)
    assert seen["url"].startswith("https://gw:8443/cgi-bin/stable_token")
    assert seen["headers"]["Authorization"] == "Bearer TKN"


def _capture_secret_post(monkeypatch):
    captured = {}

    def fake_post(url, json=None, timeout=None, **kw):
        captured["secret"] = json["secret"]
        return httpx.Response(
            200,
            json={"access_token": "T", "expires_in": 7200},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("httpx.post", fake_post)
    return captured


def test_get_access_token_falls_back_to_stored_secret(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    from app.services import credentials

    credentials.set_secret("wxFB", "stored-secret")
    captured = _capture_secret_post(monkeypatch)
    # No appsecret passed -> must resolve the stored one.
    tok = wechat_service.get_access_token(appid="wxFB", appsecret="")
    assert tok == "T"
    assert captured["secret"] == "stored-secret"


def test_get_access_token_request_secret_wins_over_stored(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    from app.services import credentials

    credentials.set_secret("wxFB", "stored-secret")
    captured = _capture_secret_post(monkeypatch)
    wechat_service.get_access_token(appid="wxFB", appsecret="request-secret")
    assert captured["secret"] == "request-secret"


def test_get_access_token_no_secret_anywhere_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    from app.core.exceptions import AppError

    with pytest.raises(AppError):
        wechat_service.get_access_token(appid="wxNONE", appsecret="")


# ---------------------------------------------------------------------------
# H6 · 微信 API 错误黑洞:errcode → 中文可行动文案 + HTTP 层防线
# ---------------------------------------------------------------------------

def _mock_upload_flow(monkeypatch, upload_payloads: list, *, status: int = 200, raw_text: str | None = None):
    """stable_token 恒成功;media/uploadimg 依次返回 upload_payloads 中的响应。"""
    calls = {"upload": 0, "token": 0}

    def fake_post(url, json=None, files=None, timeout=None, **_):
        request = httpx.Request("POST", url)
        if "stable_token" in url:
            calls["token"] += 1
            return httpx.Response(
                200, json={"access_token": f"tok-{calls['token']}", "expires_in": 7200},
                request=request,
            )
        calls["upload"] += 1
        if raw_text is not None:
            return httpx.Response(status, text=raw_text, request=request)
        payload = upload_payloads[min(calls["upload"] - 1, len(upload_payloads) - 1)]
        return httpx.Response(status, json=payload, request=request)

    monkeypatch.setattr(httpx, "post", fake_post)
    return calls


def _upload(appid="wxA", appsecret="s"):
    return wechat_service.upload_image_to_wechat(b"png", "a.png", appid=appid, appsecret=appsecret)


def test_errcode_40164_maps_to_whitelist_action_message(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{"errcode": 40164, "errmsg": "invalid ip 1.2.3.4, not in whitelist"}])
    with pytest.raises(AppError) as ei:
        _upload()
    assert "白名单" in ei.value.message
    assert "公众号后台" in ei.value.message


def test_errcode_45009_maps_to_rate_limit_message(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{"errcode": 45009, "errmsg": "reach max api daily quota limit"}])
    with pytest.raises(AppError) as ei:
        _upload()
    assert "稍后再试" in ei.value.message


def test_errcode_45002_maps_to_content_size_message(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{"errcode": 45002, "errmsg": "message too long"}])
    with pytest.raises(AppError) as ei:
        _upload()
    assert "长度" in ei.value.message


def test_unknown_errcode_falls_back_with_code_and_errmsg(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{"errcode": 99999, "errmsg": "mystery failure"}])
    with pytest.raises(AppError) as ei:
        _upload()
    assert "99999" in ei.value.message
    assert "mystery failure" in ei.value.message


def test_http_5xx_from_wechat_maps_to_502_chinese(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{}], status=500, raw_text="Bad Gateway")
    with pytest.raises(AppError) as ei:
        _upload()
    assert ei.value.code == 502
    assert "微信接口请求失败" in ei.value.message
    assert "500" in ei.value.message


def test_non_json_body_maps_to_502_chinese(monkeypatch):
    from app.core.exceptions import AppError

    _mock_upload_flow(monkeypatch, [{}], status=200, raw_text="<html>not json</html>")
    with pytest.raises(AppError) as ei:
        _upload()
    assert ei.value.code == 502
    assert "微信接口响应异常" in ei.value.message


def test_token_error_maps_bad_credential_to_chinese(monkeypatch):
    from app.core.exceptions import AppError

    def fake_post(url, json=None, timeout=None, **_):
        return httpx.Response(
            200, json={"errcode": 40013, "errmsg": "invalid appid"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AppError) as ei:
        wechat_service.get_access_token(appid="wxA", appsecret="s")
    assert "AppID" in ei.value.message
    assert "核对" in ei.value.message


def test_token_refresh_retry_on_42001_is_preserved(monkeypatch):
    """契约红线:_is_invalid_credential 三码触发的 token 刷新重试零改。"""
    calls = _mock_upload_flow(
        monkeypatch,
        [
            {"errcode": 42001, "errmsg": "access_token expired"},
            {"url": "https://mmbiz.qpic.cn/ok.png"},
        ],
    )
    assert _upload() == "https://mmbiz.qpic.cn/ok.png"
    assert calls["upload"] == 2
    assert calls["token"] == 2  # 第二次为 force_refresh


# ---------------------------------------------------------------------------
# H7 · 图片上传失败静默吞:process_html_images 返回失败清单
# ---------------------------------------------------------------------------

def test_process_html_images_reports_download_failures(monkeypatch):
    def fake_get(url, **kw):
        raise httpx.ConnectError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    html = '<img src="http://img.example.com/hotlinked.png">'
    out, failures = wechat_service.process_html_images(html, appid="wxA", appsecret="s")
    assert out == html  # 失败不中断,原样保留
    assert len(failures) == 1
    assert failures[0]["src"] == "http://img.example.com/hotlinked.png"
    assert len(failures[0]["src"]) <= 80
    assert failures[0]["reason"]


def test_process_html_images_reports_403_hotlink(monkeypatch):
    def fake_get(url, **kw):
        req = httpx.Request("GET", url)
        resp = httpx.Response(403, request=req)
        raise httpx.HTTPStatusError("403", request=req, response=resp)

    monkeypatch.setattr(httpx, "get", fake_get)
    html = '<img src="http://cdn.example.com/a.png">'
    out, failures = wechat_service.process_html_images(html, appid="wxA", appsecret="s")
    assert out == html
    assert "403" in failures[0]["reason"]


def test_process_html_images_success_returns_empty_failures(monkeypatch):
    def fake_get(url, **kw):
        return httpx.Response(200, content=b"\x89PNG", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    _mock_upload_flow(monkeypatch, [{"url": "https://mmbiz.qpic.cn/x.png"}])
    html = '<img src="http://img.example.com/a.png">'
    out, failures = wechat_service.process_html_images(html, appid="wxA", appsecret="s")
    assert 'src="https://mmbiz.qpic.cn/x.png"' in out
    assert failures == []


def test_process_html_images_truncates_long_src(monkeypatch):
    def fake_get(url, **kw):
        raise httpx.ConnectError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    long_src = "http://img.example.com/" + "a" * 200 + ".png"
    html = f'<img src="{long_src}">'
    _, failures = wechat_service.process_html_images(html, appid="wxA", appsecret="s")
    assert len(failures[0]["src"]) == 80
