"""Orígenes confiables para CORS."""

import os


def get_allowed_origins() -> list[str]:
    """Orígenes que CORSMiddleware acepta; configurable por ALLOWED_ORIGINS."""
    configured = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]
