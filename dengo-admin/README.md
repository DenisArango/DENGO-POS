# dengo-admin — consola de clientes

Panel del proveedor para dar de alta y administrar clientes de DENGO POS en el servidor: base de datos, carpeta y `.env`, tablas, administrador, proceso pm2, dominio en Caddy, módulos, IA, FEL (Digifact), suspensión, respaldos, migración de datos y despliegues.

Corre en el mismo servidor que los clientes, escucha solo en `127.0.0.1:4900`, y se entra por túnel SSH.

## Instalación en el servidor (una sola vez)

Los comandos asumen el usuario `deploy` y la raíz `~/dengo` (con `app/`, `clients/` y `backups/`, como hoy).

```bash
# 1. Código y compilación (el repo ya está en ~/dengo/app)
cd ~/dengo/app && git pull
cd dengo-admin && npm install && npm run build

# 2. Carpetas del panel
mkdir -p ~/dengo/admin ~/dengo/caddy ~/dengo/backups

# 3. Su .env (parte de .env.example)
cp ~/dengo/app/dengo-admin/.env.example ~/dengo/admin/.env
chmod 600 ~/dengo/admin/.env
npm run hash-password -- 'una-clave-larga-para-el-panel'   # pega la línea en ADMIN_PASSWORD_HASH
openssl rand -hex 32                                       # pégalo en SESSION_SECRET
nano ~/dengo/admin/.env
```

En el `.env` del panel llena:

| Variable | Qué va |
|---|---|
| `DENGO_ROOT` | `/home/deploy/dengo` |
| `SERVER_IP` | IP pública del servidor (se compara con el DNS de cada dominio) |
| `PG_ADMIN_URL` | Un rol con permiso para crear bases. Lo más simple: el mismo usuario de las bases de los clientes, con `sudo -u postgres psql -c 'ALTER ROLE <usuario> CREATEDB'` |
| `DB_APP_USER` / `DB_APP_PASSWORD` / `DB_HOST` / `DB_PORT` | El usuario que va dentro del `DATABASE_URL` de cada cliente (el mismo que usa Variedades Dayana) |
| `ANTHROPIC_API_KEY` | La clave única de IA |
| `DIGIFACT_USER` / `DIGIFACT_PASSWORD` | Tu usuario de API de Digifact |

```bash
# 4. Caddy: que importe los bloques que escribe el panel (al final del Caddyfile)
echo 'import /home/deploy/dengo/caddy/*.caddy' | sudo tee -a /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy

# 5. Permiso para validar y recargar Caddy sin contraseña (y nada más)
sudo visudo -f /etc/sudoers.d/dengo-admin
#   deploy ALL=(root) NOPASSWD: /usr/bin/caddy validate --config /etc/caddy/Caddyfile, /usr/bin/systemctl reload caddy

# 6. Arrancarlo
cd ~/dengo/admin
pm2 start ~/dengo/app/dengo-admin/dist/index.js --name dengo-admin --cwd ~/dengo/admin
pm2 save
```

La pantalla **Servidor** del panel revisa cada uno de estos puntos y muestra el comando exacto de lo que falte.

## Entrar

Desde tu computadora:

```bash
ssh -L 4900:127.0.0.1:4900 deploy@<ip-del-servidor>
```

y abre <http://localhost:4900>. Para darle dominio propio más adelante, basta un bloque de Caddy con `reverse_proxy 127.0.0.1:4900`.

## Actualizar el panel

El botón **Desplegar** actualiza a los clientes, no al panel. Para actualizar el panel:

```bash
cd ~/dengo/app/dengo-admin && npm install && npm run build && pm2 restart dengo-admin
```

## Lo que hay que saber

- **Variedades Dayana** aparece sola: el panel lee `clients/*/.env`. Su Caddy sigue en el Caddyfile principal (se ve como «Caddy a mano»). Guarda su ficha desde el panel para completarla.
- **El próximo despliegue** se va a detener en `prisma db push` por el índice único nuevo de `SALES.FEL_ACCESS_NUMBER` (lo agrega el commit de FEL). Revisa el log y repite marcando «Aceptar avisos de Prisma»: los respaldos se hacen antes.
- **Suspender** necesita que el backend del cliente ya tenga la versión con `SUSPENDED` en la licencia: despliega primero.
- Nada se borra: archivar detiene procesos y quita el dominio, pero conserva base, carpeta y respaldos.
- Las contraseñas (administrador inicial, empleados migrados) se muestran una sola vez al terminar el trabajo y no se guardan en el log.

## Migración de datos

- **Plantilla DENGO** (se descarga desde el panel): hojas Sucursales, Categorias, Productos, Inventario, Clientes, Proveedores y Empleados, más fotos en un `.zip` nombradas por SKU o código de barras. La definición está en `dengo-backend/scripts/plantilla-spec.ts`, y el importador en `dengo-backend/scripts/import-plantilla.ts`.
- **Loyverse**: los archivos de exportación tal cual, un lote por sucursal.
- **Avances Guatemala u otro sistema**: trae su exportación a una sesión con Claude y se convierte a la plantilla DENGO.

Siempre se revisa primero (dry-run). La importación real hace un respaldo antes y nunca duplica: repetirla solo actualiza las cantidades de inventario.

## Desarrollo local (Windows)

```bash
cd dengo-admin
cp .env.example .env   # ADMIN_MODE=simulate, DENGO_ROOT=./sandbox, APP_DIR=c:/denis/DENGO-POS, PG_* al Postgres local
npm run dev            # API en :4900 y UI en :5190
npm test
```

En modo **simulate**, la base de datos, `prisma db push`, el seed y los importadores corren de verdad contra el Postgres local; pm2, Caddy, sudo, git y npm solo se registran en el log. Hay pruebas de punta a punta en `server/scripts/e2e-*.ts`.
