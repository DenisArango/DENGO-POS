# Facturación electrónica (FEL Guatemala) con FELplex

Estado: **listo para conectar.** Todo el flujo funciona con el simulador interno (`FEL_PROVIDER=mock`). Para facturar de verdad solo faltan las credenciales de FELplex en el `.env` de cada cliente.

Referencia de la API: https://developers.felplex.com (colección de Postman). Hay una copia legible en [felplex_guatemala.txt](felplex_guatemala.txt) y la colección completa en [felplex_postman.json](felplex_postman.json).

---

## 1. Quién hace qué

| Paso | Lo hace | Detalle |
|---|---|---|
| Habilitarse en FEL ante la SAT | **El cliente** (emisor) | Agencia Virtual SAT → solicitud de habilitación FEL. Los establecimientos (uno por sucursal) deben estar activos en el RTU. |
| Elegir a FELplex como certificador | **El cliente** | Agencia Virtual SAT → aceptar al certificador. Sin esto, FELplex responde `FEL_ASO099`. |
| Contratar el plan de FELplex | **El cliente** | Los créditos de DTE son por NIT y los paga el emisor. |
| Pedir credenciales de API | Cliente o integrador | Correo a info@felplex.com. Devuelven un **ID de empresa** por establecimiento y una **API Key**. |
| Configurar el servidor | **Integrador (DENGO)** | Variables `.env` (abajo) y el ID de empresa por sucursal en *Configuración → Tiendas*. |
| Activar en la licencia | **Integrador** | `felEnabled = true` (`x-license-secret`). Con eso aparece «¿Generar factura?» en caja. |
| Soporte del día a día | Integrador | Facturas con error, reintentos, anulaciones fuera de plazo. |

## 2. Ambiente de pruebas (gratis)

1. Regístrate en https://felplex.stage.plex.lat.
2. Pide accesos de desarrollo a **info@felplex.com**, con los datos de tu empresa.
3. Con el ID de empresa y la API Key de pruebas, configura el backend:

```env
FEL_PROVIDER=felplex
FELPLEX_ENV=stage
FELPLEX_ENTITY_ID=<id de empresa de pruebas>
FELPLEX_API_KEY=<api key de pruebas>
FEL_DOC_TYPE=FACT
```

4. Reinicia el backend y abre *Configuración → Facturación electrónica → Probar conexión*. Debe mostrar «Conectado · N DTE disponibles» en cada sucursal.
5. Haz ventas con factura. En el ticket y en el detalle de la venta aparecen la serie, el número y la autorización de la SAT, con la leyenda «PRUEBA — SIN VALIDEZ FISCAL».

**Producción:** regístrate en https://app.felplex.com, pide credenciales nuevas a info@felplex.com, y cambia a `FELPLEX_ENV=production` con el ID de empresa y la API Key de producción. Las credenciales de un ambiente no sirven en el otro.

## 3. Variables de entorno (`dengo-backend/.env`)

| Variable | Valores | Para qué |
|---|---|---|
| `FEL_PROVIDER` | `none` · `mock` · `felplex` | `none`: no se envía nada y las facturas quedan pendientes. `mock`: simulador sin validez fiscal. |
| `FELPLEX_ENV` | `stage` · `production` | Ambiente de FELplex. |
| `FELPLEX_ENTITY_ID` | texto | ID de empresa para las sucursales que no tengan uno propio. |
| `FELPLEX_API_KEY` | texto | API Key de ese ID. |
| `FELPLEX_API_KEYS` | JSON `{"<id>":"<key>"}` | Solo si cada establecimiento tiene su propia API Key. |
| `FEL_DOC_TYPE` | `FACT` · `FPEQ` · `FAPE` | **Régimen del cliente:** general (IVA 12 %) o pequeño contribuyente (sin desglose de IVA). Variedades Dayana usa `FACT`. |
| `FEL_ALLOW_CF` | `true` · `false` | Facturar a «Consumidor Final» sin NIT. La SAT pide NIT o CUI desde `FEL_CF_MAX_TOTAL` (Q2,500). |
| `FEL_SEND_EMAIL` | `true` · `false` | FELplex envía el PDF al correo del cliente. |
| `FEL_RETRY_MINUTES` / `FEL_MAX_ATTEMPTS` | 5 / 5 | Reintento automático de facturas que no llegaron al certificador. |
| `FEL_TIMEOUT_MS` | 30000 | Tiempo máximo de espera de la certificación. |

En cada sucursal (*Configuración → Tiendas*) se pone el **ID de empresa de FELplex** y el **código de establecimiento SAT**. Cada sucursal es un establecimiento.

## 4. Cómo funciona

- **Factura en caja:** se marca «¿Generar factura?» (o se usa «Generar factura» en una venta ya hecha, sola o en lote). El botón **Buscar** junto al NIT valida el dígito verificador y trae el nombre registrado en la SAT.
- **Certificación:** es síncrona (`POST /invoices/await`). Si se certifica, el ticket imprime los datos de la SAT. Si falla, **la venta no se pierde**:
  - **Pendiente:** el certificador no respondió por conexión. Se reintenta solo.
  - **Error:** la SAT la rechazó. Se muestra el motivo en el detalle de la venta, con el botón «Certificar ahora».
  - **Tiempo de espera agotado:** queda en error y **no** se reintenta sola, porque pudo haberse certificado y reintentar la duplicaría. Primero se revisa en FELplex.
