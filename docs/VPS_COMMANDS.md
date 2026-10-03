# VPS COMMANDS

Objetivo: `https://api.supermercado.leacastro.dev`, VPS `149.34.226.101`, frontend
`https://supermercado.leacastro.dev`. Ejecutar con Bash en Ubuntu 24.04.

Acceso SSH: `ssh -p 5422 chino@149.34.226.101`.

## Auditoría y condición previa

Despliegue completado el 2026-10-03: API pública disponible mediante HTTPS.
La infraestructura se publicó inicialmente en `main` mediante `bff8c24` y el VPS
se actualizó. No transferir `.env`, `tmp/`, backups ni certificados desde la PC.
Las credenciales no se imprimieron ni se versionaron.

La causa de la falta de acceso público era que nginx/Certbot no estaban desplegados.
PostgreSQL y backend estaban saludables; 80/443 estaban libres y permitidos en UFW.
Además, ALLOWED_ORIGINS conservaba el dominio viejo de Vercel y la clave Clerk
del backend no era live. Se actualizaron las variables públicas del dominio y
el correo autorizado; el administrador configuró personalmente la clave live
en el VPS. El verificador de producción pasó después de esa actualización.

Se recreó únicamente backend y se agregaron nginx y Certbot. El contenedor y
volumen PostgreSQL conservaron su identidad, el conteo de productos no cambió
y los tres dumps existentes conservaron sus hashes tras verificarlos con pg_restore.
Backend y nginx están saludables; Certbot está en ejecución.

DNS A comprobado: `149.34.226.101`, sin AAAA publicado. Se emitió el certificado
real después del ensayo de staging, válido hasta 2027-01-01. La renovación
simulada pasó. Desde fuera del VPS se verificaron HTTP 301, HTTPS /health 200,
/products sin token o con token malformado 401 y preflight del frontend 200 con
un único Access-Control-Allow-Origin. Un origen ajeno devuelve 400 sin ese header.
Los redirects del backend conservan HTTPS y nginx rechaza Host/SNI desconocidos.
Queda por probar una sesión real del usuario desde el frontend.

Arquitectura revisada: nginx proxy a `http://backend:8000` sin reescritura;
backend conecta a `database:5432` por la red Compose, usando POSTGRES_DB/USER/PASSWORD
y URL.create. DATABASE_URL es alternativa local, no la seleccionada en Compose.
Uvicorn escucha en `0.0.0.0:8000` **del contenedor**, con un proceso y headers del
proxy habilitados. El host publica 8000 únicamente en 127.0.0.1; PostgreSQL no
publica puertos. Los HTTP/localhost restantes corresponden a checks internos y
defaults de desarrollo, no a destinos públicos de producción.

FastAPI obtiene CLERK_SECRET_KEY y ALLOWED_ORIGINS del entorno. Clerk también
valida los orígenes como `azp`; una clave ausente impide importar auth. El Dockerfile
deshabilita dotenv. CORS permite credenciales, con lista explícita de orígenes.
El frontend usa VITE_API_URL; no fue modificado. Confirmar en Vercel que conserva
`https://api.supermercado.leacastro.dev` y su clave pública de producción.

Conservar el nombre original de Compose. Si se usó `-p` o COMPOSE_PROJECT_NAME,
exportar ese mismo nombre antes de los comandos. No adivinar otro nombre si no
aparece database. Los comandos se detienen si falta el contenedor/volumen previo.
No crear una base vacía como solución. Docker Compose v2 debe soportar `--wait`.

## VPS COMMANDS

Ejecutar los bloques en orden en la misma sesión. Si falla una prueba, detenerse
y usar la tabla de diagnóstico. Se necesita Docker accesible al usuario SSH,
Python 3, curl, openssl, getent, ss, sha256sum y flock.

