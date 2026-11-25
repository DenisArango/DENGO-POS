# Panel de administración de clientes (dengo-admin) — diseño

Fecha: 2026-11-25 · Rama: `admin-clientes`

## Intención

Denis (el proveedor) da de alta y administra a sus clientes de DENGO POS sin tocar la terminal. Hoy el alta es manual (ARQUITECTURA_MULTICLIENTE.md §5): crear base, copiar y editar `.env`, `db push`, seed, pm2, bloque de Caddy, licencia por `curl`, importar datos con scripts. El panel hace todo eso de verdad en el servidor, muestra el avance en vivo y deshace lo hecho si un paso falla. También administra a los clientes que ya existen (VariedadesDayana).

## Metas

- Alta de cliente en un asistente por pasos: datos del negocio, dominio(s), sucursales, administrador inicial, módulos, IA, FEL (Digifact), página web, migración.
- Crea: base de datos, `clients/<Nombre>/.env` (secretos generados), tablas, seed, proceso pm2, bloque Caddy del POS (`pos.<dominio>`), y si tiene página web: SITE_CONFIG, proceso `<Nombre>-web` y bloque Caddy del dominio principal.
- Clientes existentes: estado (pm2, health, memoria, reinicios), métricas (ventas de hoy, productos, usuarios, uso de IA del mes), módulos, límite de IA, parámetros FEL, suspender/reactivar, reiniciar, ver logs, respaldar y descargar respaldo.
- Despliegue de versión nueva a todos los clientes (respaldo → db push → generate → build → restart), con el mismo log en vivo.
- Migración: plantilla DENGO en Excel descargable + exportación Loyverse; validación fila por fila y `dry-run` antes de importar; fotos en `.zip` nombradas por SKU o código de barras.
- Visual: bento grid con volumen y animaciones con vida (no plano).

## No-metas

- Convertidores de otros sistemas dentro del panel. **Avances Guatemala** (el origen más común) y cualquier otro se convierten a la plantilla DENGO en una sesión de trabajo con Claude, con su exportación real a la vista; el panel solo acepta plantilla DENGO y Loyverse.
- Gestión de folios/plazos de Digifact (se hace en el portal de Digifact).
- Facturación/cobro a clientes, borrado definitivo de clientes (solo «archivar»: detiene procesos, quita Caddy, conserva base y respaldo).
- Dominio propio del panel (por ahora).

## Anti-metas

- Que un cliente pueda alcanzar el panel o sus poderes: el panel nunca vive dentro de `dengo-backend`.
- Que un fallo a mitad del alta deje basura (base creada sin proceso, Caddy roto). Cada paso tiene su deshacer y Caddy se valida antes de recargar.
- Exponer secretos en el navegador (claves de Anthropic/Digifact se muestran enmascaradas).

## Decisiones (de Denis)

- El panel corre en el servidor (opción A), proyecto nuevo `dengo-admin`.
- Sin dominio por ahora: escucha en `127.0.0.1:4900`; se entra con túnel SSH (`ssh -L 4900:127.0.0.1:4900 servidor` → `http://localhost:4900`). Se le podrá poner dominio después con un bloque de Caddy.
- Cada cliente tiene su propio dominio: POS en `pos.<dominio>`, página web en `<dominio>` y `www.<dominio>`.
- Digifact es el único certificador. Usuario y clave de API son de Denis y únicos para todos; por cliente cambian NIT, frases del RTU, tipo (FACT/FPEQ), establecimiento y ambiente (test/production).
- IA: una sola API key de Anthropic para todos; por cliente se controla encendido y límite mensual.
- Suspender = el sistema sigue arriba y muestra «Servicio suspendido, contacte a su proveedor» (POS, portal y página web). Reactivar = un clic.
- Si el cliente tiene página web, el panel crea su proceso web y su bloque de Caddy.
- Commits cortos, solo a nombre de Denis.

## Enfoques considerados

1. **Proyecto nuevo `dengo-admin` en el servidor (elegido).** Ejecuta los pasos reales, log en vivo, deshacer. Aislado de los procesos de clientes.
2. Panel local que genera un `.sh` para pegar. Más seguro pero no automatiza; descartado por Denis.
3. Rutas de super-admin dentro de `dengo-backend`. Descartado: cada proceso de cliente tendría poder sobre los demás.

## Arquitectura

```
dengo-admin/                 (en el repo; en el servidor: ~/dengo/app/dengo-admin)
├── server/   Fastify + TS   API, motor de pasos, SSE de logs, sirve web/dist
└── web/      React + Vite + Tailwind + motion + lucide
```

