# DENGO POS — Notas Técnicas y Decisiones

> **Instrucción para Claude:** Lee este archivo junto con `PROJECT_CONTEXT.md`. Si aplicas un fix importante, cambias un patrón, o descubres un gotcha nuevo, agrégalo aquí antes de terminar la sesión.

---

## Fixes Aplicados (historial)

### 1. Error 500 en PUT `/api/sales/:id` (edición de venta)
**Problema:** `updateStock()` llama internamente a `prisma.$transaction()`. Al llamarla desde dentro de otra transacción de Prisma, SQL Server generaba deadlock → 500.

**Fix:** Mover las llamadas a `updateStock` **fuera** de `prisma.$transaction`:
```
[antes] reversar stock → [transacción: borrar items, crear items, update sale] → [después] aplicar nuevo stock
```
Las operaciones de inventario van antes y después del bloque transaction, nunca dentro.

**Archivo:** `dengo-backend/src/routes/sales.ts`

---

### 2. Badges de método de pago siempre en gris
**Problema:** Los mapas de color tenían keys en español (`EFECTIVO`, `TARJETA`) pero la API devuelve inglés (`CASH`, `CARD`). El lookup siempre fallaba → color gris por defecto.

**Fix:** Renombrar todos los mapas a keys en inglés:
```ts
const PM_LABEL_MAP: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
  CREDIT: 'Crédito', MIXED: 'Mixto'
}
const PM_COLOR_MAP: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700',
  CARD: 'bg-blue-100 text-blue-700',
  TRANSFER: 'bg-purple-100 text-purple-700',
  CREDIT: 'bg-orange-100 text-orange-700',
  MIXED: 'bg-gray-100 text-gray-700'
}
```

**Archivos afectados:** `Dashboard.tsx`, `SalesHistoryReport.tsx`

---

### 3. Ventas a crédito no se mostraban correctamente
**Problema:** Se usaba `paymentMethod === 'CREDIT'` para identificar ventas a crédito, pero el campo correcto es `saleType === 'CREDIT'`.

**Fix:** En todos los lugares donde se muestra/filtra crédito:
```tsx
// Badge
sale.saleType === 'CREDIT' ? 'Crédito' : PM_LABEL_MAP[sale.paymentMethod]

// Total de crédito
const creditTotal = sales.filter(s => s.saleType === 'CREDIT').reduce(...)
```

**Archivos afectados:** `SalesHistoryReport.tsx`, `Dashboard.tsx`, `POS.tsx`, `Customers.tsx`

---

### 4. Top Categorías Hoy siempre vacío en Dashboard
**Problema doble:**
- Backend enviaba `topSellingProducts` (todos los tiempos), frontend esperaba `categorySales`
- La query no filtraba por fecha actual

**Fix backend:** Nueva query en `/api/reports/dashboard`:
```ts
// Query SaleItem de hoy → agrupar por category → devolver topCategoriesToday
topCategoriesToday: [{ name: string, amount: number }]
```

**Fix frontend:** Usar `topCategoriesToday` directamente del response, sin agrupación en cliente.

**Archivo backend:** `dengo-backend/src/routes/reports.ts`
**Archivo frontend:** `dengo-frontend/src/pages/Dashboard.tsx`

---

### 5. Gráfica por hora solo mostraba 10 ventas
**Problema:** La query de `hourlyChart` usaba `recentSales` (limitada a `take: 10`).

**Fix:** Query separada para `salesHoy` sin límite, usada exclusivamente para construir la gráfica horaria.

**Archivo:** `dengo-backend/src/routes/reports.ts`

---

### 6. Lupa (search icon) fuera de su contenedor
**Problema:** El ícono estaba posicionado con `absolute`, pero la clase `.input` tiene `display: flex` — el contexto de posicionamiento se rompe y el ícono queda fuera del input.

**Fix:** Convertir a wrapper flex con ícono inline:
```tsx
<div className="flex items-center border rounded-lg px-3 gap-2">
  <Search size={16} className="text-gray-400 flex-shrink-0" />
  <input className="flex-1 outline-none bg-transparent" ... />
</div>
```
No usar `absolute` para íconos dentro de inputs si la clase `.input` está en juego.

