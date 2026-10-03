# Backend en un VPS Ubuntu 24.04

Para el despliegue actual de `api.supermercado.leacastro.dev`, seguir
[VPS COMMANDS](VPS_COMMANDS.md): incluye la auditoría, la secuencia completa,
resultados esperados y diagnóstico por falla. Esa secuencia arranca el contenedor
PostgreSQL existente sin recrearlo y sólo verifica backups existentes. El bloque
general de respaldo de esta guía se conserva como referencia, no forma parte de
la secuencia actual solicitada.

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
Antes del primer despliegue con nginx, completar «Nginx y HTTPS» y su bootstrap
contra el backend actual saludable. Si todavía no hay backend saludable, ejecutar
el respaldo y las comprobaciones de volumen de este bloque, levantar únicamente
`database backend`, ejecutar el bootstrap y luego levantar también `nginx certbot`.

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
docker compose up -d --wait --wait-timeout 180 database backend nginx certbot
current_db=$(docker compose ps -q database)
current_volume=$(docker inspect "$current_db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')
test "$previous_volume" = "$current_volume"
docker compose ps
for service in database backend; do
  docker inspect "$(docker compose ps -q "$service")" --format '{{.Name}} {{.State.Health.Status}}'
done
curl --fail http://127.0.0.1:8000/health
# Resolver nuevamente backend tras una posible recreación y cargar el certificado.
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
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

## Nginx y HTTPS

El frontend conserva `VITE_API_URL=https://api.supermercado.leacastro.dev`. Nginx publica
la raíz del subdominio: `/products`, `/labels/*` y los demás paths llegan intactos
a FastAPI, sin prefijo `/api`. Authorization, OPTIONS y CORS quedan a cargo de
FastAPI; nginx no agrega headers CORS ni cachea respuestas. El límite de carga
es 25 MiB (incluye multipart), con respuesta 413 para cargas mayores; los tiempos
de envío/lectura son 300 s entre operaciones, no un límite total del trabajo PDF.
Los buffers admiten headers grandes, aunque un header que exceda 64 KiB puede
seguir produciendo 502. No se comprimen PDFs.

### Requisitos y configuración

1. Crear el registro A de `api.supermercado.leacastro.dev` dirigido a la IPv4 pública del VPS.
   Si se publica AAAA, debe apuntar a una IPv6 operativa del mismo VPS; corregir
   o retirar registros obsoletos antes de emitir. El script avisa sobre diferencias
   entre DNS e IP pública (consulta api64.ipify.org); la emisión exige DNS correcto.
2. Abrir TCP 80/443 en el firewall del proveedor y en UFW:
   `sudo ufw allow 80/tcp` y `sudo ufw allow 443/tcp`. No publicar 8000 ni 5432.
   Verificar también las reglas de Docker, que pueden eludir reglas de UFW.
3. Comprobar `sudo ss -lntp '( sport = :80 or sport = :443 )'`: no debe haber
   otros procesos escuchando. En ejecuciones posteriores se permite el nginx
   del mismo proyecto. Se necesitan Bash, Docker Compose v2 con `--wait`, curl,
   openssl, getent, ss y flock en Ubuntu. El bootstrap instala openssl dentro
   del contenedor Certbot si falta: requiere acceso a los repositorios Alpine.
4. Completar manualmente el `.env` existente, sin reemplazar credenciales:

   ```dotenv
   API_SERVER_NAME=api.supermercado.leacastro.dev
   LETSENCRYPT_EMAIL=admin@TU-DOMINIO.com
   ALLOWED_ORIGINS=https://supermercado.leacastro.dev
   ```

   ALLOWED_ORIGINS debe incluir el dominio de Vercel sin barra final; separar
   varios orígenes por comas. También se valida el `azp` de Clerk. Las dos
   variables del bootstrap admiten valores literales con comillas, sin expansión
   de otras variables. El script lee solamente esas claves y no imprime secretos.

### Bootstrap y despliegue

Conservar siempre el directorio `/opt/apps/supermercado` y el nombre original
del proyecto. Si se usa `COMPOSE_PROJECT_NAME`, exportarlo antes; si antes se usó
`-p`, exportar ese mismo valor como `COMPOSE_PROJECT_NAME` para el script y cron.
Ejecutar el bootstrap como root porque Certbot escribe archivos propiedad de root:

```bash
cd /opt/apps/supermercado
sudo --preserve-env=COMPOSE_PROJECT_NAME bash scripts/init-letsencrypt.sh --staging
sudo --preserve-env=COMPOSE_PROJECT_NAME bash scripts/init-letsencrypt.sh
```

La primera ejecución crea un dummy de un día con OpenSSL dentro de Certbot y
arranca sólo nginx contra el backend existente saludable. Staging prueba el
desafío HTTP y guarda su certificado en `certbot/conf/staging`, sin instalarlo:
HTTPS todavía presenta el dummy, no confiable. La segunda ejecución emite el
certificado real, elimina el dummy y recarga nginx. No dejar el VPS en staging.
Ante un fallo de emisión se restaura el enlace al dummy para permitir reintentar.
El desafío HTTP permanece accesible en 80; el resto redirige a HTTPS con 301.

Un certificado real vigente hace que el script termine sin reemitir; `--force`
permite reemisión explícita (sujeta a límites de Let's Encrypt). Para repetir el
ensayo con un certificado real existente, usar `--staging --force`: queda aislado.
Después del bootstrap, ejecutar el bloque «Aplicación de los cambios», que incluye
el respaldo, la verificación del volumen y `database backend nginx certbot`.
Los certificados y desafíos son directorios bind ignorados por Git.

Uvicorn usa un único proceso con `--proxy-headers --forwarded-allow-ips '*'`.
Se confía en la red Compose y en los procesos locales del VPS: 8000 sólo se
publica en 127.0.0.1 y nginx es la entrada pública. No incorporar contenedores no
confiables a esa red ni ampliar la publicación de 8000. No se cambia la red de
database ni se introduce una subnet fija. Nginx fija Host, X-Real-IP y
X-Forwarded-Proto y agrega su salto a X-Forwarded-For.

### Renovación, recarga y rollback

Certbot intenta `renew --webroot -w /var/www/certbot --quiet` cada 12 horas.
Instalar esta entrada con `sudo crontab -e` para probar y recargar nginx cada
6 horas, sin montar el socket Docker en ningún contenedor. Si el proyecto usa
un nombre explícito, anteponer `COMPOSE_PROJECT_NAME=nombre-original` a **ambos**
comandos Compose. Usar la ruta real de Docker (`command -v docker`) si difiere:

```cron
0 */6 * * * cd /opt/apps/supermercado && /usr/bin/docker compose exec -T nginx nginx -t && /usr/bin/docker compose exec -T nginx nginx -s reload
```

La recarga carga certificados nuevos y vuelve a resolver la IP interna del backend.
Revisar `docker compose logs certbot nginx` y monitorear expiración; un fallo de
renovación se informa en logs y se reintenta en el siguiente ciclo. Probar:

```bash
docker compose run --rm --no-deps --entrypoint certbot certbot renew --dry-run --webroot -w /var/www/certbot
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
```

Para rollback del proxy: `docker compose stop nginx certbot`. Deshabilitar también
la entrada cron mientras estén detenidos. Esto interrumpe HTTPS público; conserva
database, su volumen y el backend accesible por loopback. No usar `down -v`,
`volume rm` ni `prune`. Conservar copias seguras de `certbot/conf` fuera de Git.

### Verificación desde el VPS y otra máquina

```bash
curl -I http://api.supermercado.leacastro.dev/health
# 301 hacia HTTPS.
curl -fsS https://api.supermercado.leacastro.dev/health
# {"status":"ok"}, certificado confiable (sin -k).
docker compose exec nginx nginx -t
curl -i -X OPTIONS https://api.supermercado.leacastro.dev/products -H "Origin: https://supermercado.leacastro.dev" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
# 200 y UN solo Access-Control-Allow-Origin con el origen del frontend.
curl -i https://api.supermercado.leacastro.dev/products
# 401 sin token: auth sigue activa detrás del proxy.
```

El healthcheck de nginx consulta un listener sólo de loopback dentro del contenedor
en 8080: comprueba el proceso sin DNS externo. `/health` conserva el proxy al backend
pero no escribe access log. Hosts desconocidos reciben 444 en HTTP y rechazo de
handshake en HTTPS. Referencias: [proxy nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html),
[TLS nginx](https://nginx.org/en/docs/http/ngx_http_ssl_module.html) y
[Certbot y renovación](https://eff-certbot.readthedocs.io/en/stable/using.html).

## Puntos a revisar

- Completar «Nginx y HTTPS», incluido el bootstrap y cron de recarga del proxy.
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

- 11 tests de configuración y auth aprobados con Python 3.13,
  PYTHON_DOTENV_DISABLED=1 y CLERK_SECRET_KEY ficticia, sin cargar .env ni
  conectar con una base. El comando sin clave falla durante la colección de
  test_auth.py; no se cambió la lógica para evitar ese requisito.
- git diff --check sin errores de whitespace.
- bash -n scripts/init-letsencrypt.sh aprobado y finales LF comprobados.
  ShellCheck no está disponible en este entorno.
- .env, backend/.env, claves SSH comunes y backups ignorados por Git;
  ningún .env real rastreado. Los patrones no protegen archivos ya rastreados,
  git add -f ni secretos con nombres arbitrarios.
- docker compose --env-file .env.example -f docker-compose.yml config --quiet
  pendiente: Docker no está disponible en este entorno. Tampoco se pudo ejecutar
  nginx -t dentro de la imagen ni probar bootstrap/emisión/renovación reales.
- Servicio database y bloque de respaldo comparados con HEAD: sin cambios.
- Build Linux y comprobación SELECT 1 pendientes en el VPS.

Validar Compose con el comando anterior y el template en un contenedor descartable
(certificado temporal dentro del contenedor, sin montar certificados o volúmenes
existentes, sin publicar puertos). Este comando usa el envsubst nativo de la imagen:

```bash
docker run --rm --add-host backend:127.0.0.1 \
  -e API_SERVER_NAME=api.example.com -e 'NGINX_ENVSUBST_FILTER=^API_SERVER_NAME$' \
  --mount "type=bind,src=$PWD/nginx/templates,dst=/etc/nginx/templates,readonly" \
  --entrypoint /bin/sh nginx:1.28-alpine -ec '
    apk add --no-cache openssl
    mkdir -p /etc/letsencrypt/live/api.example.com
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/api.example.com/privkey.pem \
      -out /etc/letsencrypt/live/api.example.com/fullchain.pem -subj /CN=api.example.com
    /docker-entrypoint.sh nginx -t
  '
```

Se mantiene python:3.13-slim-bookworm: instala requirements.txt en /app y
copia app/, scripts/ y migrations/; ejecuta Uvicorn sin reload como UID 10001.
No hay evidencia que justifique bajar a 3.12: las versiones fijadas de
[NumPy](https://pypi.org/project/numpy/2.5.1/) y
[pandas](https://pypi.org/project/pandas/3.0.5/) ofrecen soporte para 3.13.
La compatibilidad de todas las dependencias en Linux debe confirmarse con el build.
PYTHON_DOTENV_DISABLED=1 es una opción de python-dotenv fijada en la imagen;
no requiere configuración adicional del operador.
