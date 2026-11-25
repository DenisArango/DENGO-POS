# Product

<!-- impeccable:product-schema 1 -->

> Escrito sin entrevista aparte: todo sale de lo que Denis respondió en la sesión del 2026-11-25 al pedir el panel. Lo inferido va marcado *(inferido)*.

## Platform

web

## Users

Una sola persona: Denis, el proveedor de DENGO POS. Da de alta negocios nuevos (librerías, tiendas) y administra a los que ya tiene. Entra desde su computadora por un túnel SSH al servidor. Los clientes finales nunca ven este panel.

## Product Purpose

Hacer sin terminal todo lo que hoy se hace a mano en el servidor para un cliente: base de datos, carpeta y `.env`, tablas, administrador inicial, proceso pm2, dominio en Caddy, módulos (POS, portal de maestros, página web, FEL, IA), migración de datos y despliegues. Éxito = un cliente nuevo queda en línea desde un formulario, y cualquier problema se ve y se arregla desde aquí.

## Operating Context

- Servidor único (3.7 GB RAM) con un proceso por cliente, PostgreSQL local y Caddy.
- Cada cliente tiene su dominio propio: POS en `pos.<dominio>`, página en `<dominio>`.
- Facturación electrónica solo con Digifact; usuario y clave de API únicos de Denis; folios y plazos se asignan en el portal de Digifact.
- Una sola API key de Anthropic; por cliente se controla encendido y límite mensual.
- El sistema de origen más común de los clientes nuevos es Avances Guatemala; sus exportaciones se convierten a la plantilla DENGO en una sesión con Claude, no en el panel.
- Suspender a un cliente deja el sistema arriba mostrando «Servicio suspendido».

## Capabilities and Constraints

- Alta por asistente, operación de clientes existentes (estado, métricas, módulos, IA, FEL, suspensión, reinicio, logs, respaldos, archivar), despliegue a todos, migración con plantilla DENGO o Loyverse.
- Interfaz en español de Guatemala; montos en quetzales (Q).
- Sin dominio propio por ahora (127.0.0.1:4900).

## Brand Commitments

- Marca DENGO: azul tinta `#1E4D68` y coral `#E07A5F` (símbolo hexagonal del logo).
- Denis rechaza las interfaces planas, grises o neutras: quiere color, íconos de color y microanimaciones.
- Estilo fijado por Denis: **bento grid con volumen, con animaciones y cosas que le den vida**. Un solo estilo, aplicado completo.

## Evidence on Hand

- Datos reales de un cliente (Variedades Dayana) solo en la base local de pruebas; nada de clientes, cifras o testimonios inventados en la interfaz.

## Product Principles

1. Nada destructivo sin respaldo antes y sin confirmación explícita.
2. Cada acción muestra en vivo qué está haciendo el servidor y deshace lo hecho si falla.
3. Los secretos no se muestran ni se guardan en logs.
4. El estado de cada cliente se entiende de un vistazo.
