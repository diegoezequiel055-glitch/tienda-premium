import { enOferta, etiquetaHtml, precioAnterior, CLAVE_OFERTAS } from './ofertas.js';

// ══════════════════════════════════════════
// OFERTAS — la parte de pantalla que no vive en app.js (la sección, el filtro "Ver todas →" y el precio en las tarjetas sí: app.js + ofertas.js):
//   • ítem rojo "Ofertas" arriba del menú lateral (en el celular). El de la barra (PC) ya está en index.html.
//   • los dos ítems (barra y menú) y la sección se muestran SOLO si hay productos en oferta (app.js avisa con 'ofertas-actualizadas').
//   • link #cat=ofertas: abre la vista "Ver todas".   • título de la vista: "Ofertas" en vez de "Catálogo completo".
//   • ficha: etiqueta "-15%" y precio anterior tachado, arriba del precio (lo dibuja al recibir 'detalle-pintado').
// ══════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const TITULO_NORMAL = ($('grid-titulo') && $('grid-titulo').textContent) || 'Catálogo completo';
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

// Menú lateral (lo crea header-menu.js, que carga antes que este archivo).
const cats = $('menu-cats');
if (cats && cats.parentNode) {
  const nav = document.createElement('nav');
  nav.className = 'menu-ofertas'; nav.id = 'menu-ofertas'; nav.hidden = true;
  nav.innerHTML = '<a href="#" class="menu-ofertas-btn">Ofertas</a>';
  cats.parentNode.insertBefore(nav, cats);
  nav.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-ofertas-btn')) return;
    e.preventDefault();
    const cerrar = $('menu-cerrar'); if (cerrar) cerrar.click();
    if ($('detalle-overlay').classList.contains('open')) window.cerrarDetalle();
    setTimeout(() => window.irAOfertas(), 60); // un tick después: el menú ya cerró y el scroll del fondo volvió
  });
}

let hashPendiente = true; // #cat=ofertas se aplica cuando llega el catálogo
function alCambiarOfertas(cantidad) {
  const hay = cantidad > 0;
  const barra = $('nav-ofertas'); if (barra) barra.style.display = hay ? '' : 'none';
  const menu = $('menu-ofertas'); if (menu) menu.hidden = !hay;
  if (hashPendiente) {
    hashPendiente = false;
    if (hay && location.hash === '#cat=' + CLAVE_OFERTAS) { window.setCategoria(CLAVE_OFERTAS); setTimeout(() => $('grid-titulo').scrollIntoView({ block: 'start' }), 60); }
  }
}
document.addEventListener('ofertas-actualizadas', (e) => alCambiarOfertas(e.detail));
if (typeof window.__cantidadOfertas === 'number') alCambiarOfertas(window.__cantidadOfertas); // el catálogo llegó antes que este archivo

document.addEventListener('categoria-cambiada', (e) => {
  const t = $('grid-titulo'); if (t) t.textContent = e.detail === CLAVE_OFERTAS ? 'Ofertas' : TITULO_NORMAL;
  const menu = $('menu-ofertas'); if (menu) menu.classList.toggle('activa', e.detail === CLAVE_OFERTAS);
});

// Ficha: etiqueta + precio anterior tachado arriba del precio grande.
document.addEventListener('detalle-pintado', (e) => {
  const p = e.detail; const precio = $('detalle-precio'); if (!precio) return;
  let caja = $('detalle-oferta');
  if (!caja) { caja = document.createElement('div'); caja.id = 'detalle-oferta'; caja.className = 'detalle-oferta'; precio.parentNode.insertBefore(caja, precio); }
  caja.innerHTML = enOferta(p) ? `${etiquetaHtml(p)}<span class="detalle-precio-ant"><span class="solo-lectores">Precio anterior </span><s>$${fmt(precioAnterior(p))}</s></span>` : '';
});
