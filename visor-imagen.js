import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// VISOR DE FOTOS CON ZOOM (ficha del producto).
// Tocar la foto de la ficha abre un visor a pantalla completa, fondo oscuro, foto
// ENTERA centrada (object-fit contain, sin recortar).
// - Celular: pellizco para acercar, doble toque acerca/aleja, arrastrar si está
//   ampliada, deslizar a los costados (con zoom 1×) para cambiar de foto.
// - PC: rueda del mouse o botones + / −, arrastrar, flechas ‹ › y teclado ← →.
// - Cierra con ✕, Esc o el botón "atrás" (pushState: no sale de la ficha).
// - Sin scroll de la página de fondo (body.visor-abierto).
// - Foto: se muestra al instante la de la ficha (ya en caché) y se reemplaza por la de
//   tamaño 'visor' (fotos-cloudinary.js); se precarga la siguiente. Solo se pide al abrir.
// Escucha 'detalle-pintado' (para saber el producto). No toca app.js ni compartir.js.
// ══════════════════════════════════════════

const ZOOM_MAX = 4;
const ZOOM_DOBLE_TOQUE = 2.5;
const UMBRAL_SWIPE = 60;

let producto = null;
let fotos = [];
let idx = 0;
let idxInicial = 0;
let abierto = false;
let empujado = false; // se agregó una entrada al historial para que "atrás" cierre el visor
let s = 1, tx = 0, ty = 0;   // zoom y desplazamiento (px, desde el centro)
let w0 = 0, h0 = 0;          // tamaño de la foto ajustada a la pantalla (zoom 1×)
let ui = null;
let ultimoToque = { t: 0, x: 0, y: 0 };

const $ = (id) => document.getElementById(id);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

function construir() {
  if (ui) return;
  const el = document.createElement('div');
  el.className = 'visor';
  el.id = 'visor';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Foto ampliada');
  el.innerHTML = `
    <div class="visor-escena"><img class="visor-img" alt="" draggable="false"></div>
    <span class="visor-contador"></span>
    <button type="button" class="visor-cerrar" aria-label="Cerrar">✕</button>
    <button type="button" class="visor-flecha visor-prev" aria-label="Foto anterior">‹</button>
    <button type="button" class="visor-flecha visor-next" aria-label="Foto siguiente">›</button>
    <div class="visor-zoom"><button type="button" class="visor-mas" aria-label="Acercar">+</button><button type="button" class="visor-menos" aria-label="Alejar">−</button></div>`;
  document.body.appendChild(el);
  ui = {
    el,
    escena: el.querySelector('.visor-escena'),
    img: el.querySelector('.visor-img'),
    contador: el.querySelector('.visor-contador'),
    prev: el.querySelector('.visor-prev'),
    next: el.querySelector('.visor-next'),
  };
  el.querySelector('.visor-cerrar').addEventListener('click', () => cerrar());
  ui.prev.addEventListener('click', () => ir(idx - 1));
  ui.next.addEventListener('click', () => ir(idx + 1));
  el.querySelector('.visor-mas').addEventListener('click', () => zoomEn(s * 1.5, null));
  el.querySelector('.visor-menos').addEventListener('click', () => zoomEn(s / 1.5, null));
  ui.img.addEventListener('load', () => { ajustar(); aplicar(); });
  window.addEventListener('resize', () => { if (abierto) { ajustar(); aplicar(); } });
  gestos();
}

