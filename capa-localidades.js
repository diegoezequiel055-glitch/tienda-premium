import { filtrarLocalidades, textoFila, MENSAJE_SIN_RESULTADOS } from './buscador-localidades.js';

// ══════════════════════════════════════════
// CAPA DE BÚSQUEDA DE LOCALIDADES A PANTALLA COMPLETA (solo iPhone/iPad, en la ficha → "Calcular envío").
// iOS Safari NO achica la página al abrir el teclado: mueve el "visual viewport" y los elementos position:fixed
// se corren (el panel de la ficha quedaba desplazado y se veía la portada entre el panel y el teclado).
// Para que no importe cómo lo mueva iOS, el campo y la lista viven en una capa propia, encima de todo:
//   · position:fixed pegada al área VISIBLE: top = visualViewport.offsetTop, alto = visualViewport.height
//     (--vv-top y --vv-h; se actualizan SOLO cuando el visor cambia: teclado abre/cierra, giro de pantalla;
//     nunca por tecla). La lista usa el resto del alto (flex) y se desplaza por dentro.
//   · el <body> se fija (position:fixed; top:-scrollY) y los gestos fuera de la lista / al pasar del tope o del final se cancelan.
//   · TODO lo de atrás se oculta y queda inerte mientras está abierta (clase loc-capa-abierta en <html>, inert + aria-hidden en el resto
//     del <body>), fondo de html/body blanco, sin scroll del fondo. Al cerrar se restaura el scroll de la ficha tal como estaba.
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
  capa.innerHTML = `<div class="loc-capa-int">
    <div class="loc-capa-barra">
      <button type="button" class="loc-capa-atras" aria-label="Cerrar búsqueda">&#8249;</button>
      <input type="text" class="loc-capa-input" role="combobox" aria-expanded="true" aria-controls="${uid}-ul" aria-autocomplete="list" aria-label="Buscá tu localidad" placeholder="Buscá tu localidad"
        name="loc-buscar-${uid}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search"
        data-lpignore="true" data-1p-ignore="true" data-form-type="other">
    </div>
    <ul class="loc-capa-lista" id="${uid}-ul" role="listbox" aria-label="Localidades"></ul>
    <p class="loc-capa-vacio" hidden></p>
    <span class="solo-lectores" role="status" aria-live="polite"></span>
    </div>`;
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
    // La capa exterior (blanca) cubre SIEMPRE todo lo visible, incluso si Safari corre el visor más allá del layout viewport.
    capa.style.height = Math.max(window.innerHeight, Math.round(arriba + alto)) + 'px';
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

  // Mientras la capa está abierta TODO lo demás se oculta y se vuelve inerte (ficha, portada, carrito...): nada se ve por un hueco
  // y Safari no encuentra otros campos de formulario (si no, muestra su barra gris con flechas y tilde).
  const panel = document.querySelector('.detalle-panel');
  const guardado = { panelTop: panel ? panel.scrollTop : 0, x: window.scrollX, y: window.scrollY };
  const inertes = [];
  [...document.body.children].forEach((el) => {
    if (el === capa) return;
    inertes.push({ el, inert: el.hasAttribute('inert'), aria: el.getAttribute('aria-hidden') });
    el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true');
  });
  // Bloqueo REAL del fondo (en iOS overflow:hidden no alcanza): el <body> pasa a position:fixed con top:-scrollY (la portada queda
  // visualmente quieta y no puede desplazarse). Al cerrar se quita y se vuelve al scrollY exacto.
  const bs = document.body.style;
  const bodyPrevio = { position: bs.position, top: bs.top, left: bs.left, right: bs.right, width: bs.width };
  bs.position = 'fixed'; bs.top = `-${guardado.y}px`; bs.left = '0'; bs.right = '0'; bs.width = '100%';
  // Otros campos de formulario de la página: deshabilitados mientras la capa está abierta (Safari los cuenta para su barra gris
  // con flechas ‹ › y tilde aunque estén ocultos o inertes). Se restauran al cerrar.
  const camposFuera = [...document.querySelectorAll('input,select,textarea')].filter((el) => !capa.contains(el) && !el.disabled);
  camposFuera.forEach((el) => { el.disabled = true; });
  function restaurar() { // deja la ficha y la página exactamente donde estaban
    const poner = () => { if (panel && panel.isConnected) panel.scrollTop = guardado.panelTop; window.scrollTo(guardado.x, guardado.y); };
    poner(); requestAnimationFrame(() => { poner(); requestAnimationFrame(poner); });
  }

  function cerrar(restaurarScroll = true) {
    if (cerrada) return; cerrada = true;
    if (vv) { vv.removeEventListener('resize', pedirAjuste); vv.removeEventListener('scroll', pedirAjuste); }
    window.removeEventListener('orientationchange', pedirAjuste);
    window.removeEventListener('resize', pedirAjuste);
    if (pendiente) cancelAnimationFrame(pendiente);
    document.removeEventListener('keydown', alTeclado, true);
    capa.remove();
    inertes.forEach(({ el, inert, aria }) => { if (!inert) el.removeAttribute('inert'); if (aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', aria); });
    document.documentElement.classList.remove('loc-capa-abierta');
    camposFuera.forEach((el) => { if (el.isConnected) el.disabled = false; });
    Object.assign(bs, bodyPrevio); // fin del bloqueo del fondo (el scrollY se repone en restaurar())
    alCerrar();
    if (restaurarScroll) restaurar();
  }
  function elegir(id) { cerrar(false); alElegir(id); restaurar(); } // el scroll se restaura DESPUÉS de que la ficha se vuelve a dibujar
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
  capa.querySelector('.loc-capa-atras').addEventListener('click', () => cerrar());
  // el fondo no se mueve: solo la lista puede desplazarse
  // Solo la lista puede desplazarse, y sin "pasarse" al fondo: se bloquea todo toque fuera de la lista y, dentro de ella,
  // el arrastre que intenta pasar del tope (hacia abajo) o del final (hacia arriba), o cualquiera si la lista no tiene scroll.
  let yPrev = 0;
  capa.addEventListener('touchstart', (ev) => { if (ev.touches[0]) yPrev = ev.touches[0].clientY; }, { passive: true });
  capa.addEventListener('touchmove', (ev) => {
    const t = ev.touches[0]; if (!t) return;
    const dy = t.clientY - yPrev; yPrev = t.clientY;
    const lista = ev.target.closest && ev.target.closest('.loc-capa-lista');
    if (!lista) { ev.preventDefault(); return; }
    const enTope = lista.scrollTop <= 0, enFin = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 1;
    const sinScroll = lista.scrollHeight <= lista.clientHeight + 1;
    if (sinScroll || (dy > 0 && enTope) || (dy < 0 && enFin)) ev.preventDefault();
  }, { passive: false });
  document.addEventListener('keydown', alTeclado, true);

  pintarLista();
  document.documentElement.classList.add('loc-capa-abierta');
  document.body.appendChild(capa);
  $in.focus(); // dentro del mismo toque: iOS abre el teclado
  return { cerrar: () => cerrar() };
}
