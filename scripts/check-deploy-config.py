"""Valida JSON de Compose por stdin; nunca imprime valores de credenciales.

Uso en el VPS: docker compose --env-file .env config --format json |
              python3 scripts/check-deploy-config.py
No importa la aplicación, no abre .env ni conecta a la base.
"""

import json
import re
import sys
from urllib.parse import urlsplit


def validate(config: dict) -> list[str]:
    errors = []
    services = config.get("services", {})
    backend = services.get("backend", {})
    database = services.get("database", {})
    nginx = services.get("nginx", {})
    env = backend.get("environment", {})
    db_env = database.get("environment", {})
    nginx_env = nginx.get("environment", {})
    certbot_env = services.get("certbot", {}).get("environment", {})
    for key in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "CLERK_SECRET_KEY"):
        value = env.get(key) or ""
        if not value or "reemplazar" in value:
            errors.append(f"Falta configurar {key}")
    for key in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"):
        if env.get(key) != db_env.get(key):
            errors.append(f"{key} difiere entre backend y database")
    if not (env.get("CLERK_SECRET_KEY") or "").startswith("sk_live_"):
        errors.append("CLERK_SECRET_KEY debe corresponder a producción; no cambiarla sin revisar la instancia")
    if env.get("POSTGRES_HOST") != "database" or str(env.get("POSTGRES_PORT")) != "5432":
        errors.append("El backend debe conectar a database:5432")
    origins = [item.strip() for item in (env.get("ALLOWED_ORIGINS") or "").split(",") if item.strip()]
    if "https://supermercado.leacastro.dev" not in origins:
        errors.append("ALLOWED_ORIGINS no incluye el frontend de producción")
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.path
                or parsed.query or parsed.fragment or parsed.username or parsed.password
                or parsed.hostname in ("localhost", "127.0.0.1", "::1") or "*" in origin):
            errors.append("ALLOWED_ORIGINS contiene un origen incompatible con producción")
            break
    if nginx_env.get("API_SERVER_NAME") != "api.supermercado.leacastro.dev":
        errors.append("API_SERVER_NAME debe ser api.supermercado.leacastro.dev")
    email = certbot_env.get("LETSENCRYPT_EMAIL") or ""
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or email.endswith("@example.com"):
        errors.append("Completar LETSENCRYPT_EMAIL con un correo real de contacto")
    if database.get("ports"):
        errors.append("database no debe publicar puertos")
    for port in backend.get("ports", []):
        if not isinstance(port, dict) or port.get("host_ip") != "127.0.0.1":
            errors.append("backend no debe publicar puertos fuera de loopback")
    mounts = database.get("volumes", [])
    if not any(isinstance(m, dict) and m.get("type") == "volume"
               and m.get("source") == "postgres_data"
               and m.get("target") == "/var/lib/postgresql/data" for m in mounts):
        errors.append("El montaje de postgres_data no coincide con el esperado")
    return errors


if __name__ == "__main__":
    try:
        problems = validate(json.load(sys.stdin))
    except (ValueError, TypeError, AttributeError):
        # No mostrar excepciones que puedan incorporar fragmentos del JSON.
        print("ERROR: configuración Compose inválida", file=sys.stderr)
        sys.exit(1)
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        sys.exit(1)
    print("OK: configuración de producción, CORS, red y variables requeridas; secretos omitidos")
