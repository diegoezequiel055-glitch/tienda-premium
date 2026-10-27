// ══════════════════════════════════════════
// "COMPRAR POR CATEGORÍA" (carrusel de tarjetas con foto) — lógica pura (sin DOM ni Firebase). Se prueba con `node test-categorias-portada.mjs`.
//
// Una tarjeta vertical (4:5) por categoría que tiene productos; tocarla (o el botón "Comprar") abre la vista de esa categoría (#cat=<clave>).
// Datos que carga Diego en StockMGR (Catálogo y sitio › "Categorías de la portada"), en config_sitio/config › categoriasPortada:
//   { "Camisetas": { foto: "https://...jpg", frase: "Las de la temporada" }, ... }   (nombre de la categoría → foto y frase corta opcionales)
//   Viaja en el documento de config que la tienda YA lee: sin lecturas extra.
// FOTO de cada categoría, por orden de prioridad:
//   1) la que cargó Diego en StockMGR (categoriasPortada[categoría].foto);
//   2) si no hay, la foto principal del ÚLTIMO producto ingresado de esa categoría (por fecha de alta, creadoEn);
//   3) si la categoría no tiene productos publicables, no se muestra (la tarjeta se arma solo con categorías que tienen productos).
// FRASE: texto corto opcional (máx. 30 caracteres) sobre el nombre; vale con cualquiera de las dos fotos.
// La clave de cada entrada se pasa por claveDe() (categorias-config.js): "Camisetas", "Camiseta" y "camisetas" son la misma categoría.
// ══════════════════════════════════════════
import { categoriasDisponibles, claveDe } from './categorias-config.js';

export const MAX_FRASE = 30;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const urlValida = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(u.trim());
export const limpiarFrase = (f) => String(f ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FRASE);

// { "Camisetas": { foto, frase }, ... } → { camisetas: { foto: url|'', frase: texto|'' }, ... }. Lo que no sirve se ignora (foto que no es https; entradas que no son objetos;
// entradas sin foto ni frase). Si dos claves caen en la misma categoría gana la primera.
export function portadaPorClave(mapa) {
  const salida = {};
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return salida;
  for (const [nombre, v] of Object.entries(mapa)) {
    if (!String(nombre).trim() || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const foto = urlValida(v.foto) ? v.foto.trim() : '', frase = limpiarFrase(v.frase);
    if (!foto && !frase) continue;
    const clave = claveDe(nombre); if (clave && !(clave in salida)) salida[clave] = { foto, frase };
  }
  return salida;
}

// Foto principal del último producto ingresado de la categoría (el de mayor creadoEn que tenga foto); null si no hay.
export function ultimaFotoDe(productos, clave) {
  let mejor = null;
  for (const p of productos || []) {
    if (claveDe(p.categoria) !== clave) continue;
    const foto = (p.fotos || []).find(urlValida); if (!foto) continue;
    const t = Number(p.creadoEn) || 0;
    if (!mejor || t > mejor.t) mejor = { t, foto };
  }
  return mejor ? mejor.foto : null;
}

// Tarjetas a mostrar: [{ clave, nombre, foto, origen: 'cargada' | 'ultimo', frase }], en el orden del menú, solo categorías con productos y con alguna foto.
export function tarjetasCategorias(productos, categoriasPortada) {
  const datos = portadaPorClave(categoriasPortada);
  const salida = [];
  for (const c of categoriasDisponibles(productos || [])) {
    const d = datos[c.clave] || { foto: '', frase: '' };
    const foto = d.foto || ultimaFotoDe(productos, c.clave);
    if (!foto) continue;
    salida.push({ clave: c.clave, nombre: c.nombre, foto, origen: d.foto ? 'cargada' : 'ultimo', frase: d.frase });
  }
  return salida;
}

// Tarjeta vertical 4:5: foto a tarjeta completa, degradé oscuro abajo y, abajo a la izquierda, frase (opcional), nombre en blanco y botón blanco "Comprar".
// Es UN link (#cat=...): tocar la tarjeta o el botón abre la vista de la categoría. data-click-categoria lleva el nombre para Analytics (analytics.js).
// La primera foto carga con prioridad; las demás, lazy.
export const tarjetaCategoriaHtml = (c, urlFoto, posicion = 0) => `<a class="cat-card" role="listitem" href="#cat=${encodeURIComponent(c.clave)}" data-clave="${esc(c.clave)}" data-click-categoria="${esc(c.nombre)}" aria-label="Comprar ${esc(c.nombre)}">
    <img src="${esc(urlFoto || c.foto)}" width="400" height="500" ${posicion === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" alt="">
    <span class="cat-card-texto">${c.frase ? `<span class="cat-card-frase">${esc(c.frase)}</span>` : ''}<span class="cat-card-nombre">${esc(c.nombre)}</span><span class="cat-card-boton" aria-hidden="true">Comprar</span></span>
  </a>`;

// Puntitos indicadores: uno por tarjeta (botón que lleva a esa tarjeta); el activo más largo.
export const puntosHtml = (tarjetas, activo = 0) => tarjetas.map((c, i) => `<button type="button" class="cat-punto${i === activo ? ' activo' : ''}" data-i="${i}" aria-label="Ir a ${esc(c.nombre)}"${i === activo ? ' aria-current="true"' : ''}></button>`).join('');

// Qué tarjeta está "activa" según el scroll del carrusel: la más cercana al borde izquierdo; al final del recorrido, la última.
export function indiceActivo({ scrollLeft, paso, cantidad, alFinal }) {
  if (!(cantidad > 0)) return 0;
  if (alFinal) return cantidad - 1;
  if (!(paso > 0)) return 0;
  return Math.min(cantidad - 1, Math.max(0, Math.round(scrollLeft / paso)));
}
