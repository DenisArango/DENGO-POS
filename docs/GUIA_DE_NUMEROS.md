# Guía de números de DENGO — de dónde sale cada monto

Esta guía explica cómo calcula DENGO cada cifra de dinero que ve el cliente: el Dashboard, la caja, las metas, el inventario y los reportes. Sirve para atender soporte ("¿por qué este número no me cuadra?") y para explicárselo al cliente.

## Reglas que aplican a todo

1. **Las ventas anuladas nunca cuentan.** Ningún total, ganancia ni meta incluye una venta anulada.
2. **El "día" es el de Guatemala.** Va de 00:00 a 23:59 hora de Guatemala, aunque el servidor esté en otra zona horaria.
3. **Total de una venta = subtotal − descuento general + impuesto.** Los descuentos por línea ya vienen restados en el total de cada línea.
4. **Las ventas al crédito cuentan como venta el día que se hacen**, aunque el dinero llegue después. Por eso "Ventas de hoy" puede ser mayor que el efectivo que hay en la caja.
5. **Cada venta guarda su precio y su costo del momento.** El precio de venta siempre se guardó en cada línea. Desde noviembre 2026 también se guarda el costo unitario del momento de la venta. Cambiar después el precio o el costo de un producto solo afecta a las ventas nuevas; ni los totales ni las ganancias de ventas pasadas se mueven. Las ventas anteriores a este cambio se rellenaron una vez con el costo que tenía el producto en su fecha, reconstruido con el historial de cambios de costo.
6. **Las presentaciones se convierten a unidades base.** Una venta de "1 caja de 12" descuenta 12 unidades del inventario, y su costo es costo unitario × 12.
7. **Cada sucursal ve lo suyo.** Un usuario que no es administrador solo ve números de las sucursales que tiene asignadas.

## Dashboard (inicio)

| Número | Cómo se calcula |
|---|---|
| **Ventas de hoy** | Suma del total de todas las ventas no anuladas de hoy en la sucursal seleccionada. Incluye las ventas al crédito. |
| **Transacciones** | Cantidad de esas ventas. |
| **Costo de hoy** | Por cada línea vendida hoy: el costo unitario guardado en la venta × cantidad (regla 5). |
| **Ganancia de hoy** | Ventas de hoy − Costo de hoy. |
| **Efectivo en caja** | En cada caja **abierta** de la sucursal: fondo inicial + ventas en efectivo + abonos en efectivo + ingresos − egresos. **Este número sí incluye el fondo inicial**, a diferencia del cierre de caja. |
| **Ventas por hora** | Total vendido en cada hora de hoy (hora de Guatemala). |
| **Top categorías** | Suma del total de las líneas vendidas hoy, agrupada por la categoría del producto. |
| **Alertas de stock** | Productos activos cuyo stock en la sucursal es menor o igual al stock mínimo. "Agotado" es stock 0 y "crítico" es ≤ 30% del mínimo. |

## Caja (abrir, vender, cerrar)

| Número | Cómo se calcula |
|---|---|
| **Ventas de la caja** | Todas las ventas registradas en **esa sesión de caja**, desde que se abrió. Si dos dispositivos usan la misma "Caja 1", ambos venden en la misma sesión y sus ventas se suman juntas. |
| **Efectivo** | Ventas en efectivo + la parte en efectivo de los pagos mixtos + abonos en efectivo cobrados en esa caja (incluye abonos de créditos de días anteriores). |
| **Tarjeta / Transferencia** | Ventas con ese método + la parte correspondiente de los pagos mixtos. |
| **Crédito** | Ventas al crédito de la sesión. **No es efectivo:** no entra en "Efectivo esperado". |
| **Efectivo esperado** (al cerrar) | Efectivo + ingresos − egresos de la caja. **No incluye el fondo inicial**, porque el fondo se queda en la caja para el día siguiente. |
| **Diferencia** | Efectivo entregado − Efectivo esperado. Negativo = falta dinero; positivo = sobra. |
| **Total Excel** (conciliación, opcional) | Diferencia entre el total de ventas de DENGO y el total que el cliente lleva en su otro sistema o Excel. |

