import { datosNegocio } from './datos-negocio.js';

// ══════════════════════════════════════════
// MODO MANTENIMIENTO de la portada (se activa desde StockMGR › Catálogo y sitio › "Modo mantenimiento").
// Datos: config_sitio/config (lectura pública, escritura solo del dueño): mantenimiento (boolean), mantenimientoMensaje (texto)
// y mantenimientoClave (texto del link de acceso). app.js le pasa cada snapshot de config_sitio con recibirConfig().
//   · mantenimiento !== true  → tienda normal.
//   · true y sin acceso       → pantalla negra a pantalla completa (marca, mensaje, WhatsApp, Instagram) y el catálogo NO se arma
//                               (app.js no lo dibuja mientras esté bloqueado); el carrito queda oculto con el resto de la página.
//   · true y ?acceso=<clave>  → tienda normal + barra fina "Modo mantenimiento activo (solo vos lo ves)". La clave correcta se guarda
//                               en sessionStorage (esa pestaña) y se saca de la URL.
//   · Si Firestore no responde en ESPERA_MAX_MS o falla la lectura → la tienda queda ABIERTA (falla hacia abierto).
//   · Sin parpadeo del catálogo: app.js espera esta decisión antes de dibujarlo; quien ya vio mantenimiento (localStorage) ve la
//     pantalla desde el primer momento, antes de que llegue Firestore.
//   · Mientras hay mantenimiento activo se agrega <meta name="robots" content="noindex"> y analytics.js no registra visitas
//     (window.__mantenimiento.bloqueado()).
// La clave NO es secreta: config_sitio es de lectura pública. Es una puerta de cortesía, no seguridad.
// decidir() es pura y se prueba en test-mantenimiento.mjs.
// ══════════════════════════════════════════

export const MENSAJE_DEFECTO = 'Estamos actualizando la tienda. Volvemos en breve.';
export const AVISO_ADMIN = 'Modo mantenimiento activo (solo vos lo ves)';
export const CLAVE_SESION = 'mantenimientoAcceso';
const CLAVE_ULTIMO = 'mantenimientoUltimo'; // '1' si la última vez estaba en mantenimiento (para mostrar la pantalla sin esperar a Firestore)
export const ESPERA_MAX_MS = 1500;

