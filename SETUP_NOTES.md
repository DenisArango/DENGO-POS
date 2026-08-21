# Portal de Maestros — Setup Notes (Variedades Dayana)

This document covers the steps required to run the new teacher portal feature.

## 1. Database — apply the new schema

The Prisma schema (`dengo-backend/prisma/schema.prisma`) gained 7 new models
(`PortalConfig`, `School`, `Teacher`, `TeacherSchool`, `ProgramConfig`,
`PortalOrder`, `PortalOrderItem`) plus a new `TEACHER` user role and relations.

Run from `dengo-backend/`:

```bash
npx prisma generate
npx prisma db push
```

> SQL Server: no enums (status/type are NVarChar strings), no multiple cascade
> paths (all relations use `NoAction`).

## 2. Backend — CORS for the portal

The portal frontend runs on **port 5174**. `dengo-backend/.env` `CORS_ORIGIN`
has been updated to include it (comma-separated):

```
CORS_ORIGIN="http://localhost:5173,http://localhost:5174"
```

`config.ts` already splits on commas — no code change required. Restart the
backend after editing `.env`.

## 3. Backend — new API routes

Registered in `dengo-backend/src/index.ts`:

- `/api/portal/*`        — teacher-facing (public config + login, TEACHER-guarded)
- `/api/portal-admin/*`  — admin management (ADMIN-guarded)

Start the backend as usual:

```bash
cd dengo-backend && npm run dev
```

## 4. Portal frontend (new project)

```bash
cd dengo-portal
npm install   # already run during setup
npm run dev   # serves on http://localhost:5174 (proxies /api -> :3001)
```

## 5. POS frontend additions

New admin pages under "Portal Escolar" in the sidebar (ADMIN only):
Pedidos Portal, Maestros, Escuelas, Programas, Config. Portal. The "Pedidos
Portal" item shows a red badge polling `GET /api/portal-admin/stats` every 30s.

```bash
cd dengo-frontend && npm run dev   # http://localhost:5173
```

## 6. Seed data to get started

Using the POS as ADMIN:

1. **Config. Portal** → fill business info → Guardar (creates `PortalConfig`).
2. **Escuelas** → create at least one school.
3. **Programas** → create programs (e.g. TEACHING_KIT with Q600 limit).
4. **Maestros** → create a teacher (User role TEACHER + Teacher profile),
   then assign schools/grades from the teacher drawer.
5. The teacher logs into the portal at `http://localhost:5174` and submits orders.
6. Back in the POS → **Pedidos Portal** → approve / reject / create quotation.

> Order numbers: `PED-YYYY-NNN`. Quotation numbers from portal orders: `COT-YYYY-NNN`.
