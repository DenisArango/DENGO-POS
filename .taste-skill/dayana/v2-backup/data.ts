// Variedades Dayana — the brand's own words and the catalogue the site shows.
// Everything the POS doesn't hold (story, catalogue, services, mission) lives
// here; offers, branches and contact come from the POS (SiteContent).

/** Prototype: the photos are references, not the shop's own. Flip to false once real photos replace them. */
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

export interface Photo { src: string; w: number; h: number; alt: string; caption: string; credit: string; ref: boolean }
const P = (file: string, w: number, h: number, alt: string, caption: string, credit: string): Photo =>
  ({ src: `/sites/dayana/ref/${file}.webp`, w, h, alt, caption, credit, ref: true })

export const PHOTOS = {
  room: P('tienda-juanita-comunidad-de-cantagallo', 1200, 1600, 'Una tiendita de barrio con su puerta abierta, cajas de fruta y un perro dormido en la entrada', 'Una tiendita de barrio, como la del cuarto donde empezamos', '“Tienda Juanita - Comunidad de Cantagallo”, JanetEP, CC BY-SA 4.0, Wikimedia Commons'),
  bread: P('pan-dulce-cabinet-on-los-bisquets-obregon', 1600, 1200, 'Vitrina de vidrio llena de pan dulce recién horneado', 'Una vitrina de pan dulce', '“Pan dulce cabinet on Los Bisquets Obregon”, MadeByHumansOnEarth, CC0, Wikimedia Commons'),
  notebooks: P('cuadernos', 1024, 768, 'Una pila alta de cuadernos de espiral', 'Cuadernos para la temporada', '“Free stack spiral notebook image”, CC0, rawpixel'),
  corner: P('una-papeleria-en-xochimilco', 1600, 1200, 'Una papelería en la esquina de una casa de dos niveles, con la fachada pintada de colores', 'Una papelería abajo y la casa arriba', '“Una Papelería en Xochimilco”, CCMpeto, CC BY-SA 4.0, Wikimedia Commons'),
  street: P('papeleria-sairy-mazatlan-21-de-octubre-de', 1600, 900, 'Fachada de una papelería en una calle de pueblo por la mañana', 'Una papelería abierta temprano', '“Papelería Sairy, Mazatlán”, El Nuevo Doge, CC0, Wikimedia Commons'),
  backpack: P('mochila', 1195, 1600, 'Una mochila escolar roja y gris apoyada en el piso', 'Mochilas', '“School bag backpack”, Gamingforfun365, CC BY-SA 3.0, Wikimedia Commons'),
  cases: P('estuches', 1600, 1355, 'Estuches escolares abiertos con lápices de colores adentro', 'Estuches', '“School pencil cases”, ABX, CC BY-SA 4.0, Wikimedia Commons'),
  wallet: P('billetera', 1600, 1200, 'Una billetera de cuero café abierta', 'Billeteras', '“Leather wallets 01”, Nicholas Gemini, CC BY-SA 3.0, Wikimedia Commons'),
  bag: P('cartera', 960, 640, 'Un bolso de cuero café sobre la grama', 'Carteras y bolsos', '“Handbag Leather”, Harsh Jadav, CC0, StockSnap'),
  ballpoints: P('parker-sheaffer', 1600, 865, 'Un bolígrafo Parker Jotter y un Sheaffer Sentinel lado a lado', 'Parker Jotter y Sheaffer Sentinel', '“Parker Jotter & Sheaffer Sentinel ballpoints”, Francis Flinch, CC0, Wikimedia Commons'),
  fountain: P('plumas-fuente', 1600, 972, 'Una fila de plumas fuente negras con plumilla dorada', 'Plumas fuente', '“Different fountain pens”, Ilkin Santak, CC BY-SA 4.0, Wikimedia Commons'),
  paint: P('haltern-am-see-lavesum-kunstlerhof-acrylfarbe-2021', 1600, 1067, 'Pinturas acrílicas de colores en un plato con un pincel', 'Pinturas acrílicas', '“Haltern am See, Lavesum, Künstlerhof, Acrylfarbe”, Dietmar Rabich, CC BY-SA 4.0, Wikimedia Commons'),
  markers: P('arte-mesa', 1600, 1068, 'Marcadores, pinceles y una paleta de pinturas sobre una mesa', 'Marcadores y pinturas', '“Colorful art supplies arranged on a table”, Shixart1985, CC BY 2.0, Wikimedia Commons'),
  laws: P('leyes', 1600, 900, 'Estantería de una biblioteca llena de libros de leyes', 'Leyes y obras', '“Law Book shelf at the Ghalib Chamber Library”, Ndawoje, CC BY-SA 4.0, Wikimedia Commons'),
  pencils: P('lapices', 1067, 1600, 'Lápices de colores en un portalápices anaranjado', 'Útiles escolares', '“Colored pencils in holder”, ThoBel-0043, CC BY-SA 4.0, Wikimedia Commons'),
  copier: P('fotocopiadora', 1600, 969, 'Una fotocopiadora grande de oficina', 'Fotocopias e impresiones', '“Sharp MX-7500 photocopier”, Baron Maddock, CC BY 4.0, Wikimedia Commons'),
  laminate: P('emplasticado', 1600, 1200, 'Una hoja pasando por los rodillos de una máquina de emplasticar', 'Emplasticado', '“Thermal Lamination process”, Sachinkothari123, CC BY-SA 4.0, Wikimedia Commons'),
  bind: P('bookbinding-1', 1600, 1200, 'Manos cosiendo las hojas de un cuadernillo en un bastidor de encuadernación', 'Encuadernado', '“Bookbinding 1”, Michal Maňas, CC BY 2.5, Wikimedia Commons'),
}
export type PhotoKey = keyof typeof PHOTOS

