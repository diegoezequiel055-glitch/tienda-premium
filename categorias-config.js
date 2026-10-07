// ══════════════════════════════════════════
// CATEGORÍAS — solo para la web. No modifica Firestore ni StockMGR: traduce el
// nombre que viene cargado en el stock al nombre que se ve en el menú y los
// filtros, y define el orden del menú.
//
// Para agregar una variante (ej. "Camisetas" escrita distinto en el stock) o una
// categoría nueva: sumá el nombre a `stock` de la fila correspondiente. Si dos
// nombres del stock apuntan a la misma fila, se unifican en una sola categoría.
// Las que no estén acá se muestran igual con su nombre original, al final.
// Se compara sin importar mayúsculas ni tildes.
// ══════════════════════════════════════════

export const CATEGORIAS = [
  { visible: 'Camisetas', stock: ['Camiseta'] },
  { visible: 'Conjuntos', stock: ['Conjunto'] },
  { visible: 'Camperas', stock: ['Campera'] },
  { visible: 'Chombas', stock: ['Chombas'] },
  { visible: 'Chalecos', stock: ['Chalecos'] },
  { visible: 'Remeras', stock: ['Remeras'] },
  { visible: 'Buzos', stock: ['Buzo'] },
  { visible: 'Pantalones', stock: ['Pantalón'] },
  { visible: 'Shorts', stock: ['Short'] },
  { visible: 'Bermudas', stock: ['Bermuda'] },
  { visible: 'Gorras', stock: ['Gorra G5'] },
  { visible: 'Jeans', stock: ['Jean'] },
  { visible: 'Perfumes', stock: ['Perfume'] },
];

// minúsculas, sin tildes y sin espacios sobrantes
export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const aSlug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const PORNOMBRE = new Map(); // nombre del stock normalizado → { clave, nombre, orden }
CATEGORIAS.forEach((c, i) => {
  const info = { clave: aSlug(c.visible), nombre: c.visible, orden: i };
  c.stock.forEach((n) => PORNOMBRE.set(normalizar(n), info));
  PORNOMBRE.set(normalizar(c.visible), info);
});

// Datos de la categoría de un producto (clave estable para filtros y links #cat=...)
export function infoCategoria(nombreStock) {
  const info = PORNOMBRE.get(normalizar(nombreStock));
  if (info) return info;
  return { clave: aSlug(nombreStock) || 'sin-categoria', nombre: String(nombreStock || 'Sin categoría').trim(), orden: Infinity };
}
export const claveDe = (nombreStock) => infoCategoria(nombreStock).clave;

// Misma condición que el catálogo público: foto, precio y stock.
export const esVisible = (p) => (p.fotos || []).length > 0 && p.precio > 0 && (p.talles || []).length > 0;

// Categorías con al menos 1 producto visible, en el orden del menú.
export function categoriasDisponibles(productos) {
  const mapa = new Map();
  productos.filter(esVisible).forEach((p) => {
    const info = infoCategoria(p.categoria);
    const e = mapa.get(info.clave) || { ...info, cantidad: 0 };
    e.cantidad++;
    mapa.set(info.clave, e);
  });
  return [...mapa.values()].sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
}

// Un valor de link (#cat=camisetas, #cat=camiseta) → clave existente, o '' si no corresponde.
export function resolverClave(valor, disponibles) {
  let v = String(valor || '');
  try { v = decodeURIComponent(v); } catch {}
  v = aSlug(v);
  if (!v) return '';
  const directa = disponibles.find((c) => c.clave === v);
  return directa ? directa.clave : (disponibles.find((c) => c.clave === claveDe(v))?.clave || '');
}
