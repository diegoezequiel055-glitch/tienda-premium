import { normalizar, infoCategoria } from './categorias-config.js';

// ══════════════════════════════════════════
// BUSCADOR del header (lupa). Lógica de coincidencia + comportamiento de la
// barra. app.js solo usa palabrasDe(), coincide(), actualizarInfoBusqueda() y
// htmlSinResultados(); el filtro de la grilla sigue estando en app.js.
// - Coincide si TODAS las palabras escritas aparecen (en cualquier orden) en el
//   nombre o en la categoría del producto, sin mayúsculas ni tildes.
// - Mientras se escribe NO se mueve la vista: a los 300 ms de la última letra solo
//   se filtra la grilla en segundo plano. Enter, o la lupa (la del header o la de
//   dentro de la barra) con texto, buscan al instante, cierran el teclado y llevan
//   la vista al título del catálogo (#grid-titulo) con scroll instantáneo (solo si
//   no está ya cerca del tope; se reubica a los 150 y 400 ms por el teclado).
//   Mientras hay búsqueda, #grid tiene un min-height para que la página no se achique de golpe.
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
const ESPERA_MS = 300; // tiempo sin escribir antes de filtrar la grilla en segundo plano
let timerBusqueda = null;
let altoFijado = false;

// Lleva la vista al título del catálogo (scroll instantáneo). Solo si el título no está ya cerca
// del tope: queda a ~130 px del borde (scroll-margin-top de header-menu.css) y eso cuenta como "ya está".
function irAResultados() {
  const t = $('grid-titulo'); if (!t) return;
  const top = t.getBoundingClientRect().top;
  if (top >= 0 && top <= 160) return;
  t.scrollIntoView({ behavior: 'instant', block: 'start' }); // 'instant' pisa el scroll suave global
}
// Mientras hay una búsqueda, la grilla no se achica de golpe: así el navegador no corrige el scroll.
// Alcanza con el alto de la pantalla (el resto de la página, debajo, ya suma alto).
function fijarAlto() {
  const g = $('grid'); if (!g || altoFijado) return;
  g.style.minHeight = window.innerHeight + 'px';
  altoFijado = true;
}
function liberarAlto() {
  const g = $('grid'); if (g) g.style.minHeight = '';
  altoFijado = false;
}
// Filtra la grilla SIN mover la vista (la usa tanto el filtrado mientras se escribe como el Enter/lupa).
function filtrar(valor) {
  clearTimeout(timerBusqueda);
  if (!valor.trim()) { liberarAlto(); window.setBusqueda(''); return; }
  fijarAlto();
  window.setBusqueda(valor);
}
// Enter o lupa con texto: buscar al instante, cerrar el teclado y llevar la vista al catálogo.
function buscarEIr() {
  filtrar(input.value);
  if (!input.value.trim()) return;
  input.blur(); // cierra el teclado del celular
  irAResultados();
  // el teclado al bajar cambia el alto de la pantalla: se reubica cuando termina
  setTimeout(irAResultados, 150);
  setTimeout(irAResultados, 400);
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
// Borra el texto, cancela cualquier búsqueda pendiente y vuelve al catálogo completo.
function limpiarTodo() {
  clearTimeout(timerBusqueda);
  input.value = '';
  filtrar('');
  cerrarBarra();
}

window.limpiarBusqueda = function () {
  limpiarTodo();
  irAResultados();
};

if (barra && input) {
  // Lupa del header: cerrada → abre; abierta con texto → busca y va al catálogo; abierta y vacía → cierra.
  $('btn-lupa').addEventListener('click', () => {
    if (!barra.classList.contains('open')) abrirBusqueda();
    else if (input.value.trim()) buscarEIr();
    else limpiarTodo();
  });
  const ir = $('hdr-search-go'); // lupa dentro de la barra, para tocar en el celular además del Enter del teclado
  if (ir) ir.addEventListener('click', () => { if (input.value.trim()) buscarEIr(); else input.focus(); });
  $('hdr-search-x').addEventListener('click', limpiarTodo);
  input.addEventListener('input', () => {
    clearTimeout(timerBusqueda);
    if (!input.value.trim()) { filtrar(''); return; } // vacío: se limpia sin demora
    timerBusqueda = setTimeout(() => filtrar(input.value), ESPERA_MS); // sin scroll mientras se escribe
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    buscarEIr();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && barra.classList.contains('open') && document.activeElement === input) limpiarTodo();
  });
}
