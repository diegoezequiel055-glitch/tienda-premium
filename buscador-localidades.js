import { normalizar } from './categorias-config.js';

// ══════════════════════════════════════════
// BUSCADOR DE LOCALIDADES del carrito (Motomensajería). Reemplaza al selector largo.
// - Campo "Buscá tu localidad" + lista debajo que se filtra en vivo.
// - Ignora mayúsculas y acentos ("jose" encuentra "José C. Paz"). Primero las que EMPIEZAN con lo
//   escrito y después las que lo CONTIENEN (cada grupo en orden alfabético). Sin texto: todas, A-Z.
// - Al elegir una, el campo muestra "Localidad — $precio" con el botón "Cambiar". No calcula nada:
//   avisa con alElegir(id) y app.js hace lo de siempre (setEnvio → costo, total y mensaje de WhatsApp).
// - Accesible: input role=combobox + lista role=listbox, flechas arriba/abajo, Enter elige, Esc limpia/vuelve.
// Las funciones puras (filtrarLocalidades, textoFila) se prueban en test-buscador-localidades.mjs.
// ══════════════════════════════════════════

export const MENSAJE_SIN_RESULTADOS = 'No encontramos esa localidad. Elegí la más cercana o consultanos por WhatsApp';

const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const porNombre = (a, b) => a.localidad.localeCompare(b.localidad, 'es');

export function filtrarLocalidades(envios, texto) {
  const q = normalizar(texto);
  if (!q) return [...envios].sort(porNombre);
  const empieza = [], contiene = [];
  for (const e of envios) {
    const n = normalizar(e.localidad);
    if (n.startsWith(q)) empieza.push(e); else if (n.includes(q)) contiene.push(e);
  }
  return [...empieza.sort(porNombre), ...contiene.sort(porNombre)];
}

// Mismo texto que tenía cada opción del selector anterior.
export const textoFila = (e) => `${e.localidad} — ${e.estimado ? '≈' : ''}$${fmt(e.precio)}`;

// cont: elemento vacío donde se arma. opciones: { envios, seleccionId, alElegir(id) }
export function montarBuscadorLocalidades(cont, { envios = [], seleccionId = null, alElegir = () => {} } = {}) {
  let lista = envios, elegido = seleccionId, activo = -1, buscando = !seleccionId, filas = [];
  const uid = 'loc' + Math.random().toString(36).slice(2, 7);
  cont.innerHTML = `<div class="loc">
      <div class="loc-campo">
        <input type="text" class="loc-input" id="${uid}-in" role="combobox" aria-expanded="true" aria-controls="${uid}-ul" aria-autocomplete="list" aria-label="Buscá tu localidad" placeholder="Buscá tu localidad" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
        <button type="button" class="loc-cambiar" hidden>Cambiar</button>
      </div>
      <ul class="loc-lista" id="${uid}-ul" role="listbox" aria-label="Localidades"></ul>
      <p class="loc-vacio" hidden>${esc(MENSAJE_SIN_RESULTADOS)}</p>
      <span class="solo-lectores" role="status" aria-live="polite"></span>
    </div>`;
  const $in = cont.querySelector('.loc-input'), $ul = cont.querySelector('.loc-lista'), $vacio = cont.querySelector('.loc-vacio');
  const $cambiar = cont.querySelector('.loc-cambiar'), $estado = cont.querySelector('.solo-lectores'), $caja = cont.querySelector('.loc');

  const sel = () => lista.find((e) => e.id === elegido) || null;

  function pintar() {
    const e = sel();
    const modoElegida = !buscando && !!e;
    $caja.classList.toggle('loc-elegida', modoElegida);
    $in.readOnly = modoElegida;
    $cambiar.hidden = !modoElegida;
    $in.setAttribute('aria-expanded', String(!modoElegida));
    if (modoElegida) {
      $in.value = textoFila(e);
      $ul.hidden = true; $vacio.hidden = true; $ul.innerHTML = ''; filas = [];
      $in.removeAttribute('aria-activedescendant');
      return;
    }
    $ul.hidden = false;
    filas = filtrarLocalidades(lista, $in.value);
    if (activo >= filas.length) activo = filas.length - 1;
    $ul.innerHTML = filas.map((x, i) => `<li role="option" id="${uid}-o${i}" class="loc-fila${i === activo ? ' activa' : ''}${x.id === elegido ? ' elegida' : ''}" data-id="${esc(x.id)}" aria-selected="${x.id === elegido}">${esc(textoFila(x))}</li>`).join('');
    $vacio.hidden = filas.length > 0 || !lista.length;
    if (activo >= 0) $in.setAttribute('aria-activedescendant', `${uid}-o${activo}`); else $in.removeAttribute('aria-activedescendant');
    $estado.textContent = filas.length ? `${filas.length} localidades` : 'Sin resultados';
  }

  function elegir(id) {
    elegido = id; buscando = false; $in.value = ''; activo = -1;
    pintar();
    alElegir(id);
    $cambiar.focus();
  }
  function abrirBusqueda() {
    buscando = true; $in.readOnly = false; $in.value = ''; activo = -1; pintar(); $in.focus();
  }
  function mover(d) {
    if (!filas.length) return;
    activo = activo < 0 ? (d > 0 ? 0 : filas.length - 1) : (activo + d + filas.length) % filas.length;
    pintar();
    const el = $ul.children[activo]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  $in.addEventListener('input', () => { activo = $in.value.trim() ? 0 : -1; pintar(); });
  $in.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); mover(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (!$in.readOnly && filas[activo]) elegir(filas[activo].id); }
    else if (ev.key === 'Escape') {
      if ($in.value) { $in.value = ''; activo = -1; pintar(); }
      else if (sel()) { buscando = false; pintar(); $cambiar.focus(); }
    }
  });
  // En celular, al tocar el campo se sube al tope del carrito para que el teclado no tape la lista.
  $in.addEventListener('focus', () => { if (!$in.readOnly) setTimeout(() => { if ($in.scrollIntoView) $in.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 250); });
  $in.addEventListener('click', () => { if ($in.readOnly) abrirBusqueda(); });
  $cambiar.addEventListener('click', abrirBusqueda);
  $ul.addEventListener('click', (ev) => { const li = ev.target.closest('.loc-fila'); if (li) elegir(li.dataset.id); });
  $ul.addEventListener('mousemove', (ev) => {
    const li = ev.target.closest('.loc-fila'); if (!li) return;
    const i = [...$ul.children].indexOf(li); if (i === activo) return;
    if ($ul.children[activo]) $ul.children[activo].classList.remove('activa');
    activo = i; li.classList.add('activa'); $in.setAttribute('aria-activedescendant', li.id);
  });

  pintar();
  return {
    // La tabla de envíos cambió en vivo (Firestore) o la ficha eligió otra localidad.
    actualizar(nuevos, nuevoId) {
      lista = nuevos;
      if (nuevoId !== undefined) { elegido = nuevoId; if (nuevoId) buscando = false; }
      pintar();
    },
  };
}
