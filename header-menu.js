import { datosNegocio } from './datos-negocio.js';
import { categoriasDisponibles, resolverClave } from './categorias-config.js';
import { pintarMenuCategorias, fijarDesplegado } from './menu-desplegable.js';

// ══════════════════════════════════════════
// HEADER: menú lateral ☰ con categorías (el buscador está en buscador.js).
// No toca el carrito ni la grilla: usa window.setCategoria
// de app.js y escucha los eventos 'catalogo-actualizado' y 'categoria-cambiada'.
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let disponibles = [];
let claveActiva = '';

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
  pintarMenuCategorias($('menu-cats'), { disponibles, claveActiva }); // "Todos los productos" desplegable (menu-desplegable.js)
}

function abrirMenu() {
  fijarDesplegado($('menu-cats'), claveActiva !== ''); // cerrado, salvo que haya una categoría activa (queda desplegada y marcada)
  drawer.classList.add('open');
  document.body.classList.add('menu-abierto');
  $('btn-menu').setAttribute('aria-expanded', 'true');
}
function cerrarMenu() {
  drawer.classList.remove('open');
  document.body.classList.remove('menu-abierto');
  $('btn-menu').setAttribute('aria-expanded', 'false');
}

const fichaAbierta = () => $('detalle-overlay').classList.contains('open');

drawer.addEventListener('click', (e) => {
  if (e.target === drawer || e.target.closest('#menu-cerrar')) { cerrarMenu(); return; }
  const btn = e.target.closest('.menu-cat');
  if (btn) {
    cerrarMenu();
    window.setCategoria(btn.dataset.clave); // abre la vista (Todo el catálogo / una categoría); si hay una ficha abierta, app.js la cierra antes
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

// Logo = volver al inicio: cierra el carrito y limpia la búsqueda; desde una vista de catálogo vuelve a la portada (restaura su scroll, app.js › irAPortada);
// si ya está en la portada, sube y deja la URL en la raíz.
function irAlInicio(e) {
  if (e) e.preventDefault();
  if ($('carrito-overlay').classList.contains('open')) window.cerrarCarrito();
  if (window.reiniciarBusqueda) window.reiniciarBusqueda();
  window.irAPortada();
}
$('hdr-logo').addEventListener('click', irAlInicio);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) cerrarMenu();
});

// ── sincronización con app.js ──
// La vista y la URL (#cat=...) las maneja app.js (setCategoria, Atrás/Adelante); acá solo se marca cuál está activa en el menú.
document.addEventListener('catalogo-actualizado', (e) => {
  disponibles = categoriasDisponibles(e.detail);
  pintarCategorias();
});
document.addEventListener('categoria-cambiada', (e) => {
  claveActiva = e.detail;
  pintarCategorias();
});

pintarLinks();
pintarCategorias();
