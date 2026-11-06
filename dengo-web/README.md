# dengo-web — sitio público de cada cliente

Astro (SSR, adaptador Node). Un solo código sirve a todos los clientes; cada
cliente corre su propio proceso apuntando a **su** backend (`DENGO_API`).

## Qué diseño ve cada cliente
`SiteConfig.site` (POS → Página web → Sitio web) elige el diseño:

| `site` | Diseño |
|---|---|
| `plantilla` (por defecto) | Bloques que el cliente arma desde el POS: portada, ofertas, categorías, historia, galería, sucursales, contacto. 3 estilos: `clasico`, `moderno`, `editorial`. |
| `<clave>` | Diseño a la medida en `src/sites/<clave>/` (se cobra aparte). Puede usar bloques de `src/blocks/` o ninguno. |

`WEB_SITE=<clave>` en el entorno fija el diseño sin importar la base.

### Crear un diseño a la medida
1. Copiar `src/sites/aurora/` a `src/sites/<cliente>/` (es la demo a la medida).
2. Su `index.ts` exporta `Home`, `Offers`, `Offer`, `Coupon`, `Login`, `NotFound`.
3. Registrarlo en `src/sites/registry.ts`.
4. En el POS del cliente: `SiteConfig.site = '<cliente>'` (o `WEB_SITE`).

Todo diseño reutiliza el núcleo (`src/core/`): datos del POS, SEO y datos
estructurados, formulario de cupón (con anti‑bots), QR + código de barras,
horario "abierto ahora".

## Cupones
- La persona pide su cupón en `/ofertas/<slug>` (nombre + teléfono) → `/cupon/<código>` con QR y código de barras (`CUP-XXXXXXXX`).
- En caja: se escanea en el campo de productos o en "Aplicar cupón". El servidor calcula y valida el descuento; un cupón se usa una vez. Anular la venta lo devuelve.

## «Ingresar» (equipo y maestros)
Si en POS → Página web → Sitio web → «Botón Ingresar» se llena la dirección del POS y/o del portal de maestros,
la página muestra «Ingresar» y la ruta `/ingresar` (con el diseño del sitio). Un solo formulario: el backend
revisa la contraseña (`POST /api/site/login`) y, según el rol, manda a la persona a `<POS>/entrar` o
`<portal>/entrar` con un código de un solo uso (60 s, en memoria del backend; `lib/handoff.ts`), nunca con el token.
Cada diseño exporta además `Login` y `NotFound` (404).

## Desarrollo
```bash
npm install
WEB_ALLOW_SWITCH=1 npm run dev     # http://127.0.0.1:4321  (?diseno=aurora para ver la demo; se recuerda en una cookie, ?diseno= la borra)
```

## Producción (por cliente)
```bash
npm install && npm run build
HOST=127.0.0.1 PORT=4321 DENGO_API=http://127.0.0.1:3001 pm2 start dist/server/entry.mjs --name <Cliente>-web
```
Caddy (el `/api` del mismo dominio va al backend, para el formulario del cupón):
```caddy
tudominio.com {
	encode zstd gzip
	handle /api/* { reverse_proxy 127.0.0.1:3001 }
	handle { reverse_proxy 127.0.0.1:4321 }
}
```

## Fotos de la demo (Aurora)
Wikimedia Commons, con crédito en el pie de página (ver `public/sites/aurora/credits.json`):
lápices (Chevre, CC BY‑SA 3.0; B. D. Esham, CC BY‑SA 4.0), crayones Conté (Just plain Bill, CC BY‑SA 3.0),
sacapuntas Apsco (CC BY‑SA 3.0), cuaderno (Tobin, CC BY‑SA 2.0). La foto del sacapuntas suizo (CC BY 4.0) está descargada pero no se usa.

## Variedades Dayana (`site = 'dayana'`)
Diseño a la medida en `src/sites/dayana/`, «la caja de crayones»: la estructura de la demo (Aurora)
adaptada a Dayana, con un elenco de crayones que guía la página. Roja y Azul (los dos colores del logo)
están en 3D en la portada, entre lápices y crayones flotando (`hero3d.ts`, three.js): miran el puntero,
parpadean, saludan y saltan al tocarlos. Luego Roja baja a la esquina y comenta cada sección (`GUIDE` en
`data.ts`; se puede ocultar). La historia es un cuaderno que pasa sus páginas al bajar mientras un crayón
dibuja la casa en cada etapa (`Drawing.astro`). Destacados en tarjetas que corren de lado, cada una con su
crayón; Black November con dos crayones de lentes oscuros sosteniendo el letrero, cuenta regresiva y el
cupón ahí mismo; un crayón traza el camino por los servicios; y en «Tiendas» cada crayón está despierto si
su tienda está abierta y dormido si está cerrada. No hay pedidos por WhatsApp: el número es solo para consultas.

- Páginas internas con el mismo ánimo que la demo, cada una en su campo de color: Ofertas (amarillo, burbujas que
  flotan y rebotan, calcomanías), Obtener cupón (rojo, boleto con tijeras que cortan y confeti), el cupón (cielo,
  sello «¡Listo!» y la tripulación celebrando; al imprimir sale solo el boleto), Ingresar (pase de entrada colgado
  sobre los útiles 3D) y 404 (rosado). Efectos compartidos en `fx.ts` (confeti, burbujas).
- Los personajes en SVG: `Crayon.astro` (poses, caras y accesorios por props). Nombres y colores en `CREW` (`data.ts`).
- Textos propios de la marca (historia, destacados, surtido, servicios, misión y visión): `src/sites/dayana/data.ts`.
  Ofertas, sucursales y contacto vienen del POS; las sucursales con «bodega» en el nombre no se muestran.
- Fotos: las de la tienda (historia, sucursales, categorías) están en `public/sites/dayana/real/`. Las de
  productos y servicios sin foto propia (Parker, acrílicos, leyes, estuches, billeteras, fotocopiadora,
  emplasticado, espiral, empastado) siguen **de referencia** (Commons, con crédito en el pie). Al tener las
  reales, reemplazarlas y poner `PROTOTYPE = false` en `data.ts`.
- Horario: igual en las cuatro tiendas y distinto en fin de semana, así que vive en `HOURS` / `shopState()`
  de `data.ts` (el POS solo guarda una hora de apertura y cierre por sucursal).
- Logo vectorizado: `public/sites/dayana/logo.svg`. Tipografías: Fraunces (títulos), Switzer (texto, en `public/sites/dayana/fonts/`) y Caveat (letra a mano).
- Su CSS común va bajo `html[data-site='dayana']` con clases `dy-` (marco) y `d-` (páginas internas); la portada usa estilos con alcance de Astro. Así no choca con los otros diseños, cuyo CSS se empaqueta junto.
- El diseño anterior (marco de foto que crece) quedó respaldado fuera del repo en `.taste-skill/dayana/v2-backup/`.
