// ══════════════════════════════════════════
// VISTAS DE LA TIENDA — lógica pura (sin DOM). Se prueba con `node test-portada-corta.mjs`.
//
// La tienda tiene UNA portada (corta: hero, categorías, Nuevos ingresos, Destacados, Ofertas, Videos, botón "Ver todo el catálogo", texto/envíos)
// y VISTAS que reemplazan el contenido de la portada: el catálogo completo, una categoría o las ofertas. En app.js la vista actual es
// `categoria`:  ''  → portada      'todos' → "Todo el catálogo"      'ofertas' → todas las ofertas      '<clave>' → una categoría (camisetas, ...)
// La URL la refleja con #cat=...: sin hash es la portada. Es la MISMA forma de siempre (#cat=camisetas, #cat=ofertas), más #cat=todos.
// ══════════════════════════════════════════

export const CLAVE_TODOS = 'todos';
export const CLAVE_OFERTAS = 'ofertas';

// '#cat=camisetas' → 'camisetas' (decodificado); sin hash o con otro hash → null (portada).
export function claveDeHash(hash) {
  const m = String(hash || '').match(/^#cat=(.+)$/);
  if (!m) return null;
  let v = m[1]; try { v = decodeURIComponent(v); } catch {}
  v = v.trim(); return v || null;
}

// 'camisetas' → '#cat=camisetas'; '' (portada) → ''.
export const hashDeClave = (clave) => (clave ? '#cat=' + encodeURIComponent(clave) : '');

// Título de la vista: "Ofertas", "Todo el catálogo" o el nombre de la categoría (si no se conoce, "Todo el catálogo").
export function tituloVista(clave, nombreCategoria) {
  if (clave === CLAVE_OFERTAS) return 'Ofertas';
  if (!clave || clave === CLAVE_TODOS) return 'Todo el catálogo';
  return nombreCategoria || 'Todo el catálogo';
}

// "Ver todo el catálogo (73 productos)" con el número real; sin productos no hay botón.
export function textoBotonCatalogo(n) {
  const c = Number(n) || 0;
  if (c <= 0) return '';
  return `Ver todo el catálogo (${c.toLocaleString('es-AR')} ${c === 1 ? 'producto' : 'productos'})`;
}