// ── tamaño y posición ──
function ajustar() {
  const nw = ui.img.naturalWidth, nh = ui.img.naturalHeight;
  const vw = ui.escena.clientWidth, vh = ui.escena.clientHeight;
  if (!nw || !nh || !vw || !vh) return;
  const r = nw / nh;
  if (vw / vh < r) { w0 = vw; h0 = vw / r; } else { h0 = vh; w0 = vh * r; }
  ui.img.style.width = w0 + 'px';
  ui.img.style.height = h0 + 'px';
}
function limitarDesplazamiento() {
  const vw = ui.escena.clientWidth, vh = ui.escena.clientHeight;
  const mx = Math.max(0, (w0 * s - vw) / 2), my = Math.max(0, (h0 * s - vh) / 2);
  tx = limitar(tx, -mx, mx);
  ty = limitar(ty, -my, my);
}
function aplicar() {
  ui.img.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(${s})`;
}
// Zoom hacia el punto (px,py) de la pantalla (o el centro si es null), manteniéndolo bajo el dedo/cursor.
function zoomEn(nuevo, punto, animar = true) {
  nuevo = limitar(nuevo, 1, ZOOM_MAX);
  if (nuevo < 1.02) nuevo = 1;
  const r = ui.escena.getBoundingClientRect();
  const px = punto ? punto.x - r.left - r.width / 2 : 0;
  const py = punto ? punto.y - r.top - r.height / 2 : 0;
  const k = nuevo / s;
  tx = px - k * (px - tx);
  ty = py - k * (py - ty);
  s = nuevo;
  if (s === 1) { tx = 0; ty = 0; }
  limitarDesplazamiento();
  if (animar) animarTransform();
  aplicar();
}
function animarTransform() {
  ui.img.classList.add('anim');
  clearTimeout(animarTransform.t);
  animarTransform.t = setTimeout(() => ui.img.classList.remove('anim'), 260);
}

// ── fotos ──
const urlGrande = (i) => fotoCloudinary(fotos[i], 'visor');
function mostrar(i, conFundido) {
  idx = i;
  s = 1; tx = 0; ty = 0;
  const grande = urlGrande(i);
  const chica = fotoCloudinary(fotos[i], 'ficha'); // la misma de la ficha: ya está en caché
  ui.img.alt = producto ? producto.nombre : '';
  ui.img.src = chica;
  if (conFundido) { ui.img.classList.remove('fade'); void ui.img.offsetWidth; ui.img.classList.add('fade'); }
  aplicar();
  if (grande !== chica) {
    const pre = new Image();
    pre.onload = () => { if (abierto && idx === i) ui.img.src = grande; };
    pre.src = grande;
  }
  if (i + 1 < fotos.length) new Image().src = urlGrande(i + 1); // precarga la siguiente
  actualizarUI();
}
function actualizarUI() {
  const n = fotos.length;
  ui.el.classList.toggle('una', n < 2);
  ui.contador.textContent = `${idx + 1}/${n}`;
  ui.prev.classList.toggle('oculta', idx === 0);
  ui.next.classList.toggle('oculta', idx === n - 1);
}
function ir(i) {
  if (i < 0 || i >= fotos.length || i === idx) return;
  mostrar(i, true);
}

// ── abrir / cerrar ──
function abrir(i) {
  if (!producto || !(producto.fotos || []).length) return;
  construir();
  fotos = producto.fotos;
  idxInicial = i;
  abierto = true;
  ui.el.classList.add('abierto');
  document.body.classList.add('visor-abierto');
  ajustarAlAbrir(i);
  try { history.pushState({ visor: true }, '', location.href); empujado = true; } catch { empujado = false; }
  ui.el.querySelector('.visor-cerrar').focus({ preventScroll: true });
}
function ajustarAlAbrir(i) {
  mostrar(i, false);
  ajustar(); aplicar();
}
function cerrar() {
  if (!abierto) return;
  abierto = false;
  ui.el.classList.remove('abierto');
  document.body.classList.remove('visor-abierto');
  // La foto de la ficha queda en la última que se vio en el visor.
  if (idx !== idxInicial && window.elegirFotoDetalle && producto && $('detalle-overlay').classList.contains('open')) window.elegirFotoDetalle(idx);
  if (empujado) { empujado = false; history.back(); }
}
window.addEventListener('popstate', () => { if (abierto) { empujado = false; cerrar(); } }); // botón "atrás"

document.addEventListener('keydown', (e) => {
  if (!abierto) return;
  const usada = ['Escape', 'ArrowLeft', 'ArrowRight', '+', '=', '-', '_'];
  if (!usada.includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation(); // que no mueva también las fotos de la ficha de atrás
  if (e.key === 'Escape') cerrar();
  else if (e.key === 'ArrowLeft') ir(idx - 1);
  else if (e.key === 'ArrowRight') ir(idx + 1);
  else if (e.key === '+' || e.key === '=') zoomEn(s * 1.5, null);
  else zoomEn(s / 1.5, null);
}, true);

// ── gestos: pellizco, arrastre, deslizar, doble toque, rueda ──
function gestos() {
  const escena = ui.escena;
  const punteros = new Map();
  let g = null; // estado del gesto en curso

  const centro = () => {
    const p = [...punteros.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  };
  const distancia = () => {
    const p = [...punteros.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
  };
  const iniciar = () => {
    const unico = punteros.size === 1 ? [...punteros.values()][0] : null;
    g = { s0: s, tx0: tx, ty0: ty, x0: unico ? unico.x : 0, y0: unico ? unico.y : 0, dist0: punteros.size === 2 ? distancia() : 0, c0: punteros.size === 2 ? centro() : null, movido: false, pellizco: punteros.size === 2 };
  };

  escena.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { escena.setPointerCapture(e.pointerId); } catch {}
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    ui.img.classList.remove('anim');
    if (punteros.size > 2) return;
    iniciar();
    if (punteros.size === 1) g.inicioT = Date.now();
    escena.classList.add('arrastrando');
  });

  escena.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId) || !g) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = escena.getBoundingClientRect();
    if (punteros.size === 2) {
      // pellizco: el zoom sigue la distancia entre los dedos y el punto medio acompaña el movimiento
      g.pellizco = true; g.movido = true;
      const nuevo = limitar(g.s0 * distancia() / g.dist0, 1, ZOOM_MAX);
      const c = centro();
      const px0 = g.c0.x - r.left - r.width / 2, py0 = g.c0.y - r.top - r.height / 2;
      const px = c.x - r.left - r.width / 2, py = c.y - r.top - r.height / 2;
      const k = nuevo / g.s0;
      s = nuevo;
      tx = px - k * (px0 - g.tx0);
      ty = py - k * (py0 - g.ty0);
      limitarDesplazamiento();
      aplicar();
      return;
    }
    if (punteros.size !== 1 || g.pellizco) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (Math.abs(dx) + Math.abs(dy) > 8) g.movido = true;
    if (s > 1) { tx = g.tx0 + dx; ty = g.ty0 + dy; limitarDesplazamiento(); aplicar(); }
    else { tx = dx; ty = 0; aplicar(); } // con zoom 1×: la foto acompaña al dedo para cambiar de foto
  });

  const soltar = (e) => {
    if (!punteros.has(e.pointerId)) return;
    const p = punteros.get(e.pointerId);
    punteros.delete(e.pointerId);
    escena.classList.remove('arrastrando');
    if (!g) return;
    if (punteros.size === 1) { iniciar(); g.movido = true; g.pellizco = true; return; } // quedó un dedo: sigue sin saltar de foto
    if (punteros.size > 0) return;
    const dx = p.x - g.x0;
    const eraPellizco = g.pellizco;
    const movido = g.movido;
    g = null;
    if (eraPellizco) { if (s < 1.02) { s = 1; tx = 0; ty = 0; animarTransform(); aplicar(); } return; }
    if (s === 1 && movido) {
      if (Math.abs(dx) > UMBRAL_SWIPE) { const dir = dx < 0 ? 1 : -1; tx = 0; if (idx + dir >= 0 && idx + dir < fotos.length) ir(idx + dir); else { animarTransform(); aplicar(); } }
      else { tx = 0; animarTransform(); aplicar(); }
      return;
    }
    if (!movido) {
      // toque: dos seguidos = acercar/alejar
      const ahora = Date.now();
      if (ahora - ultimoToque.t < 320 && Math.hypot(p.x - ultimoToque.x, p.y - ultimoToque.y) < 30) {
        zoomEn(s > 1 ? 1 : ZOOM_DOBLE_TOQUE, { x: p.x, y: p.y });
        ultimoToque = { t: 0, x: 0, y: 0 };
      } else ultimoToque = { t: ahora, x: p.x, y: p.y };
    }
  };
  escena.addEventListener('pointerup', soltar);
  escena.addEventListener('pointercancel', soltar);

  escena.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEn(s * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY }, false);
  }, { passive: false });
}

// ── conexión con la ficha ──
document.addEventListener('detalle-pintado', (e) => { producto = e.detail; });
$('detalle-foto').addEventListener('click', (e) => {
  const img = e.target.closest('img'); if (!img || !producto) return;
  const carril = img.parentElement && img.parentElement.id === 'detalle-foto-scroll' ? img.parentElement : null;
  const i = carril ? [...carril.children].indexOf(img) : 0;
  abrir(Math.max(0, i));
});
