#!/usr/bin/env bash
# Despliega el commit actual y activa la página web de Variedades Dayana.
# Correr en el servidor DESPUÉS de `cd ~/dengo/app && git pull`.
#
#   bash ~/dengo/app/scripts/dayana-web-activar.sh <dominio-de-la-pagina> [url-del-POS] [url-del-portal]
#
#   ej.: bash ~/dengo/app/scripts/dayana-web-activar.sh variedadesdayana.com https://pos.variedadesdayana.com
#
# Las URL del POS y del portal son para el botón «Ingresar» de la página: se guarda
# exactamente lo que se pase, y lo que no se pase queda vacío (esa puerta no aparece).
# El portal de maestros está apagado para Dayana: no pases su URL y no se compila
# (BUILD_PORTAL=1 bash … lo compila, para cuando se active).
#
# Qué hace, en orden (se detiene ante el primer error):
#   1. Respalda la base de CADA cliente de ~/dengo/clients/*/.env (pg_dump) en ~/dengo/backups/.
#   2. `prisma db push` en la base de cada cliente (el código es compartido: todos necesitan
#      las tablas nuevas). Va ANTES de compilar: agregar tablas y columnas no molesta al backend
#      que sigue corriendo, y así nunca queda código nuevo sobre una base vieja. El único aviso de
#      Prisma es por un índice único sobre una columna nueva y vacía (Sale.COUPON_ID), por eso
#      --accept-data-loss.
#   3. Compila backend y POS como siempre (npm install && npm run build); el portal solo con BUILD_PORTAL=1.
#   4. Carga los datos de la página de Dayana (SITE_CONFIG): diseño «dayana», publicada,
#      contacto, redes y SEO. Los textos, fotos y horarios van en el código (dengo-web).
#   5. Compila dengo-web y lo arranca en pm2 como «VariedadesDayana-web».
#   6. Reinicia los procesos de pm2 y prueba que la página responda.
#   7. Imprime el bloque de Caddy para el dominio (ese paso lo haces tú, con sudo).
set -euo pipefail

DOMAIN="${1:?Falta el dominio de la página. Uso: bash dayana-web-activar.sh variedadesdayana.com [url-POS] [url-portal]}"
POS_URL="${2:-}"
PORTAL_URL="${3:-}"
APP="$HOME/dengo/app"
CLIENTS="$HOME/dengo/clients"
DAYANA_ENV="$CLIENTS/VariedadesDayana/.env"
WEB_PORT="${WEB_PORT:-4401}"
WEB_NAME="VariedadesDayana-web"
BACKUPS="$HOME/dengo/backups"
STAMP="$(date +%Y%m%d-%H%M)"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$APP/dengo-web" ] || die "No encuentro $APP/dengo-web. ¿Corriste git pull en $APP?"
[ -f "$DAYANA_ENV" ] || die "No encuentro $DAYANA_ENV"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "dengo-web (Astro) necesita Node 22 o más nuevo; este servidor tiene $(node -v)."

# The database URL from a client's .env, without Prisma's ?schema=… (psql doesn't take it).
db_url() { local u; u="$(grep -E '^DATABASE_URL=' "$1" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"; printf '%s' "${u%%\?*}"; }
# psql / pg_dump from the system, or from a temporary Postgres image of the server's major version.
PGIMG=""
pg() {
  local tool="$1"; shift
  if command -v "$tool" >/dev/null 2>&1; then "$tool" "$@"
  else docker run --rm -i --network host "postgres:${PGIMG:-16}-alpine" "$tool" "$@"; fi
}

