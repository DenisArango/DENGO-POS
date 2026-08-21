# DENGO POS — Contexto del Proyecto

> **Instrucción para Claude:** Lee este archivo al inicio de cualquier sesión sobre este proyecto. Si se cambia alguna funcionalidad, módulo o alcance, actualiza las secciones correspondientes antes de terminar la sesión.

---

## ¿Qué es DENGO POS?

Sistema de punto de venta (POS) completo para comercios. Permite gestionar ventas, inventario, clientes, caja, traslados entre sucursales y cotizaciones. Desarrollado por Denis Arango (GitHub: DenisArango1, email: arangosierrad@gmail.com).

---

## Stack Tecnológico

### Backend
- **Runtime:** Node.js
- **Framework:** Fastify
- **ORM:** Prisma
- **Base de datos:** SQL Server (MSSQL)
- **Auth:** JWT
- **Carpeta:** `dengo-backend/`
- **Entry point:** `dengo-backend/src/index.ts` (corre en puerto **3001**)
- **Rutas:** `dengo-backend/src/routes/`

### Frontend
- **Framework:** React + Vite + TypeScript
- **Estilos:** TailwindCSS
- **Animaciones:** Framer Motion (sidebar)
- **Gráficas:** Recharts
- **Íconos:** Lucide React
- **Estado global:** Zustand (`useAuthStore`, `useAppStore`, `useStore`)
- **Router:** React Router DOM
- **Carpeta:** `dengo-frontend/`
- **Dev server:** puerto **5173**
- **Proxy Vite:** `/api` → `http://localhost:3001` (configurado en `vite.config.ts`)

---

## Arquitectura General

```
Browser (5173) → Vite proxy /api → Fastify (3001) → Prisma → SQL Server
```

El frontend nunca llama directamente a `localhost:3001`. Todas las llamadas van a `/api/...` y Vite las redirige. Esto permite acceso desde otras máquinas en la red sin cambiar URLs.

**`.env` del frontend:**
```
VITE_API_URL=   (vacío — usa proxy)
```

---

## Módulos / Páginas

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/` | Resumen del día: ventas, transacciones, ticket promedio, stock bajo, gráfica por hora, top categorías hoy, métodos de pago |
| POS | `/pos` | Punto de venta. Búsqueda de productos, carrito, cobro (efectivo/tarjeta/transferencia/crédito/mixto), historial del cliente |
| Caja | `/cash-register` | Apertura/cierre de caja, movimientos de entrada/salida, resumen |
| Clientes | `/customers` | CRUD de clientes, historial de compras por cliente, modal con navegación a venta específica |
| Inventario | `/inventory` | Gestión de productos y stock |
| Reportes | `/reports` | Hub de reportes. Subpáginas: historial de ventas, movimientos de inventario, productos |
| Traslados | `/transfers` | Traslados de stock entre sucursales. Vista crear: layout split |
| Compras | `/purchases` | Registro de compras/entradas de inventario. Vista crear: layout split |
| Cotizaciones | `/quotations` | Creación de cotizaciones. Vista crear: layout split |
| Usuarios | `/users` | Gestión de usuarios (admin) |

---

## Roles y Autenticación

- JWT almacenado en `useAuthStore`
- Roles: admin, cajero (u otros definidos en backend)
- Algunas rutas están protegidas por rol

---

## Conceptos Clave del Dominio

### `saleType` vs `paymentMethod`
- `paymentMethod`: cómo se pagó físicamente (`CASH`, `CARD`, `TRANSFER`, `MIXED`)
- `saleType`: tipo de venta (`REGULAR`, `CREDIT`)
- Una venta a crédito tiene `saleType = 'CREDIT'` pero puede tener cualquier `paymentMethod`
- **Regla:** para mostrar "Crédito" en badges/filtros, siempre revisar `saleType === 'CREDIT'`, no el `paymentMethod`

### Métodos de Pago (API keys en inglés)
| API key | Label español |
|---------|--------------|
| `CASH` | Efectivo |
| `CARD` | Tarjeta |
| `TRANSFER` | Transferencia |
| `CREDIT` | Crédito |
| `MIXED` | Mixto |

### Venta Mixta
Cuando `paymentMethod === 'MIXED'`, la venta tiene campos `cashAmount` y `cardAmount` con los montos parciales.

---

## Layout y Responsividad

### Sidebar
- Desktop: siempre visible, colapsable a íconos (`w-16`) o expandido (`w-64`)
- Móvil: overlay con backdrop negro semitransparente, se cierra al tocar fuera
- Toggle: botón hamburger (`Menu`) cuando colapsado, X cuando expandido
- Nombre de la app: **DENGO POS**

### Patrón de layout split (POS, Traslados, Compras, Cotizaciones)
```tsx
// Contenedor principal
className="md:h-[calc(100vh-7rem)]"

// Split
className="flex flex-col md:flex-row gap-3 flex-1 overflow-auto md:overflow-hidden md:min-h-0"

// Panel izquierdo (productos)
className="flex-1 ..."

// Panel derecho (cobro/resumen)
className="w-full md:w-72 ..."
```
En móvil: stacked (lista arriba, form abajo). En desktop: side by side.

### Tablas con scroll horizontal en móvil
Envolver en `overflow-x-auto` con `min-w-[...]` en el `<table>` o contenedor interno.

---

## Endpoints Backend Importantes

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/reports/dashboard` | Stats del día: ventas, transacciones, ticket, stock bajo, hourlyChart, topCategoriesToday, paymentBreakdown |
| `GET /api/reports/daily-sales` | Ventas por día (últimos 7 días) |
| `GET /api/reports/top-products` | Top productos por rango de fecha |
| `GET /api/reports/sales-history` | Historial de ventas con filtros (fecha, cliente, saleType) |
| `PUT /api/sales/:id` | Editar venta (incluye ajuste de stock) |
| `GET /api/customers/:id/sales` | Historial de ventas de un cliente |

---

## Estructura de Carpetas Frontend

```
dengo-frontend/src/
├── pages/
│   ├── Dashboard.tsx
│   ├── POS.tsx
│   ├── CashRegister.tsx
│   ├── Customers.tsx
│   ├── Inventory.tsx
│   ├── Transfers.tsx
│   ├── Purchases.tsx
│   ├── Quotations.tsx
│   ├── Reports.tsx
│   └── reports/
│       ├── SalesHistoryReport.tsx
│       ├── InventoryMovementsReport.tsx
│       └── (otros)
├── components/
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── MainLayout.tsx
├── store/
│   └── (zustand stores)
└── ...
```

---

## Notas de Acceso en Red Local

Para acceder desde otro dispositivo en la misma red:
1. Backend corre en `0.0.0.0:3001` (escucha en todas las interfaces)
2. Frontend dev server: `vite --host` (escucha en todas las interfaces)
3. Firewall de Windows debe tener abiertos los puertos 3001 y 5173
4. Desde otro dispositivo: `http://<IP-del-servidor>:5173`

---

*Última actualización: 2026-06-16 — Mobile responsiveness aplicada en todos los módulos*
