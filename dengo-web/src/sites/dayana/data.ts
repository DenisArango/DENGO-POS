// Variedades Dayana — the brand's own words and the catalogue the site shows.
// Everything the POS doesn't hold (story, catalogue, services, hours,
// mission) lives here; offers, branches and contact come from the POS.
// The texts are the client's (sent 2026-11-05), trimmed only to fit.

/** A few photos (Parker/Sheaffer pens, the photocopier) are still references (Commons). Flip to false once real ones replace them. */
export const PROTOTYPE = true

export const BRAND = {
  name: 'Variedades Dayana',
  short: 'Dayana',
  slogan: 'En servicio y calidad nadie nos gana',
  since: 2010,
  origin: 'Rabinal, Baja Verapaz',
  whatsapp: '5912 5855',
  facebook: { label: 'Variedades Dayana', url: 'https://www.facebook.com/search/top?q=Variedades%20Dayana' },
  instagram: { label: 'Variedades_Dayana23', url: 'https://www.instagram.com/variedades_dayana23/' },
  tiktok: { label: 'variedades_dayana15', url: 'https://www.tiktok.com/@variedades_dayana15' },
}

/**
 * The crayon crew that guides the visitor. Roja and Azul wear the logo's two
 * colours; Sol and Pino come from the rest of the box. Names are a proposal
 * for the client to confirm.
 */
export const CREW = {
  roja: { name: 'Roja', wax: '#ff2a2a', wrap: '#e8141c', shade: '#9e0710', hex: 0xe8141c },
  azul: { name: 'Azul', wax: '#2a56d6', wrap: '#173a9e', shade: '#0a1d5c', hex: 0x173a9e },
  sol: { name: 'Sol', wax: '#ffd23a', wrap: '#ffb800', shade: '#b97c00', hex: 0xffb800 },
  pino: { name: 'Pino', wax: '#2fd07a', wrap: '#12a356', shade: '#0a6634', hex: 0x12a356 },
}
export type CrewKey = keyof typeof CREW

/** What Roja says in the corner as each part of the page comes into view. */
export const GUIDE: Record<string, string> = {
  hola: '¡Hola! Soy Roja. Te acompaño por la tienda.',
  historia: 'Este cuaderno lo empezamos en 2010. Baja y pasa la página.',
  destacados: 'Lo que más nos piden. Toca los botones para ver más.',
  cupon: '¡Esta es la oferta! Recorta tu cupón aquí abajo.',
  servicios: 'Esto también lo hacemos en la tienda.',
  mueve: 'Esto es lo que nos mueve cada mañana.',
  tiendas: 'Si una tienda está cerrada, mis amigos duermen. ¡Shhh!',
  contacto: '¿Una pregunta? Escríbenos, aquí estamos.',
}

export interface Photo { src: string; w: number; h: number; alt: string; caption: string; credit: string; ref: boolean; set?: string }
/**
 * Every photo wider than 900 px also ships an 800 px copy (`name-800.webp`,
 * made with sharp when the photos are added), so phones and slow
 * connections download about a third of the bytes. `set` is its srcset.
 */
const srcset = (src: string, w: number) => w > 900 ? `${src.replace(/\.webp$/, '-800.webp')} 800w, ${src} ${w}w` : undefined
/** The shop's own photos (public/sites/dayana/real). */
const R = (file: string, w: number, h: number, alt: string, caption: string): Photo =>
  ({ src: `/sites/dayana/real/${file}.webp`, w, h, alt, caption, credit: '', ref: false, set: srcset(`/sites/dayana/real/${file}.webp`, w) })
/** Reference photos from open collections, until the shop's own replace them. */
const P = (file: string, w: number, h: number, alt: string, caption: string, credit: string): Photo =>
  ({ src: `/sites/dayana/ref/${file}.webp`, w, h, alt, caption, credit, ref: true, set: srcset(`/sites/dayana/ref/${file}.webp`, w) })

