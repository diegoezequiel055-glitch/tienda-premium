import { tarjetasCategorias, tarjetaCategoriaHtml, puntosHtml, indiceActivo } from './categorias-portada.js';
import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// SECCIÓN "COMPRAR POR CATEGORÍA" — carrusel de tarjetas grandes con foto (estilo Nike), en la portada, justo después de "Nuevos ingresos" y antes de
// "Destacados" (reemplaza la fila de chips).
//   • Carrusel horizontal con scroll-snap, SIN autoplay. Celular: cada tarjeta ~80 % del ancho (asoma un pedazo de la siguiente). PC: 3 o 4 a la vez, con
//     flechas ‹ ›. Puntitos debajo (el activo, más largo; tocar uno lleva a esa tarjeta).
//   • productos: window.__catalogo + evento 'catalogo-actualizado' (app.js); datos de StockMGR: config_sitio/config › categoriasPortada (app.js los publica en
//     window.__categoriasPortada + evento 'categorias-portada-actualizadas'). Ninguna lectura extra.
//   • solo categorías con productos; sin ninguna, no se muestra la sección ni queda hueco.
//   • tocar la tarjeta o el botón abre la vista de esa categoría (setCategoria), como los chips de antes. Al volver, el carrusel queda donde estaba.
//   • Analytics: click_categoria (analytics.js, delegado por [data-click-categoria]).
// ══════════════════════════════════════════
const $ = (id) => document.getElementById(id);
let productos = Array.isArray(window.__catalogo) ? window.__catalogo : [];
let datos = window.__categoriasPortada || null;
let cantidad = 0;
let scrollGuardado = 0; // posición horizontal del carrusel al salir de la portada (display:none la reinicia)

const carril = () => $('categorias-carril');
const paso = () => { const c = carril().children; return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : (c[0] ? c[0].offsetWidth : 0); };

function actualizarIndicadores() {
  const car = carril(); if (!car || !cantidad) return;
  const alFinal = car.scrollLeft + car.clientWidth >= car.scrollWidth - 2;
  const idx = indiceActivo({ scrollLeft: car.scrollLeft, paso: paso(), cantidad, alFinal });
  document.querySelectorAll('#categorias-puntos .cat-punto').forEach((p, i) => { p.classList.toggle('activo', i === idx); if (i === idx) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current'); });
  const desborda = car.scrollWidth > car.clientWidth + 2;
  $('categorias-puntos').hidden = !desborda;
  const prev = $('categorias-prev'), sig = $('categorias-next');
  prev.hidden = !desborda || car.scrollLeft <= 2; sig.hidden = !desborda || alFinal;
}

function pintar() {
  const sec = $('categorias-section'), car = carril(); if (!sec || !car) return;
  const tarjetas = tarjetasCategorias(productos, datos);
  cantidad = tarjetas.length;
  car.innerHTML = tarjetas.map((c, i) => tarjetaCategoriaHtml(c, fotoCloudinary(c.foto, 'categoria'), i)).join('');
  car.dataset.cantidad = String(cantidad);
  $('categorias-puntos').innerHTML = puntosHtml(tarjetas, 0);
  sec.hidden = cantidad === 0;
  actualizarIndicadores();
}

document.addEventListener('catalogo-actualizado', (e) => { productos = e.detail || []; pintar(); });
document.addEventListener('categorias-portada-actualizadas', (e) => { datos = e.detail || null; pintar(); });
pintar(); // por si el catálogo o la config llegaron antes que este archivo

const car = carril();
if (car) {
  car.addEventListener('scroll', () => requestAnimationFrame(actualizarIndicadores), { passive: true });
  car.addEventListener('click', (e) => {
    const a = e.target.closest('.cat-card'); if (!a) return;
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // Ctrl/Cmd+clic o botón del medio: que el navegador lo abra en otra pestaña
    e.preventDefault();
    scrollGuardado = car.scrollLeft;
    window.setCategoria(a.dataset.clave);
  });
  const irA = (i) => { const c = car.children[i]; if (c) car.scrollTo({ left: c.offsetLeft - parseFloat(getComputedStyle(car).scrollPaddingLeft || 0), behavior: 'smooth' }); };
  $('categorias-puntos').addEventListener('click', (e) => { const b = e.target.closest('.cat-punto'); if (b) irA(Number(b.dataset.i)); });
  $('categorias-prev').addEventListener('click', () => car.scrollBy({ left: -paso() * Math.max(1, Math.floor(car.clientWidth / paso()) - 0), behavior: 'smooth' }));
  $('categorias-next').addEventListener('click', () => car.scrollBy({ left: paso() * Math.max(1, Math.floor(car.clientWidth / paso()) - 0), behavior: 'smooth' }));
  window.addEventListener('resize', () => requestAnimationFrame(actualizarIndicadores));
  // Al volver a la portada el carrusel queda donde estaba (al ocultarse la portada el navegador lo reinicia).
  document.addEventListener('categoria-cambiada', (e) => { if (e.detail === '' && scrollGuardado) { const y = scrollGuardado; requestAnimationFrame(() => { car.scrollLeft = y; actualizarIndicadores(); }); } });
}
