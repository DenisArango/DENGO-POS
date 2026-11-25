---
version: 1
slug: "web"
primary_target: "web"
related_targets: []
---

# dengo-admin web — consola del proveedor

Mode: Operate. Audiencia: Denis (proveedor) administrando clientes de DENGO POS. Tarea: dar de alta, vigilar y operar clientes; migrar datos; desplegar.

## Direction contract

THESIS: Cada cliente es un mosaico vivo en un tablero bento con volumen; el estado del servidor y de cada negocio se lee por color y movimiento antes que por texto. Rechaza la tabla gris de "instancias" de un panel de hosting.

OWN-WORLD: Riel lateral azul tinta #1E4D68 con el símbolo DENGO; suelo azul hielo #EEF3F7; mosaicos blancos con radio 22px, borde superior de luz 1px, sombras en capas con desplazamiento (no halos). Coral #E07A5F para acción primaria; estados: esmeralda en línea, ámbar pendiente/suspendido, rosa caído, pizarra archivado. Bricolage Grotesque para títulos y cifras, Inter para UI, JetBrains Mono solo en logs y valores técnicos. Íconos lucide en baldosas de color.

STORY: Denis abre el panel, ve qué clientes están en línea y cuánto vendieron hoy, entra a uno para cambiar módulos o suspender, o lanza un alta y mira cómo el servidor la ejecuta paso a paso hasta darle las credenciales.

FIRST VIEWPORT: Riel a la izquierda; arriba título "Clientes" con acciones Nuevo cliente (coral) y Desplegar; debajo grilla bento de 12 columnas: mosaicos de cliente (estado con pulso, dominio, ventas de hoy, barras de 14 días, módulos), mosaico alto de servidor (RAM/disco/carga), mosaico de trabajos recientes y, si falta preparación, mosaico ámbar de checklist.

FORM: bento grid con volumen fijado por el usuario. seed: none (pinned) — mundo: «bento grid con volumen, pero que tenga animaciones y cosas que le den vida»; primera pantalla: «un panel de administracion para dar de alta nuevos clientes» y administrar los existentes («nuevos y existentes»). Movimiento firma: el "listón de pasos" de un trabajo que se enciende en vivo con el log SSE, con checks que se dibujan y el mosaico que se eleva al terminar.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
