# TIENDAPREMIUM.OK — tienda-premium

Documentación de referencia para cualquier sesión nueva. Revisado contra el código real el 2026-10-08. Donde el pedido original de Diego no coincidía con el código, se corrigió acá y se avisó la diferencia (ver mensaje de la sesión que creó este archivo).

## Quién es el usuario y cómo trabajar
- Diego, dueño de TIENDAPREMIUM.OK (ropa urbana y deportiva, Argentina). No es programador: explicar en español, directo, sin saludos ni vueltas, en pasos cortos.
- Siempre: trabajar en rama aparte, hacer backup de los archivos que se tocan, no romper lo que ya funciona, un módulo por archivo, y al terminar decir qué archivos se tocaron, si quedó publicado en GitHub Pages y cómo probarlo en el celular.
- Marca siempre escrita **TIENDAPREMIUM.OK** (mayúsculas, junta). Instagram y TikTok configurados como `tiendapremium.ok` (el handle no distingue mayúsculas, pero el valor en `datos-negocio.js` está en minúsculas).
- GitHub Pages cachea ~10 minutos: para probar un cambio recién publicado, usar ventana privada/incógnito.

## Qué es el proyecto
- Catálogo web público en GitHub Pages + Firebase Firestore, conectado a StockMGR (app de stock, repo **Mi-stock-ropa**, carpeta local `Stock Ropa`). Sin pagos online: el carrito arma el pedido y abre WhatsApp.
- StockMGR publica fichas a la colección pública `catalogo_publico` (nunca costo, mayorista ni curva) — ver detalle en la sección de Stock Ropa más abajo.
- **Dos archivos `datos-negocio.js` separados, uno por repo** (decisión deliberada: son dos dominios/repos distintos, compartir uno solo por import cross-origin sería frágil):
  - **`tienda-premium/datos-negocio.js`** (este repo) — fuente única de: nombre de marca, WhatsApp (5491156253612), mail (indpremium55@gmail.com), showroom (Diagonal 152 (Belgrano) 5453, Loma Hermosa, San Martín), horarios (lunes a viernes con cita previa, sábados de 15 a 20 hs), Instagram, TikTok, link del canal mayorista de WhatsApp, link Defensa de las y los Consumidores, CUIT, nombre del vendedor y condición fiscal. Nada de esto va escrito a mano en otros archivos (excepción inevitable: `<meta name="description">` y `og:*` de cada página, fijos en el HTML porque los robots que arman la vista previa no ejecutan JavaScript).
  - **`Stock Ropa/datos-negocio.js`** (otro repo) — hoy solo tiene `UMBRAL_STOCK_BAJO` (el límite de stock bajo). **No está en el mismo archivo que la marca/contacto**, aunque las dos cosas se llamen igual.
- El CUIT (20-46183728-0) y el titular en Términos (Diego Ezequiel Zapata, Monotributista) están en el footer/términos según lo decidido.

## Reglas de publicación de productos
- Un producto se muestra solo si tiene tilde **"Mostrar en catálogo"** (campo `catalogo === true` en Stock), foto, precio por menor > 0 y al menos un talle con stock.
- "Destacados" y "Nuevos ingresos" se ocultan si hay menos de 2 productos.
- Solo precios por menor. Precio mostrado: "Abonando en efectivo o transferencia". No usar la palabra "recargo" ni "descuento" hasta que exista un precio lista con tarjeta real (pendiente, ver abajo).
- Aviso "¡Solo quedan N en stock!" cuando el stock total es ≤ 3 (`UMBRAL_STOCK_BAJO` en `Stock Ropa/datos-negocio.js`), "¡Última unidad!" si es 1; campo `stockBajo` publicado solo en ese caso.
- Las tarjetas tienen fotos deslizables con contador (1/N) y carga diferida (`loading="lazy"`); el detalle también (swipe en celular, flechas y teclado ← → en compu, sin flechas si hay una sola foto). No tocar ese comportamiento sin que Diego lo pida.

