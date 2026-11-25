# Panel de admin de clientes (dengo-admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panel web en el servidor que da de alta y administra clientes de DENGO POS (base, .env, pm2, Caddy, módulos, IA, FEL Digifact, suspensión, migración, despliegues).

**Architecture:** Proyecto nuevo `dengo-admin` (Fastify + React en un solo paquete). Fuente de verdad = `~/dengo/clients/*/.env` + `cliente.json`. Un motor de pasos con deshacer ejecuta los trabajos y transmite el log por SSE. `ADMIN_MODE=simulate` permite desarrollarlo en Windows sin tocar nada real.

**Tech Stack:** Node 22+, TypeScript, Fastify 5, `pg`, `bcryptjs`, `xlsx`, `adm-zip`; React 19, Vite 6, Tailwind 3, `motion`, `lucide-react`, `sonner`; tests con `node:test` vía `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-panel-admin-clientes-design.md`

## Global Constraints

- Escucha en `127.0.0.1:4900`; acceso por túnel SSH. Sin dominio propio.
- POS en `pos.<dominio>`, web en `<dominio>, www.<dominio>`. Backend desde puerto 3001, web desde 4401.
- Digifact único certificador; `DIGIFACT_USER/PASSWORD` globales del panel; por cliente NIT, frases, FACT/FPEQ, establecimiento, test/production.
- Una `ANTHROPIC_API_KEY` global; por cliente `aiEnabled` + `aiMonthlyLimit`.
- Suspender = `423 { error: 'SUSPENDED' }` salvo `/api/license` y `/api/health`; pantalla «Servicio suspendido».
- Columnas nuevas solo agregan (opcionales o con default).
- Textos de interfaz en español. Estilo único: bento grid con volumen + animaciones, `prefers-reduced-motion` respetado.
- Commits cortos, sin atribución a Claude.

## Review Focus

- Alta que falla a mitad (p. ej. `db push` falla): se deshacen base, carpeta y pm2; no queda basura → test del motor `undo` en orden inverso.
- Nombre de cliente con espacios/acentos («Librería Él»): carpeta/pm2 en PascalCase ASCII, base en snake_case → test de `slugify`/`pascalName`.
- Puerto ocupado por un proceso ajeno o por otro cliente: el asignador salta ambos → test de `nextFreePort`.
- Caddy inválido tras escribir el bloque: se restaura el archivo previo y no se recarga → test con runner simulado.
- Excel de plantilla con filas incompletas o SKU repetido: errores por fila con número de fila de Excel → test de `validateTemplate`.

---

### Task 1: Suspensión en el backend

**Files:** Modify `dengo-backend/prisma/schema.prisma` (LicenseConfig), `dengo-backend/src/routes/license.ts`, `dengo-backend/src/index.ts`.

- [ ] Agregar `suspended Boolean @default(false) @map("SUSPENDED")` y `suspendedMessage String? @map("SUSPENDED_MESSAGE") @db.VarChar(300)`; `DEFAULT_LICENSE` con `suspended:false, suspendedMessage:null`; PUT acepta ambos.
- [ ] `getLicenseCached()` (TTL 15 s, invalidado en PUT) y hook `onRequest` global: si `suspended` y la URL no empieza por `/api/license` ni `/api/health` → 423.
- [ ] `npx prisma generate && npm run typecheck` pasa. Commit «Suspensión de cliente desde la licencia».

### Task 2: Pantalla «Servicio suspendido» en POS, portal y web

**Files:** `dengo-frontend/src/store/index.ts`, `App.tsx`, `lib/api.ts`, nuevo `components/SuspendedScreen.tsx`; equivalente en `dengo-portal`; `dengo-web/src/middleware.ts` + `core/Suspended.astro`.

- [ ] La licencia trae `suspended`; un 423 de la API la marca en el store; la app entera se reemplaza por la pantalla (mensaje personalizado si existe).
- [ ] dengo-web: si `/api/license` dice suspendido, responde 503 con la página.
- [ ] `npm run build` de frontend, portal y web pasa. Commit «Pantalla de servicio suspendido».