export const PHOTOS = {
  // ── the shop's own ──
  before: R('central-antes', 887, 883, 'La casa de Rabinal antes de la tienda, con su muro y su portón de reja', 'La casa, antes de la tienda'),
  firstStore: R('central-primera', 722, 659, 'La primera Variedades Dayana: una casa rosada de esquina con su rótulo verde y la puerta abierta', 'Los primeros días'),
  ourStreet: R('central-calle', 872, 883, 'Una calle de Rabinal con palmeras; la casa de la esquina es donde está Variedades Dayana', 'Nuestra calle'),
  firstShelves: R('central-abarrotes', 720, 540, 'Los primeros estantes de abarrotes y una vitrina de vidrio en la tienda de Rabinal', 'Los primeros estantes'),
  firstVitrinas: R('central-vitrinas', 720, 540, 'Vitrinas de vidrio con productos y un estante de abarrotes al fondo', 'Las primeras vitrinas'),
  firstSupplies: R('central-utiles', 1280, 960, 'Estantes con cuadernos, papel y útiles escolares en la tienda de Rabinal', 'Llegan los útiles escolares'),
  middle: R('central-medio', 1280, 960, 'Vitrinas y refrigeradores de bebidas en la tienda de Rabinal', 'La tienda va creciendo'),
  party: R('fiestas', 1600, 739, 'Estante de decoración de fiestas con letreros de «Mis 15 años» y «Feliz cumpleaños», globos de números y velas', 'Decoración de fiestas'),
  groceries: R('abarrotes', 1600, 739, 'Pasillo de abarrotes con golosinas, galletas y productos de limpieza en sus estantes', 'Abarrotes y limpieza'),
  shelves: R('central-estantes', 1280, 960, 'Pasillo con estantes de útiles, juguetes y artículos de oficina', 'Todo en un mismo lugar'),
  centralFront: R('central-fachada', 987, 739, 'La casa de dos niveles de Variedades Dayana Central, en una esquina de Rabinal', 'Variedades Dayana Central, Rabinal'),
  centralStreet: R('central-frente', 1600, 739, 'El frente de Variedades Dayana Central, con sus rótulos de útiles escolares sobre la calle', 'Variedades Dayana Central'),
  centralXmas: R('central-navidad', 994, 653, 'La fachada de Variedades Dayana Central decorada en Navidad', 'Dayana en Navidad'),
  centralInside: R('central-interior', 1600, 739, 'Vitrinas y estantes llenos de útiles, juguetes y papelería en Variedades Dayana Central', 'Central por dentro'),
  jassminFront: R('jassmin-fachada', 1600, 1200, 'Fachada amarilla de Librería Multiservicios Jassmin con sus rótulos de útiles escolares', 'Librería Jassmin'),
  jassminInside: R('jassmin-interior', 1280, 960, 'Mochilas colgadas, papel de colores y vitrinas de útiles en Librería Jassmin', 'Jassmin por dentro'),
  // vectorised from the shop's 553 px JPEG (potrace, one layer per colour)
  jassminLogo: { src: '/sites/dayana/real/jassmin-logo.svg', w: 600, h: 600, alt: 'Logo de Librería Multiservicios Jassmin', caption: 'Librería Jassmin', credit: '', ref: false },
  dayana2Front: R('dayana2-fachada', 1600, 1200, 'Fachada de Librería Dayana 2 con sus rótulos amarillos', 'Librería Dayana 2'),
  dayana2Inside: R('dayana2-interior', 1599, 899, 'Interior de Librería Dayana 2: mochilas colgadas, papel de colores y estantes de útiles', 'Dayana 2 por dentro'),
  backpacks: R('mochilas', 900, 1600, 'Una pared llena de mochilas de colores colgadas en la tienda', 'Mochilas'),
  cases: R('estuches', 1600, 900, 'Vitrina con estuches, bolsos y billeteras de colores', 'Estuches y bolsos'),
  wallet: R('billeteras', 1600, 900, 'Vitrina con billeteras de cuero en azul, café y negro', 'Billeteras'),
  caps: R('gorras', 1600, 900, 'Gorras de colores sobre las repisas de vidrio de una vitrina', 'Gorras'),
  cubulcoFront: R('cubulco-fachada', 1600, 1023, 'Fachada de Librería Variedades Dayana 4 en Cubulco, con el rótulo de Agente Coosanjer', 'Librería Dayana Cubulco'),
  family: R('cubulco-familia', 1280, 960, 'Tres integrantes de la familia Dayana sonriendo frente a las vitrinas de la tienda de Cubulco', 'La familia Dayana en Cubulco'),
  cubulcoInside: R('cubulco-interior', 1600, 1200, 'Mochilas colgadas del techo, vitrinas y estantes de útiles en la tienda de Cubulco', 'Cubulco por dentro'),
  crafts: R('manualidades', 1600, 739, 'Estantes y vitrinas con artículos de manualidades, foamy, papel de colores y adornos', 'Manualidades'),
  paint: R('pinturas-acrilicas', 739, 1600, 'Estantería llena de frascos de pintura acrílica de todos los colores', 'Pinturas acrílicas'),
  markers: R('marcadores-acrilicos', 720, 849, 'Estantes con marcadores acrílicos, crayones y pinturas', 'Marcadores acrílicos'),
  laws: R('leyes', 1600, 739, 'Libros de leyes de la SAT y de la Superintendencia de Bancos en un mostrador', 'Leyes y códigos'),
  books: R('obras', 739, 1600, 'Estantería con obras literarias como El diario de Ana Frank', 'Obras literarias'),
  spiral: R('encuadernado', 1600, 739, 'Una encuadernadora con un documento y pastas rojas listas para encuadernar', 'Encuadernados'),
  bind: R('empastado', 1600, 739, 'Una máquina de encuadernar con espirales negros y pastas azules', 'Empastados'),
  laminate: R('emplasticado', 1600, 739, 'La emplasticadora de la tienda sobre una vitrina', 'Emplasticado'),
  // ── references, until the shop's own photos arrive ──
  ballpoints: P('parker-sheaffer', 1600, 865, 'Un bolígrafo Parker Jotter y un Sheaffer Sentinel lado a lado', 'Parker Jotter y Sheaffer Sentinel', '“Parker Jotter & Sheaffer Sentinel ballpoints”, Francis Flinch, CC0, Wikimedia Commons'),
  fountain: P('plumas-fuente', 1600, 972, 'Una fila de plumas fuente negras con plumilla dorada', 'Plumas fuente', '“Different fountain pens”, Ilkin Santak, CC BY-SA 4.0, Wikimedia Commons'),
  copier: P('fotocopiadora', 1600, 969, 'Una fotocopiadora grande de oficina', 'Fotocopias e impresiones', '“Sharp MX-7500 photocopier”, Baron Maddock, CC BY 4.0, Wikimedia Commons'),
}
export type PhotoKey = keyof typeof PHOTOS