## Categorías
- StockMGR guarda la categoría en el campo `cat` (texto libre con autocompletado, `Stock Ropa/index.html` + `matching.js`) y se publica como `categoria`.
- La web traduce los nombres cargados a nombres de menú con **`categorias-config.js`** (Camiseta→Camisetas, Conjunto→Conjuntos, Campera→Camperas, Pantalón→Pantalones, Short→Shorts, Buzo→Buzos, Bermuda→Bermudas, Gorra G5→Gorras, Jean→Jeans, Perfume→Perfumes; Chombas, Chalecos y Remeras se mantienen). Una categoría sin traducción se muestra con su nombre original, al final del menú. No modifica datos de Firestore, es solo de la web.
- El header (`header-menu.js` + `header-menu.css`) tiene logo, lupa de búsqueda (se abre/cierra, no es una barra fija), carrito y menú lateral ☰ con las categorías que tengan al menos 1 producto visible; se puede entrar por link `#cat=nombre`. El catálogo también tiene pills de categoría arriba de la grilla (mismo filtro, otra forma de entrar).

## Carrito y pedido
- Entrega: Retiro en showroom / Motomensajería CABA-GBA (selector de localidad con costo, colección `envios_publico`; la lista inicial cargada desde CSV en `Stock Ropa/envios-data.js` trae **152 localidades** — no 151 — y es editable desde el panel, así que el número vigente puede cambiar) / Correo Argentino (provincia, localidad y código postal obligatorios, formato 4 dígitos o CPA, envío "a cotizar por WhatsApp").
- Pago: Efectivo, Transferencia, Tarjeta ("El pago con tarjeta puede variar. Te informamos el total antes de cerrar.").
- Se muestra Subtotal (y "Envío a cotizar por WhatsApp" cuando corresponde), no "Total", cuando la entrega es Correo Argentino. Con retiro o motomensajería sí se muestra "Total".
- El mensaje de WhatsApp tiene formato fijo (nombre, líneas de ítems, Subtotal, Entrega, Envío, Forma de pago, Total), porque Diego lo pega después en "Carga rápida" (el cargador por IA de StockMGR, `carga-rapida.js`) para cargar la venta. **No cambiar ese formato sin avisar.**
- El carrito en celular: productos primero y completos (con foto), el formulario después, todo en un solo scroll (`.carrito-scroll`); el botón "Hacer pedido por WhatsApp" queda fijo abajo.

## Fotos de la ficha (carga diferida)
- La ficha con varias fotos tiene todas las `<img>` en el carril pero con `data-src` (sin `src`); `app.js` (`cargarFotoDetalle` / `cargarFotosDetalle`) pone el `src` de a una. Al abrir se descarga solo la foto actual; cuando esa termina de cargar se precargan la siguiente y la anterior. Al frenar el scroll (150 ms sin moverse) se cargan la actual y sus vecinas, así un salto por miniatura descarga solo la foto elegida y no las intermedias. Una foto con `src` ya puesto no se vuelve a pedir. El hueco mientras carga es el fondo neutro (`--surface2`, en `style.css`), sin cambiar el alto. Las miniaturas cargan todas de entrada. Swipe, flechas, teclado y contador no se tocaron. Tamaños y calidades siguen siendo los de `fotos-cloudinary.js`.
- Peso de abrir una ficha de 5 fotos (w_900): antes ≈ 770 KB (las 5 juntas); ahora ≈ 330 KB al abrir (foto 1 + la siguiente precargada), el resto a medida que se desliza.

## Envíos en la ficha del producto
- Sección "Calcular envío" (`envio-ficha.js` + `envio-ficha.css`) con Retiro en showroom, Motomensajería (misma tabla y misma elección que el carrito — comparten estado) y Otra provincia (Correo Argentino, "te cotizamos por WhatsApp"). Sin precio aproximado de Correo, sin Vía Cargo ni Andreani, sin código postal automático (pendientes). Solo aparece si el producto tiene stock.
- Cuando se elige una localidad de motomensajería ahí aparece "Pedí hoy, te llega mañana (lunes a viernes)" — ese texto de la ficha es independiente de la barra rotativa de arriba (`promo-bar.js`) y no se toca.

