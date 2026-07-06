"""Tests for the per-appid credential store (``app.services.credentials``).

Mirrors the gateway store contract: atomic write to APP_DATA_DIR/credentials.json,
corrupt file degrades to {}, redacted() never leaks a secret.
"""
import json

import pytest

from app.core.exceptions import AppError
from app.services import credentials as cred


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    yield


def test_set_get_roundtrip():
    cred.set_secret("wxAAA", "secret-A")
    assert cred.get_secret("wxAAA") == "secret-A"


def test_get_missing_returns_none():
    assert cred.get_secret("wxNOPE") is None


def test_set_empty_clears():
    cred.set_secret("wxAAA", "secret-A")
    cred.set_secret("wxAAA", "")
    assert cred.get_secret("wxAAA") is None


def test_clear_is_idempotent():
    cred.clear_secret("wxGHOST")  # never set -> no raise
    assert cred.get_secret("wxGHOST") is None


def test_multiple_appids_isolated():
    cred.set_secret("wxAAA", "sa")
    cred.set_secret("wxBBB", "sb")
    assert cred.get_secret("wxAAA") == "sa"
    assert cred.get_secret("wxBBB") == "sb"


def test_redacted_lists_appids_not_secrets():
    cred.set_secret("wxAAA", "sa")
    cred.set_secret("wxBBB", "sb")
    red = cred.redacted()
    assert red == {"configured": ["wxAAA", "wxBBB"]}
    assert "sa" not in json.dumps(red)
    assert "sb" not in json.dumps(red)


def test_corrupt_file_degrades_to_empty(tmp_path):
    (tmp_path / "credentials.json").write_text("{not json", encoding="utf-8")
    assert cred.load() == {}


def test_readonly_volume_raises_apperror(tmp_path, monkeypatch):
    missing = tmp_path / "nope" / "deeper"
    monkeypatch.setenv("APP_DATA_DIR", str(missing))
    # Make the parent un-creatable by pointing at a file, not a dir.
    (tmp_path / "nope").write_text("x", encoding="utf-8")
    with pytest.raises(AppError):
        cred.set_secret("wxAAA", "s")