/**
 * The story, as the pages of a drawing notebook (the client's own text).
 * Each page has a crayon drawing of that stage (Drawing.astro draws it as
 * the page opens), one of the shop's photos taped beside it and Roja's line.
 */
// `photo2`, when a page has one, is a second, smaller photo taped beside the first.
export const STORY: { mark: string; title: string; text: string; photo: PhotoKey; photo2?: PhotoKey; say: string; draw: number }[] = [
  { mark: '5 de diciembre de 2010', title: 'Una tienda de barrio', photo: 'before', photo2: 'firstStore', draw: 1, say: 'Así era la casa cuando empezamos.',
    text: 'Nuestra historia comenzó el 5 de diciembre de 2010, con la apertura de nuestra primera tienda y librería en Rabinal, Baja Verapaz. Iniciamos como un pequeño negocio de barrio, para atender a nuestros clientes con la misma calidez y amabilidad que nos enseñaron las generaciones anteriores.' },
  { mark: 'Desde el inicio', title: 'Todo en un mismo lugar', photo: 'firstVitrinas', photo2: 'ourStreet', draw: 2, say: '¡Mira, las primeras vitrinas!',
    text: 'Desde nuestros inicios nos hemos caracterizado por brindar un servicio de calidad, con productos novedosos a precios accesibles. Nuestro compromiso siempre ha sido satisfacer las necesidades de nuestros clientes, para que encuentren todo lo que buscan en un mismo lugar.' },
  { mark: '2011', title: 'Crecer con su confianza', photo: 'firstSupplies', draw: 3, say: 'Cajas y cajas de útiles…',
    text: 'Con el paso del tiempo, la confianza de nuestros clientes nos permitió crecer. En 2011 comenzamos a atender a las Organizaciones de Padres de Familia (OPF), mediante los programas de apoyo del Gobierno, y a diversas instituciones que contribuyeron a nuestro desarrollo.' },
  { mark: '1 de diciembre de 2022', title: 'Librería Jassmin', photo: 'jassminFront', photo2: 'jassminInside', draw: 7, say: '¡Justo donde se estacionan los carros!',
    text: 'Abrimos en el centro de Rabinal, en un punto estratégico donde se estacionan los carros que llegan de nuestras comunidades. Así atendemos a toda la gente que pasa por el centro, sin que tenga que buscarnos hasta la central en zona 4. Con la misma amabilidad que nos caracteriza.' },
  { mark: '1 de febrero de 2024', title: 'Librería Dayana 2', photo: 'dayana2Front', photo2: 'dayana2Inside', draw: 8, say: '¡Y otra más, en la calle principal!',
    text: 'Nuestros clientes de la zona 2 y la zona 3 nos pidieron una librería más cerca: les costaba llegar hasta la central en zona 4. A inicios de 2024 abrimos la tercera, para estar más cerca de ustedes con los mejores productos y servicios. Siempre innovando para atenderlos mejor.' },
  { mark: '15 de noviembre de 2025', title: 'Hasta Cubulco', photo: 'cubulcoFront', photo2: 'cubulcoInside', draw: 5, say: 'De Rabinal hasta Cubulco.',
    text: 'Gracias a nuestras alianzas con proveedores tenemos marcas líderes a precios accesibles en todas nuestras librerías. Así llegaron clientes de toda Baja Verapaz y, a petición de nuestra clientela de Cubulco, el 15 de noviembre de 2025 abrimos Librería Dayana Cubulco, para que no tuvieran que viajar hasta Rabinal.' },
  { mark: 'Hoy', title: 'Parte de nuestra familia', photo: 'family', draw: 6, say: '¡Gracias por ser parte de esta historia!',
    text: 'Hoy, con más de 15 años de experiencia y cuatro sucursales, seguimos con la misma dedicación que nos vio nacer, apostando por la innovación, la calidad y la atención personalizada. Nuestra esencia: hacer de nuestros clientes parte de nuestra familia. ¡Gracias por confiar en nosotros!' },
]

