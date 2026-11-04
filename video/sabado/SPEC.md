GOAL:    La dueña de una librería piensa "eso es justo mi sábado" y escribe al WhatsApp para una demo.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps (versión vertical 1080 x 1920 aparte)
TIME:    41 s x 30 = 1230 frames. Sin música por ahora (sin fuente de música en esta sesión).
LOOK:    fondo blanco #FFFFFF con cuadrícula de cuaderno #E6EDF2 de 1 px cada 48 px (la página de un cuaderno, del rubro librería);
         tinta #121826; marca #1E4D68 en titulares; acento coral #E07A5F solo en: el renglón de la calculadora, el "21", "un solo lugar", el chevrón del logo.
         Display: Outfit 700, 84-120 px, tracking -2%; texto secundario Outfit 400 40 px.
         Medio: UI real de DENGO (capturas 2x) como tarjetas blancas, radio 18 px, sombra 0 24px 60px rgba(18,24,38,.14), borde 1px #E3E8EE.
OBJECTS: lista de útiles escrita (hoja de cuaderno con casillas); cursor flecha blanca con borde #121826 de 64 px; el isotipo DENGO (hexágono + diagonal + chevrón coral) dibujado con trazo.
MOTION:  entrada expo.out 0.5 s; movimientos power3.inOut 0.6 s; revelados de texto por máscara (y 100%→0) con 0.06 s de escalonado;
         la UI entra como pieza que se levanta de la pantalla, no como fundido; un solo movimiento héroe por escena.
SHOTS:   0-4.5 lista de útiles, se subraya "1 calculadora científica" (coral) · "Sábado, 10:42 a.m."
         4.5-10.5 POS real de Mixco a pantalla completa; la línea roja se levanta y crece a 1.6x · "No hay en Mixco."
         10.5-15 el cursor entra y hace clic en "Otras sucursales"; aparece el modal real; se marca Central 21 · "Pero en Central hay 21."
         15-19 la fila real del traslado (Pendiente, Q825) entra deslizando · "Se pide el traslado. La venta sigue."
         19-24 "7:30 p.m." resumen real de caja + historial con diferencia Q0.00 marcada · "La caja cuadra."
         24-32.5 "9:00 p.m." la pregunta real a la IA aparece escrita, la gráfica real se dibuja de izquierda a derecha.
         32.5-35.5 "Toda tu librería, / en un solo lugar." palabra por palabra.
         35.5-41 el isotipo se dibuja, DENGO entra con barrido, "Agenda una demo · WhatsApp +502 5568-3004", se sostiene 2.5 s.
BANNED:  fondo oscuro con cosas flotando; brillos y partículas; degradados morados/azules; papel crema con serif; todo centrado;
         todo entrando con fade + slide up; texto moviéndose mientras se lee; tres tarjetas en fila; título sobre captura oscurecida;
         logo en una esquina; precios de DENGO; botones o datos inventados (toda la UI es captura real de la demo Librería Aurora).
QA:      f0 (lista visible, no vacío), 7.5 s (fila roja legible >= 26 px), 13 s (modal + 21 marcado), 22 s (Q0.00 marcado),
         30 s (gráfica completa), 34 s (claim), 40 s (logo + WhatsApp legibles).
