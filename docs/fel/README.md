# Facturación electrónica (FEL Guatemala): Digifact y FELplex

Estado: **listo para conectar.** Todo el flujo funciona con el simulador interno (`FEL_PROVIDER=mock`). Para facturar de verdad solo faltan las credenciales de FELplex en el `.env` de cada cliente.

Referencia de la API: https://developers.felplex.com (colección de Postman). Hay una copia legible en [felplex_guatemala.txt](felplex_guatemala.txt) y la colección completa en [felplex_postman.json](felplex_postman.json).

---

## 0. Digifact (certificador actual, desde nov. 2026)

DENGO tiene dos certificadores: **Digifact** (`FEL_PROVIDER=digifact`) y FELplex. Lo de este documento sobre el flujo (caja, notas de crédito, anulación, reintentos) vale para los dos. Lo específico de Digifact:

- **Documentación:** https://documentacion.digifact.com/gt/api (formato NUC JSON en `/gt/nuc/json`, ejemplos en `/gt/nuc/ejemplos`). Portal de pruebas: https://testgt.digifact.com/.
- **Credenciales por cliente:** NIT del emisor, usuario y clave de API. Un solo usuario sirve para **todos los establecimientos**. La sucursal se distingue por su **código de establecimiento SAT** (*Configuración → Tiendas*; vacío = `DIGIFACT_ESTABLISHMENT`).
- **Frases (`DIGIFACT_FRASES`):** salen del RTU del cliente. Si no coinciden, la SAT rechaza con «VALIDACION 2.6.1.4 … no corresponde a la afiliación». Ejemplos: `1:1` sujeto a pagos trimestrales ISR, `1:2` sujeto a retención definitiva ISR. Pregúntaselo al contador del cliente.
- **PDF:** Digifact no da un enlace público. DENGO guarda un enlace propio firmado (`/api/fel/doc/<autorización>.pdf?k=…`) que pide el PDF a Digifact al abrirlo. Funciona sin sesión, así que se puede mandar al maestro del portal, pero no se puede adivinar el de otro documento.
- **Anulación y nota de crédito:** la fecha de emisión, el receptor, la serie y el número del original se leen del XML certificado en Digifact. No hace falta guardar nada más.
- **Saldo de DTE:** la API no lo da. «Probar conexión» solo valida el usuario. El bolsón se ve en el portal de Digifact.
- **Consulta de CUI:** Digifact solo documenta la consulta de NIT. Con CUI, «Buscar» responde «no encontrado» y el nombre se escribe a mano.
- **Producción:** `DIGIFACT_ENV=production`. Requiere la firma electrónica del emisor (Agencia Virtual SAT); en pruebas no.

Ambiente de pruebas (verificado el 2026-11-24): emisor de prueba NIT 5888492, establecimiento **2**, frases `1:2`. El establecimiento 1 no existe para ese NIT.

```
npx tsx scripts/fel-digifact-live.ts            # certifica, nota de crédito, PDF y anula (rechaza correr en producción)
API=http://localhost:3011 npx tsx scripts/fel-e2e.ts   # flujo completo por la API con la BD de demo
```

**Por confirmar con Digifact:**
1. Si en producción firman ellos con la firma del emisor o la mandamos nosotros.
2. Si existe forma de evitar duplicados por referencia interna. Con `VALIDAR_REFERENCIA_INTERNA=VALIDAR` en pruebas no los rechazó. Mientras tanto, un timeout no se reintenta solo.
3. Cuánto dura el token en producción. En pruebas dura 30 días; DENGO lo renueva solo.
4. ~~Receptor con CUI~~: probado el 2026-11-24 con `TaxIDType: "CUI"` (factura, nota de crédito y anulación). En pruebas la SAT es simulada y acepta cualquier CUI; en producción sí lo valida.
5. El formato para pequeño contribuyente (FPEQ), porque el NIT de prueba es régimen general.

## 0.1 Contingencia (sin conexión con el certificador)

Basado en el procedimiento oficial: **«Reglas y validaciones FEL» v2.2 (abril 2026), sección 4.1 y anexos 5.4 / 2.22**. Hay una copia en [SAT_FEL_Reglas_y_validaciones_v2.2.pdf](SAT_FEL_Reglas_y_validaciones_v2.2.pdf).