/**
 * The story. One scene per stage of the house; the picture's frame grows
 * with the house (a room, the vitrinas, the first floor, the second level,
 * the whole street) and goes back to the size of the room at the end.
 */
export const STORY: { mark: string; title: string; text: string; photo: PhotoKey }[] = [
  { mark: '2010', title: 'Un cuarto de la casa', photo: 'room',
    text: 'Rabinal, 2010. En la casa sobra un cuarto, y lo llenamos de lo que el barrio necesita: pan, huevos, galletas. Abrimos por las tardes, al volver del trabajo. No es la primera tienda de la familia: la abuela tuvo la suya, y algo de ella se nos quedó en las manos.' },
  { mark: 'Las vitrinas', title: 'Lo que era un extra', photo: 'bread',
    text: 'Un día se pierde el empleo que sostenía la casa, y la tiendita deja de ser un extra: ahora es el sustento. Con lo que va entrando compramos una vitrina, después otra. Entre el pan y los huevos aparecen los primeros cuadernos, los lápices, la goma.' },
  { mark: 'Las escuelas', title: 'El cuarto se queda chico', photo: 'notebooks',
    text: 'Luego llegan las escuelas, con las listas de útiles de los programas del gobierno. Cajas y cajas. Hay tanto trabajo que dejamos el otro empleo para atender juntos. Ampliamos el cuarto una vez, y al final tomamos todo el primer piso.' },
  { mark: 'El segundo nivel', title: 'Volver a casa', photo: 'corner',
    text: 'Mientras se construye nos vamos a vivir a otra casa. Cuando por fin terminamos, regresamos, ahora arriba, en el segundo nivel. Abajo, donde hubo un cuarto, ya hay una tienda entera, y un equipo que crece con ella.' },
  { mark: 'Hasta Cubulco', title: 'Una tienda, y otra, y otra', photo: 'street',
    text: 'La gente regresa porque la atendemos bien, y trae a otros. Llegan más escuelas. Abrimos una sucursal solo de librería, luego otra, y otra más, hasta Cubulco. Cada una fue apostar todo lo que teníamos. Ninguna fue segura. Todas valieron la pena.' },
  { mark: 'Hoy', title: 'La misma puerta', photo: 'room',
    text: 'Si entras hoy a la tienda principal, busca la puerta de siempre: la tiendita sigue en el mismo cuarto. Ahí está el pan de la tarde, el recuerdo de la abuela y la plática con los vecinos. Todo lo demás creció alrededor de ese cuarto.' },
]

