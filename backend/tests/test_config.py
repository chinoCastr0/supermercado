"""Cubre el parseo de ALLOWED_ORIGINS que usa CORSMiddleware en app.main."""

from app.config import get_allowed_origins


def test_get_allowed_origins_defaults(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert get_allowed_origins() == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def test_get_allowed_origins_parses_and_trims_custom_list(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", " https://a.com/, https://b.com ,")
    assert get_allowed_origins() == ["https://a.com", "https://b.com"]
