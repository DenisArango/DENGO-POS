#!/usr/bin/env bash
# Writes ~/dengo/admin/.env for dengo-admin (or rewrites it), on the server:
#   bash ~/dengo/app/dengo-admin/scripts/setup-env.sh
# - asks for the panel password (hidden; never on screen or in the history)
# - creates the Postgres role dengo_admin (CREATEDB CREATEROLE) or resets its password
# - takes the Anthropic key from an existing client's .env; Digifact stays empty
# - keeps Digifact credentials and the Anthropic key if the .env already had them
set -euo pipefail

ROOT="$HOME/dengo"
APP="$ROOT/app/dengo-admin"
ENVF="$ROOT/admin/.env"
mkdir -p "$ROOT/admin" "$ROOT/caddy" "$ROOT/backups"

old() { [ -f "$ENVF" ] && grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d "\"'" || true; }

# 1. Panel password → bcrypt hash
while :; do
  read -r -s -p "Clave para entrar al panel (mínimo 10 caracteres): " PW; echo
  [ "${#PW}" -ge 10 ] || { echo "  Muy corta, otra vez."; continue; }
  read -r -s -p "Repítela: " PW2; echo
  [ "$PW" = "$PW2" ] && break
  echo "  No coinciden, otra vez."
done
HASH="$(cd "$APP" && npx tsx server/scripts/hash-password.ts "$PW" | cut -d= -f2-)"
unset PW PW2
[[ "$HASH" == \$2* ]] || { echo "No se pudo generar el hash de la clave"; exit 1; }

# 2. The panel's Postgres role, with a fresh random password
PGPW="$(openssl rand -hex 24)"
if sudo -u postgres psql -XtAc "SELECT 1 FROM pg_roles WHERE rolname='dengo_admin'" | grep -q 1; then
  sudo -u postgres psql -Xqc "ALTER ROLE dengo_admin LOGIN PASSWORD '$PGPW' CREATEDB CREATEROLE"
  echo "  Rol dengo_admin: clave nueva"
else
  sudo -u postgres psql -Xqc "CREATE ROLE dengo_admin LOGIN PASSWORD '$PGPW' CREATEDB CREATEROLE"
  echo "  Rol dengo_admin creado"
fi

# 3. Public IPv4 (domains point A records at it)
IP="$(curl -4 -s --max-time 10 https://ifconfig.me || true)"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No pude saber la IPv4 pública; ponla luego en SERVER_IP"; IP=""; }

AKEY="$(old ANTHROPIC_API_KEY)"
[ -n "$AKEY" ] || AKEY="$(grep -hE '^ANTHROPIC_API_KEY=.+' "$ROOT"/clients/*/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" || true)"

umask 077
cat > "$ENVF" <<EOF
# dengo-admin — escrito por scripts/setup-env.sh el $(date +%F)
ADMIN_MODE=real
PORT=4900
HOST=127.0.0.1
ADMIN_PASSWORD_HASH='$HASH'
SESSION_SECRET=$(openssl rand -hex 32)
DENGO_ROOT=$ROOT
SERVER_IP=$IP
PG_ADMIN_URL=postgresql://dengo_admin:$PGPW@localhost:5432/postgres
DB_HOST=localhost
DB_PORT=5432
ANTHROPIC_API_KEY=$AKEY
DIGIFACT_USER=$(old DIGIFACT_USER)
DIGIFACT_PASSWORD=$(old DIGIFACT_PASSWORD)
EOF
chmod 600 "$ENVF"
unset HASH PGPW AKEY

# 4. Check: the role can log in with the URL just written, and has the powers the panel needs
URL="$(grep -E '^PG_ADMIN_URL=' "$ENVF" | cut -d= -f2-)"
if psql "$URL" -XtAc "SELECT rolcreatedb AND rolcreaterole FROM pg_roles WHERE rolname = current_user" | grep -q t; then
  echo "  Conexión del panel a Postgres: OK"
else
  echo "  ¡La conexión del panel a Postgres falló! Revisa PG_ADMIN_URL"; exit 1
fi
unset URL
echo
echo "Listo: $ENVF"
grep -E '^(ADMIN_MODE|PORT|HOST|DENGO_ROOT|SERVER_IP|DB_HOST|DB_PORT)=' "$ENVF"
for k in ADMIN_PASSWORD_HASH SESSION_SECRET PG_ADMIN_URL ANTHROPIC_API_KEY DIGIFACT_USER; do
  if grep -qE "^$k=.+" "$ENVF"; then echo "  $k: puesto"; else echo "  $k: vacío"; fi
done
