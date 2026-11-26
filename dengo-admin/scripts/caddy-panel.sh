#!/usr/bin/env bash
# Publishes dengo-admin on its own domain through Caddy, on the server:
#   bash ~/dengo/app/dengo-admin/scripts/caddy-panel.sh admin.dengogt.com
# - checks that the domain points at this server (A record, Cloudflare «DNS only»)
# - asks for a SECOND user/password (Caddy basic auth) that the browser asks before the
#   panel's own login: the panel is never reachable from the internet with one password alone
# - appends the block to /etc/caddy/Caddyfile (backup first), validates, reloads;
#   if validation fails the Caddyfile is put back and nothing is reloaded
set -euo pipefail

DOMAIN="${1:?Uso: bash caddy-panel.sh admin.tudominio.com}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "Dominio inválido: $DOMAIN"; exit 1; }
CF=/etc/caddy/Caddyfile

if grep -qE "^[[:space:]]*$DOMAIN[[:space:]]*\{" "$CF"; then
  echo "$DOMAIN ya está en $CF; no se cambia nada."; exit 1
fi

IP="$(grep -E '^SERVER_IP=' "$HOME/dengo/admin/.env" | cut -d= -f2-)"
DNS="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}')"
echo "DNS $DOMAIN → ${DNS:-sin registro} (servidor $IP)"
[ -n "$DNS" ] && [ "$DNS" = "$IP" ] || { echo "El dominio todavía no apunta a este servidor (¿nube naranja en Cloudflare?)."; exit 1; }

read -r -p "Usuario para la primera puerta (ej. denis): " U
[[ "$U" =~ ^[A-Za-z0-9._-]{3,32}$ ]] || { echo "Usuario inválido (3-32 letras, números, . _ -)"; exit 1; }
echo "Clave para esa primera puerta (distinta a la del panel):"
H="$(caddy hash-password)"
[[ "$H" == \$2* ]] || { echo "No se pudo generar el hash"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M)"
sudo cp "$CF" "$CF.antes-$DOMAIN-$STAMP"
printf '\n# dengo-admin (consola del proveedor) — escrito por caddy-panel.sh el %s\n%s {\n\tencode zstd gzip\n\tbasicauth {\n\t\t%s %s\n\t}\n\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\tX-Frame-Options DENY\n\t\tX-Content-Type-Options nosniff\n\t\tReferrer-Policy no-referrer\n\t\tX-Robots-Tag "noindex, nofollow"\n\t}\n\treverse_proxy 127.0.0.1:4900\n}\n' \
  "$(date +%F)" "$DOMAIN" "$U" "$H" | sudo tee -a "$CF" >/dev/null
unset H

if sudo caddy validate --config "$CF" >/dev/null 2>&1; then
  sudo systemctl reload caddy
  echo "Listo. Caddy recargado; el certificado HTTPS se saca solo en unos segundos."
  sleep 8
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || true)"
  echo "https://$DOMAIN/api/health → $code (401 = pide la primera clave: correcto)"
else
  sudo cp "$CF.antes-$DOMAIN-$STAMP" "$CF"
  echo "Caddy rechazó la configuración; se dejó el Caddyfile como estaba. Error:"
  sudo caddy validate --config "$CF" 2>&1 | tail -3
  exit 1
fi