**Archivo:** `dengo-frontend/src/pages/reports/SalesHistoryReport.tsx`

---

### 7. Sidebar toggle button mal posicionado en móvil
**Problema:** Al colapsar el sidebar, el botón X quedaba en la posición del panel expandido en lugar de moverse al lado izquierdo.

**Fix:** Renderizado condicional del logo + centering dinámico:
```tsx
<div className={`h-16 flex items-center border-b ${
  isSidebarCollapsed ? 'justify-center' : 'justify-between px-4'
}`}>
  {!isSidebarCollapsed && <Logo />}
  <ToggleButton />
</div>
```

**Archivo:** `dengo-frontend/src/components/layout/Sidebar.tsx`

---

### 8. Acceso desde otra máquina en la red
**Problema:** `VITE_API_URL=http://localhost:3001` hacía que el browser del cliente remoto intentara conectar a su propio `localhost`.

**Fix:** Proxy de Vite + `.env` vacío:
```ts
// vite.config.ts
proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }
```
```
# .env
VITE_API_URL=
```
El browser siempre llama a `<misma-IP>:5173/api/...`, Vite lo redirige en el servidor.

---

### 9. Reports.tsx tenía datos hardcodeados (placeholders)
**Problema:** La página de Reportes mostraba gráficas con datos falsos (`hardcoded`).

**Fix:** Reescritura completa con datos reales:
- Stats (`ventas hoy`, `transacciones`, `ticket promedio`, `stock bajo`) → `GET /api/reports/dashboard`
- "Ventas de la Semana" → BarChart de Recharts con datos de `GET /api/reports/daily-sales`
- "Top 5 Productos Hoy" → lista horizontal de `GET /api/reports/top-products?from=today&to=today`

**Archivo:** `dengo-frontend/src/pages/Reports.tsx`

---

## Patrones Establecidos

### Navegación desde modal a venta específica
Usado en `Customers.tsx` y `POS.tsx` (modal de historial del cliente):
```tsx
const navigate = useNavigate()
// Al clickear una fila de venta:
navigate(`/reports/sales/${sale.id}`)
// + cerrar modal
```

### Formato de fecha consistente
Usar `date-fns` con locale español:
```tsx
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
format(new Date(sale.createdAt), 'dd MMM yyyy', { locale: es })
```

### Layout split responsivo (POS, Traslados, Compras, Cotizaciones)
Ver sección "Patrón de layout split" en `PROJECT_CONTEXT.md`.

---

## Gotchas / Cosas a evitar

| Situación | No hacer | Hacer |
|-----------|----------|-------|
| Identificar ventas a crédito | `paymentMethod === 'CREDIT'` | `saleType === 'CREDIT'` |
| Lookup de colores/labels de método | Keys en español | Keys en inglés (`CASH`, `CARD`, etc.) |
| Ícono dentro de input con clase `.input` | `position: absolute` | Wrapper flex con ícono inline |
| Llamar `updateStock` en Prisma | Dentro de `$transaction` | Fuera del bloque `$transaction` |
| URLs de API en frontend | `http://localhost:3001/api/...` | `/api/...` (proxy de Vite) |
| Gráfica de ventas por hora | Usar `recentSales` (limitado) | Query separada sin límite |

---

## Cosas Pendientes / Por Revisar

- [ ] **Ganancia total en reportes:** El usuario mencionó que la ganancia unitaria se ve bien pero la total no. No se llegó a investigar a fondo.
- [ ] **Firewall Windows:** Los puertos 3001 y 5173 deben estar abiertos manualmente por el usuario.
- [ ] **Tarjeta en venta mixta en historial:** El `cardTotal` en `SalesHistoryReport.tsx` suma `cardAmount` para ventas mixtas. Verificar que el backend siempre envíe `cardAmount` cuando `paymentMethod === 'MIXED'`.

---

*Última actualización: 2026-06-16 — Mobile responsiveness completa; proxy Vite configurado*