## Páginas y footer
- Footer en todas las páginas: marca + íconos Instagram/TikTok + eslogan, Ayuda (Inicio, Productos, Contacto, Cambios y devoluciones, Cómo comprar, Términos y condiciones, + Mayorista si hay link), medios de pago y envío en texto (sin logos de terceros), link Defensa de las y los Consumidores (`https://autogestion.produccion.gob.ar/consumidores`, pestaña nueva, `rel="noopener noreferrer"`) y "Botón de arrepentimiento" (lleva a Contacto con `?arrepentimiento=1`), copyright "© 2026 TIENDAPREMIUM.OK. CUIT: 20-46183728-0".
- El botón de arrepentimiento va SOLO en el footer (no en el bloque de Atención del inicio).
- Contacto: datos + formulario (nombre y teléfono obligatorios; email opcional; producto y fecha obligatorios solo en modo arrepentimiento; mensaje opcional) que abre WhatsApp con "ARREPENTIMIENTO" o "CONSULTA". Sin backend.
- Cambios y devoluciones (por menor): 7 días corridos, prenda sin uso, sin lavar, con bolsa y etiquetas; cambio por talle o modelo con envío a cargo del cliente; prenda con falla a cargo nuestro (si no hay reposición, devolvemos el dinero); si no hay stock para el cambio, vale por el monto abonado válido 90 días; no afecta los derechos del consumidor. **La página actual no menciona "por mayor no hay cambios"** — si Diego quiere esa aclaración, hay que agregarla a `cambios-y-devoluciones.html`.
- Arrepentimiento: 10 días corridos, producto sin uso y con etiquetas, gastos de devolución por nuestra cuenta, se devuelve lo abonado.
- Textos legales pendientes de revisión por un contador.

## Inicio actual y pendientes
- Inicio: hero rotativo (`hero-rotativo.js`, ver abajo) y, solo si no hay productos que cumplan, la tira de 3 fotos de antes; título y subtítulo editables desde Firestore (`config_sitio/config`, campos `heroTitulo`/`heroSubtitulo` — si Diego los configuró ahí, eso es lo que se ve; el HTML trae un texto de relleno distinto como fallback), botones "Comprar ahora" (negro) y "Mayorista" (canal de WhatsApp, sin precios), showroom, envíos, formas de pago, atención, cómo comprar, catálogo.
- Pendientes (anotados, no hacer sin que Diego lo pida):
  - Rediseño del inicio con bloques grandes con foto y botón "Comprar" por categoría (el hero rotativo ya está hecho; esto es lo que falta debajo).
  - Campo "foto de portada" en StockMGR para elegir qué foto va en el hero rotativo (hoy usa la primera foto del producto).
  - Pestaña lateral "Destacados" con 3 categorías.
  - Envío gratis desde cierto monto.
  - Previsualización al compartir el link — **el inicio ya tiene `og:title`/`og:description`/`og:type`**, así que compartir la home ya arma una vista previa básica; lo que falta es la preview por producto (ver siguiente punto).
  - Link propio por producto y botón Compartir.
  - Google Analytics.
  - Conectar tiendapremium.com.ar.
  - Revisión de reglas de Firestore (que solo se lea `catalogo_publico`, `envios_publico` y `config_sitio`) — no se encontró un archivo de reglas en ninguno de los dos repos; probablemente se administran directo desde la consola de Firebase, revisar ahí.
  - Guía de talles.
  - "Completá tu look".
  - Pantalla de confirmación tras el pedido (hoy "Hacer pedido" abre WhatsApp directo, sin pantalla intermedia).
  - Ícono para pantalla de inicio (favicon / apple-touch-icon) — tienda-premium no tiene ninguno hoy; Stock Ropa sí.
  - Filtrar y Ordenar por — el filtro por categoría y la búsqueda por nombre ya existen (pills, menú ☰, lupa); lo que falta es "Ordenar por" (precio, novedad, etc.).
  - Página de Productos — hoy "Productos" en el footer lleva a `index.html#grid` (la misma portada), no es una página aparte.
  - Precio lista con tarjeta y precio con descuento por efectivo/transferencia.
  - Correo Argentino con precio aproximado y luego conexión con MiCorreo (con servidor intermedio).
  - Código postal automático.
  - Prueba social real.
  - Cupón primera compra.

