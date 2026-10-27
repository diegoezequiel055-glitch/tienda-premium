import { subtotalDe, precioUnitario } from './precios.js';

// ══════════════════════════════════════════
// GOOGLE ANALYTICS 4 (G-XMQQ0PMRDY) — medición anónima de visitas y uso de la tienda.
// - gtag.js se carga de forma asíncrona, recién cuando la página terminó de cargar.
// - Solo envía datos desde tiendapremium.com.ar. En localhost y en las pruebas NO envía nada.
// - Excluir mis propias visitas: entrar a cualquier página con ?interno=1 guarda una marca en
//   localStorage y desde ese navegador no se envía nada; ?interno=0 la quita.
// - ?analytics_debug=1 (se recuerda en la pestaña): NO envía nada y muestra en la consola cada
//   evento con sus parámetros y si se habría enviado. Sirve para probar, también en producción.
// - Eventos: view_item, add_to_cart, begin_checkout, click_whatsapp, click_tiktok, share, search (moneda ARS).
//   search no se envía si el término parece un teléfono, un email o tiene 6+ dígitos seguidos.
// - NUNCA se envían datos personales: ni nombre, teléfono, dirección, localidad ni el texto del
//   mensaje de WhatsApp. Solo datos de producto (id, nombre, categoría, talle, precio), valores,
//   forma de pago, tipo de entrega y el término de búsqueda.
// El resto del sitio solo avisa con eventos del DOM: 'detalle-abierto' (ficha), 'carrito-agregado',
// 'pedido-iniciado', 'producto-compartido' y 'busqueda-hecha'; el clic en el botón flotante se
// detecta acá. Ver test-analytics.mjs.
// ══════════════════════════════════════════

export const ID_MEDICION = 'G-XMQQ0PMRDY';
export const HOST_PRODUCCION = ['tiendapremium.com.ar', 'www.tiendapremium.com.ar'];
export const CLAVE_INTERNO = 'analyticsInterno';
const MONEDA = 'ARS';

// ── decisiones (puras, se prueban en test-analytics.mjs) ──
// ¿Se envía a Google? Solo en el dominio de producción, sin la marca de visita interna y sin modo debug.
export function debeEnviar({ host, interno, debug }) {
  return HOST_PRODUCCION.includes(host) && !interno && !debug;
}
// Lee ?interno=1 / ?interno=0 y devuelve qué hacer con la marca guardada ('guardar' | 'quitar' | null).
export function accionInterno(search) {
  const v = new URLSearchParams(search || '').get('interno');
  return v === '1' ? 'guardar' : v === '0' ? 'quitar' : null;
}

const texto = (s, max = 100) => String(s ?? '').trim().slice(0, max);
const itemBase = (x) => ({
  item_id: String(x.id ?? x.item_id ?? ''),
  item_name: texto(x.nombre ?? x.item_name),
  item_category: texto(x.categoria ?? x.item_category),
});

// ¿Es seguro mandar este término de búsqueda? No si parece un email, un teléfono o tiene 6 o más
// dígitos seguidos (podría ser un dato personal escrito por error): en ese caso no se envía el evento.
export function terminoSeguro(termino) {
  const t = String(termino ?? '');
  if (t.includes('@')) return false;                       // email
  if (/\d{6,}/.test(t)) return false;                      // 6 o más dígitos seguidos
  if ((t.match(/\d/g) || []).length >= 7) return false;    // teléfono con espacios, guiones o paréntesis
  return true;
}

// Armado de cada evento (solo datos de producto / valores / tipos).
export const eventos = {
  view_item(p) {
    return { currency: MONEDA, value: p.precio, items: [{ ...itemBase(p), price: p.precio }] }; // price = efectivo/transferencia
  },
  add_to_cart({ id, nombre, categoria, talle, cantidad = 1, precio }) {
    return { currency: MONEDA, value: precio * cantidad, items: [{ ...itemBase({ id, nombre, categoria }), item_variant: texto(talle, 20), price: precio, quantity: cantidad }] };
  },
  begin_checkout({ items, formaPago, tipoEntrega, costoEnvio = 0 }) {
    return {
      currency: MONEDA,
      value: subtotalDe(items, formaPago) + (costoEnvio || 0),
      payment_type: formaPago,
      shipping_tier: tipoEntrega,
      items: items.map((it) => ({ ...itemBase(it), item_variant: texto(it.talle, 20), price: precioUnitario(it, items, formaPago), quantity: it.cantidad })),
    };
  },
  click_whatsapp() { return { ubicacion: 'boton_flotante' }; },
  // Videos de TikTok: solo dónde se tocó (tarjeta o "Ver más en TikTok") y el lugar en la fila. Nada del visitante.
  click_tiktok({ ubicacion, posicion } = {}) {
    const p = { ubicacion: ubicacion === 'ver_mas' ? 'ver_mas' : 'tarjeta' };
    const n = Number(posicion); if (Number.isInteger(n) && n >= 1 && n <= 6) p.posicion = n;
    return p;
  },
  share({ id, metodo }) { return { method: metodo, content_type: 'product', item_id: String(id ?? '') }; },
  search(termino) { return { search_term: texto(termino).toLowerCase() }; },
};

