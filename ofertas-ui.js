import { enOferta, etiquetaHtml, precioAnterior, tarjetaCompactaHtml, CLAVE_OFERTAS } from './ofertas.js';
import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// OFERTAS — la parte de pantalla que no vive en app.js (el filtro "Ver todas →" y el precio en las tarjetas sí: app.js + ofertas.js):
//   • sección "Ofertas" compacta AL FINAL de la página (debajo de "Ver más productos", arriba del footer): carrusel de tarjetas chicas.
//   • fila "Ofertas" (texto rojo, negrita, ›) justo debajo de "Todos los productos" en el menú lateral, y "Ofertas" en rojo en la barra (PC).
//     Las dos llevan a la vista de todas las ofertas (verOfertas, la misma de "Ver todas →").
//   • sin productos en oferta no aparece nada (ni sección ni ítems): app.js avisa con 'ofertas-actualizadas' (detail = lista de ofertas).
//   • link #cat=ofertas: abre la vista "Ver todas".   • título de la vista: "Ofertas" en vez de "Catálogo completo".
//   • ficha: etiqueta "-15%" y precio anterior tachado, arriba del precio (lo dibuja al recibir 'detalle-pintado').
// ══════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

// Menú lateral (lo crea header-menu.js, que carga antes que este archivo): fila con el mismo estilo que "Todos los productos".
const cats = $('menu-cats');
if (cats && cats.parentNode) {
  const nav = document.createElement('nav');
  nav.className = 'menu-ofertas'; nav.id = 'menu-ofertas'; nav.hidden = true;
  nav.innerHTML = '<button type="button" class="menu-toggle menu-ofertas-fila" id="menu-ofertas-fila"><span>Ofertas</span><span class="menu-flecha" aria-hidden="true">›</span></button>';
  cats.parentNode.insertBefore(nav, cats.nextSibling);
  nav.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-ofertas-fila')) return;
    const cerrar = $('menu-cerrar'); if (cerrar) cerrar.click();
    setTimeout(() => window.verOfertas(), 60); // un tick después: el menú ya cerró y el scroll del fondo volvió
  });
}

let hayOfertas = false;
let categoriaActual = window.__categoriaActual || ''; // '' = portada normal
let buscando = window.__buscando === true; // hay una búsqueda por texto activa
// La sección compacta se ve SOLO en la portada normal (sin categoría ni búsqueda): en la vista de ofertas sería un duplicado, en las otras categorías no corresponde y al buscar distrae de los resultados.
function mostrarSeccion() { const sec = $('ofertas-section'); if (sec) sec.style.display = hayOfertas && categoriaActual === '' && !buscando ? '' : 'none'; }
document.addEventListener('busqueda-cambiada', (e) => { buscando = e.detail === true; mostrarSeccion(); });
function alCambiarOfertas(lista) {
  const hay = lista.length > 0;
  hayOfertas = hay;
  const carril = $('ofertas-strip');
  if (carril) {
    carril.innerHTML = lista.map((p) => tarjetaCompactaHtml(p, (p.fotos || [])[0] ? fotoCloudinary(p.fotos[0], 'tarjeta') : '')).join('');
    mostrarSeccion();
  }
  const barra = $('nav-ofertas'); if (barra) barra.style.display = hay ? '' : 'none';
  const menu = $('menu-ofertas'); if (menu) menu.hidden = !hay;
}
document.addEventListener('ofertas-actualizadas', (e) => alCambiarOfertas(e.detail || []));
if (Array.isArray(window.__ofertas)) alCambiarOfertas(window.__ofertas); // el catálogo llegó antes que este archivo

// Tocar una tarjeta del carrusel abre la ficha.
const carrilOfertas = $('ofertas-strip');
if (carrilOfertas) carrilOfertas.addEventListener('click', (e) => { const c = e.target.closest('.of-card'); if (c) window.abrirDetalle(c.dataset.id); });

document.addEventListener('categoria-cambiada', (e) => {
  const activa = e.detail === CLAVE_OFERTAS;
  categoriaActual = e.detail || ''; mostrarSeccion();
  const fila = $('menu-ofertas-fila'); if (fila) { fila.classList.toggle('con-activa', activa); if (activa) fila.setAttribute('aria-current', 'true'); else fila.removeAttribute('aria-current'); }
});

// Ficha: etiqueta + precio anterior tachado arriba del precio grande.
document.addEventListener('detalle-pintado', (e) => {
  const p = e.detail; const precio = $('detalle-precio'); if (!precio) return;
  let caja = $('detalle-oferta');
  if (!caja) { caja = document.createElement('div'); caja.id = 'detalle-oferta'; caja.className = 'detalle-oferta'; precio.parentNode.insertBefore(caja, precio); }
  caja.innerHTML = enOferta(p) ? `${etiquetaHtml(p)}<span class="detalle-precio-ant"><span class="solo-lectores">Precio anterior </span><s>$${fmt(precioAnterior(p))}</s></span>` : '';
});
