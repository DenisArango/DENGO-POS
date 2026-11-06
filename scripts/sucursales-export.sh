#!/usr/bin/env bash
# Exporta las sucursales de un cliente a CSV (solo lectura, no modifica nada).
#
# Uso, en el servidor:
#   bash sucursales-export.sh                       # Variedades Dayana
#   bash sucursales-export.sh ~/dengo/clients/<Cliente>/.env
#
# Deja el archivo sucursales.csv en la carpeta actual y lo muestra en pantalla.
set -euo pipefail

ENV_FILE="${1:-$HOME/dengo/clients/VariedadesDayana/.env}"
[ -f "$ENV_FILE" ] || { echo "No encuentro $ENV_FILE" >&2; exit 1; }

URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')
[ -n "$URL" ] || { echo "No hay DATABASE_URL en $ENV_FILE" >&2; exit 1; }
URL="${URL%%\?*}"   # psql no entiende ?schema=public de Prisma

SQL='COPY (
  SELECT "NAME" AS nombre, "CODE" AS codigo, "TYPE" AS tipo, "STATUS" AS estado,
         "ADDRESS" AS direccion, "CITY" AS municipio, "PHONE" AS telefono, "EMAIL" AS correo,
         "MANAGER" AS encargado, "OPEN_TIME" AS abre, "CLOSE_TIME" AS cierra,
         "COMPANY_NAME" AS razon_social, "COMPANY_TAX_ID" AS nit,
         "COMPANY_TAGLINE" AS eslogan, "COMPANY_WEBSITE" AS sitio_web, "SOCIAL_MEDIA_NAME" AS redes
  FROM "BRANCHES" ORDER BY "CREATED_AT"
) TO STDOUT WITH CSV HEADER'

if command -v psql >/dev/null 2>&1; then
  psql "$URL" -X -q -c "$SQL" > sucursales.csv
else
  # Sin psql instalado: usa la imagen oficial de Postgres de forma temporal.
  docker run --rm --network host postgres:16-alpine psql "$URL" -X -q -c "$SQL" > sucursales.csv
fi

echo "Listo: $(pwd)/sucursales.csv"
echo
cat sucursales.csv
