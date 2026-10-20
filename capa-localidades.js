import { filtrarLocalidades, textoFila, MENSAJE_SIN_RESULTADOS } from './buscador-localidades.js';

// ══════════════════════════════════════════
// CAPA DE BÚSQUEDA DE LOCALIDADES A PANTALLA COMPLETA (solo iPhone/iPad, en la ficha → "Calcular envío").
// iOS Safari NO achica la página al abrir el teclado: mueve el "visual viewport" y los elementos position:fixed
// se corren (el panel de la ficha quedaba desplazado y se veía la portada entre el panel y el teclado).
// Para que no importe cómo lo mueva iOS, el campo y la lista viven en una capa propia, encima de todo:
//   · position:fixed pegada al área VISIBLE: top = visualViewport.offsetTop, alto = visualViewport.height
//     (--vv-top y --vv-h; se actualizan SOLO cuando el visor cambia: teclado abre/cierra, giro de pantalla;
//     nunca por tecla). La lista usa el resto del alto (flex) y se desplaza por dentro.
//   · el fondo no se desplaza mientras está abierta (clase loc-capa-abierta en <html> + touchmove bloqueado).
//   · sin scrollIntoView. El campo se enfoca dentro del mismo toque que la abre (si no, iOS no abre el teclado).
//   · al elegir una localidad (o tocar ‹ / Esc) se cierra y quien la abrió sigue igual que siempre.
// La abre buscador-localidades.js (opción `capa`) cuando usaCapa() es true. Ver capa-localidades.css.
// ══════════════════════════════════════════

export function abrirCapaLocalidades({ envios = [], seleccionId = null, alElegir = () => {}, alCerrar = () => {} } = {}) {
  if (document.querySelector('.loc-capa')) return null;
  const uid = 'lcp' + Math.random().toString(36).slice(2, 7);
  const capa = document.createElement('div');
  capa.className = 'loc-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.setAttribute('aria-label', 'Buscá tu localidad');
  capa.innerHTML = `
    <div class="loc-capa-barra">
      <button type="button" class="loc-capa-atras" aria-label="Cerrar búsqueda">&#8249;</button>
      <input type="text" class="loc-capa-input" role="combobox" aria-expanded="true" aria-controls="${uid}-ul" aria-autocomplete="list" aria-label="Buscá tu localidad" placeholder="Buscá tu localidad"
        name="loc-buscar-${uid}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search"
        data-lpignore="true" data-1p-ignore="true" data-form-type="other">
    </div>
    <ul class="loc-capa-lista" id="${uid}-ul" role="listbox" aria-label="Localidades"></ul>
    <p class="loc-capa-vacio" hidden></p>
    <span class="solo-lectores" role="status" aria-live="polite"></span>`;
  capa.querySelector('.loc-capa-vacio').textContent = MENSAJE_SIN_RESULTADOS;
  const $in = capa.querySelector('.loc-capa-input'), $ul = capa.querySelector('.loc-capa-lista'), $vacio = capa.querySelector('.loc-capa-vacio'), $estado = capa.querySelector('.solo-lectores');
  let filas = [], activo = -1, cerrada = false;

  // ── tamaño = área visible (solo al abrir y cuando el visor cambia) ──
  const vv = window.visualViewport;
  let pendiente = 0;
  function ajustar() {
    pendiente = 0;
    const alto = vv ? vv.height : window.innerHeight, arriba = vv ? vv.offsetTop : 0;
    capa.style.setProperty('--vv-h', Math.round(alto) + 'px');
    capa.style.setProperty('--vv-top', Math.round(arriba) + 'px');
  }
  const pedirAjuste = () => { if (!pendiente) pendiente = requestAnimationFrame(ajustar); };
  ajustar();
  if (vv) { vv.addEventListener('resize', pedirAjuste); vv.addEventListener('scroll', pedirAjuste); }
  window.addEventListener('orientationchange', pedirAjuste);
  window.addEventListener('resize', pedirAjuste);

  // ── lista (lo único que cambia al escribir) ──
  function pintarLista() {
    filas = filtrarLocalidades(envios, $in.value);
    if (activo >= filas.length) activo = filas.length - 1;
    $ul.innerHTML = filas.map((x, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = `${uid}-o${i}`; li.dataset.id = x.id;
      li.className = 'loc-capa-fila' + (i === activo ? ' activa' : '') + (x.id === seleccionId ? ' elegida' : '');
      li.setAttribute('aria-selected', String(x.id === seleccionId));
      li.textContent = textoFila(x);
      return li.outerHTML;
    }).join('');
    $vacio.hidden = filas.length > 0 || !envios.length;
    if (activo >= 0) $in.setAttribute('aria-activedescendant', `${uid}-o${activo}`); else $in.removeAttribute('aria-activedescendant');
    $estado.textContent = filas.length ? `${filas.length} localidades` : 'Sin resultados';
  }

  function cerrar() {
    if (cerrada) return; cerrada = true;
    if (vv) { vv.removeEventListener('resize', pedirAjuste); vv.removeEventListener('scroll', pedirAjuste); }
    window.removeEventListener('orientationchange', pedirAjuste);
    window.removeEventListener('resize', pedirAjuste);
    if (pendiente) cancelAnimationFrame(pendiente);
    document.removeEventListener('keydown', alTeclado, true);
    capa.remove();
    document.documentElement.classList.remove('loc-capa-abierta');
    alCerrar();
  }
  function elegir(id) { cerrar(); alElegir(id); }
  function mover(d) {
    if (!filas.length) return;
    activo = activo < 0 ? (d > 0 ? 0 : filas.length - 1) : (activo + d + filas.length) % filas.length;
    $ul.querySelectorAll('.activa').forEach((e) => e.classList.remove('activa'));
    const el = $ul.children[activo]; if (el) { el.classList.add('activa'); el.scrollIntoView({ block: 'nearest' }); $in.setAttribute('aria-activedescendant', el.id); }
  }
  function alTeclado(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); }
  }

  $in.addEventListener('input', () => { activo = $in.value.trim() ? 0 : -1; pintarLista(); });
  $in.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); mover(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (filas[activo]) elegir(filas[activo].id); else if (filas.length === 1) elegir(filas[0].id); else $in.blur(); }
  });
  $ul.addEventListener('mousedown', (ev) => ev.preventDefault()); // tocar una fila no saca el foco del campo
  $ul.addEventListener('click', (ev) => { const li = ev.target.closest('.loc-capa-fila'); if (li) elegir(li.dataset.id); });
  capa.querySelector('.loc-capa-atras').addEventListener('click', cerrar);
  // el fondo no se mueve: solo la lista puede desplazarse
  capa.addEventListener('touchmove', (ev) => { if (!ev.target.closest('.loc-capa-lista')) ev.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', alTeclado, true);

  pintarLista();
  document.documentElement.classList.add('loc-capa-abierta');
  document.body.appendChild(capa);
  $in.focus(); // dentro del mismo toque: iOS abre el teclado
  return { cerrar };
}
