import { datosNegocio } from './datos-negocio.js';
import { categoriasDisponibles, resolverClave } from './categorias-config.js';

// ══════════════════════════════════════════
// HEADER: menú lateral ☰ con categorías (el buscador está en buscador.js).
// No toca el carrito ni la grilla: usa window.setCategoria
// de app.js y escucha los eventos 'catalogo-actualizado' y 'categoria-cambiada'.
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let disponibles = [];
let claveActiva = '';
let hashPendiente = true; // el link #cat=... se aplica cuando llega el catálogo

// ── menú lateral ──
const drawer = document.createElement('div');
drawer.className = 'menu-overlay';
drawer.id = 'menu-overlay';
drawer.innerHTML = `
  <aside class="menu-panel" role="dialog" aria-modal="true" aria-label="Menú">
    <div class="menu-head"><span>Menú</span><button class="menu-cerrar" id="menu-cerrar" aria-label="Cerrar menú">✕</button></div>
    <div class="menu-scroll">
      <nav class="menu-cats" id="menu-cats"></nav>
      <nav class="menu-links" id="menu-links"></nav>
    </div>
  </aside>`;
document.body.appendChild(drawer);

function pintarLinks() {
  const d = datosNegocio;
  const links = [
    ['Cómo comprar', 'como-comprar.html'],
    ['Cambios y devoluciones', 'cambios-y-devoluciones.html'],
    ['Contacto', 'contacto.html'],
    ['Mayorista', d.canalMayoristaWhatsApp, true],
    ['Instagram', d.instagram, true],
    ['TikTok', d.tiktok, true],
  ].filter((l) => l[1]);
  $('menu-links').innerHTML = links.map(([t, href, ext]) => `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(t)}</a>`).join('');
}

function pintarCategorias() {
  $('menu-cats').innerHTML =
    `<button class="menu-cat${claveActiva === '' ? ' active' : ''}" data-clave="">Todos los productos</button>` +
    disponibles.map((c) => `<button class="menu-cat${c.clave === claveActiva ? ' active' : ''}" data-clave="${esc(c.clave)}">${esc(c.nombre)}</button>`).join('');
}

function abrirMenu() {
  drawer.classList.add('open');
  document.body.classList.add('menu-abierto');
  $('btn-menu').setAttribute('aria-expanded', 'true');
}
function cerrarMenu() {
  drawer.classList.remove('open');
  document.body.classList.remove('menu-abierto');
  $('btn-menu').setAttribute('aria-expanded', 'false');
}

function irAlCatalogo() {
  $('grid-titulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const fichaAbierta = () => $('detalle-overlay').classList.contains('open');

drawer.addEventListener('click', (e) => {
  if (e.target === drawer || e.target.closest('#menu-cerrar')) { cerrarMenu(); return; }
  const btn = e.target.closest('.menu-cat');
  if (btn) {
    cerrarMenu();
    if (fichaAbierta()) window.cerrarDetalle();
    window.setCategoria(btn.dataset.clave);
    irAlCatalogo();
    return;
  }
  if (e.target.closest('.menu-links a')) cerrarMenu();
});
$('btn-menu').addEventListener('click', () => (drawer.classList.contains('open') ? cerrarMenu() : abrirMenu()));

// (El buscador de la lupa vive en buscador.js.)

// ── barra fija: se mide su borde de abajo para que los paneles (ficha, carrito) arranquen debajo ──
const barraHdr = document.querySelector('.hdr');
function medirBarra() {
  document.documentElement.style.setProperty('--hdr-bottom', Math.max(0, Math.round(barraHdr.getBoundingClientRect().bottom)) + 'px');
}
window.addEventListener('scroll', medirBarra, { passive: true });
window.addEventListener('resize', medirBarra);
if (window.ResizeObserver) new ResizeObserver(medirBarra).observe(barraHdr);
document.addEventListener('detalle-abierto', medirBarra);
medirBarra();

// Carrito desde la ficha: cierra la ficha y abre el carrito (el onclick del botón ya abre el carrito).
barraHdr.addEventListener('click', (e) => {
  if (e.target.closest('#btn-cart') && fichaAbierta()) window.cerrarDetalle();
}, true);

// Logo = volver al inicio: cierra ficha y carrito, limpia búsqueda y categoría, sube y deja la URL en la raíz.
function irAlInicio(e) {
  if (e) e.preventDefault();
  if ($('carrito-overlay').classList.contains('open')) window.cerrarCarrito();
  if (fichaAbierta()) window.cerrarDetalle();
  if (window.reiniciarBusqueda) window.reiniciarBusqueda();
  window.setCategoria('');
  window.scrollTo({ top: 0, behavior: 'instant' });
  // cerrar la ficha puede volver atrás en el historial (asíncrono): se deja la URL limpia después también
  const limpiarUrl = () => { try { history.replaceState(null, '', location.pathname); } catch {} };
  limpiarUrl();
  setTimeout(() => { limpiarUrl(); window.scrollTo({ top: 0, behavior: 'instant' }); }, 120);
  setTimeout(limpiarUrl, 400);
}
$('hdr-logo').addEventListener('click', irAlInicio);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) cerrarMenu();
});

// ── sincronización con app.js y con el link (#cat=camisetas) ──
function actualizarHash(clave) {
  try { history.replaceState(null, '', clave ? `#cat=${clave}` : location.pathname + location.search); } catch {}
}
function valorDelHash() {
  const m = location.hash.match(/^#cat=(.+)$/);
  return m ? m[1] : '';
}
function aplicarHash() {
  const v = valorDelHash();
  if (!v || !disponibles.length) return;
  const clave = resolverClave(v, disponibles);
  if (!clave) return;
  window.setCategoria(clave);
  setTimeout(irAlCatalogo, 50); // un tick después, con la grilla ya pintada
}

document.addEventListener('catalogo-actualizado', (e) => {
  disponibles = categoriasDisponibles(e.detail);
  pintarCategorias();
  if (hashPendiente) { hashPendiente = false; aplicarHash(); }
});
document.addEventListener('categoria-cambiada', (e) => {
  claveActiva = e.detail;
  pintarCategorias();
  actualizarHash(claveActiva);
});
window.addEventListener('hashchange', () => {
  if (!valorDelHash()) return;
  if (!disponibles.length) { hashPendiente = true; return; }
  aplicarHash();
});

pintarLinks();
pintarCategorias();