```bash
# 1–2. Entrar y actualizar (los cambios locales deben estar publicados previamente).
cd /opt/apps/supermercado
git pull --ff-only
set -euo pipefail
test -f nginx/templates/default.conf.template
test -f scripts/check-deploy-config.py
bash -n scripts/init-letsencrypt.sh

# 3. Verificar .env y configuración efectiva, sin volcar secretos en terminal.
# No usar cat .env, source .env ni docker compose config sin --quiet/filtro.
test -f .env
docker compose --env-file .env config --quiet
docker compose --env-file .env config --format json | python3 scripts/check-deploy-config.py

# 4. DNS: todas las A deben ser 149.34.226.101.
getent ahostsv4 api.supermercado.leacastro.dev | awk '{print $1}' | sort -u
test "$(getent ahostsv4 api.supermercado.leacastro.dev | awk '{print $1}' | sort -u)" = '149.34.226.101'
# Si está instalado dig, revisar también AAAA: ninguno o IPv6 operativa de ESTE VPS.
if command -v dig >/dev/null; then dig +short AAAA api.supermercado.leacastro.dev; fi

# 5. Puertos: libres antes del bootstrap, o únicamente nginx de este proyecto.
sudo ss -lntp '( sport = :80 or sport = :443 )'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ufw status verbose
# Si faltan reglas, habilitar sólo los puertos requeridos (sin activar/resetear UFW):
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Abrir también TCP 80/443 en el firewall del proveedor, para las IP publicadas.

# 6. Compose completo validado silenciosamente.
docker compose config --quiet

# Proteger la identidad del contenedor y volumen ANTES de cualquier arranque.
previous_db=$(docker compose ps -a -q database)
test -n "$previous_db"
previous_volume=$(docker inspect "$previous_db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
test -n "$previous_volume"
docker volume inspect "$previous_volume" --format '{{.Name}}'
expected_volume=$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["volumes"]["postgres_data"]["name"])')
test "$previous_volume" = "$expected_volume"
# También el contenedor existente debe tener 5432 sin publicación.
docker inspect "$previous_db" --format '{{json .HostConfig.PortBindings}}' | python3 -c 'import json,sys; assert not any((json.load(sys.stdin) or {}).values()), "database publica puertos: detener y revisar"'

# 7a. Arrancar SÓLO el contenedor PostgreSQL ya existente; no recrearlo ni crear volumen.
docker compose start --wait --wait-timeout 180 database

# Verificar los dumps existentes sin escribir, reemplazar ni crear backups.
# Debe existir un respaldo reciente y adecuado al esquema antes de arrancar backend.
shopt -s nullglob
dumps=(backups/*.dump)
test "${#dumps[@]}" -gt 0
for dump in "${dumps[@]}"; do
  test -s "$dump"
  before=$(sha256sum -- "$dump")
  docker compose exec -T database pg_restore --list < "$dump" > /dev/null
  test "$before" = "$(sha256sum -- "$dump")"
  stat --format='Backup verificado: %n, fecha %y, bytes %s' "$dump"
done
# Si faltan backups, son antiguos o falla pg_restore, DETENERSE; no sobrescribirlos.
# La lista del dump valida su lectura, no sustituye una prueba de restauración aislada.

# 7b. Backend: puede recrearse, sin arrancar/recrear sus dependencias.
docker compose build --pull backend
docker compose up -d --no-deps --wait --wait-timeout 180 backend
test "$previous_db" = "$(docker compose ps -a -q database)"
current_volume=$(docker inspect "$previous_db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
test "$previous_volume" = "$current_volume"

# 8. Health INTERNO: no depende de publicar 8000 en el host.
docker compose exec -T backend python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=5).read().decode())'
# Esperado: {"status":"ok"}. Verificar además conexión real a PostgreSQL, sin DDL.
docker compose exec -T backend python - <<'PY'
try:
    from sqlalchemy import text
    from app.database import engine
    assert engine.url.host == "database" and engine.url.port == 5432
    with engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1
    print("OK: conexión autenticada a database:5432")
except Exception as error:
    print("ERROR de conexión/configuración PostgreSQL:", type(error).__name__)
    raise SystemExit(1)
PY

# 9. Bootstrap: staging aislado y después emisión real. Conserva certificados válidos.
sudo --preserve-env=COMPOSE_PROJECT_NAME bash scripts/init-letsencrypt.sh --staging
sudo --preserve-env=COMPOSE_PROJECT_NAME bash scripts/init-letsencrypt.sh

# 10–11. Arrancar proxy/renovador, sin tocar database ni backend.
docker compose up -d --no-deps --wait --wait-timeout 120 nginx certbot
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
docker compose ps -a
# database/backend/nginx: running (healthy); certbot: running, sin healthcheck.

# 12. Logs recientes; revisar localmente errores sin compartir credenciales.
docker compose logs --since 10m --tail 80 database backend nginx certbot

# 13. HTTP: 301 y Location https://api.supermercado.leacastro.dev/health.
curl --connect-timeout 10 --max-time 20 -I http://api.supermercado.leacastro.dev/health
# 14. HTTPS: 200 y {"status":"ok"}, sin -k.
curl --connect-timeout 10 --max-time 20 -fsS https://api.supermercado.leacastro.dev/health
# 15. Endpoint protegido sin token: 401. No usar --fail para esta prueba.
curl --connect-timeout 10 --max-time 20 -i https://api.supermercado.leacastro.dev/products
# 16. Preflight: 200 y UN solo Access-Control-Allow-Origin con el frontend exacto.
curl --connect-timeout 10 --max-time 20 -i -X OPTIONS https://api.supermercado.leacastro.dev/products \
  -H 'Origin: https://supermercado.leacastro.dev' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
```