// config: lo que hay en config_sitio/config (o null). ctx: { acceso: valor de ?acceso=, guardado: clave guardada en sessionStorage }
// Devuelve { estado: 'abierto' | 'bloqueado' | 'autorizado', mensaje?, clave? }
export function decidir(config, { acceso = null, guardado = null } = {}) {
  if (!config || config.mantenimiento !== true) return { estado: 'abierto' }; // cualquier otra cosa (undefined, "true", error) = abierto
  const clave = typeof config.mantenimientoClave === 'string' ? config.mantenimientoClave.trim() : '';
  const mensaje = (typeof config.mantenimientoMensaje === 'string' && config.mantenimientoMensaje.trim()) || MENSAJE_DEFECTO;
  const entra = clave !== '' && (acceso === clave || guardado === clave); // sin clave configurada nadie entra por link
  return entra ? { estado: 'autorizado', mensaje, clave } : { estado: 'bloqueado', mensaje };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// HTML de la pantalla (puro). Todo texto va escapado.
export function htmlPantalla({ mensaje = MENSAJE_DEFECTO, marca = 'TIENDAPREMIUM.OK', whatsappNumero = '', instagram = '' } = {}) {
  const wa = whatsappNumero ? `https://wa.me/${esc(whatsappNumero)}?text=${encodeURIComponent('¡Hola! Quería hacer una consulta.')}` : '';
  return `<div class="mant-int">
    <div class="mant-marca">${esc(marca)}</div>
    <h1 class="mant-titulo" id="mant-titulo">En mantenimiento</h1>
    <p class="mant-msg">${esc(mensaje)}</p>
    <div class="mant-acciones">
      ${wa ? `<a class="mant-btn mant-btn-wa" href="${wa}" target="_blank" rel="noopener">Escribinos por WhatsApp</a>` : ''}
      ${instagram ? `<a class="mant-btn mant-btn-ig" href="${esc(instagram)}" target="_blank" rel="noopener">Instagram @TIENDAPREMIUM.OK</a>` : ''}
    </div>
    <p class="mant-legal"><a href="terminos-y-condiciones.html">Términos y condiciones</a> · <a href="contacto.html?arrepentimiento=1">Botón de arrepentimiento</a></p>
  </div>`;
}

// ── funcionamiento en el navegador ──
let estadoActual = 'pendiente'; // 'pendiente' | 'abierto' | 'bloqueado' | 'autorizado'
const oyentes = [];
export const decisionPendiente = () => estadoActual === 'pendiente';
export const estaBloqueado = () => estadoActual === 'bloqueado';
export const estadoMantenimiento = () => estadoActual;
export function alCambiarMantenimiento(fn) { oyentes.push(fn); }

let resolverDecision;
export const decision = new Promise((ok) => { resolverDecision = ok; });
export const esperarDecision = () => decision;

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const ss = (op, k, v) => { try { return op === 'get' ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch { return null; } };
  const ls = (op, k, v) => { try { return op === 'get' ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };

  // ?acceso=<clave>: se lee una vez y se saca de la URL (que no quede en el historial ni en lo que se comparta)
  let acceso = null;
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('acceso')) {
      acceso = u.searchParams.get('acceso');
      u.searchParams.delete('acceso');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch {}

  const pantalla = () => document.getElementById('mant-pantalla');
  function ponerPantalla(mensaje) {
    let el = pantalla();
    if (!el) {
      el = document.createElement('div');
      el.id = 'mant-pantalla'; el.className = 'mant-pantalla'; el.setAttribute('role', 'main'); el.setAttribute('aria-labelledby', 'mant-titulo');
      document.body.appendChild(el);
    }
    el.innerHTML = htmlPantalla({ mensaje, marca: datosNegocio.nombreMarca, whatsappNumero: datosNegocio.whatsappNumero, instagram: datosNegocio.instagram });
    document.documentElement.classList.add('mant-bloqueado');
  }
  function quitarPantalla() { const el = pantalla(); if (el) el.remove(); document.documentElement.classList.remove('mant-bloqueado'); }
  function ponerAviso(on) {
    let b = document.getElementById('mant-aviso');
    if (on && !b) { b = document.createElement('div'); b.id = 'mant-aviso'; b.className = 'mant-aviso'; b.setAttribute('role', 'status'); b.textContent = AVISO_ADMIN; document.body.insertBefore(b, document.body.firstChild); }
    else if (!on && b) b.remove();
  }
  function ponerNoindex(on) {
    let m = document.querySelector('meta[name="robots"][data-mantenimiento]');
    if (on && !m) { m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; m.setAttribute('data-mantenimiento', '1'); document.head.appendChild(m); }
    else if (!on && m) m.remove();
  }

  function aplicar(d) {
    const antes = estadoActual;
    estadoActual = d.estado;
    if (d.estado === 'bloqueado') { ponerPantalla(d.mensaje); ponerAviso(false); ponerNoindex(true); ls('set', CLAVE_ULTIMO, '1'); }
    else if (d.estado === 'autorizado') { quitarPantalla(); ponerAviso(true); ponerNoindex(true); ss('set', CLAVE_SESION, d.clave); ls('set', CLAVE_ULTIMO, '0'); }
    else { quitarPantalla(); ponerAviso(false); ponerNoindex(false); ls('set', CLAVE_ULTIMO, '0'); }
    if (antes === 'pendiente') resolverDecision({ estado: d.estado, bloqueado: d.estado === 'bloqueado' });
    oyentes.forEach((fn) => { try { fn(estadoActual, antes); } catch {} });
  }

  // Lo llama app.js con cada snapshot de config_sitio/config (cfg = datos o {}), o con error si la lectura falla (falla hacia abierto).
  window.__mantenimientoRecibir = (cfg, error) => {
    if (error) { if (estadoActual === 'pendiente') aplicar({ estado: 'abierto' }); return; } // si ya había una decisión se mantiene
    aplicar(decidir(cfg, { acceso, guardado: ss('get', CLAVE_SESION) }));
  };

  window.__mantenimiento = { listo: decision, bloqueado: () => estadoActual === 'bloqueado', estado: () => estadoActual };

  // Quien ya vio la pantalla de mantenimiento la ve desde el primer momento (sin esperar a Firestore). Se corrige sola si ya no corresponde.
  if (ls('get', CLAVE_ULTIMO) === '1' && !ss('get', CLAVE_SESION)) { estadoActual = 'pendiente'; ponerPantalla(MENSAJE_DEFECTO); }
  // Si Firestore no contesta a tiempo, la tienda queda abierta.
  setTimeout(() => { if (estadoActual === 'pendiente') window.__mantenimientoRecibir(null, new Error('timeout')); }, ESPERA_MAX_MS);
}

export function recibirConfig(cfg, error) {
  if (typeof window !== 'undefined' && window.__mantenimientoRecibir) window.__mantenimientoRecibir(cfg, error);
}