// ── funcionamiento en el navegador ──
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const guardado = (op, clave, valor) => { try { return op === 'get' ? localStorage.getItem(clave) : op === 'set' ? localStorage.setItem(clave, valor) : localStorage.removeItem(clave); } catch { return null; } };
  const sesion = (op, clave, valor) => { try { return op === 'get' ? sessionStorage.getItem(clave) : sessionStorage.setItem(clave, valor); } catch { return null; } };

  const accion = accionInterno(location.search);
  if (accion === 'guardar') guardado('set', CLAVE_INTERNO, '1');
  else if (accion === 'quitar') guardado('remove', CLAVE_INTERNO);
  const interno = guardado('get', CLAVE_INTERNO) === '1';

  const pDebug = new URLSearchParams(location.search).get('analytics_debug');
  if (pDebug === '1') sesion('set', 'analyticsDebug', '1'); else if (pDebug === '0') sesion('set', 'analyticsDebug', '0');
  const debug = sesion('get', 'analyticsDebug') === '1';

  const enviar = debeEnviar({ host: location.hostname, interno, debug });
  let productos = [];

  // gtag.js: asíncrono y después de que la página terminó de cargar (no bloquea nada).
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  // Modo mantenimiento (mantenimiento.js): no se registran visitas a la pantalla de mantenimiento. La carga de gtag espera esa decisión.
  const enMantenimiento = () => !!(window.__mantenimiento && window.__mantenimiento.bloqueado());
  const decisionMant = (window.__mantenimiento && window.__mantenimiento.listo) || Promise.resolve();
  if (enviar) {
    gtag('js', new Date());
    gtag('config', ID_MEDICION, { allow_google_signals: false, allow_ad_personalization_signals: false }); // queda en cola; solo se envía si se carga gtag.js
    const cargar = () => {
      if (enMantenimiento()) return; // en mantenimiento gtag.js no se carga: no se registra ninguna visita
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${ID_MEDICION}`;
      document.head.appendChild(s);
    };
    const tarde = () => decisionMant.then(() => (window.requestIdleCallback ? requestIdleCallback(cargar, { timeout: 4000 }) : setTimeout(cargar, 1500)));
    if (document.readyState === 'complete') tarde(); else window.addEventListener('load', tarde, { once: true });
  }

  function registrar(nombre, params) {
    if (debug) console.log(`[analytics] ${nombre}`, params, enviar ? '→ se enviaría' : (interno ? '→ NO se envía (visita interna)' : '→ NO se envía (modo debug / no es tiendapremium.com.ar)'));
    if (enMantenimiento()) return;
    if (enviar) gtag('event', nombre, params);
  }
  if (debug) decisionMant.then(() => { if (!enMantenimiento()) console.log('[analytics] page_view', { page_location: location.href, page_title: document.title }, enviar ? '' : '→ NO se envía'); });

  document.addEventListener('catalogo-actualizado', (e) => { productos = e.detail || []; });
  document.addEventListener('detalle-abierto', (e) => {
    const p = productos.find((x) => x.id === e.detail);
    if (p) registrar('view_item', eventos.view_item(p));
  });
  document.addEventListener('carrito-agregado', (e) => registrar('add_to_cart', eventos.add_to_cart(e.detail)));
  document.addEventListener('pedido-iniciado', (e) => registrar('begin_checkout', eventos.begin_checkout(e.detail)));
  document.addEventListener('producto-compartido', (e) => registrar('share', eventos.share(e.detail)));
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#whatsapp-float')) registrar('click_whatsapp', eventos.click_whatsapp()); });
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('[data-tiktok]'); if (a) registrar('click_tiktok', eventos.click_tiktok({ ubicacion: a.dataset.tiktok, posicion: a.dataset.pos })); });

  // Búsqueda: se envía el último término después de 1,2 s sin cambios (no cada letra) y sin repetir el mismo.
  let timerBusqueda = null, ultimaBusqueda = '';
  document.addEventListener('busqueda-hecha', (e) => {
    const t = texto(e.detail && e.detail.termino).toLowerCase();
    clearTimeout(timerBusqueda);
    if (!t) { ultimaBusqueda = ''; return; }
    if (!terminoSeguro(t)) return; // parece teléfono, email o tiene 6+ dígitos: no se manda el evento
    timerBusqueda = setTimeout(() => { if (t !== ultimaBusqueda) { ultimaBusqueda = t; registrar('search', eventos.search(t)); } }, 1200);
  });
}
