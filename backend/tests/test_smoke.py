"""Smoke test — verifies the FastAPI app can respond to /healthz."""
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_healthz_responds():
    """The /healthz endpoint must return 200 with the expected body."""
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