## Archivos del repo (un módulo por archivo)
`index.html`, `contacto.html`, `como-comprar.html`, `cambios-y-devoluciones.html`, `terminos-y-condiciones.html` — páginas.
`app.js` — catálogo, grilla, ficha de producto, carrito y pedido (el módulo más grande).
`datos-negocio.js` — datos del negocio (ver arriba).
`categorias-config.js` — traducción y orden de categorías.
`header-menu.js` / `header-menu.css` — buscador y menú ☰.
`envio-ficha.js` / `envio-ficha.css` — "Calcular envío" en la ficha.
`footer.js` — footer compartido.
`fotos-cloudinary.js` — `fotoCloudinary(url, tamaño)` inserta `f_auto,q_auto:<calidad>,c_limit,w_<ancho>` después de `/image/upload/` (la original no se toca ni se vuelve a subir). Tamaños fijos en `TAMANOS_FOTO`: `carrito` 160 px (miniaturas del carrito y de la ficha, calidad eco), `tarjeta` 400 px (tarjetas, tira del inicio; eco), `ficha` 900 px (foto grande de la ficha; calidad good). Si la URL no es de Cloudinary o ya trae transformación, la devuelve igual. Usado en `app.js`. La tira de 3 fotos del inicio NO es lazy (primera pantalla); tarjetas y carrito sí. No agregar tamaños nuevos sin necesidad (cada combinación nueva gasta cuota de Cloudinary).
`marca.js` — nombre de marca en logo y `<title>`.
`hero-rotativo.js` / `hero-rotativo.css` — foto grande 4:5 del inicio (`#hero-rot`, debajo del header) con los **4 productos más nuevos**: orden por `creadoEn` (fecha real de alta en StockMGR, ms; la misma que usa Nuevos ingresos) y mismas reglas de publicación (foto, precio > 0, algún talle con stock). Etiqueta "Nuevo" si `creadoEn` tiene ≤ 30 días. Foto = primera del producto con el tamaño `ficha` de `fotos-cloudinary.js` (900 px, ≈ 130–170 KB; misma URL que la ficha, así se reutiliza el caché; no se agregó tamaño nuevo). Nombre (Anton, mayúsculas), precio, botón "Comprar →" y puntitos sobre un degradado oscuro; tocar la foto o el botón abre la ficha (`abrirDetalle`). Carril con scroll-snap (swipe nativo); rota sola cada 5 s, se frena mientras se toca (touch) o se pasa el mouse, no rota con "reducir movimiento", y vuelve al principio con fundido. La primera foto carga de inmediato; las otras de a una (la siguiente cuando la actual cargó). Con 1 producto: queda fija, sin puntitos. Con 0 (o si el catálogo no llega en 8 s): se muestra la tira de 3 fotos de antes (`#hero-triptych`, oculta por defecto con `display:none`; `app.js` la pinta solo en ese caso). Alto reservado desde el principio (aspect-ratio 4/5); en compu ancho máximo 460 px centrado. `app.js` solo llama a `pintarHeroRotativo` / `idsHero`. **Nuevos ingresos** salta los productos del hero y muestra hasta 8 (se oculta si quedan < 2).
`promo-bar.js` / `promo-bar.css` — barra negra de arriba como mini-eslogan rotativo. Textos en `datosNegocio.mensajesPromo` (`datos-negocio.js`, un texto por línea). Rota cada 4 s con fade de 0,4 s; alto fijo de 34 px y una sola línea (si un texto es largo se corta con "…", mantenerlos ≤ ~50 caracteres); con un solo texto queda fijo; con "reducir movimiento" cambia sin fade; no rota si la pestaña está oculta. La barra (`<div class="promo-bar" id="promo-bar-texto">`) está en las 5 páginas y cada una carga `promo-bar.css` y `promo-bar.js`. Ya **no** se lee `promoBarra` de Firestore (`config_sitio`): se sacó esa línea de `app.js` para que no pise la rotación (el campo, si existe en Firestore, queda sin uso, no se borró).
`contacto.js` — formulario de contacto/arrepentimiento.
`firebase-config.js` — conexión a Firestore.
`style.css` — estilos generales.