**Cambio de noviembre 2026:** si un dispositivo intenta vender con una sesión de caja que otro dispositivo ya cerró, DENGO ahora pasa la venta a la sesión abierta de esa misma caja. Si esa caja no está abierta, rechaza la venta y pide abrirla. Antes, esas ventas quedaban fuera de todos los cierres.

## Metas

| Número | Cómo se calcula |
|---|---|
| **Vendido** | Suma del total de las ventas no anuladas del mes (calendario de Guatemala) en la sucursal. Incluye las ventas al crédito. Si la meta está dividida por cajas, solo cuenta las ventas de esas cajas. |
| **% de avance** | Vendido ÷ meta × 100. Se muestra con un tope de 100%. |
| **Debo vender por día** | (Meta − vendido) ÷ días que faltan del mes, **contando hoy**. Solo aparece para el mes en curso. |

## Inventario y productos

| Pantalla | Número | Cómo se calcula |
|---|---|---|
| Inventario | **Costo Total** | Σ stock × costo actual del producto. Es lo que "vale" el inventario a precio de compra. |
| Inventario | **Valor de Venta Total** | Σ stock × precio base de venta. Es lo que se recibiría vendiéndolo todo a precio normal. |
| Productos | **Valor de Venta Inventario** | Lo mismo que el "Valor de Venta Total" de Inventario (stock × precio de venta). Antes se llamaba "Valor Inventario" y se confundía con el costo. |
| Ambas | **Stock** | Suma de las existencias en las sucursales que el usuario puede ver. Si un administrador no elige sucursal, ve la suma de todas. |
| Ambas | **Stock bajo / Sin stock** | Stock ≤ mínimo / stock = 0. Solo productos activos. |
| Reporte "Estado de inventario" con fecha | **Stock a una fecha** | Cantidad que quedó después del último movimiento registrado hasta ese día. **El costo y el precio son los de hoy**, no los de esa fecha. |
| Compras | **Costo de una compra** | Cantidad × costo unitario ingresado. Si se compra por presentación, se guarda el costo por unidad base (costo ÷ factor). |
| Rotación | **Venta diaria promedio** | Unidades base vendidas en los últimos 30 días ÷ 30. |
| Rotación | **Días de inventario** | Stock ÷ venta diaria promedio. Si no se vendió nada, aparece 999. |

## Reportes de ventas

| Reporte | Número | Cómo se calcula |
|---|---|---|
| Historial de ventas | **Total / Ganancia** | Suma del total de cada venta / suma de (total de las líneas − costo guardado − descuento general). **Muestra como máximo las 500 ventas más recientes del filtro.** Para rangos grandes, usa "Ventas por día" o "Márgenes". |
| Ventas por día | **Total, efectivo, tarjeta…** | Ventas agrupadas por día de Guatemala. Ganancia = total − costo. |
| Top productos / por producto | **Ingresos** | Suma del total de las líneas de ese producto. No resta el descuento general de la venta, así que puede salir un poco más alto que el historial. |
| Márgenes de ganancia | **Margen %** | (Ingresos − costo) ÷ ingresos × 100. |
| Créditos | **Pendiente** | Total de la venta − lo abonado. El saldo total del cliente es su "crédito usado". |
| Flujo de caja | **Ventas / efectivo / tarjeta / transferencia** | Totales de cada sesión de caja. Las cajas cerradas usan el total guardado al cerrar y las abiertas se calculan en vivo. |

**Corrección de noviembre 2026 en Flujo de caja:** hasta ahora, las cajas que se cerraban desde la app guardaban sus totales en 0, y por eso este reporte y la IA mostraban Q0.00. Ya se corrigió. Para arreglar las cajas cerradas antes del cambio, hay que correr una vez `npx tsx scripts/backfill-register-totals.ts --apply` en el servidor.

## Diferencias que el cliente puede notar, y por qué son correctas

- **"Ventas de hoy" (Dashboard) ≠ efectivo de la caja.** Las ventas incluyen crédito, tarjeta y transferencia, y la caja solo cuenta efectivo.
- **"Efectivo en caja" (Dashboard) ≠ "Efectivo esperado" (cierre).** El primero incluye el fondo inicial y el segundo no.
- **Top productos no coincide con el Historial de ventas.** Top productos no resta el descuento general de cada venta.
- **El Historial no cuadra con "Ventas por día" en un mes completo.** El Historial muestra como máximo 500 ventas.