### Task 3: Esqueleto de dengo-admin + login

**Files:** `dengo-admin/package.json`, `tsconfig.json`, `server/{index,config,auth}.ts`, `web/` (Vite), `.env.example`, `scripts/hash-password.ts`.

**Produces:** `config: { root, clientsDir, caddyDir, backupsDir, appDir, mode: 'real'|'simulate', serverIp, pgAdminUrl, dbAppUser, dbAppPassword, globals: { anthropicKey, anthropicModel, digifactUser, digifactPassword } }`; cookie de sesión firmada `dadm` (12 h), `POST /api/login`, `POST /api/logout`, `GET /api/me`; todas las demás rutas `/api/*` requieren sesión; límite de 5 intentos/min.

- [ ] Test `auth.test.ts`: contraseña buena → cookie; mala → 401; sin cookie → 401 en `/api/clients`.
- [ ] Implementar; servir `web/dist` con fallback a `index.html`. Commit «dengo-admin: esqueleto y login».

### Task 4: Registro de clientes y lecturas

**Files:** `server/lib/{names,env-file,registry,ports,pm2,clientdb,dns}.ts`.

**Produces:**
- `pascalName(s): string` («Librería Él» → `LibreriaEl`), `dbName(s)` (→ `libreria_el`).
- `parseEnv(text): Record<string,string>`, `renderEnv(vars, comments?)`.
- `type ClientFile = { name, displayName, domain, apiPort, webPort?, web: boolean, contact?: {name,phone,email}, notes?, createdAt, archived?: boolean, caddy: 'managed'|'manual' }`; `listClients(): Promise<ClientSummary[]>` (infiere de `.env` si falta `cliente.json`), `readClient(name)`, `writeClientFile(name, ClientFile)`.
- `nextFreePort(start, taken: Set<number>, isListening:(p)=>Promise<boolean>)`.
- `pm2List(): Promise<Pm2Proc[]>` (`pm2 jlist`; simulado = datos fijos), `health(port)`.
- `withClientDb(env, fn)`; `clientMetrics(env)`: ventas y total de hoy, productos, usuarios, sucursales, uso IA del mes, tamaño de base, licencia.
- `checkDns(host, serverIp): Promise<{ ok, addresses }>`.
- [ ] Tests: `names`, `env-file` (ida y vuelta conserva comentarios), `nextFreePort` (salta tomados y escuchando), `listClients` sobre sandbox con un cliente sin `cliente.json`.
- [ ] Rutas `GET /api/clients`, `GET /api/clients/:name`, `GET /api/server` (RAM, disco, carga, preparación de Caddy/sudoers). Commit.

### Task 5: Motor de trabajos + SSE

**Files:** `server/jobs/{engine,shell}.ts`, ruta `server/routes/jobs.ts`.

**Produces:** `type Step = { id, title, run(ctx): Promise<void>, undo?(ctx): Promise<void> }`; `startJob(kind, client|null, steps, input): Job`; `ctx.log(line)`, `ctx.sh(cmd, args, opts)` (en simulate solo registra `$ cmd`); `Job { id, kind, client, status: 'running'|'ok'|'failed'|'rolled_back', steps: {id,title,status}[], lines }`; candado por cliente y global. `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/stream` (SSE: `line`, `step`, `done`). Historial en `~/dengo/admin/jobs/*.json`.
- [ ] Test: paso 3 falla → undo de 2 y 1 en ese orden, estado `rolled_back`; candado rechaza segundo trabajo del mismo cliente.
- [ ] Commit.

### Task 6: Alta de cliente

**Files:** `server/jobs/provision.ts`, `server/lib/caddy.ts`, ruta `POST /api/clients`.

