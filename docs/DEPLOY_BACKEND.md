# Backend en un VPS Ubuntu 24.04

## Configuración

Ejecutar desde el directorio actual del proyecto en el VPS, conservando el nombre
original del proyecto Compose y sus opciones -p/COMPOSE_PROJECT_NAME si se usaron.
Cambiar ese nombre puede seleccionar otro volumen vacío. No agregar `name:` al
volumen ni cambiar su montaje. No usar `down -v`, `volume rm` ni `volume prune`.

El backend contiene app/main.py, rutas en app/api, modelos SQLAlchemy en
app/models y servicios de importación, exportación y PDF en app/services.
requirements.txt fija las dependencias: FastAPI/Uvicorn, SQLAlchemy/psycopg2,
Clerk, pandas/openpyxl y bibliotecas PDF. La imagen instala ese archivo sin cambios.

No reemplazar el .env existente por .env.example. Conservar POSTGRES_DB,
POSTGRES_USER y POSTGRES_PASSWORD correspondientes a la base actual. Proveer
CLERK_SECRET_KEY y ALLOWED_ORIGINS (orígenes HTTPS del frontend separados por coma)
en el entorno del proceso Compose o configurarlos manualmente en el VPS.
Las claves Clerk del frontend y backend deben pertenecer a la misma aplicación.
Para valores literales con $ o #, usar comillas simples en archivos .env.

Compose pasa credenciales como campos separados. POSTGRES_HOST=database y POSTGRES_PORT=5432
prevalecen sobre DATABASE_URL; SQLAlchemy URL.create admite caracteres especiales
sin codificar la contraseña. Fuera de Docker sigue funcionando DATABASE_URL.
El .env no entra en el contexto de construcción ni se carga dentro de la imagen.

## Aplicación de los cambios (Bash en el VPS)

Actualizar primero los archivos del repositorio con el mecanismo habitual, sin
sobrescribir .env. Los comandos asumen que database ya está funcionando; si no
aparece el contenedor anterior, detener el procedimiento y localizar el proyecto
original antes de ejecutar up. No crear una base nueva para resolver esa ausencia.

```bash
cd /opt/apps/supermercado
git pull origin main
set -euo pipefail
# Validación silenciosa: no imprime los secretos interpolados.
docker compose config --quiet
previous_db=$(docker compose ps -q database)
test -n "$previous_db"
previous_volume=$(docker inspect "$previous_db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
test -n "$previous_volume"
docker volume inspect "$previous_volume" --format '{{.Name}}'
# Comprobar ANTES de up que Compose reutilizará exactamente el volumen anterior.
expected_volume=$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["volumes"]["postgres_data"]["name"])')
test "$previous_volume" = "$expected_volume"

# Respaldo lógico con el contenedor anterior, antes de cualquier cambio de esquema.
umask 077
mkdir -p backups
backup_file="backups/postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
test -s "$backup_file"
docker compose exec -T database pg_restore --list < "$backup_file" > /dev/null
# Copiar este respaldo fuera del VPS y verificar su restauración antes del deploy.

docker compose build --pull backend
docker compose up -d --wait --wait-timeout 180 database backend
current_db=$(docker compose ps -q database)
current_volume=$(docker inspect "$current_db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
test "$previous_volume" = "$current_volume"
docker compose ps
for service in database backend; do
  docker inspect "$(docker compose ps -q "$service")" --format '{{.Name}} {{.State.Health.Status}}'
done
curl --fail http://127.0.0.1:8000/health
```

El volumen conserva exactamente la clave `postgres_data` y el montaje
`/var/lib/postgresql/data`. Se recreará el contenedor database para retirar el
puerto publicado, con una breve interrupción. Cambiar POSTGRES_PASSWORD no cambia
la contraseña dentro de una base ya inicializada.

## Comprobación de PostgreSQL y FastAPI

