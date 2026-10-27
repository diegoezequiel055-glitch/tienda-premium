// ══════════════════════════════════════════
// "COMPRAR POR CATEGORÍA" — lógica pura (sin DOM ni Firebase). Se prueba con `node test-categorias-foto.mjs`.
//
// Una tarjeta con foto por categoría que tiene productos; tocarla abre la vista de esa categoría (#cat=<clave>, la misma de siempre).
// FOTO de cada categoría, por orden de prioridad:
//   1) la que cargó Diego en StockMGR (Catálogo y sitio › "Fotos de categorías"), guardada en config_sitio/config › fotosCategorias
//      como { "Camisetas": "https://...jpg" } (nombre de la categoría → url). Viaja en el documento de config que la tienda YA lee: sin lecturas extra.
//   2) si no hay, la foto principal del ÚLTIMO producto ingresado de esa categoría (por fecha de alta, creadoEn).
//   3) si la categoría no tiene productos, no se muestra (solo se arma tarjeta de las categorías con productos).
// La clave de cada entrada de fotosCategorias se pasa por claveDe() (categorias-config.js): "Camisetas", "Camiseta" y "camisetas" son la misma.
// ══════════════════════════════════════════
import { categoriasDisponibles, claveDe } from './categorias-config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const urlValida = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(u.trim());

// { "Camisetas": url, ... } → { camisetas: url, ... } (solo urls https; lo que no sirve se ignora). Si dos claves caen en la misma categoría gana la primera.
export function fotosPorClave(mapa) {
  const salida = {};
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return salida;
  for (const [nombre, url] of Object.entries(mapa)) {
    if (!urlValida(url) || !String(nombre).trim()) continue;
    const clave = claveDe(nombre); if (clave && !(clave in salida)) salida[clave] = url.trim();
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

// Tarjetas a mostrar: [{ clave, nombre, foto, origen: 'cargada' | 'ultimo' }], en el orden del menú, solo categorías con productos y con alguna foto.
export function tarjetasCategorias(productos, fotosCargadas) {
  const cargadas = fotosPorClave(fotosCargadas);
  const salida = [];
  for (const c of categoriasDisponibles(productos || [])) {
    const cargada = cargadas[c.clave];
    const foto = cargada || ultimaFotoDe(productos, c.clave);
    if (!foto) continue;
    salida.push({ clave: c.clave, nombre: c.nombre, foto, origen: cargada ? 'cargada' : 'ultimo' });
  }
  return salida;
}

// Tarjeta horizontal 4:3 con la foto a pantalla completa, degradé oscuro abajo, el nombre en blanco y una flecha. Es un link (#cat=...): abre la vista de la categoría.
export const tarjetaCategoriaHtml = (c, urlFoto) => `<a class="cat-foto" href="#cat=${encodeURIComponent(c.clave)}" data-clave="${esc(c.clave)}" aria-label="Comprar ${esc(c.nombre)}">
    <img src="${esc(urlFoto || c.foto)}" width="400" height="300" loading="lazy" decoding="async" alt="">
    <span class="cat-foto-nombre"><span>${esc(c.nombre)}</span><span class="cat-foto-flecha" aria-hidden="true">→</span></span>
  </a>`;
