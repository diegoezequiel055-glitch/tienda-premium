import { claveDe, normalizar } from './categorias-config.js';
import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// PRODUCTOS RELACIONADOS en la ficha (solo con el catálogo ya cargado: no lee Firestore).
// 1) "Quizá también te guste": misma categoría, primero los del mismo equipo/modelo
//    (palabras del nombre en común, ej. "boca", "river"). Grilla de 2 columnas, hasta 8.
// 2) "Completá tu look": carrusel con categorías COMPLEMENTARIAS (ver COMPLEMENTOS),
//    hasta 8. Las categorías se reconocen en singular o plural con categorias-config.js.
// Cada sección se oculta si le quedan menos de 2 productos. Se excluyen el producto
// actual y los que no tienen precio o stock. Tocar una tarjeta abre esa ficha (la URL pasa
// a su ?p= y "atrás" vuelve al anterior: lo maneja compartir.js) y la ficha sube al tope.
// ══════════════════════════════════════════

const MAX = 8;
const MIN = 2;

// Claves de categoría (ver categorias-config.js) → categorías que combinan, en orden de prioridad.
const COMPLEMENTOS = {
  camisetas: ['shorts', 'pantalones', 'gorras', 'camperas'],
  conjuntos: ['gorras', 'camperas', 'camisetas'],
  chombas: ['pantalones', 'jeans', 'bermudas', 'gorras'],
  camperas: ['pantalones', 'jeans', 'camisetas', 'gorras'],
  buzos: ['pantalones', 'jeans', 'camisetas', 'gorras'],
  chalecos: ['pantalones', 'jeans', 'camisetas', 'gorras'],
  shorts: ['camisetas', 'remeras', 'gorras'],
  bermudas: ['camisetas', 'remeras', 'gorras'],
};

// Palabras del nombre que no identifican un equipo o modelo (tipo de prenda, versión, conectores...).
const GENERICAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'con', 'sin', 'para', 'version', 'jugador', 'hincha', 'fan', 'titular', 'suplente', 'alternativa', 'tercera', 'retro', 'icon', 'aniversario', 'edicion', 'nuevo', 'nueva', 'g5', 'camiseta', 'camisetas', 'short', 'shorts', 'conjunto', 'conjuntos', 'remera', 'remeras', 'campera', 'camperas', 'buzo', 'buzos', 'chomba', 'chombas', 'gorra', 'gorras', 'jean', 'jeans', 'pantalon', 'pantalones', 'bermuda', 'bermudas', 'chaleco', 'chalecos', 'perfume', 'perfumes', 'manga', 'larga', 'corta']);

let productos = [];
let firma = '';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
import { precioLista, extrasPrecioHtml } from './precios.js';
import { etiquetaHtml, anteriorHtml } from './ofertas.js';

const publicable = (p) => p.precio > 0 && (p.talles || []).some((t) => t.stock > 0) && (p.fotos || [])[0];
const palabrasClave = (nombre) => new Set(normalizar(nombre).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/\d/.test(w) && !GENERICAS.has(w)));

// Misma categoría; los que comparten palabras del nombre (equipo/modelo) van primero.
export function quizaTeGuste(actual, lista) {
  const clave = claveDe(actual.categoria);
  const mias = palabrasClave(actual.nombre);
  return lista
    .filter((p) => p.id !== actual.id && publicable(p) && claveDe(p.categoria) === clave)
    .map((p) => ({ p, afinidad: [...palabrasClave(p.nombre)].filter((w) => mias.has(w)).length }))
    .sort((a, b) => b.afinidad - a.afinidad || (b.p.creadoEn || 0) - (a.p.creadoEn || 0) || a.p.nombre.localeCompare(b.p.nombre, 'es'))
    .slice(0, MAX)
    .map((x) => x.p);
}

export function completaTuLook(actual, lista) {
  const orden = COMPLEMENTOS[claveDe(actual.categoria)] || [];
  if (!orden.length) return [];
  return lista
    .filter((p) => p.id !== actual.id && publicable(p) && orden.includes(claveDe(p.categoria)))
    .sort((a, b) => orden.indexOf(claveDe(a.categoria)) - orden.indexOf(claveDe(b.categoria)) || (b.creadoEn || 0) - (a.creadoEn || 0))
    .slice(0, MAX);
}

const tarjeta = (p) => `<button type="button" class="rel-card" data-id="${esc(p.id)}" aria-label="${esc(p.nombre)}, $${fmt(precioLista(p))}">
    <span class="rel-foto"><img src="${esc(fotoCloudinary(p.fotos[0], 'tarjeta'))}" alt="" loading="lazy">${etiquetaHtml(p)}</span>
    <span class="rel-nombre">${esc(p.nombre)}</span>
    ${anteriorHtml(p, 'rel-precio-ant', 'span')}
    <span class="rel-precio">$${fmt(precioLista(p))}</span>
    ${extrasPrecioHtml(p, 'rel')}
  </button>`;

function contenedor() {
  let c = $('relacionados');
  if (c) return c;
  const cuerpo = document.querySelector('.detalle-body'); if (!cuerpo) return null;
  c = document.createElement('section');
  c.id = 'relacionados';
  c.className = 'rel';
  cuerpo.appendChild(c); // debajo de talles, agregar, compartir y calcular envío
  c.addEventListener('click', (e) => {
    const b = e.target.closest('.rel-card'); if (!b) return;
    window.abrirDetalle(b.dataset.id);
    const panel = document.querySelector('.detalle-panel');
    if (panel) panel.scrollTo({ top: 0, behavior: 'instant' }); // la ficha nueva arranca desde arriba
  });
  return c;
}

function pintar(actual) {
  const c = contenedor(); if (!c) return;
  const gusta = quizaTeGuste(actual, productos);
  const look = completaTuLook(actual, productos);
  const f = actual.id + '|' + gusta.map((p) => p.id).join(',') + '|' + look.map((p) => p.id).join(',');
  if (f === firma) return; // nada cambió (el catálogo se actualiza seguido): no repintar
  firma = f;
  c.innerHTML =
    (gusta.length >= MIN ? `<div class="rel-bloque"><h3 class="rel-titulo">Quizá también te guste</h3><div class="rel-grid">${gusta.map(tarjeta).join('')}</div></div>` : '') +
    (look.length >= MIN ? `<div class="rel-bloque"><h3 class="rel-titulo">Completá tu look</h3><div class="rel-carril">${look.map(tarjeta).join('')}</div></div>` : '');
  c.style.display = c.innerHTML ? '' : 'none';
}

let fichaActual = null;
document.addEventListener('catalogo-actualizado', (e) => {
  productos = e.detail || [];
  if (fichaActual && $('detalle-overlay').classList.contains('open')) pintar(fichaActual); // ficha abierta por link (?p=) antes de que llegara este aviso
});
document.addEventListener('detalle-pintado', (e) => { fichaActual = e.detail; pintar(fichaActual); });
