// ══════════════════════════════════════════
// MENÚ LATERAL: "Todos los productos" como botón desplegable (lo usa header-menu.js).
//   [Todos los productos  ▾]      ← botón (aria-expanded, aria-controls), área táctil de 52 px
//      Ver todos los productos    ← primera opción (muestra el catálogo completo)
//      Camisetas / Conjuntos / …  ← salen de los datos del catálogo (categoriasDisponibles), nunca escritas a mano
// - Cerrado al abrir el menú, salvo que haya una categoría activa: entonces se abre solo y la categoría queda marcada.
// - Se abre/cierra con una animación corta (grid-template-rows 0fr↔1fr) y la flecha gira (▾ → ▴).
// - Las opciones siguen siendo `.menu-cat[data-clave]`: header-menu.js ya sabe qué hacer al tocarlas (cierra el menú, filtra, baja al catálogo).
// - Al repintar (llega el catálogo o cambia la categoría) NO se recrea el botón ni la lista abierta: solo se actualizan las opciones.
// Funciones puras (itemsHtml) probadas en test-menu-desplegable.mjs.
// ══════════════════════════════════════════

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ETIQUETA_TODOS = 'Todos los productos';
export const ETIQUETA_VER_TODOS = 'Ver todos los productos';

// HTML de las opciones del desplegable. disponibles: [{clave, nombre}]. claveActiva: '' = todas.
export function itemsHtml(disponibles, claveActiva) {
  const item = (clave, nombre) => `<button type="button" class="menu-cat${clave === claveActiva ? ' active' : ''}" data-clave="${esc(clave)}"${clave === claveActiva ? ' aria-current="true"' : ''}>${esc(nombre)}</button>`;
  return item('', ETIQUETA_VER_TODOS) + (disponibles || []).map((c) => item(c.clave, c.nombre)).join('');
}

// Crea (una sola vez) el botón y el contenedor desplegable dentro de `cont` y actualiza las opciones.
export function pintarMenuCategorias(cont, { disponibles = [], claveActiva = '' } = {}) {
  let toggle = cont.querySelector('.menu-toggle');
  if (!toggle) {
    cont.innerHTML = `<button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="menu-sub">
        <span>${esc(ETIQUETA_TODOS)}</span><span class="menu-flecha" aria-hidden="true">▾</span>
      </button>
      <div class="menu-sub" id="menu-sub" role="group" aria-label="${esc(ETIQUETA_TODOS)}"><div class="menu-sub-in"></div></div>`;
    toggle = cont.querySelector('.menu-toggle');
    toggle.addEventListener('click', () => fijarDesplegado(cont, !estaDesplegado(cont)));
  }
  cont.querySelector('.menu-sub-in').innerHTML = itemsHtml(disponibles, claveActiva);
  toggle.classList.toggle('con-activa', claveActiva !== '');
}

export const estaDesplegado = (cont) => { const t = cont.querySelector('.menu-toggle'); return !!t && t.getAttribute('aria-expanded') === 'true'; };

// Abre o cierra el desplegable (flecha ▾/▴ y aria-expanded). Las opciones ocultas no reciben foco (visibility en el CSS).
export function fijarDesplegado(cont, abierto) {
  const t = cont.querySelector('.menu-toggle'), sub = cont.querySelector('.menu-sub'); if (!t || !sub) return;
  t.setAttribute('aria-expanded', String(abierto));
  t.querySelector('.menu-flecha').textContent = abierto ? '▴' : '▾';
  sub.classList.toggle('abierto', abierto);
}
