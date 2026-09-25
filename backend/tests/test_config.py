"""Cubre el parseo de ALLOWED_ORIGINS que usa CORSMiddleware en app.main."""

import pytest
from sqlalchemy.engine import make_url

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


def test_database_fields_preserve_special_characters(monkeypatch):
    from app.config import get_database_url

    values = {
        "POSTGRES_HOST": "database", "POSTGRES_PORT": "5432", "POSTGRES_DB": "test_db",
        "POSTGRES_USER": "test_user", "POSTGRES_PASSWORD": "test@:/?#%$pass",
        "DATABASE_URL": "postgresql://unused:unused@localhost:5433/unused",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    url = get_database_url()
    assert url.host == "database"
    assert url.port == 5432
    assert url.password == values["POSTGRES_PASSWORD"]
    assert url.database == "test_db"
    assert url.username == "test_user"
    assert make_url(url.render_as_string(hide_password=False)).password == values["POSTGRES_PASSWORD"]


def test_database_url_fallback(monkeypatch):
    from app.config import get_database_url

    monkeypatch.delenv("POSTGRES_HOST", raising=False)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    assert get_database_url() == "sqlite:///:memory:"


@pytest.mark.parametrize("missing", ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"])
def test_database_fields_fail_without_credentials(monkeypatch, missing):
    from app.config import get_database_url

    monkeypatch.setenv("POSTGRES_HOST", "database")
    monkeypatch.setenv("POSTGRES_DB", "test_db")
    monkeypatch.setenv("POSTGRES_USER", "test_user")
    monkeypatch.setenv("POSTGRES_PASSWORD", "fake_password")
    monkeypatch.delenv(missing, raising=False)
    with pytest.raises(RuntimeError, match=missing):
        get_database_url()


def test_database_configuration_required(monkeypatch):
    from app.config import get_database_url

    monkeypatch.delenv("POSTGRES_HOST", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL o POSTGRES_HOST"):
        get_database_url()
