import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// HERO ROTATIVO — foto grande del inicio con los 4 productos más nuevos.
// "Más nuevos" = campo `creadoEn` de catalogo_publico (fecha real de alta en
// StockMGR, la misma que usa "Nuevos ingresos"). Etiqueta "Nuevo" si se cargó
// hace 30 días o menos. Foto = primera del producto, tamaño 'ficha' (900 px):
// es la misma URL que la ficha, así al abrirla esa foto ya está en caché.
// app.js solo llama a pintarHeroRotativo() y a idsHero() (para que "Nuevos
// ingresos" no repita estos productos).
// En PC (≥ 900 px, ver hero-rotativo.css) el hero es una banda oscura a ancho
// completo en dos mitades: a la izquierda el título y subtítulo del inicio
// (config_sitio.heroTitulo / heroSubtitulo, que app.js escribe en #hero-titulo y
// #hero-subtitulo) más nombre, precio y "Comprar →" del producto activo; a la
// derecha la foto que rota (con flechas ‹ › y pausa con el mouse encima). En
// celular esa mitad izquierda no se ve y el diseño es el de siempre.
// Rapidez: index.html carga este módulo directo (sin esperar a Firestore) y, si
// el cliente ya nos visitó, dibuja de inmediato el hero de la última vez
// (guardado en localStorage). Cuando llega el catálogo real se confirma: si es
// igual no se toca nada, si cambió se redibuja.
// ══════════════════════════════════════════

const CANTIDAD = 4;
const DIAS_NUEVO = 30;
const INTERVALO_MS = 5000;
const ESPERA_SIN_DATOS_MS = 8000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
import { precioLista, extrasPrecioHtml } from './precios.js';
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

const CLAVE_CACHE = 'heroCache';
let firma = '';
let catalogoListo = false; // true cuando ya llegó el catálogo real de Firestore
let pendienteAbrir = null; // tocó un producto del hero guardado antes de que llegue el catálogo
let timer = null;
let timerSinDatos = null;
let pausado = false;
let idx = 0;
let slides = [];
let datos = []; // productos mostrados, en el mismo orden que slides
const CLAVE_TEXTOS = 'heroTextos';

// Título y subtítulo para la mitad izquierda (PC). Se guardan de la última vez para no
// parpadear: la primera pintura usa lo guardado (o el relleno del HTML) y cuando app.js
// aplica config_sitio ('config-sitio-aplicada') se actualizan con lo real.
function textosInicio() {
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE_TEXTOS) || 'null'); } catch {}
  const t = document.getElementById('hero-titulo'), sub = document.getElementById('hero-subtitulo');
  return guardado || { t: t ? t.textContent : '', s: sub ? sub.textContent : '' };
}
function pintarTextosLado() {
  const raiz = document.getElementById('hero-rot'); if (!raiz) return;
  const x = textosInicio();
  const t = raiz.querySelector('.hero-rot-titulo'), sub = raiz.querySelector('.hero-rot-sub');
  if (t) t.textContent = x.t || ''; if (sub) sub.textContent = x.s || '';
}
document.addEventListener('config-sitio-aplicada', () => {
  const t = document.getElementById('hero-titulo'), sub = document.getElementById('hero-subtitulo');
  try { localStorage.setItem(CLAVE_TEXTOS, JSON.stringify({ t: t ? t.textContent : '', s: sub ? sub.textContent : '' })); } catch {}
  pintarTextosLado();
});

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
      <div class="hero-rot-precio">$${fmt(precioLista(p))}</div>
      ${extrasPrecioHtml(p, 'hero')}
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
  // Mitad izquierda (PC): nombre y precio del producto activo.
  const p = datos[idx]; if (!p) return;
  const n = raiz.querySelector('.hero-rot-act-nombre'), pr = raiz.querySelector('.hero-rot-act-precio'), pn = raiz.querySelector('.hero-rot-act-precio-nota');
  if (n) n.textContent = p.nombre; if (pr) pr.textContent = '$' + fmt(precioLista(p));
  if (pn) pn.innerHTML = extrasPrecioHtml(p, 'hero');
}
function abrirProducto(id) {
  if (!catalogoListo) { pendienteAbrir = id; return; } // todavía no llegó el catálogo: se abre apenas llegue
  if (window.abrirDetalle) window.abrirDetalle(id);
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

function leerCache() {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE_CACHE) || '[]');
    return Array.isArray(l) ? l.filter((p) => p && p.id && p.creadoEn > 0 && p.fotos && p.fotos[0] && p.precio > 0).slice(0, CANTIDAD) : [];
  } catch { return []; }
}
function guardarCache(lista) {
  try {
    if (!lista.length) { localStorage.removeItem(CLAVE_CACHE); return; }
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(lista.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, precioTarjeta: p.precioTarjeta, creadoEn: p.creadoEn, fotos: [p.fotos[0]] }))));
  } catch {}
}

