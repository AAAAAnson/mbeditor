# backend/tests/test_api_health.py
"""Tests for health check and version endpoints."""
import pytest


def test_healthz(client):
    """Test health check endpoint."""
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version(client):
    """Test version endpoint."""
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "version" in data["data"]
