// ══════════════════════════════════════════
// PAGINACIÓN DEL CATÁLOGO ("Ver más") — funciones puras, sin DOM.
// Primero se filtra (búsqueda + categoría) sobre TODOS los productos y recién después se
// recorta a lo que se muestra: así los filtros y la búsqueda siempre ven el catálogo completo
// y el contador ("N productos") cuenta el total filtrado, no solo lo que está en pantalla.
// app.js guarda cuántos se muestran (arranca en TAMANO_PAGINA, "Ver más" suma otra tanda y
// cambiar de categoría o de búsqueda vuelve a empezar).
// ══════════════════════════════════════════

export const TAMANO_PAGINA = 24;

// lista = ya filtrada y ordenada; mostrados = cuántos se muestran ahora.
export function paginar(lista, mostrados = TAMANO_PAGINA, tanda = TAMANO_PAGINA) {
  const n = Math.max(tanda, Number(mostrados) || tanda);
  const visibles = lista.slice(0, n);
  const restantes = Math.max(0, lista.length - visibles.length);
  return { visibles, restantes, proximaTanda: Math.min(tanda, restantes) };
}

// Texto del botón: "Ver más (24 de 34 restantes)" → claro y corto.
export function textoVerMas(restantes, tanda = TAMANO_PAGINA) {
  if (restantes <= 0) return '';
  return restantes > tanda ? `Ver más productos (${restantes} restantes)` : `Ver los ${restantes} restantes`;
}