Repetir las últimas cuatro pruebas desde otra máquina: una comprobación local
no demuestra que el firewall del proveedor permita conexiones externas.
Para probar una sesión real, iniciar sesión en el frontend y verificar en Network
que GET `/products` devuelve 200. No hace falta copiar el token a la terminal.
El 401 sin token confirma la protección, no valida por sí solo la instancia Clerk.

Si el verificador del paso 3 falla, editar **únicamente** los campos públicos del
`.env` existente con `sudoedit .env`, conservando claves y contraseñas:
API_SERVER_NAME=`api.supermercado.leacastro.dev`,
ALLOWED_ORIGINS=`https://supermercado.leacastro.dev`, LETSENCRYPT_EMAIL=correo real
del administrador (no se conoce; no se inventó). Mantener POSTGRES_DB/USER/PASSWORD
y CLERK_SECRET_KEY actuales. El nombre real de CORS es ALLOWED_ORIGINS, no CORS_ORIGINS.

### Renovación imprescindible

Certbot renueva cada 12 h. Este VPS ya tiene la recarga cada 6 h instalada en
`/etc/cron.d/supermercado-nginx-reload`, con usuario root y `-p supermercado`.
El servicio cron está activo. No duplicarla en root crontab.

Para una instalación nueva, como alternativa a ese archivo, agregar con
`sudo crontab -e` una recarga cada 6 h:

```cron
0 */6 * * * cd /opt/apps/supermercado && /usr/bin/docker compose exec -T nginx nginx -t && /usr/bin/docker compose exec -T nginx nginx -s reload
```

Si hay nombre explícito de proyecto, usar ese mismo COMPOSE_PROJECT_NAME en ambos
comandos de cron. Confirmar la ruta con `command -v docker`. Probar renovación:

```bash
docker compose run --rm --no-deps --entrypoint certbot certbot renew --dry-run --webroot -w /var/www/certbot
```

## Si falla una prueba

Estos diagnósticos son de lectura; no ejecutan migraciones, eliminan certificados
ni recrean PostgreSQL. No imprimir `docker inspect` completo: contiene variables.

| Caso | Comando de diagnóstico | Resultado / siguiente paso |
| --- | --- | --- |
| Backend caído | `docker compose ps -a backend; docker compose logs --tail 100 backend` | exited/unhealthy o error de arranque; resolver antes de HTTPS. |
| Backend reiniciándose | `docker inspect "$(docker compose ps -a -q backend)" --format '{{.State.Status}} restarts={{.RestartCount}} exit={{.State.ExitCode}}'` | restarting o contador creciente; revisar traceback en logs. |
| PostgreSQL caído | `docker compose ps -a database; docker compose logs --tail 100 database` | Debe estar healthy; no crear otro proyecto/volumen. |
| Error de conexión PostgreSQL | Ejecutar el bloque SELECT 1 del paso 8 y `docker compose exec -T database sh -c 'pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` | pg_isready no verifica contraseña; SELECT 1 sí. Conservar credenciales del volumen existente. |
| Clerk falla al importar auth | `docker compose logs --tail 100 backend` y comando de import debajo | CLERK_SECRET_KEY ausente impide arranque. No rotar claves: revisar inyección y app/instancia. |
| Nginx caído | `docker compose ps -a nginx; docker compose logs --tail 100 nginx` | Errores de certificado, bind de puertos o upstream; resolver la causa. |
| Certificado inexistente | `sudo test -s certbot/conf/live/api.supermercado.leacastro.dev/fullchain.pem && echo PRESENTE` | Sin PRESENTE: completar bootstrap; no borrar directorios live/archive. |
| Certificado inválido | `curl -Iv --connect-timeout 10 --max-time 20 https://api.supermercado.leacastro.dev/health` | Error TLS: revisar SAN, emisor, fecha y cadena con los comandos siguientes; no ocultarlo con -k. |
| Puerto 80 ocupado | `sudo ss -lntp 'sport = :80'; docker ps --filter publish=80 --format '{{.Names}} {{.Ports}}'` | Identificar proceso propietario; no detener otros servicios a ciegas. |
| Puerto 443 ocupado | `sudo ss -lntp 'sport = :443'; docker ps --filter publish=443 --format '{{.Names}} {{.Ports}}'` | Igual; el nginx de este proyecto es válido. |
| Firewall bloqueando | `sudo ufw status verbose; sudo nft list ruleset` | Si curl local con --resolve funciona y externo no, revisar firewall del host/proveedor y ruta de red. |
| DNS incorrecto | `getent ahostsv4 api.supermercado.leacastro.dev; dig +short A api.supermercado.leacastro.dev; dig +short AAAA api.supermercado.leacastro.dev` | A debe ser 149.34.226.101; AAAA sólo si esa IPv6 sirve este stack. |
| Upstream incorrecto / 502 | `docker compose exec -T nginx wget -qO- http://backend:8000/health; docker compose exec -T nginx nginx -T` | Debe responder ok y mostrar proxy_pass http://backend:8000. Tras recrear backend: nginx -t y nginx -s reload. |
| CORS incorrecto | Repetir OPTIONS del paso 16 y `docker compose config --format json \| python3 scripts/check-deploy-config.py` | Esperado 200 y un solo allow-origin. Corregir ALLOWED_ORIGINS y recrear sólo backend con --no-deps; recargar nginx. |