- **Fuente de verdad:** el sistema de archivos. `~/dengo/clients/<Nombre>/.env` + `cliente.json` (nombre visible, dominio, puertos, módulos deseados, contacto, fechas, estado). Un cliente sin `cliente.json` (Dayana) se infiere del `.env` + pm2 y el panel ofrece completar su ficha. Sin base propia del panel.
- **Configuración del panel:** `~/dengo/admin/.env`: `ADMIN_PASSWORD_HASH` (bcrypt), `SESSION_SECRET`, `DENGO_ROOT` (`~/dengo`), `PG_ADMIN_URL` (rol con CREATEDB), `DB_APP_USER/DB_APP_PASSWORD` (dueño de las bases de clientes), `SERVER_IP`, globales compartidos `ANTHROPIC_API_KEY`, `DIGIFACT_USER`, `DIGIFACT_PASSWORD`. `ADMIN_MODE=simulate` para desarrollo en Windows: los comandos se registran pero no se ejecutan y `DENGO_ROOT` apunta a un sandbox.
- **Motor de pasos:** un trabajo = lista de pasos `{ id, título, run(ctx), undo?(ctx) }`. Se ejecutan en orden, cada línea de salida va al log (SSE `/api/jobs/:id/stream`); si uno falla se ejecutan los `undo` de los completados en orden inverso. Un trabajo a la vez por cliente; despliegue global bloquea todo.
- **Base de cada cliente:** el panel se conecta con `pg` a la `DATABASE_URL` del cliente para leer métricas y escribir `LICENSE_CONFIG`, `SITE_CONFIG`, sucursales. Funciona aunque el backend esté caído.
- **Caddy:** una vez, a mano: `import /home/<usuario>/dengo/caddy/*.caddy` en `/etc/caddy/Caddyfile` y una regla de sudoers solo para `caddy validate` y `systemctl reload caddy`. El panel escribe `~/dengo/caddy/<Nombre>.caddy`, valida y recarga; si la validación falla restaura el archivo anterior. Los bloques de Dayana que siguen en el Caddyfile principal se muestran como «gestionado a mano». La pantalla «Servidor» muestra esta preparación como checklist con los comandos exactos.
- **DNS:** antes de crear el bloque Caddy el panel resuelve `pos.<dominio>` y `<dominio>` y los compara con `SERVER_IP`; si no apuntan, avisa (Caddy no podría sacar el certificado) y deja el paso para después.

### Alta (pasos del trabajo)

1. Validar (nombre único, dominio, puertos libres: siguiente `PORT` libre desde 3001, web desde 4401).
2. Crear base `<slug>` (dueño `DB_APP_USER`). Deshacer: `DROP DATABASE`.
3. Escribir `clients/<Nombre>/.env` (PORT, HOST=127.0.0.1, DATABASE_URL, JWT_SECRET y LICENSE_ADMIN_SECRET aleatorios, CORS_ORIGIN, ANTHROPIC_*, FEL_PROVIDER=digifact|none, DIGIFACT_*). Deshacer: borrar carpeta.
4. `prisma db push --skip-generate` con ese `.env`.
5. Seed (`tsx src/seed.ts`) con `SEED_*` (admin, sucursal principal, licencia, IA).
6. Datos extra por `pg`: sucursales adicionales, licencia FEL, nombre del negocio.
7. pm2 start `<Nombre>` con `cwd` en su carpeta; `pm2 save`. Deshacer: `pm2 delete`.
8. Health check `/api/health` (reintentos 20 s).
9. Caddy POS. Deshacer: quitar archivo y recargar.
10. (Página web) SITE_CONFIG (diseño `plantilla`), pm2 `<Nombre>-web`, Caddy del dominio.
11. Guardar `cliente.json`. Mostrar credenciales iniciales una sola vez.

### Suspensión

`LICENSE_CONFIG` gana `SUSPENDED` (bool, default false) y `SUSPENDED_MESSAGE` (texto opcional) — columnas que solo agregan. Backend: hook `onRequest` con caché de 15 s responde `423 { error: 'SUSPENDED' }` en toda ruta salvo `/api/license`, `/api/health`. POS y portal: pantalla completa «Servicio suspendido» al leer la licencia o recibir 423. dengo-web: el middleware muestra la misma página.

### Migración

- **Plantilla DENGO (.xlsx)**, una hoja por tipo, encabezados fijos en español, columnas obligatorias marcadas, una fila de ejemplo y una hoja «Instrucciones»:
  - `Sucursales`: Código*, Nombre*, Dirección, Ciudad, Teléfono.
  - `Categorias`: Nombre*, Color.
  - `Productos`: SKU*, Código de barras, Nombre*, Categoría*, Marca, Precio*, Costo, Stock mínimo, Stock máximo, Unidad, Activo.
  - `Inventario`: SKU*, luego una columna por código de sucursal con la cantidad.
  - `Clientes`: Nombre*, NIT, Teléfono, Correo, Dirección, Crédito (sí/no), Límite de crédito, Saldo pendiente, Comentarios.
  - `Proveedores`: Código*, Nombre*, Contacto, Teléfono, Correo, NIT, Dirección, Ciudad, Condición de pago.
  - `Empleados`: Nombre*, Correo*, Sucursal*, Rol (OPERATOR por defecto).
  - Fotos: `.zip` aparte; cada archivo `<SKU o código de barras>.jpg|png|webp`.
- Importador nuevo `dengo-backend/scripts/import-plantilla.ts` (mismas reglas que el de Loyverse: empata por código de barras → SKU → nombre, nunca duplica, `--dry-run`, contraseñas temporales impresas una vez). Saldo pendiente → `CreditCharge` con concepto «Saldo migrado». Fotos se comprimen con sharp a webp.
- El panel sube a `clients/<Nombre>/migracion/<fecha>/`, valida y muestra errores por fila, corre `--dry-run`, muestra el resumen y pide confirmar la importación real (respaldo antes).

## Visual

Estilo único: **bento grid con volumen**. Superficie clara cálida, tarjetas de distintos tamaños que encajan sin huecos, sombras en capas (no planas), bordes de 1 px con luz superior, íconos en mosaicos de color, acento azul tinta (coherente con el POS) más un color por cliente. Vida: números que cuentan, pulso en el estado «en línea», tarjetas con leve inclinación/realce al pasar el cursor, transiciones del asistente con resorte, terminal de log con líneas que entran y check animado por paso, confeti sobrio al terminar un alta. Respeta `prefers-reduced-motion`. Tipografía: Inter (texto) + una display con carácter para títulos y cifras + JetBrains Mono en la terminal.

## Queda a criterio del constructor

Rutas exactas de la API, forma del `cliente.json`, componentes, estructura de carpetas internas, textos de la interfaz.
