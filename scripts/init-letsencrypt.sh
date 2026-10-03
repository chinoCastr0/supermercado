#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
umask 077

staging=false
force=false
for arg in "$@"; do
    case "$arg" in
        --staging) staging=true ;;
        --force) force=true ;;
        *) echo "Uso: bash scripts/init-letsencrypt.sh [--staging] [--force]" >&2; exit 2 ;;
    esac
done
for dependency in docker openssl curl getent ss flock; do
    command -v "$dependency" >/dev/null || { echo "Falta $dependency" >&2; exit 1; }
done
[[ -f .env ]] || { echo 'Falta .env en la raíz' >&2; exit 1; }
# No ejecutar/sourcear el .env: sólo aceptar estas dos claves, sin interpolación.
API_SERVER_NAME=
LETSENCRYPT_EMAIL=
while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?(API_SERVER_NAME|LETSENCRYPT_EMAIL)[[:space:]]*=(.*)$ ]]; then
        key=${BASH_REMATCH[2]}
        value=${BASH_REMATCH[3]}
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [[ "$value" =~ ^\"([^\"]*)\"[[:space:]]*(#.*)?$ ]]; then
            value=${BASH_REMATCH[1]}
        elif [[ "$value" =~ ^\'([^\']*)\'[[:space:]]*(#.*)?$ ]]; then
            value=${BASH_REMATCH[1]}
        else
            value=${value%%[[:space:]]#*}
            value="${value%"${value##*[![:space:]]}"}"
        fi
        printf -v "$key" '%s' "$value"
    fi
done < .env
[[ "$API_SERVER_NAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$API_SERVER_NAME" == *.* && "$API_SERVER_NAME" != *..* ]] || {
    echo 'API_SERVER_NAME debe ser un nombre DNS, sin esquema ni ruta' >&2; exit 1;
}
[[ "$LETSENCRYPT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
    echo 'Definir LETSENCRYPT_EMAIL con un correo válido' >&2; exit 1;
}
export API_SERVER_NAME LETSENCRYPT_EMAIL
compose=(docker compose)
"${compose[@]}" config --quiet
live="certbot/conf/live/$API_SERVER_NAME"
renewal="certbot/conf/renewal/$API_SERVER_NAME.conf"
if ! "$force" && [[ -f "$renewal" && -f "$live/fullchain.pem" && -f "$live/cert.pem" && -f "$live/chain.pem" && -f "$live/privkey.pem" ]] &&
    openssl verify -verify_hostname "$API_SERVER_NAME" -untrusted "$live/chain.pem" \
      "$live/cert.pem" >/dev/null 2>&1; then
    echo 'Ya existe un certificado real vigente; sin cambios. Usar --force para reemitir.'
    exit 0
fi
mkdir -p certbot/conf certbot/www
chmod 755 certbot/www
exec 9>certbot/conf/.bootstrap.lock
flock -n 9 || { echo 'Ya hay otro bootstrap en curso' >&2; exit 1; }

# Aviso DNS: comprobar ambas familias si el VPS tiene conectividad pública.
for family in 4 6; do
    public_ip=$(curl -"$family" -fsS --connect-timeout 5 --max-time 10 https://api64.ipify.org || true)
    [[ -n "$public_ip" ]] || { echo "AVISO: no se pudo consultar la IPv$family pública" >&2; continue; }
    dns=$(getent "ahostsv$family" "$API_SERVER_NAME" | awk '{print $1}' | sort -u || true)
    if ! grep -Fxq "$public_ip" <<< "$dns"; then
        echo "AVISO: DNS IPv$family de $API_SERVER_NAME no coincide con la IP pública del VPS" >&2
    fi
done

# Permitir únicamente los puertos ya publicados por nginx de ESTE proyecto.
nginx_id=$("${compose[@]}" ps -q nginx)
for port in 80 443; do
    listeners=$(ss -H -lntp "sport = :$port")
    owners=$(docker ps --filter "publish=$port" --format '{{.ID}}')
    for owner in $owners; do
        [[ -n "$nginx_id" && "$nginx_id" == "$owner"* ]] || {
            echo "Puerto $port ocupado por otro contenedor" >&2; exit 1;
        }
    done
    if [[ -n "$listeners" ]]; then
        [[ -n "$owners" && -n "$nginx_id" ]] || { echo "Puerto $port ocupado; revisar sudo ss -lntp" >&2; exit 1; }
        if grep 'users:' <<< "$listeners" | grep -Ev '"(docker-proxy|dockerd)"' >/dev/null; then
            echo "Otro proceso escucha en $port; revisar sudo ss -lntp" >&2; exit 1
        fi
    fi
done
backend_id=$("${compose[@]}" ps -q backend)
[[ -n "$backend_id" && $(docker inspect "$backend_id" --format '{{.State.Health.Status}}') == healthy ]] || {
    echo 'Se requiere backend saludable. Realizar respaldo y despliegue del backend antes del bootstrap.' >&2; exit 1;
}

dummy=false
restore_dummy() {
    if "$dummy" && [[ ! -e "$live" && ! -L "$live" ]]; then
        ln -s "../bootstrap/$API_SERVER_NAME" "$live"
    fi
}
trap restore_dummy EXIT
if [[ ! -f "$live/fullchain.pem" ]]; then
    # OpenSSL se ejecuta dentro de certbot; instalarlo allí si la imagen no lo trae.
    "${compose[@]}" run --rm --no-deps --entrypoint /bin/sh certbot -ec '
        command -v openssl >/dev/null || apk add --no-cache openssl
        mkdir -p "/etc/letsencrypt/bootstrap/$1" /etc/letsencrypt/live
        openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
          -keyout "/etc/letsencrypt/bootstrap/$1/privkey.pem" \
          -out "/etc/letsencrypt/bootstrap/$1/fullchain.pem" -subj "/CN=$1"
    ' sh "$API_SERVER_NAME"
    [[ ! -e "$live" && ! -L "$live" ]] || { echo 'Ruta de certificado incompleta; revisar manualmente' >&2; exit 1; }
    ln -s "../bootstrap/$API_SERVER_NAME" "$live"
fi
if [[ -L "$live" && $(readlink "$live") == "../bootstrap/$API_SERVER_NAME" ]]; then
    dummy=true
fi
# No arrancar/recrear database ni backend (su import ejecuta DDL).
"${compose[@]}" up -d --no-deps --wait --wait-timeout 120 nginx
# El backend puede haberse recreado: volver a resolver su dirección interna.
"${compose[@]}" exec -T nginx nginx -t
"${compose[@]}" exec -T nginx nginx -s reload
args=(certonly --webroot -w /var/www/certbot --cert-name "$API_SERVER_NAME"
      -d "$API_SERVER_NAME" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive)
if "$staging"; then
    # Staging aislado: nunca sustituye el certificado de producción.
    args+=(--staging --config-dir /etc/letsencrypt/staging)
elif "$dummy"; then
    # nginx mantiene el dummy en memoria; liberar sólo nuestro enlace para Certbot.
    unlink "$live"
fi
"$force" && args+=(--force-renewal)
"${compose[@]}" run --rm --no-deps --entrypoint certbot certbot "${args[@]}"
if "$staging"; then
    echo 'Staging validado. Ejecutar ahora sin --staging para emitir el certificado real.'
else
    "${compose[@]}" exec -T nginx nginx -t
    "${compose[@]}" exec -T nginx nginx -s reload
    if "$dummy"; then
        rm -f -- "certbot/conf/bootstrap/$API_SERVER_NAME/fullchain.pem" "certbot/conf/bootstrap/$API_SERVER_NAME/privkey.pem"
        rmdir -- "certbot/conf/bootstrap/$API_SERVER_NAME"
    fi
    echo 'Certificado real instalado y nginx recargado.'
fi
