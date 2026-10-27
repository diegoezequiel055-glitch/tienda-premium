import { tarjetasCategorias, tarjetaCategoriaHtml } from './categorias-foto.js';
import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// SECCIÓN "COMPRAR POR CATEGORÍA" — en la portada, justo después de "Nuevos ingresos" y antes de "Destacados" (reemplaza la fila de chips).
//   • productos: de app.js (window.__catalogo + evento 'catalogo-actualizado'); fotos cargadas por Diego: config_sitio/config › fotosCategorias
//     (app.js las publica en window.__fotosCategorias + evento 'fotos-categorias-actualizadas'). Ninguna lectura extra.
//   • solo categorías con productos; sin ninguna, no se muestra la sección ni queda hueco.
//   • tocar una tarjeta abre la vista de esa categoría (setCategoria): lo mismo que hacían los chips. Un link común (#cat=...): abrirlo en otra pestaña también anda.
// ══════════════════════════════════════════
const $ = (id) => document.getElementById(id);
let productos = Array.isArray(window.__catalogo) ? window.__catalogo : [];
let fotos = window.__fotosCategorias || null;

function pintar() {
  const sec = $('categorias-section'), grid = $('categorias-grid'); if (!sec || !grid) return;
  const tarjetas = tarjetasCategorias(productos, fotos);
  grid.innerHTML = tarjetas.map((c) => tarjetaCategoriaHtml(c, fotoCloudinary(c.foto, 'categoria'))).join('');
  grid.dataset.cantidad = String(tarjetas.length);
  sec.hidden = tarjetas.length === 0;
}

document.addEventListener('catalogo-actualizado', (e) => { productos = e.detail || []; pintar(); });
document.addEventListener('fotos-categorias-actualizadas', (e) => { fotos = e.detail || null; pintar(); });
pintar(); // por si el catálogo o la config llegaron antes que este archivo

const grid = $('categorias-grid');
if (grid) grid.addEventListener('click', (e) => {
  const a = e.target.closest('.cat-foto'); if (!a) return;
  if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // clic con Ctrl/Cmd o botón del medio: que el navegador lo abra en otra pestaña
  e.preventDefault();
  window.setCategoria(a.dataset.clave);
});
