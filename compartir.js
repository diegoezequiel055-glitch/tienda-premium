import { datosNegocio } from './datos-negocio.js';

// ══════════════════════════════════════════
// LINK POR PRODUCTO + BOTÓN "COMPARTIR" de la ficha.
// - Link: <página>?p=<id en catalogo_publico> (location.origin + pathname, así sirve
//   igual en tiendapremium.com.ar y en github.io/tienda-premium/). No usa el # (lo usa #cat=).
// - Al cargar con ?p=ID abre esa ficha cuando llega el catálogo; si el producto ya no
//   está, avisa "Ese producto ya no está disponible" y deja la URL limpia.
// - Al abrir una ficha la URL pasa a ?p=ID (pushState) y al cerrarla vuelve a la limpia;
//   el botón "atrás" del navegador cierra la ficha.
// app.js solo avisa con los eventos 'detalle-abierto' / 'detalle-cerrado' (más el
// 'detalle-pintado' y 'catalogo-actualizado' que ya existían).
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
import { precioLista, lineaEfectivo } from './precios.js';

let productos = [];
let cargaInicial = true;
let empujadas = 0; // entradas de historial agregadas por las fichas abiertas (abrir una desde 'relacionados' suma otra)
let actual = null;  // producto de la ficha abierta

const idDeLaUrl = () => new URLSearchParams(location.search).get('p') || '';
const linkDe = (id) => `${location.origin}${location.pathname}?p=${encodeURIComponent(id)}`;
const aviso = (msg) => { if (window.toast) window.toast(msg); };

// ── abrir / cerrar y URL ──
document.addEventListener('catalogo-actualizado', (e) => {
  productos = e.detail || [];
  if (!cargaInicial) return;
  cargaInicial = false;
  const id = idDeLaUrl();
  if (!id) return;
  if (productos.some((p) => p.id === id)) {
    window.abrirDetalle(id); // la URL ya tiene ?p=: no se agrega otra entrada al historial
  } else {
    history.replaceState(null, '', location.pathname + location.hash);
    aviso('Ese producto ya no está disponible');
  }
});

document.addEventListener('detalle-abierto', (e) => {
  const id = e.detail;
  if (idDeLaUrl() === id) return;
  // d = cuántas entradas propias hay apiladas hasta acá: sirve para cerrar de una sola vez y para atrás/adelante
  try { history.pushState({ p: id, d: empujadas + 1 }, '', `${location.pathname}?p=${encodeURIComponent(id)}${location.hash}`); empujadas++; } catch {}
});

document.addEventListener('detalle-cerrado', () => {
  actual = null;
  if (empujadas > 0) { const n = empujadas; empujadas = 0; history.go(-n); return; } // vuelve a la entrada anterior a la primera ficha (URL limpia)
  if (idDeLaUrl()) { try { history.replaceState(null, '', location.pathname + location.hash); } catch {} }
});

// Botón "atrás" (o adelante) del navegador: la ficha acompaña a la URL (?p=).
window.addEventListener('popstate', () => {
  const id = idDeLaUrl();
  const abierta = $('detalle-overlay').classList.contains('open');
  empujadas = (history.state && history.state.d) || 0;
  if (!id && abierta) { empujadas = 0; window.cerrarDetalle(); }
  else if (id && (!abierta || !actual || actual.id !== id) && productos.some((p) => p.id === id)) window.abrirDetalle(id); // ya está en la URL: no suma entrada
});

// ── botón Compartir ──
function copiar(texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  return new Promise((ok, mal) => { // contextos sin clipboard API (http)
    const t = document.createElement('textarea');
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy') ? ok() : mal(); } catch (err) { mal(err); } finally { t.remove(); }
  });
}

async function compartir() {
  const p = actual; if (!p) return;
  const url = linkDe(p.id);
  const text = `Mirá esta prenda en ${datosNegocio.nombreMarca}: ${p.nombre} — $${fmt(precioLista(p))}${lineaEfectivo(p) ? ' (' + lineaEfectivo(p).toLowerCase() + ')' : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title: p.nombre, text, url }); }
    catch (err) { if (err && err.name === 'AbortError') return; /* canceló: sin aviso */ await copiarLink(url); }
    return;
  }
  await copiarLink(url);
}
async function copiarLink(url) {
  try { await copiar(url); aviso('Link copiado'); } catch { aviso('No se pudo copiar el link'); }
}

document.addEventListener('detalle-pintado', (e) => {
  actual = e.detail;
  let btn = $('btn-compartir');
  if (!btn) {
    const talles = $('detalle-talles'); if (!talles) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-compartir';
    btn.className = 'btn-compartir';
    btn.setAttribute('aria-label', 'Compartir este producto');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg><span>Compartir</span>';
    btn.addEventListener('click', compartir);
    talles.insertAdjacentElement('afterend', btn);
  }
});