export function pintarHeroRotativo(productos, { alFallback } = {}) {
  const raiz = document.getElementById('hero-rot');
  if (!raiz) { if (alFallback) alFallback(); return; }
  const lista = listaHero(productos);
  clearTimeout(timerSinDatos);
  catalogoListo = true;
  guardarCache(lista);
  if (!lista.length) {
    clearTimeout(timer);
    raiz.style.display = 'none'; raiz.innerHTML = ''; firma = '';
    document.body.classList.remove('hero-rot-on');
    if (alFallback) alFallback();
    return;
  }
  dibujar(raiz, lista);
  if (pendienteAbrir) {
    const id = pendienteAbrir; pendienteAbrir = null;
    if (productos.some((p) => p.id === id) && window.abrirDetalle) window.abrirDetalle(id);
  }
}

function dibujar(raiz, lista) {
  const nueva = lista.map((p) => [p.id, p.fotos[0], p.nombre, p.precio, p.precioTarjeta, esNuevo(p)].join('~')).join('|');
  if (nueva === firma) return; // mismo contenido: no reiniciar el carrusel en cada actualización
  firma = nueva;
  clearTimeout(timer);
  raiz.style.display = '';
  document.body.classList.add('hero-rot-on'); // en PC oculta el título de abajo (ya está en el hero)
  const multiple = lista.length > 1;
  datos = lista;
  raiz.innerHTML = `<div class="hero-rot-lado">
      <div class="hero-rot-titulo"></div>
      <p class="hero-rot-sub"></p>
      <div class="hero-rot-activo">
        <div class="hero-rot-act-nombre"></div>
        <div class="hero-rot-act-precio"></div>
        <div class="hero-rot-act-precio-nota"></div>
        <button type="button" class="hero-rot-btn hero-rot-act-btn">Comprar →</button>
      </div>
    </div>
    <div class="hero-rot-foto">
      <div class="hero-rot-carril">${lista.map(slideHtml).join('')}</div>
      ${multiple ? `<button type="button" class="hero-rot-flecha hero-rot-prev" aria-label="Producto anterior">‹</button><button type="button" class="hero-rot-flecha hero-rot-next" aria-label="Producto siguiente">›</button>
      <div class="hero-rot-puntos">${lista.map((_, k) => `<button type="button" class="hero-rot-punto" aria-label="Ver producto ${k + 1}"></button>`).join('')}</div>` : ''}
    </div>`;
  idx = 0;
  const car = raiz.querySelector('.hero-rot-carril');
  slides = [...car.children];
  pintarTextosLado();
  marcarPuntos(raiz);
  cargarDesde(0);

  slides.forEach((s) => s.addEventListener('click', () => abrirProducto(s.dataset.id)));
  raiz.querySelector('.hero-rot-act-btn').addEventListener('click', () => abrirProducto(datos[idx].id));
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
  // Con mouse (PC): se frena con el cursor encima de todo el hero. En pantallas táctiles no
  // se usa: un toque dispara mouseenter y la rotación quedaría frenada para siempre.
  if (window.matchMedia('(hover: hover)').matches) {
    raiz.addEventListener('mouseenter', parar);
    raiz.addEventListener('mouseleave', seguir);
  }
  const flecha = (d) => {
    const actual = Math.max(0, Math.min(slides.length - 1, Math.round(car.scrollLeft / (car.clientWidth || 1)))); // posición real, aunque todavía no haya llegado el evento de scroll
    irA(raiz, (actual + d + slides.length) % slides.length, true);
  };
  raiz.querySelector('.hero-rot-prev').addEventListener('click', () => flecha(-1));
  raiz.querySelector('.hero-rot-next').addEventListener('click', () => flecha(1));
  programar(raiz);
}

// Si el catálogo nunca llega, no dejar el hueco: vuelve la tira de 3 fotos.
export function esperarHeroRotativo(alFallback) {
  timerSinDatos = setTimeout(() => {
    const raiz = document.getElementById('hero-rot');
    if (raiz && !raiz.firstElementChild) { raiz.style.display = 'none'; alFallback(); }
  }, ESPERA_SIN_DATOS_MS);
}

// Visita repetida: dibujar ya el hero de la última vez, sin esperar a Firestore.
(function () {
  const raiz = document.getElementById('hero-rot');
  const guardado = raiz ? leerCache() : [];
  if (guardado.length) dibujar(raiz, guardado);
})();