/** The lines the shop wants seen first. Each choice swaps the picture. */
export const FEATURED: { id: string; brand: string; title: string; text: string; tone: 'red' | 'navy' | 'paper' | 'ink'; choices: { label: string; photo: PhotoKey }[]; also?: string }[] = [
  { id: 'totto', brand: 'Totto', title: 'Totto, de la mochila a la gorra', tone: 'red',
    text: 'Mochilas, estuches, loncheras, billeteras, carteras y gorras de la marca, con su garantía. Para el primer día de clases y para todos los que siguen.',
    choices: [{ label: 'Mochilas', photo: 'backpack' }, { label: 'Estuches', photo: 'cases' }, { label: 'Billeteras', photo: 'wallet' }, { label: 'Carteras', photo: 'bag' }],
    also: 'También loncheras y gorras.' },
  { id: 'plumas', brand: 'Parker y Sheaffer', title: 'Plumas para firmar lo importante', tone: 'navy',
    text: 'Bolígrafos y plumas fuente Parker y Sheaffer, con sus repuestos y su tinta. Para un título, un contrato o un regalo que se guarda.',
    choices: [{ label: 'Bolígrafos', photo: 'ballpoints' }, { label: 'Plumas fuente', photo: 'fountain' }] },
  { id: 'arte', brand: 'Línea de arte', title: 'Color para artesanos y artistas', tone: 'paper',
    text: 'Pinturas y marcadores acrílicos para tela, madera, barro, piedra o lienzo. La línea para quien trabaja con las manos.',
    choices: [{ label: 'Pinturas acrílicas', photo: 'paint' }, { label: 'Marcadores acrílicos', photo: 'markers' }] },
  { id: 'leyes', brand: 'Leyes y obras', title: 'Para estudiar, ejercer y leer', tone: 'ink',
    text: 'Códigos y leyes de Guatemala, obras literarias y las lecturas que piden en los colegios.',
    choices: [{ label: 'Leyes y obras', photo: 'laws' }] },
]

/** Everything else on the shelves. */
export const SHELVES: { name: string; note: string; photo: PhotoKey; items: string[] }[] = [
  { name: 'Útiles escolares', note: 'Fast, Maped y las marcas de siempre', photo: 'pencils', items: ['Cuadernos y libretas', 'Lápices, crayones y colores', 'Reglas, compases y escuadras', 'Pegamento, tijeras y plastilina', 'Cartulinas, foamy y papel de colores'] },
  { name: 'Oficina', note: 'Para el escritorio y el negocio', photo: 'notebooks', items: ['Papel bond carta y oficio', 'Folders, archivadores y sobres', 'Engrapadoras, perforadoras y clips', 'Tinta y tóner', 'Calculadoras'] },
  { name: 'La tiendita', note: 'Solo en la tienda principal', photo: 'bread', items: ['Pan', 'Huevos', 'Galletas', 'Lo de todos los días'] },
]

/** Services, done in the store. */
export const SERVICES: { name: string; note: string; photo: PhotoKey }[] = [
  { name: 'Listas de útiles', note: 'Traes la lista del colegio y te la armamos completa.', photo: 'cases' },
  { name: 'Fotocopias e impresiones', note: 'En blanco y negro o a color, tamaño carta y oficio.', photo: 'copier' },
  { name: 'Emplasticado', note: 'Carnés, documentos y hojas de trabajo.', photo: 'laminate' },
  { name: 'Encuadernado', note: 'Reportes, tesis y folletos.', photo: 'bind' },
  { name: 'Ventas al por mayor', note: 'Para escuelas, programas y otras tiendas.', photo: 'notebooks' },
]

export const MISSION = {
  mission: { before: 'Somos una empresa honesta y responsable que ofrece una variada cartera de productos y servicios de calidad para satisfacer los deseos y necesidades de nuestros clientes, ', mark: 'atendiendo con calidez y eficiencia', after: ', sin olvidarnos de nuestra responsabilidad social. Trabajamos junto a nuestros colaboradores para mejorar la calidad de vida de las familias de nuestro municipio.' },
  vision: 'Ser la primera y mejor opción de compra y distribución de productos de librería, canasta básica y limpieza, tanto para quien compra al detalle como para los mayoristas. Con nuestra experiencia y compromiso queremos ganar la confianza de nuestros clientes y proveedores, a la vanguardia de los cambios que exige el mercado.',
}

/** Branch names without the "Dayana" prefix, and which one is the original house. */
export const isMain = (name: string) => /principal|central/i.test(name)
export const visibleBranches = <T extends { name: string }>(list: T[]) => list.filter(b => !/bodega/i.test(b.name))

/** An offer's name for a heading: the part before a colon ("Black November Totto: 15% de descuento" → "Black November Totto"). */
export const title = (name: string) => name.split(':')[0]!.trim() || name
