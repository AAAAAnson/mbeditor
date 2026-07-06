"""Tests for image_processor service."""
import pytest
from unittest.mock import patch, MagicMock
from app.services.image_processor import download_and_encode


def test_download_and_encode_returns_none_for_non_image():
    """Should return None when content-type is not image."""
    mock_response = MagicMock()
    mock_response.headers = {"content-type": "text/html"}
    mock_response.content = b"<html></html>"

    with patch("httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.get.return_value = mock_response
        result = download_and_encode("https://example.com/page.html")
        assert result is None


def test_download_and_encode_returns_data_uri():
    """Should return data URI for valid image."""
    mock_response = MagicMock()
    mock_response.headers = {"content-type": "image/png"}
    mock_response.content = b"\x89PNG\r\n\x1a\n"

    with patch("httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.get.return_value = mock_response
        result = download_and_encode("https://example.com/image.png")
        assert result is not None
        assert result.startswith("data:image/png;base64,")