**Input (zod):** `{ displayName, domain, contact, admin:{name,email,password?}, branches:[{name,code}] (≥1), modules:{pos,maestros,page,fel,ai}, aiMonthlyLimit|null, fel?:{nit,frases,docType:'FACT'|'FPEQ',establishment,env:'test'|'production',sellerName?}, web:boolean }`.
- [ ] `renderCaddyPos(domain, apiPort, frontendDist)`, `renderCaddyWeb(domain, apiPort, webPort)`; `applyCaddy(name, content)` = respaldo → escribir → `sudo -n caddy validate` → si falla restaurar y lanzar → `sudo -n systemctl reload caddy`. Test con shell simulado que falla en validate.
- [ ] Pasos del spec §Alta 1-11 con sus `undo`; contraseña admin generada si falta y devuelta una vez. DNS no apuntado = paso Caddy marcado «pendiente», no falla.
- [ ] Prueba en simulate: el log contiene `createdb`, `prisma db push`, `pm2 start`, bloque Caddy. Commit.

### Task 7: Operaciones sobre clientes

**Files:** `server/routes/client-ops.ts`, `server/jobs/{ops,deploy}.ts`.
- [ ] `PATCH /api/clients/:name/license` (módulos, IA, suspensión + mensaje) vía `pg`; `PATCH …/fel` (reescribe `DIGIFACT_*`/`FEL_*` del `.env` + `felEnabled`, reinicia); `PATCH …/profile` (cliente.json).
- [ ] Trabajos: reiniciar, respaldar (`pg_dump | gzip` a `backups/`), archivar (detener pm2, quitar Caddy, respaldo, `archived:true`), reactivar archivado, aplicar Caddy pendiente, propagar globales (IA/Digifact) a todos y reiniciar.
- [ ] `GET …/logs?lines=` (cola de `~/.pm2/logs/<name>-error.log` y out), `GET …/backups`, `GET /api/backups/:file` (descarga, nombre validado).
- [ ] Trabajo global «Desplegar versión»: git pull, respaldo de cada base, db push en cada una, generate, builds (backend, frontend, web si hay clientes con web), `pm2 restart` de clientes, health de cada uno. Commit.

### Task 8: Migración

**Files:** `dengo-backend/scripts/import-plantilla.ts`, `dengo-admin/server/lib/template.ts`, `server/routes/migration.ts`.
- [ ] `buildTemplate(): Buffer` con hojas Instrucciones, Sucursales, Categorias, Productos, Inventario, Clientes, Proveedores, Empleados (encabezados del spec, `*` en obligatorias, una fila ejemplo). `GET /api/template.xlsx`.
- [ ] `validateTemplate(buf): { sheets: {name, rows, errors:{row, column, message}[]}[] }` — obligatorias, números, SKU duplicado, categoría inexistente si no está en la hoja, sucursal de Inventario/Empleados desconocida. Test con un libro armado en memoria.
- [ ] `import-plantilla.ts --file=… [--images=dir] [--dry-run]` siguiendo las reglas de `import-loyverse.ts`; saldo → `CreditCharge` «Saldo migrado»; fotos webp 600 px vía sharp.
- [ ] Panel: subir xlsx/zip (Loyverse o plantilla) a `migracion/<fecha>/`, validar, trabajo dry-run, trabajo real (respaldo primero). Commit.

### Task 9: Interfaz

**Files:** `dengo-admin/web/src/**`.
- [ ] Aplicar skill de diseño (impeccable) antes de escribir UI. Tokens: superficie cálida, sombras en capas, azul tinta, Inter + display + JetBrains Mono.
- [ ] Pantallas: Login; Inicio (bento: totales, clientes con estado vivo, servidor, últimos trabajos, acceso a «Nuevo cliente»); Cliente (bento: estado, métricas con contador, módulos con interruptores, IA con medidor, FEL, dominios+DNS, respaldos, logs, zona peligrosa); Asistente de alta (7 pasos con transición de resorte, resumen); Trabajo (terminal en vivo, checks animados, credenciales finales); Migración; Servidor (checklist de preparación con comandos copiables); Ajustes globales.
- [ ] Capturas en simulate con Playwright y revisión visual. Commit por pantalla.

### Task 10: Documentación de instalación

- [ ] `dengo-admin/README.md`: instalar en el servidor, `.env`, sudoers, import de Caddy, túnel SSH, pm2 `dengo-admin`. Commit.