/** The lines the shop wants seen first. Each choice swaps the picture; a crayon minds each one. */
export const FEATURED: {
  id: string; brand: string; title: string; text: string; color: string; ink: string
  choices: { label: string; photo: PhotoKey }[]; also?: string
  crew: { who: CrewKey; pose: 'idle' | 'wave' | 'cheer' | 'hold' | 'read' | 'point'; acc: ('glasses' | 'shades' | 'cap' | 'beret' | 'backpack' | 'book' | 'brush' | 'pen' | 'apron')[]; style?: string }
}[] = [
  { id: 'totto', brand: 'Totto', title: 'De la mochila a la gorra', color: 'var(--red)', ink: '#fff',
    text: 'Mochilas, estuches, gorras, billeteras y loncheras de la marca Totto. Para el primer día de clases y para todos los que siguen.',
    choices: [{ label: 'Mochilas', photo: 'backpacks' }, { label: 'Estuches', photo: 'cases' }, { label: 'Billeteras', photo: 'wallet' }, { label: 'Gorras', photo: 'caps' }],
    also: 'También loncheras.',
    crew: { who: 'sol', pose: 'wave', acc: ['backpack', 'cap'], style: '--pack:#173a9e;--pack-2:#0a1d5c;--cap:#e8141c' } },
  { id: 'plumas', brand: 'Parker y Sheaffer', title: 'Plumas para firmar lo importante', color: 'var(--navy)', ink: '#fff',
    text: 'Plumas y bolígrafos Parker y Sheaffer. Para un título, un contrato o un regalo que se guarda.',
    choices: [{ label: 'Bolígrafos', photo: 'ballpoints' }, { label: 'Plumas fuente', photo: 'fountain' }],
    crew: { who: 'roja', pose: 'wave', acc: ['pen'] } },
  { id: 'arte', brand: 'Línea de arte', title: 'Color para artesanos y artistas', color: 'var(--yellow)', ink: 'var(--ink)',
    text: 'Pinturas y marcadores acrílicos para quien trabaja con las manos.',
    choices: [{ label: 'Pinturas acrílicas', photo: 'paint' }, { label: 'Marcadores acrílicos', photo: 'markers' }],
    crew: { who: 'pino', pose: 'wave', acc: ['beret', 'brush', 'apron'], style: '--beret:#e8141c;--paint:#ff2a2a' } },
  { id: 'leyes', brand: 'Leyes y obras', title: 'Para estudiar, ejercer y leer', color: 'var(--green)', ink: '#fff',
    text: 'Leyes y códigos actualizados, y obras literarias.',
    choices: [{ label: 'Leyes y códigos', photo: 'laws' }, { label: 'Obras literarias', photo: 'books' }],
    crew: { who: 'azul', pose: 'read', acc: ['glasses', 'book'], style: '--book:#e8141c' } },
]