**Cuándo una factura entra en contingencia:**
- **En caja, sin respuesta:** Digifact no responde al cobrar, porque no hay conexión o se agotó el tiempo. Al documento se le asigna un **número de acceso** aleatorio de 9 dígitos (100000000–999999999) y la fecha de emisión queda fija.
- **El POS sin servidor:** la venta se guarda en la cola offline y el POS genera el número de acceso en ese momento.

**Lo que se imprime** (ticket; regla 4.1, 1-b a 1-e):
- el título **«Documento en contingencia»** y el tipo de documento;
- **Número de acceso**;
- emisor, NIT y frases;
- fecha y hora de emisión;
- receptor;
- detalle y total.

**No lleva** serie, número ni autorización. Al pie dice: «Emisión en contingencia, obtenga su DTE certificado en el sitio www.sat.gob.gt/fel». También lleva el QR del verificador de la SAT en modo contingencia (2.22.2).

**Certificación posterior:**
- **Reintento:** el reintento automático manda el documento con el mismo número de acceso (`NumeroAcceso`) y la fecha original. No cuenta el límite de intentos.
- **Al volver la conexión:** apenas una factura se certifica, DENGO manda las pendientes («de forma inmediata», punto 3).
- **Plazo:** la SAT rechaza una emisión con más de **5 días** de antigüedad (validación 2.2.1, regla FEL_INF300; verificado en pruebas). Pasado el plazo, DENGO no la manda y la deja «con error» explicando el motivo; lo usual es anular y emitir una factura nueva, con el visto bueno del contador.
- **Timeout:** si se agotó el tiempo, el documento queda en contingencia pero **no** se reintenta solo, porque pudo haberse certificado. En pruebas, Digifact no rechazó un `NumeroAcceso` repetido.

**Aviso de contingencia** (punto 3): en *Configuración → Facturación electrónica → Contingencias* aparecen los periodos por sucursal, con inicio, fin, establecimiento, motivo, cantidad de documentos y estado de cada uno. El botón «Copiar datos del aviso» copia lo que hay que llenar en la Agencia Virtual SAT → Factura Electrónica en Línea → Aviso de Contingencia, o en el correo a efactura@sat.gob.gt. Después se marca como presentado.

Solo Digifact y el simulador mandan el número de acceso. FELplex no documenta ese campo.

## 0.2 Factura en PDF personalizada

El enlace «Factura PDF» (`/api/fel/doc/<autorización>.pdf?k=…`, firmado, sin sesión) ya no entrega el PDF del certificador. Entrega **nuestro PDF**, dibujado a partir del **XML certificado** (`lib/fel/dte-xml.ts` y `invoice-pdf.ts`), así que los datos fiscales siempre son exactamente los que tiene la SAT.

**Marca del cliente**, por sucursal en *Configuración → Tiendas*:
- logo;
- nombre de la empresa;
- teléfono, correo y sitio web;
- lema;
- **color de la factura**;
- **pie de la factura**.

**Contenido:**
- **Documento:** tipo, serie, número, autorización y fecha de emisión; el número de acceso si fue contingencia.
- **Partes:** emisor (razón social, NIT, establecimiento y dirección) y receptor (NIT, CUI o CF).
- **Detalle:** cantidad, precio, descuento y total.
- **Totales:** IVA incluido, total y total en letras.
- **Frases:** con el texto oficial de la SAT.
- **Notas de crédito:** el documento que se modifica y el motivo.
- **Certificación:** datos del certificador y QR del verificador de la SAT (2.22.1).
- **Marcas de agua:** «PRUEBA · SIN VALIDEZ FISCAL» fuera de producción y «ANULADO» si se anuló.

**Versión del certificador:** se obtiene con `&original=1` (enlace «Versión del certificador» en el detalle de la venta).

**Archivo del XML:** el XML certificado se guarda en la tabla `FEL_DOCUMENT_XML`; la SAT exige conservarlo durante el plazo de prescripción. Los documentos anteriores lo descargan del certificador la primera vez que se abre su PDF.

**Vista previa sin tocar la BD:**

```
INVOICE_COLOR=#0F766E LOGO_FILE=logo.png FOOTER="..." npx tsx scripts/fel-pdf-preview.ts <autorización> salida.pdf
```

**Pruebas:**

```
DOWN=http://localhost:3012 UP=http://localhost:3013 npx tsx scripts/fel-contingency-e2e.ts
```

Para la prueba, `DOWN` es un backend con `DIGIFACT_BASE_URL` apuntando a un puerto muerto y `UP` es uno normal.

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
