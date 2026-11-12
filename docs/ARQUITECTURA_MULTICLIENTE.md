# Arquitectura multicliente: código compartido, una base por cliente

Guía para montar un sistema web con varios clientes en un mismo servidor, cada uno con sus datos aislados. Viene de cómo corre DENGO POS en producción, pero está escrita para replicarla en cualquier proyecto con:

- un backend Node (API),
- un frontend SPA (React/Vite u otro),
- opcionalmente, un sitio web con render en el servidor,
- PostgreSQL.

---

## 1. La idea en una frase

**Un solo código, compilado una vez. Por cada cliente: un proceso backend, una base de datos y un dominio.** Un único Caddy entrega el frontend como archivos estáticos y manda `/api` de cada dominio al backend del cliente que corresponde.

```
                         ┌──────────────────────── SERVIDOR ─────────────────────────┐
                         │                                                           │
 pos.clienteA.com ──┐    │  Caddy (1 servicio del sistema, HTTPS automático)         │
 pos.clienteB.com ──┼──► │   ├─ /api/*  de clienteA → 127.0.0.1:3001                 │
 clienteA.com     ──┘    │   ├─ /api/*  de clienteB → 127.0.0.1:3002                 │
                         │   ├─ lo demás de pos.*   → archivos de frontend/dist      │
                         │   └─ clienteA.com        → 127.0.0.1:4401 (sitio web)     │
                         │                                                           │
                         │  pm2                                                      │
                         │   ├─ ClienteA       backend/dist  cwd=clients/ClienteA    │──► BD cliente_a
                         │   ├─ ClienteB       backend/dist  cwd=clients/ClienteB    │──► BD cliente_b
                         │   └─ ClienteA-web   web/dist      → API 127.0.0.1:3001    │
                         │                                                           │
                         │  PostgreSQL (1 servidor, 1 base por cliente)              │
                         └───────────────────────────────────────────────────────────┘
```

| Pieza | Cuántas | Qué es |
|---|---|---|
| Caddy | **1** para todo el servidor | Servicio del sistema (`systemctl`). Un bloque por dominio en `/etc/caddy/Caddyfile`. |
| Frontend (SPA) | **0 procesos** | Archivos estáticos en una sola carpeta `dist/` que comparten todos. Los sirve Caddy. |
| Backend | **1 proceso pm2 por cliente** | El mismo `dist/` para todos. Cada uno arranca en la carpeta de su cliente y lee el `.env` de ahí (base, puerto, secretos). |
| Sitio web (SSR) | **1 proceso pm2 por cliente que lo tenga** | Mismo código, configurado por variables de entorno o por datos de la base del cliente. |
| PostgreSQL | **1 servidor** | Una base por cliente dentro. |

---

## 2. Estructura de carpetas en el servidor

```
~/<proyecto>/
├── app/                       ← el repo (git pull). Se compila UNA vez.
│   ├── backend/dist/
│   ├── frontend/dist/
│   └── web/dist/              (opcional)
├── clients/
│   ├── ClienteA/.env          ← lo único propio de cada cliente
│   └── ClienteB/.env
├── backups/                   ← pg_dump por cliente antes de cada despliegue
└── monitor.env                ← configuración del monitor (Telegram)
```

`.env` de un cliente (ejemplo):

```dotenv
NODE_ENV=production
PORT=3001                       # único por cliente
HOST=127.0.0.1                  # solo accesible a través de Caddy
DATABASE_URL=postgresql://usuario:clave@localhost:5432/cliente_a?schema=public
JWT_SECRET=<distinto-por-cliente>
LOG_LEVEL=warn
```

---

## 3. Requisitos del código para que esto funcione

Son las condiciones que el proyecto nuevo tiene que cumplir desde el principio.

### Backend
1. **Toda la configuración sale del entorno.** El backend lee el `.env` del directorio de trabajo (`process.cwd()`), no de la carpeta del código. Así el mismo `dist/` sirve a todos y cada proceso pm2 apunta a su cliente con su `cwd`.
2. **Nada específico de un cliente en el código.** Nombre, logo, módulos activos y licencia viven en la base del cliente (por ejemplo, una tabla de configuración) o en su `.env`.
3. **Escucha en `127.0.0.1`.** Solo Caddy habla con él.
4. **Tiene `GET /api/health`** con `{ status, uptime }`. El monitor y el frontend lo usan para saber si está vivo y si se reinició.
5. **Las listas nunca devuelven columnas pesadas.** Imágenes en base64, archivos o textos largos se excluyen por defecto (en Prisma, `omit` global) y se sirven por su propia ruta cacheable (`GET /api/items/:id/image?v=<updatedAt>`). Una sola lista con fotos incrustadas puede llenar la RAM del servidor y tumbar a todos los clientes.
6. **Las migraciones solo agregan.** Columnas nuevas opcionales o con valor por defecto, tablas nuevas. Así se pueden aplicar con el backend viejo todavía corriendo.