```bash
# Debe devolver {} o null, sin HostPort para 5432.
docker inspect "$(docker compose ps -q database)" --format '{{json .HostConfig.PortBindings}}'
# No debe mostrar listeners en 5432/5433 (investigar otros servicios si aparecen).
sudo ss -lntp '( sport = :5432 or sport = :5433 )'

# Desde backend, usando el mismo motor que FastAPI, sin imprimir credenciales.
docker compose exec -T backend python - <<'PY'
from sqlalchemy import text
from app.database import engine
assert engine.url.host == "database"
assert engine.url.port == 5432
with engine.connect() as connection:
    assert connection.execute(text("SELECT 1")).scalar_one() == 1
print("OK: backend conecta a database:5432")
PY
```

Desde otra máquina, ejecutar `nmap -Pn -p 5432,5433 IP_PUBLICA_DEL_VPS`:
ninguno debe figurar como open. Repetir con `nmap -6` si el VPS tiene IPv6 pública.
Un `5432/tcp` sin flecha de publicación en `docker compose ps` es metadato de la
imagen, no un puerto publicado. El healthcheck pg_isready comprueba disponibilidad,
no las credenciales del backend; SELECT 1 comprueba la conexión autenticada.
`/health` solo comprueba el proceso, no consulta la base de datos.

## Puntos a revisar

- Configurar un proxy HTTPS en el host hacia 127.0.0.1:8000. Sin ese proxy, la API
  solo es accesible desde el VPS. El frontend no fue modificado.
- app.main ejecuta initialize_database al importar: crea tablas y agrega columnas.
  Hacer respaldo y revisar compatibilidad del esquema antes de arrancar. Se usa un
  único proceso Uvicorn para evitar DDL concurrente durante este arranque.
- Revisar las migraciones existentes antes de aplicar cualquiera manualmente;
  no se ejecutan scripts destructivos ni migraciones SQL automáticamente aquí.
- No publicar PostgreSQL mediante archivos Compose adicionales o reglas externas.
- Verificar build en el VPS: los paquetes están fijados, pero la imagen base usa
  un tag actualizable. Registrar el digest de una imagen probada para rollback.
- `restart: unless-stopped` reinicia procesos que terminan; un estado unhealthy
  por sí solo no reinicia el contenedor. Configurar monitoreo y respaldos externos.

Referencias: [dependencias y healthchecks](https://docs.docker.com/compose/how-tos/startup-order/),
[nombre del proyecto](https://docs.docker.com/compose/how-tos/project-name/) y
[conexiones SQLAlchemy](https://docs.sqlalchemy.org/en/21/core/engines.html).

## Validación realizada en el entorno de trabajo

- 8 tests relevantes de configuración aprobados con Python 3.13 y
  PYTHON_DOTENV_DISABLED=1, sin cargar .env ni conectar con una base.
- git diff --check sin errores de whitespace.
- .env, backend/.env, claves SSH comunes y backups ignorados por Git;
  ningún .env real rastreado. Los patrones no protegen archivos ya rastreados,
  git add -f ni secretos con nombres arbitrarios.
- docker compose --env-file .env.example -f docker-compose.yml config --quiet
  aprobado con valores ficticios, sin leer el .env real.
- Build Linux y comprobación SELECT 1 pendientes en el VPS.

Se mantiene python:3.13-slim-bookworm: instala requirements.txt en /app y
copia app/, scripts/ y migrations/; ejecuta Uvicorn sin reload como UID 10001.
No hay evidencia que justifique bajar a 3.12: las versiones fijadas de
[NumPy](https://pypi.org/project/numpy/2.5.1/) y
[pandas](https://pypi.org/project/pandas/3.0.5/) ofrecen soporte para 3.13.
La compatibilidad de todas las dependencias en Linux debe confirmarse con el build.
PYTHON_DOTENV_DISABLED=1 es una opción de python-dotenv fijada en la imagen;
no requiere configuración adicional del operador.