Import de auth sin imprimir secretos ni ejecutar `app.main`/DDL, incluso si el
backend no consigue permanecer arrancado (requiere que la imagen esté construida):

```bash
docker compose run --rm --no-deps --entrypoint python backend -c '
try:
    import app.auth
    print("OK: auth importada; falta verificar sesión real desde frontend")
except Exception as error:
    print("ERROR importando auth:", type(error).__name__)
    raise SystemExit(1)
'
```

TLS y aislamiento del firewall, después del bootstrap real:

```bash
sudo openssl x509 -in certbot/conf/live/api.supermercado.leacastro.dev/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
curl --connect-timeout 10 --max-time 20 --resolve api.supermercado.leacastro.dev:443:127.0.0.1 -fsS https://api.supermercado.leacastro.dev/health
openssl s_client -connect api.supermercado.leacastro.dev:443 -servername api.supermercado.leacastro.dev -verify_hostname api.supermercado.leacastro.dev -verify_return_error </dev/null
# Esperado Verify return code: 0 (ok).
# Desde OTRA máquina, omitir DNS para aislarlo (mantiene validación TLS/SNI):
curl --connect-timeout 10 --max-time 20 --resolve api.supermercado.leacastro.dev:443:149.34.226.101 -fsS https://api.supermercado.leacastro.dev/health
# Host HTTP desconocido: conexión cerrada sin respuesta (444, curl suele devolver 52).
curl --connect-timeout 10 --max-time 20 -i http://149.34.226.101/health -H 'Host: desconocido.invalid'
```

Rollback del proxy: `docker compose stop nginx certbot`; deshabilitar su cron.
La base y backend siguen intactos. No usar down -v, volume rm, reset de migraciones
ni borrar archivos de PostgreSQL o certificados válidos.

Referencias: [Compose start](https://docs.docker.com/reference/cli/docker/compose/start/),
[Compose up y --no-deps](https://docs.docker.com/reference/cli/docker/compose/up/),
[Certbot webroot](https://eff-certbot.readthedocs.io/en/stable/using.html).

## Validaciones locales de esta entrega

- 121 tests del backend aprobados con PYTHON_DOTENV_DISABLED=1,
  CLERK_SECRET_KEY ficticia, POSTGRES_HOST vacío y DATABASE_URL=sqlite:///:memory:.
  Una advertencia de deprecación Starlette/httpx, sin fallos.
- 6 tests del verificador de configuración aprobados: producción, CORS, exposición
  de puertos, identidad del volumen y ausencia de secretos en los errores.
- `bash -n scripts/init-letsencrypt.sh` y `git diff --check` aprobados.
- Docker y ShellCheck ausentes en la PC. En el VPS se aprobaron Compose config
  con .env.example, nginx -t en nginx:1.28-alpine con certificado temporal,
  los 6 tests del verificador y el build Linux del backend. ShellCheck sigue ausente.
- En el VPS también pasaron Compose config y el verificador con la configuración
  efectiva, la emisión real de Let's Encrypt y el ensayo renew --dry-run.
  Se comprobaron health interno, SELECT 1, auth importada, HTTPS público, CORS,
  rechazos sin token/token inválido, Host/SNI desconocido y persistencia de la base.
- No se probó una sesión real del usuario de Clerk desde el frontend.