say "1/7 Respaldo de las bases"
mkdir -p "$BACKUPS"
ENVS=()
for env in "$CLIENTS"/*/.env; do
  [ -f "$env" ] || continue
  url="$(db_url "$env")"; [ -n "$url" ] || continue
  ENVS+=("$env")
  name="$(basename "$(dirname "$env")")"
  PGIMG="$(pg psql "$url" -X -tAc 'SHOW server_version' | cut -d. -f1 | tr -dc 0-9)"
  out="$BACKUPS/$name-$STAMP.sql.gz"
  pg pg_dump "$url" --no-owner | gzip > "$out"
  [ -s "$out" ] || die "El respaldo de $name salió vacío."
  echo "  $name → $out ($(du -h "$out" | cut -f1))"
done
[ ${#ENVS[@]} -gt 0 ] || die "No encontré ningún .env con DATABASE_URL en $CLIENTS"

say "2/7 Tablas nuevas (prisma db push) en cada cliente"
( cd "$APP/dengo-backend" && npm install --no-audit --no-fund )
for env in "${ENVS[@]}"; do
  echo "  $(basename "$(dirname "$env")")"
  # in its own shell, so the client's variables never leak into the builds
  ( cd "$APP/dengo-backend" && set -a && . "$env" && set +a && npx prisma db push --accept-data-loss --skip-generate )
done

say "3/7 Compilar backend y POS"
( cd "$APP/dengo-backend" && npm run build )
( cd "$APP/dengo-frontend" && npm install --no-audit --no-fund && npm run build )
if [ "${BUILD_PORTAL:-0}" = "1" ] && [ -d "$APP/dengo-portal" ]; then
  # a node_modules copied from Windows (it used to be in the repo) has no exec bits and Windows binaries
  if [ -d "$APP/dengo-portal/node_modules" ] && [ ! -x "$APP/dengo-portal/node_modules/.bin/tsc" ]; then rm -rf "$APP/dengo-portal/node_modules"; fi
  ( cd "$APP/dengo-portal" && npm install --no-audit --no-fund && npm run build )
fi

say "4/7 Datos de la página de Variedades Dayana"
DURL="$(db_url "$DAYANA_ENV")"
PGIMG="$(pg psql "$DURL" -X -tAc 'SHOW server_version' | cut -d. -f1 | tr -dc 0-9)"
pg psql "$DURL" -X -q -v ON_ERROR_STOP=1 -v url="https://$DOMAIN" -v pos="$POS_URL" -v portal="$PORTAL_URL" <<'SQL'
BEGIN;
-- the site needs the page switched on in the licence (it already is by default)
UPDATE "LICENSE_CONFIG" SET "PAGE_ENABLED" = true, "UPDATED_AT" = now() WHERE "PAGE_ENABLED" = false;

INSERT INTO "SITE_CONFIG" ("ID", "SITE", "THEME", "PUBLISHED", "CREATED_AT", "UPDATED_AT")
SELECT 'site' || substr(md5(random()::text), 1, 24), 'dayana', 'clasico', false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "SITE_CONFIG");

UPDATE "SITE_CONFIG" SET
  "SITE" = 'dayana',
  "PUBLISHED" = true,
  "PUBLIC_URL" = :'url',
  "POS_URL" = NULLIF(:'pos', ''),
  "PORTAL_URL" = NULLIF(:'portal', ''),
  "BUSINESS_NAME" = 'Variedades Dayana',
  "TAGLINE" = 'En servicio y calidad nadie nos gana',
  "WHATSAPP" = '5912 5855',
  "PHONE" = '5912 5855',
  "EMAIL" = 'variedadesdayana@hotmail.es',
  "INSTAGRAM" = 'https://www.instagram.com/variedades_dayana23/',
  "TIKTOK" = 'https://www.tiktok.com/@variedades_dayana15',
  "SEO_TITLE" = 'Variedades Dayana · Librería en Rabinal y Cubulco',
  "SEO_DESCRIPTION" = 'Útiles escolares y de oficina, Totto, Parker y Sheaffer, pinturas acrílicas, leyes y obras, y abarrotes. Cuatro tiendas en Rabinal y Cubulco, Baja Verapaz, desde 2010.',
  "UPDATED_AT" = now()
WHERE "ID" = (SELECT "ID" FROM "SITE_CONFIG" ORDER BY "CREATED_AT" LIMIT 1);
COMMIT;

SELECT "SITE" AS diseno, "PUBLISHED" AS publicada, "PUBLIC_URL" AS pagina, "POS_URL" AS pos, "PORTAL_URL" AS portal FROM "SITE_CONFIG" ORDER BY "CREATED_AT" LIMIT 1;
SELECT count(*) AS ofertas_vigentes FROM "PROMOTIONS" WHERE "IS_ACTIVE" = true;
SQL

say "5/7 Compilar y arrancar dengo-web"
API_PORT="$(grep -E '^PORT=' "$DAYANA_ENV" | head -1 | cut -d= -f2 | tr -dc 0-9)"; API_PORT="${API_PORT:-3001}"
if ss -ltn 2>/dev/null | grep -q ":$WEB_PORT " && ! pm2 describe "$WEB_NAME" >/dev/null 2>&1; then
  die "El puerto $WEB_PORT ya está ocupado por otro programa. Corre de nuevo con WEB_PORT=<otro> bash $0 $*"
fi
( cd "$APP/dengo-web" && npm install --no-audit --no-fund && npm run build )
pm2 delete "$WEB_NAME" >/dev/null 2>&1 || true
( cd "$APP/dengo-web" && HOST=127.0.0.1 PORT="$WEB_PORT" DENGO_API="http://127.0.0.1:$API_PORT" WEB_SITE=dayana \
    pm2 start dist/server/entry.mjs --name "$WEB_NAME" --update-env )

say "6/7 Reiniciar y probar"
pm2 restart all
pm2 save
sleep 4
code="$(curl -s -o /tmp/dayana-home.html -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/" || true)"
if [ "$code" = "200" ] && grep -q "Variedades Dayana" /tmp/dayana-home.html; then echo "  La página responde en 127.0.0.1:$WEB_PORT ✔"
else echo "  La página respondió $code. Revisa: pm2 logs $WEB_NAME --lines 40 --nostream"; fi
api="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/site/content" || true)"
echo "  Backend /api/site/content → $api (200 = bien)"

say "7/7 Falta: el dominio en Caddy (con sudo)"
cat <<CADDY
Agrega este bloque a /etc/caddy/Caddyfile:

$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:$API_PORT
	}
	handle {
		reverse_proxy 127.0.0.1:$WEB_PORT
	}
}

y luego:
  sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy

El dominio debe apuntar (registro A) a la IP de este servidor; Caddy saca el certificado solo.
Respaldo de las bases en: $BACKUPS/*-$STAMP.sql.gz
CADDY
