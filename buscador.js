import { normalizar, infoCategoria } from './categorias-config.js';

// ══════════════════════════════════════════
// BUSCADOR del header (lupa). Lógica de coincidencia + comportamiento de la
// barra. app.js solo usa palabrasDe(), coincide(), actualizarInfoBusqueda() y
// htmlSinResultados(); el filtro de la grilla sigue estando en app.js.
// - Coincide si TODAS las palabras escritas aparecen (en cualquier orden) en el
//   nombre o en la categoría del producto, sin mayúsculas ni tildes.
// - Cada búsqueda nueva lleva la vista al título del catálogo (#grid-titulo),
//   con scroll instantáneo. Enter hace lo mismo y cierra el teclado.
// - Al buscar se limpia el filtro de categoría (lo hace window.setBusqueda en app.js).
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function palabrasDe(texto) {
  return normalizar(texto).split(' ').filter(Boolean);
}

export function coincide(producto, palabras) {
  if (!palabras.length) return true;
  const texto = normalizar(`${producto.nombre} ${producto.categoria} ${infoCategoria(producto.categoria).nombre}`);
  return palabras.every((w) => texto.includes(w));
}

// Contador "3 resultados para 'arsenal'" + "Limpiar búsqueda" arriba de la grilla.
export function actualizarInfoBusqueda(texto, cantidad) {
  const el = $('busqueda-info'); if (!el) return;
  const q = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!q || !cantidad) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = `<span class="busqueda-cuenta">${cantidad} ${cantidad === 1 ? 'resultado' : 'resultados'} para '${esc(q)}'</span>
    <button type="button" class="busqueda-limpiar" onclick="limpiarBusqueda()">Limpiar búsqueda</button>`;
  el.style.display = '';
}

export function htmlSinResultados(texto) {
  const q = String(texto || '').trim().replace(/\s+/g, ' ');
  return `<div class="empty"><p>No encontramos productos para '${esc(q)}'.<br>Probá con otra palabra.</p>
    <button type="button" class="busqueda-limpiar busqueda-todo" onclick="limpiarBusqueda()">Ver todo el catálogo</button></div>`;
}

// ── barra de búsqueda ──
const barra = $('hdr-search');
const input = $('hdr-search-input');

function irAResultados() {
  const t = $('grid-titulo');
  if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' }); // 'instant' pisa el scroll suave global
}
function abrirBusqueda() {
  barra.classList.add('open');
  $('btn-lupa').setAttribute('aria-expanded', 'true');
  input.focus();
}
function cerrarBarra() {
  barra.classList.remove('open');
  $('btn-lupa').setAttribute('aria-expanded', 'false');
}

window.limpiarBusqueda = function () {
  input.value = '';
  window.setBusqueda('');
  cerrarBarra();
  irAResultados();
};

if (barra && input) {
  $('btn-lupa').addEventListener('click', () => {
    if (barra.classList.contains('open')) { input.value = ''; window.setBusqueda(''); cerrarBarra(); } else abrirBusqueda();
  });
  $('hdr-search-x').addEventListener('click', () => { input.value = ''; window.setBusqueda(''); cerrarBarra(); });
  input.addEventListener('input', () => {
    window.setBusqueda(input.value);
    if (input.value.trim()) irAResultados(); // en cada búsqueda nueva, no solo en la primera letra
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    window.setBusqueda(input.value);
    input.blur(); // cierra el teclado del celular
    if (input.value.trim()) {
      irAResultados();
      // el teclado tarda en bajar y cambia el alto de la pantalla: se reubica cuando termina
      setTimeout(irAResultados, 150);
      setTimeout(irAResultados, 400);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && barra.classList.contains('open') && document.activeElement === input) {
      input.value = ''; window.setBusqueda(''); cerrarBarra();
    }
  });
}