### Frontend (SPA)
1. **La URL de la API es relativa.** Se compila con `VITE_API_URL=` vacío y llama a `/api/...` en el mismo dominio desde donde se abrió. Ese es el truco que permite **una sola compilación para todos los clientes**: el dominio decide el cliente y Caddy decide el backend.
2. **Los datos del cliente se piden en tiempo de ejecución.** Nombre, logo, colores y permisos llegan del backend después de cargar, nunca se compilan dentro.
3. **Es PWA (service worker).** Después de la primera visita los archivos salen del dispositivo, así que el servidor casi no recibe tráfico de front. Los archivos llevan hash en el nombre (Vite lo hace solo): se cachean para siempre, y una versión nueva tiene nombres nuevos.

### Sitio web con render en el servidor (opcional)
- Corre como proceso propio por cliente (`HOST=127.0.0.1 PORT=44xx API=http://127.0.0.1:<puerto-backend>`).
- Le pide los datos al backend del cliente por loopback.
- Si el backend arma URLs absolutas (por ejemplo, de imágenes), para pedidos que llegan por `127.0.0.1` debe devolverlas **relativas**. Si no, el visitante recibe enlaces a `http://127.0.0.1` que no le sirven.

---

## 4. Caddy

Un solo archivo, un bloque por dominio:

```caddy
# POS / app del cliente A
pos.clienteA.com {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:3001
	}
	handle {
		root * /home/deploy/<proyecto>/app/frontend/dist
		try_files {path} /index.html
		file_server
	}
}

# Sitio web del cliente A (opcional)
clienteA.com, www.clienteA.com {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:3001
	}
	handle {
		reverse_proxy 127.0.0.1:4401
	}
}

# Cliente B: igual que A; solo cambian el dominio y el puerto del backend
pos.clienteB.com {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:3002
	}
	handle {
		root * /home/deploy/<proyecto>/app/frontend/dist
		try_files {path} /index.html
		file_server
	}
}
```

Para aplicar cambios:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

- **`reload`** aplica la configuración sin cortar las conexiones activas.
- **HTTPS:** Caddy saca y renueva solo el certificado de cada dominio. El dominio solo tiene que apuntar (registro A) a la IP del servidor.
- **`try_files … /index.html`:** hace que las rutas internas de la SPA (`/ventas`, `/inventario`) funcionen al recargar la página.

---

## 5. Alta de un cliente nuevo

```bash
NOMBRE=ClienteB
PUERTO=3002                       # el siguiente libre:  ss -ltn | grep 30
BASE=cliente_b
APP=~/<proyecto>/app

# 1. Base de datos
sudo -u postgres createdb "$BASE"            # o CREATE DATABASE dentro de psql

# 2. Su .env
mkdir -p ~/<proyecto>/clients/$NOMBRE
cp ~/<proyecto>/clients/ClienteA/.env ~/<proyecto>/clients/$NOMBRE/.env
nano ~/<proyecto>/clients/$NOMBRE/.env       # cambia PORT, DATABASE_URL y JWT_SECRET (¡nuevo!)

# 3. Tablas (+ datos iniciales si hay seed)
( cd $APP/backend && set -a && . ~/<proyecto>/clients/$NOMBRE/.env && set +a && npx prisma db push )

# 4. Proceso
cd ~/<proyecto>/clients/$NOMBRE
pm2 start $APP/backend/dist/index.js --name "$NOMBRE"
pm2 save

# 5. Probar
curl -s http://127.0.0.1:$PUERTO/api/health

# 6. Caddy: agrega su bloque (sección 4) y recarga
```

Con varios clientes, conviene convertir estos pasos en un script `nuevo-cliente.sh <Nombre> <puerto> <dominio>`.

---

## 6. Despliegue de una versión nueva (a todos los clientes a la vez)

El orden importa:

```bash
cd ~/<proyecto>/app && git pull

# 1. Respaldo de CADA base
for env in ~/<proyecto>/clients/*/.env; do
  n=$(basename "$(dirname "$env")")
  url=$(grep -E '^DATABASE_URL=' "$env" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
  pg_dump "$url" --no-owner | gzip > ~/<proyecto>/backups/$n-$(date +%Y%m%d-%H%M).sql.gz
done

# 2. Esquema nuevo en CADA base, ANTES de compilar
#    (agregar tablas no molesta al backend viejo que sigue corriendo)
cd backend && npm install
for env in ~/<proyecto>/clients/*/.env; do
  ( set -a && . "$env" && set +a && npx prisma db push --skip-generate )
done
npx prisma generate          # sin esto, el código nuevo no conoce las tablas nuevas → 500

# 3. Compilar una vez
npm run build
cd ../frontend && npm install && npm run build

# 4. Reiniciar todos los procesos
pm2 restart all && pm2 save
```

Errores típicos:
- **Olvidar el `db push` en una de las bases:** ese cliente da 500 en las rutas nuevas.
- **Olvidar `prisma generate`:** el backend no arranca, o falla en todo lo nuevo.

---

## 7. Monitoreo

Un script de Node sin dependencias (`scripts/monitor-servidor.mjs` en DENGO) corre con cron cada minuto y avisa por Telegram de:

- un proceso pm2 caído, o un reinicio (con la causa, por ejemplo OOM, y el final del log de errores);
- un proceso usando más memoria del límite;
- `/api/health` de cada backend que no responde (el puerto lo lee del `.env` en el `cwd` de cada proceso);
- poca RAM disponible en el servidor, disco lleno o carga alta.

Avisa una vez, repite cada N minutos si sigue el problema y manda «Resuelto» cuando pasa.

```cron
* * * * * /usr/bin/node /home/deploy/<proyecto>/app/scripts/monitor-servidor.mjs >> /home/deploy/<proyecto>/monitor.log 2>&1
```

Además, los logs del backend en producción están en `warn`, con etiquetas fáciles de buscar con grep (`lenta`, `abortada`, `bloqueo`). El frontend guarda un registro de fallos de conexión y lo envía al backend cuando vuelve la conexión.

---

## 8. Dónde está el límite y cómo crecer

**Lo que no se satura:**
- **Caddy:** entrega archivos estáticos y hace proxy. Aguanta miles de peticiones por segundo.
- **El frontend:** con el service worker, cada dispositivo lo baja una vez por versión.

**Lo que crece con cada cliente:**
- **Procesos backend:** cada uno usa unos 150–300 MB en reposo, más con datos grandes. Todos comparten la RAM del servidor, que es **el primer límite**.
- **Conexiones a PostgreSQL:** cada backend abre su propio pool. Hay que vigilar `max_connections`, o ajustar el pool de cada uno con `connection_limit` en la `DATABASE_URL`.
- **Disco:** bases y respaldos.

**Cómo crecer, en orden:**
1. Subir la RAM y los CPU del servidor.
2. Llevar PostgreSQL a su propia máquina o a un servicio gestionado.
3. Repartir clientes entre varios servidores de app: cada uno con el mismo código, su Caddy y sus clientes. El DNS de cada dominio apunta al servidor donde vive ese cliente.

---

## 9. Por qué este modelo y no otro

| | **Este modelo** (código compartido, base por cliente) | Una sola app y una sola base para todos (multitenant con `tenant_id`) | Todo separado por cliente (un servidor o contenedor completo cada uno) |
|---|---|---|---|
| Aislamiento de datos | Total: bases distintas | Depende de no olvidar nunca el filtro `tenant_id` | Total |
| Respaldo y restauración de un cliente | Simple: `pg_dump` de su base | Complejo: hay que extraer sus filas | Simple |
| Si un cliente tumba su proceso | Los demás siguen (salvo que se acabe la RAM del servidor) | Se caen todos | Los demás siguen |
| Desplegar una versión | Un build; `db push` en cada base | Un build, una migración | N despliegues |
| RAM por cliente | Un proceso Node cada uno | La más baja | La más alta |
| Adecuado para | Decenas de clientes, PYMES, datos sensibles | Cientos o miles de clientes pequeños, SaaS masivo | Pocos clientes grandes con exigencias propias |

**Reglas de oro para replicarlo:**
1. El frontend no sabe quién es el cliente: llama a `/api` relativo, y el dominio decide.
2. El backend no sabe quién es el cliente: lo dice el `.env` de su `cwd`.
3. Nada pesado en las listas; los archivos van por su propia ruta cacheable.
4. Migraciones que solo agregan, aplicadas a todas las bases antes de compilar.
5. Respaldo de todas las bases antes de cada despliegue.
6. Monitor con alertas desde el primer día.
