# backend/tests/conftest.py
"""Test configuration and fixtures."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def sample_article():
    """Sample article data for testing."""
    return {
        "title": "Test Article",
        "html": "<h1>Hello</h1><p>World</p>",
        "css": "h1 { color: red; }",
        "author": "Test Author",
        "digest": "Test digest",
        "cover": "",
        "mode": "html",
        "markdown": "",
    }
