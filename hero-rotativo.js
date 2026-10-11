import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// HERO ROTATIVO — foto grande del inicio con los 4 productos más nuevos.
// "Más nuevos" = campo `creadoEn` de catalogo_publico (fecha real de alta en
// StockMGR, la misma que usa "Nuevos ingresos"). Etiqueta "Nuevo" si se cargó
// hace 30 días o menos. Foto = primera del producto, tamaño 'ficha' (900 px):
// es la misma URL que la ficha, así al abrirla esa foto ya está en caché.
// app.js solo llama a pintarHeroRotativo() y a idsHero() (para que "Nuevos
// ingresos" no repita estos productos).
// ══════════════════════════════════════════

const CANTIDAD = 4;
const DIAS_NUEVO = 30;
const INTERVALO_MS = 5000;
const ESPERA_SIN_DATOS_MS = 8000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const esNuevo = (p) => Date.now() - p.creadoEn <= DIAS_NUEVO * 864e5;

// Mismas reglas de publicación del catálogo (por si algo llegara sin cumplirlas).
function publicable(p) {
  return p.creadoEn > 0 && (p.fotos || [])[0] && p.precio > 0 && (p.talles || []).some((t) => t.stock > 0);
}
export function listaHero(productos) {
  return productos.filter(publicable).sort((a, b) => b.creadoEn - a.creadoEn).slice(0, CANTIDAD);
}
export function idsHero(productos) {
  return new Set(listaHero(productos).map((p) => p.id));
}

let firma = '';
let timer = null;
let timerSinDatos = null;
let pausado = false;
let idx = 0;
let slides = [];

function slideHtml(p, i) {
  const foto = esc(fotoCloudinary(p.fotos[0], 'ficha'));
  // La primera foto carga ya (es lo primero que se ve); las demás se piden de a una desde JS.
  const img = i === 0
    ? `<img src="${foto}" alt="${esc(p.nombre)}" fetchpriority="high" decoding="async">`
    : `<img data-src="${foto}" alt="" decoding="async">`;
  return `<div class="hero-rot-slide" data-id="${esc(p.id)}" data-alt="${esc(p.nombre)}">
    ${img}
    <div class="hero-rot-degradado"></div>
    ${esNuevo(p) ? '<span class="hero-rot-nuevo">Nuevo</span>' : ''}
    <div class="hero-rot-info">
      <div class="hero-rot-nombre">${esc(p.nombre)}</div>
      <div class="hero-rot-precio">$${fmt(p.precio)}</div>
      <button type="button" class="hero-rot-btn">Comprar →</button>
    </div>
  </div>`;
}

function cargarFoto(i) {
  const img = slides[i] && slides[i].querySelector('img');
  if (!img || img.getAttribute('src')) return;
  img.alt = slides[i].dataset.alt || '';
  img.src = img.dataset.src;
}
// La actual y, cuando esa terminó de cargar, la siguiente (de a una, no todas juntas).
function cargarDesde(i) {
  const img = slides[i] && slides[i].querySelector('img');
  if (!img) return;
  cargarFoto(i);
  const siguiente = () => cargarFoto((i + 1) % slides.length);
  if (img.complete) siguiente(); else img.addEventListener('load', siguiente, { once: true });
}

function marcarPuntos(raiz) {
  raiz.querySelectorAll('.hero-rot-punto').forEach((el, k) => el.classList.toggle('activo', k === idx));
}
function irA(raiz, i, suave) {
  const car = raiz.querySelector('.hero-rot-carril');
  car.scrollTo({ left: i * car.clientWidth, behavior: suave ? 'smooth' : 'auto' });
}
function programar(raiz) {
  clearTimeout(timer);
  if (slides.length < 2 || pausado || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setTimeout(() => {
    if (document.hidden) { programar(raiz); return; }
    if (idx + 1 < slides.length) { irA(raiz, idx + 1, true); return; }
    // Vuelta al principio: fundido corto en vez de recorrer todas las fotos hacia atrás.
    raiz.classList.add('hero-rot-fade');
    setTimeout(() => { irA(raiz, 0, false); raiz.classList.remove('hero-rot-fade'); }, 250);
  }, INTERVALO_MS);
}

export function pintarHeroRotativo(productos, { alFallback } = {}) {
  const raiz = document.getElementById('hero-rot');
  if (!raiz) { if (alFallback) alFallback(); return; }
  const lista = listaHero(productos);
  clearTimeout(timerSinDatos);
  if (!lista.length) {
    clearTimeout(timer);
    raiz.style.display = 'none'; raiz.innerHTML = ''; firma = '';
    if (alFallback) alFallback();
    return;
  }
  const nueva = lista.map((p) => [p.id, p.fotos[0], p.nombre, p.precio, esNuevo(p)].join('~')).join('|');
  if (nueva === firma) return; // mismo contenido: no reiniciar el carrusel en cada actualización
  firma = nueva;
  clearTimeout(timer);
  raiz.style.display = '';
  const multiple = lista.length > 1;
  raiz.innerHTML = `<div class="hero-rot-carril">${lista.map(slideHtml).join('')}</div>
    ${multiple ? `<div class="hero-rot-puntos">${lista.map((_, k) => `<button type="button" class="hero-rot-punto" aria-label="Ver producto ${k + 1}"></button>`).join('')}</div>` : ''}`;
  idx = 0;
  const car = raiz.querySelector('.hero-rot-carril');
  slides = [...car.children];
  marcarPuntos(raiz);
  cargarDesde(0);

  slides.forEach((s) => s.addEventListener('click', () => { if (window.abrirDetalle) window.abrirDetalle(s.dataset.id); }));
  raiz.querySelectorAll('.hero-rot-punto').forEach((b, k) => b.addEventListener('click', () => irA(raiz, k, true)));

  if (!multiple) return;
  let fin = null;
  car.addEventListener('scroll', () => {
    const k = Math.max(0, Math.min(slides.length - 1, Math.round(car.scrollLeft / (car.clientWidth || 1))));
    if (k !== idx) { idx = k; marcarPuntos(raiz); }
    clearTimeout(fin);
    fin = setTimeout(() => { cargarDesde(idx); programar(raiz); }, 150); // cuando frena
  }, { passive: true });
  // Se frena mientras el cliente la toca y retoma al soltar.
  const parar = () => { pausado = true; clearTimeout(timer); };
  const seguir = () => { pausado = false; programar(raiz); };
  car.addEventListener('touchstart', parar, { passive: true });
  car.addEventListener('touchend', seguir, { passive: true });
  car.addEventListener('touchcancel', seguir, { passive: true });
  car.addEventListener('mouseenter', parar);
  car.addEventListener('mouseleave', seguir);
  programar(raiz);
}

// Si el catálogo nunca llega, no dejar el hueco: vuelve la tira de 3 fotos.
export function esperarHeroRotativo(alFallback) {
  timerSinDatos = setTimeout(() => {
    const raiz = document.getElementById('hero-rot');
    if (raiz && !raiz.firstElementChild) { raiz.style.display = 'none'; alFallback(); }
  }, ESPERA_SIN_DATOS_MS);
}
