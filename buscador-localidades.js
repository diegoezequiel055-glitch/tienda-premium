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

// ¿Usar la capa a pantalla completa (capa-localidades.js)? Solo en iPhone/iPad: iOS no achica la página al abrir el teclado
// y mueve los paneles fijos. ?capa=1 la fuerza (para probar en otros navegadores) y ?capa=0 la desactiva.
// El parámetro se lee al cargar el módulo y se recuerda en la pestaña (la ficha cambia la URL a ?p=… y se perdería).
try { const u = new URLSearchParams(location.search).get('capa'); if (u === '1' || u === '0') sessionStorage.setItem('capa', u); } catch {}
export function usaCapa() {
  try {
    let q = null; try { q = sessionStorage.getItem('capa'); } catch {}
    if (q === '1') return true;
    if (q === '0') return false;
    const ua = navigator.userAgent || '';
    return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { return false; }
}

// cont: elemento vacío donde se arma. opciones: { envios, seleccionId, alElegir(id), capa }
// capa: función abrirCapaLocalidades (opcional). Si se pasa y usaCapa() es true, el campo es solo un botón que abre la capa.
export function montarBuscadorLocalidades(cont, { envios = [], seleccionId = null, alElegir = () => {}, capa = null } = {}) {
  const modoCapa = typeof capa === 'function' && usaCapa();
  let lista = envios, elegido = seleccionId, activo = -1, buscando = !seleccionId, filas = [];
  const uid = 'loc' + Math.random().toString(36).slice(2, 7);
  cont.innerHTML = `<div class="loc">
      <div class="loc-campo">
        <input type="text" class="loc-input" id="${uid}-in" role="combobox" aria-expanded="true" aria-controls="${uid}-ul" aria-autocomplete="list" aria-label="Buscá tu localidad" placeholder="Buscá tu localidad" name="loc-buscar-${uid}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="done" data-lpignore="true" data-1p-ignore="true" data-form-type="other">
        <button type="button" class="loc-cambiar" hidden>Cambiar</button>
      </div>
      <div class="loc-res">
        <ul class="loc-lista" id="${uid}-ul" role="listbox" aria-label="Localidades"></ul>
        <p class="loc-vacio" hidden>${esc(MENSAJE_SIN_RESULTADOS)}</p>
      </div>
      <span class="solo-lectores" role="status" aria-live="polite"></span>
    </div>`;
  const $in = cont.querySelector('.loc-input'), $ul = cont.querySelector('.loc-lista'), $vacio = cont.querySelector('.loc-vacio');
  const $cambiar = cont.querySelector('.loc-cambiar'), $res = cont.querySelector('.loc-res'), $estado = cont.querySelector('.solo-lectores'), $caja = cont.querySelector('.loc');

  const sel = () => lista.find((e) => e.id === elegido) || null;

  function pintar() {
    const e = sel();
    if (modoCapa) { // el campo es un botón: vacío ("Buscá tu localidad") o con la localidad elegida + "Cambiar"
      $caja.classList.toggle('loc-elegida', !!e);
      $in.readOnly = true;
      $in.value = e ? textoFila(e) : '';
      $cambiar.hidden = !e;
      $res.hidden = true; $vacio.hidden = true; $ul.innerHTML = ''; filas = [];
      return;
    }
    const modoElegida = !buscando && !!e;
    $caja.classList.toggle('loc-elegida', modoElegida);
    $in.readOnly = modoElegida;
    $cambiar.hidden = !modoElegida;
    $res.hidden = modoElegida;
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
    else if (ev.key === 'Enter') { ev.preventDefault(); if (modoCapa) abrirLaCapa(); else if (!$in.readOnly && filas[activo]) elegir(filas[activo].id); }
    else if (ev.key === 'Escape') {
      if ($in.value) { $in.value = ''; activo = -1; pintar(); }
      else if (sel()) { buscando = false; pintar(); $cambiar.focus(); }
    }
  });
  // Al enfocar se acomoda UNA sola vez (nunca por tecla). El scroll-margin
  // (buscador-localidades.css) deja a la vista la fila de arriba. Escribir solo redibuja la LISTA, nunca el campo.
  // Mientras el campo tiene el foco el botón "Hacer pedido" del carrito se oculta (buscador-localidades.css).
  $in.addEventListener('focus', () => { setTimeout(() => { if (document.activeElement === $in && !$in.readOnly && $caja.scrollIntoView) $caja.scrollIntoView({ block: 'start' }); }, 300); });
  // Tocar una fila no debe sacar el foco del campo (si no, el botón reaparece y la lista se mueve antes de elegir).
  $ul.addEventListener('mousedown', (ev) => ev.preventDefault());
  // Modo capa: el toque abre la capa a pantalla completa (el campo se enfoca DENTRO de ese toque, ver capa-localidades.js).
  function abrirLaCapa() {
    capa({ envios: lista, seleccionId: elegido, alElegir: (id) => elegir(id), alCerrar: () => { if (!$cambiar.hidden) $cambiar.focus(); } });
  }
  $in.addEventListener('click', () => { if (modoCapa) abrirLaCapa(); else if ($in.readOnly) abrirBusqueda(); });
  $cambiar.addEventListener('click', modoCapa ? abrirLaCapa : abrirBusqueda);
  $ul.addEventListener('click', (ev) => { const li = ev.target.closest('.loc-fila'); if (li) elegir(li.dataset.id); });
  $ul.addEventListener('mousemove', (ev) => {
    const li = ev.target.closest('.loc-fila'); if (!li) return;
    const i = [...$ul.children].indexOf(li); if (i === activo) return;
    if ($ul.children[activo]) $ul.children[activo].classList.remove('activa');
    activo = i; li.classList.add('activa'); $in.setAttribute('aria-activedescendant', li.id);
  });

  if (modoCapa) { $caja.classList.add('loc-capa-modo'); $in.setAttribute('role', 'button'); $in.setAttribute('aria-haspopup', 'dialog'); $in.removeAttribute('aria-controls'); $in.removeAttribute('aria-autocomplete'); $in.setAttribute('aria-expanded', 'false'); }
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
