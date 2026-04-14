"""Tests for WeChat API proxy configuration."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from app.services import wechat_service


@pytest.fixture
def temp_config(tmp_path: Path):
    """Provide a temporary config file for testing."""
    config_file = tmp_path / "config.json"
    config_file.write_text('{"appid": "wx123", "appsecret": "secret456"}')
    original = wechat_service.settings.CONFIG_FILE
    wechat_service.settings.CONFIG_FILE = str(config_file)
    # Reset cache so tests start clean
    wechat_service._token_cache.clear()
    # Also clear proxy client cache
    wechat_service._proxy_client_cache.clear()
    yield config_file
    wechat_service.settings.CONFIG_FILE = original


class TestGetHttpClient:
    """Tests for the HTTP client factory with proxy support."""

    def test_no_proxy_returns_direct_client(self, temp_config):
        """When proxy_url is empty/absent, client has no proxy."""
        client = wechat_service.get_http_client()
        assert client._transport._pool._proxy is None
        assert not client._mounts

    def test_with_proxy_returns_proxied_client(self, temp_config):
        """When proxy_url is set, client uses it."""
        config = json.loads(temp_config.read_text())
        config["proxy_url"] = "https://proxy.example.com:8080"
        temp_config.write_text(json.dumps(config))

        wechat_service._proxy_client_cache.clear()

        client = wechat_service.get_http_client()
        assert client._mounts  # Proxy config creates mount entries

    def test_same_proxy_returns_cached_client(self, temp_config):
        """Same proxy URL returns the same cached client instance."""
        config = json.loads(temp_config.read_text())
        config["proxy_url"] = "https://proxy.example.com:8080"
        temp_config.write_text(json.dumps(config))
        wechat_service._proxy_client_cache.clear()

        client1 = wechat_service.get_http_client()
        client2 = wechat_service.get_http_client()
        assert client1 is client2


class TestProxyConfigSaveLoad:
    """Tests for proxy_url persistence in config.json."""

    def test_save_config_includes_proxy_url(self, temp_config):
        """save_config writes proxy_url to config.json."""
        wechat_service.save_config(
            "wx123", "secret456", "https://proxy.example.com:8080"
        )
        config = json.loads(temp_config.read_text())
        assert config["proxy_url"] == "https://proxy.example.com:8080"

    def test_save_config_empty_proxy(self, temp_config):
        """save_config with empty proxy_url still writes the field."""
        wechat_service.save_config("wx123", "secret456", "")
        config = json.loads(temp_config.read_text())
        assert config["proxy_url"] == ""

    def test_load_config_returns_proxy_url(self, temp_config):
        """load_config includes proxy_url when present."""
        config_data = {
            "appid": "wx123",
            "appsecret": "sec",
            "proxy_url": "http://proxy:8080",
        }
        temp_config.write_text(json.dumps(config_data))
        result = wechat_service.load_config()
        assert result["proxy_url"] == "http://proxy:8080"

    def test_load_config_missing_proxy_url(self, temp_config):
        """load_config handles old config without proxy_url (backward compat)."""
        temp_config.write_text('{"appid": "wx123", "appsecret": "sec"}')
        result = wechat_service.load_config()
        assert result.get("proxy_url") is None