- **Precios e IVA:** en caja los precios incluyen IVA. Las ventas que vienen de una cotización con el IVA sumado aparte se ajustan solas para que el documento cuadre con lo cobrado.
- **Descuentos:** el descuento de línea, el de cupón y el descuento general se reparten por línea al centavo. La suma del documento es exactamente lo que pagó el cliente.
- **Portal de maestros:** la factura de un pedido sale a nombre y NIT de **la escuela**. Se configuran en *Portal → Escuelas → NIT para factura / Nombre en la factura*. Al certificarse, el pedido pasa a «Facturado» y se le puede enviar al maestro por Mensajes, con el enlace al PDF oficial.
- **Edición bloqueada:** una venta con factura certificada no deja cambiar productos ni montos. Se corrige con nota de crédito, o anulando la venta y haciéndola de nuevo.

## 5. Anulación y notas de crédito

| | Anular la venta | Nota de crédito |
|---|---|---|
| Cuándo | Error total: la venta no debió existir o salió a otro NIT | Devolución o corrección **parcial** («devolvió 2 de 10 cuadernos») |
| Qué pasa en la SAT | El DTE queda **anulado** | Se emite un **DTE nuevo** (NCRE) ligado a la factura, que **sigue vigente** |
| Plazo SAT | Hasta el fin del mes siguiente al de emisión | Según las reglas de la SAT para notas (confirmar con el contador del cliente) |
| Inventario | Regresa todo | Regresa lo devuelto (casilla «Regresar al inventario») |
| En DENGO | Botón «Anular» en la venta. Si la anulación SAT falla, queda marcada para reintentar. | Botón «Nota de crédito» en el panel de factura de la venta |

**Qué implica para el cliente (el negocio):**
- Cada nota de crédito **consume un DTE** de su plan, igual que una factura.
- El IVA de la nota **reduce su débito fiscal** del mes en que se emite. Su contador la verá en el reporte de documentos emitidos.
- Debe entregar la nota (PDF) a su cliente, igual que la factura.
- El dinero se devuelve aparte, en efectivo o como saldo a favor: la nota no mueve la caja por sí sola.

**Qué implica para ti (integrador):**
- Las notas nunca acreditan más de lo pagado por cada línea, con los descuentos ya repartidos.
- Una nota que no se pudo certificar se puede **reintentar** o **cancelar** (si se había devuelto inventario, se vuelve a descontar).
- **Reportes:** «Ventas por período» resta las notas de crédito certificadas del día en que se emitieron: muestra las columnas «Notas de crédito» y «Total neto», y la tarjeta pasa a «Ventas netas». Las demás vistas siguen mostrando lo cobrado: dashboard, metas, márgenes y caja. Una nota no mueve la caja; devolver el dinero se hace aparte.

## 6. Puesta en producción (checklist)

1. `db push` en el servidor. Solo agrega columnas que aceptan nulos y las tablas `CREDIT_NOTES` y `CREDIT_NOTE_ITEMS`:
   `cd ~/dengo/clients/<Cliente> && <comando habitual de prisma db push>`
2. Variables `.env` con `FEL_PROVIDER=felplex` y `FELPLEX_ENV=production`, más el ID de empresa y la API Key.
3. El ID de empresa de cada sucursal en *Tiendas*. El NIT del emisor y la dirección de la empresa deben estar en *Tiendas* (salen en el ticket).
4. *Facturación electrónica → Probar conexión*: todas las sucursales en verde.
5. Una factura real de bajo monto, y revisar el PDF en FELplex.
6. Activar `felEnabled` en la licencia.

## 7. Preguntas abiertas para FELplex (confirmar en pruebas)

1. ¿FELplex rechaza un `external_id` repetido? Si lo hace, se podrían reintentar con seguridad las facturas que quedaron sin respuesta.
2. Para receptor con DPI: ¿`tax_code_type` es `CUI` o `DPI`? Hoy se envía `CUI`, que es el nombre que usa su endpoint de búsqueda.
3. ¿Cada establecimiento es una «empresa» con su propio ID y API Key, o una sola API Key sirve para todos? El sistema soporta ambas cosas.
4. El formato exacto del arreglo `errors` cuando la SAT rechaza un documento. Se admiten texto u objeto con código y mensaje.

## 8. Pruebas automáticas

- `npx tsx scripts/fel-selftest.ts`: armado del documento, descuentos, IVA aparte, CF, pequeño contribuyente y nombres de campos de FELplex (sin red).
- `npx tsx scripts/fel-e2e.ts`: contra el backend corriendo con `FEL_PROVIDER=mock`. Cubre venta con factura, bloqueo de edición, nota de crédito con devolución de inventario, anulación y rechazo de la SAT.