/** Everything else on the shelves (the client's list). */
export const SHELVES: { name: string; note: string; photo: PhotoKey; color: string; ink: string }[] = [
  { name: 'Útiles escolares y de oficina', note: 'Para la lista del colegio y para el escritorio', photo: 'dayana2Inside', color: 'var(--sky)', ink: 'var(--ink)' },
  { name: 'Manualidades', note: 'Para hacer, pegar, cortar y decorar', photo: 'crafts', color: 'var(--purple)', ink: '#fff' },
  { name: 'Decoración de fiestas', note: 'Para cumpleaños y celebraciones', photo: 'party', color: 'var(--pink)', ink: 'var(--ink)' },
  { name: 'Abarrotes y limpieza', note: 'La canasta básica, como desde el primer día', photo: 'groceries', color: 'var(--orange)', ink: 'var(--ink)' },
]

/** Services, done in the store (the client's list). `only` names the one branch that has it. */
export const SERVICES: { name: string; note: string; photo: PhotoKey; only?: string }[] = [
  { name: 'Encuadernados', note: 'Con espiral continuo.', photo: 'spiral' },
  { name: 'Empastados', note: 'Pegados y cosidos.', photo: 'bind' },
  { name: 'Fotocopias e impresiones', note: 'Fotocopias, ampliaciones y reducciones. Impresiones en blanco y negro y a color.', photo: 'copier' },
  { name: 'Emplasticado', note: 'De documentos, desde tamaño carné hasta tamaño oficio.', photo: 'laminate' },
  { name: 'Agente Mi Coope de Coosanjer', note: 'Exclusivo de Librería Dayana Cubulco.', photo: 'cubulcoFront', only: 'Cubulco' },
  { name: 'Caja de Desarrollo de Génesis Empresarial', note: 'Exclusiva de Variedades Dayana Central.', photo: 'centralStreet', only: 'Central' },
]
/** Said once under the services. */
export const SERVICE_NOTES = {
  groups: 'Atención personalizada a Organizaciones de Padres de Familia (OPF), clientes mayoristas e instituciones, con precios especiales.',
  pay: 'Aceptamos pagos con tarjeta y transferencias electrónicas.',
}

export const MISSION = {
  mission: { before: 'Somos una empresa honesta y responsable que ofrece una variada cartera de productos y servicios de calidad para satisfacer los deseos y necesidades de nuestros clientes, ', mark: 'atendiendo con calidez y eficiencia', after: ', sin olvidarnos de nuestra responsabilidad social. Trabajamos junto a nuestros colaboradores para mejorar la calidad de vida de las familias de nuestro municipio.' },
  vision: 'Ser la primera y mejor opción de compra y distribución de productos de librería, canasta básica y limpieza, tanto para quien compra al detalle como para los mayoristas. Con nuestra experiencia y compromiso queremos ganar la confianza de nuestros clientes y proveedores, a la vanguardia de los cambios que exige el mercado.',
}

/**
 * Opening hours, the same in every store (the client's text). The POS keeps
 * one open/close time per branch, which can't say "different on weekends",
 * so the site uses this instead.
 */
