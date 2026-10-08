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

## Envíos en la ficha del producto
- Sección "Calcular envío" (`envio-ficha.js` + `envio-ficha.css`) con Retiro en showroom, Motomensajería (misma tabla y misma elección que el carrito — comparten estado) y Otra provincia (Correo Argentino, "te cotizamos por WhatsApp"). Sin precio aproximado de Correo, sin Vía Cargo ni Andreani, sin código postal automático (pendientes). Solo aparece si el producto tiene stock.
- Cuando se elige una localidad de motomensajería ahí aparece "Pedí hoy, te llega mañana (lunes a viernes)" — es el único lugar donde existe ese texto hoy; **no** es todavía el mini-eslogan rotativo global que pide la lista de pendientes (ver abajo).

## Páginas y footer
- Footer en todas las páginas: marca + íconos Instagram/TikTok + eslogan, Ayuda (Inicio, Productos, Contacto, Cambios y devoluciones, Cómo comprar, Términos y condiciones, + Mayorista si hay link), medios de pago y envío en texto (sin logos de terceros), link Defensa de las y los Consumidores (`https://autogestion.produccion.gob.ar/consumidores`, pestaña nueva, `rel="noopener noreferrer"`) y "Botón de arrepentimiento" (lleva a Contacto con `?arrepentimiento=1`), copyright "© 2026 TIENDAPREMIUM.OK. CUIT: 20-46183728-0".
- El botón de arrepentimiento va SOLO en el footer (no en el bloque de Atención del inicio).
- Contacto: datos + formulario (nombre y teléfono obligatorios; email opcional; producto y fecha obligatorios solo en modo arrepentimiento; mensaje opcional) que abre WhatsApp con "ARREPENTIMIENTO" o "CONSULTA". Sin backend.
- Cambios y devoluciones (por menor): 7 días corridos, prenda sin uso, sin lavar, con bolsa y etiquetas; cambio por talle o modelo con envío a cargo del cliente; prenda con falla a cargo nuestro (si no hay reposición, devolvemos el dinero); si no hay stock para el cambio, vale por el monto abonado válido 90 días; no afecta los derechos del consumidor. **La página actual no menciona "por mayor no hay cambios"** — si Diego quiere esa aclaración, hay que agregarla a `cambios-y-devoluciones.html`.
- Arrepentimiento: 10 días corridos, producto sin uso y con etiquetas, gastos de devolución por nuestra cuenta, se devuelve lo abonado.
- Textos legales pendientes de revisión por un contador.

## Inicio actual y pendientes
- Inicio: tira de 3 fotos (sin nada superpuesto encima), título y subtítulo editables desde Firestore (`config_sitio/config`, campos `heroTitulo`/`heroSubtitulo` — si Diego los configuró ahí, eso es lo que se ve; el HTML trae un texto de relleno distinto como fallback), botones "Comprar ahora" (negro) y "Mayorista" (canal de WhatsApp, sin precios), showroom, envíos, formas de pago, atención, cómo comprar, catálogo.
- Pendientes (anotados, no hacer sin que Diego lo pida):
  - Rediseño del inicio con bloques grandes con foto y botón "Comprar" por categoría.
  - Pestaña lateral "Destacados" con 3 categorías.
  - Mini-eslogan rotativo "Pedí hoy, te llega mañana · Exclusivo CABA y GBA" como banner global (hoy ese texto solo existe, sin rotar y sin la segunda parte, dentro de "Calcular envío" al elegir motomensajería).
  - Envío gratis desde cierto monto.
  - Previsualización al compartir el link — **el inicio ya tiene `og:title`/`og:description`/`og:type`**, así que compartir la home ya arma una vista previa básica; lo que falta es la preview por producto (ver siguiente punto).
  - Link propio por producto y botón Compartir.
  - Google Analytics.
  - Conectar tiendapremium.com.ar.
  - Revisión de reglas de Firestore (que solo se lea `catalogo_publico`, `envios_publico` y `config_sitio`) — no se encontró un archivo de reglas en ninguno de los dos repos; probablemente se administran directo desde la consola de Firebase, revisar ahí.
  - Guía de talles.
  - "Completá tu look".
  - Pantalla de confirmación tras el pedido (hoy "Hacer pedido" abre WhatsApp directo, sin pantalla intermedia).
  - Optimizar fotos (hoy se suben a Cloudinary sin transformación de tamaño/calidad).
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
`marca.js` — nombre de marca en logo y `<title>`.
`contacto.js` — formulario de contacto/arrepentimiento.
`firebase-config.js` — conexión a Firestore.
`style.css` — estilos generales.