export const HOURS = [
  { days: 'Lunes a viernes', from: '6:30 a. m.', to: '6:30 p. m.', open: 6 * 60 + 30, close: 18 * 60 + 30 },
  { days: 'Sábados y domingos', from: '7:00 a. m.', to: '5:00 p. m.', open: 7 * 60, close: 17 * 60 },
] as const
const hoursOn = (day: number) => HOURS[day === 0 || day === 6 ? 1 : 0]
/** Open now? In Guatemala time (UTC−6, no daylight saving), wherever this runs. */
export function shopState(now = new Date()) {
  const gt = new Date(now.getTime() - 6 * 3_600_000)
  const day = gt.getUTCDay()
  const t = gt.getUTCHours() * 60 + gt.getUTCMinutes()
  const today = hoursOn(day)
  if (t >= today.open && t < today.close) return { open: true, label: `Abierto ahora · cierra a las ${today.to}` }
  if (t < today.open) return { open: false, label: `Cerrado · abre hoy a las ${today.from}` }
  return { open: false, label: `Cerrado · abre mañana a las ${hoursOn((day + 1) % 7).from}` }
}

export const visibleBranches = <T extends { name: string }>(list: T[]) => list.filter(b => !/bodega/i.test(b.name))
/**
 * How each store shows on the site. The POS keeps the names in capitals and
 * the municipality in different fields (or inside the address, or as the
 * default "Guatemala"), so the site takes from the POS only the street and
 * the phone (live, so a correction there shows here) and names each store
 * the way the family does in its story, with its real municipality.
 */
// `inside` is the shop's own photo of that store from the inside (the card
// flips to it); `motto` is the line the family gave each store.
const STORES: { match: RegExp; name: string; short: string; town: string; photo: PhotoKey; inside?: PhotoKey; logo?: PhotoKey; main?: boolean; motto?: string }[] = [
  { match: /jass?min/i, name: 'Librería Jassmin', short: 'Jassmin', town: 'Rabinal, Baja Verapaz', photo: 'jassminFront', inside: 'jassminInside', logo: 'jassminLogo', motto: 'Con la misma amabilidad que nos caracteriza' },
  { match: /cubulco/i, name: 'Librería Dayana Cubulco', short: 'Cubulco', town: 'Cubulco, Baja Verapaz', photo: 'cubulcoFront', inside: 'cubulcoInside' },
  { match: /\b2\b/, name: 'Librería Dayana 2', short: 'Dayana 2', town: 'Rabinal, Baja Verapaz', photo: 'dayana2Front', inside: 'dayana2Inside', motto: 'Siempre innovando para atenderlos mejor' },
  { match: /central|principal/i, name: 'Variedades Dayana Central', short: 'Central', town: 'Rabinal, Baja Verapaz', photo: 'centralFront', inside: 'centralInside', main: true },
]
const titleCase = (t: string) => t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase())
/** "+502 5123 6297" / "59125855" → "5123 6297" */
export const fmtPhone = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^502(?=\d{8}$)/, '')
  return d.length === 8 ? `${d.slice(0, 4)} ${d.slice(4)}` : (p ?? '').trim() || null
}
export function storeCard(b: { name: string; address: string; city: string; phone: string }) {
  const known = STORES.find(st => st.match.test(b.name))
  // the street alone: drop a municipality typed into the address
  const street = (b.address ?? '').replace(/[,\s]*(rabinal|cubulco)[,\s]*(baja\s+verapaz)?\s*$/i, '').trim()
  const town = known?.town ?? (b.city && !/^guatemala$/i.test(b.city) ? b.city : '')
  return {
    name: known?.name ?? titleCase(b.name),
    short: known?.short ?? titleCase(b.name),
    street, town,
    address: [street, town].filter(Boolean).join(', '),
    phone: fmtPhone(b.phone),
    photo: known?.photo ?? ('centralFront' as PhotoKey),
    inside: known?.inside,
    motto: known?.motto,
    logo: known?.logo,
    main: !!known?.main,
  }
}

/** An offer's name for a heading: the part before a colon ("Black November Totto: 15% de descuento" → "Black November Totto"). */
export const title = (name: string) => name.split(':')[0]!.trim() || name
