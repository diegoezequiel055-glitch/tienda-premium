// ══════════════════════════════════════════
// PRECIOS DE LA TIENDA — un solo lugar para decidir qué precio se muestra.
//
// Cada ficha de catalogo_publico tiene:
//   precio         → efectivo o transferencia (siempre está)
//   precioTarjeta  → precio de lista con tarjeta, hasta 3 cuotas sin interés (puede no estar)
//
// Si la ficha NO tiene precioTarjeta (documentos viejos, o interruptor apagado en StockMGR), o si el
// valor no tiene sentido (no es un número, o no es mayor que el de efectivo), todo se ve como siempre:
// un solo precio y "Abonando en efectivo o transferencia". Nada se rompe mientras los documentos no
// estén actualizados.
// ══════════════════════════════════════════

export const fmtPrecio = (n) => Number(n || 0).toLocaleString('es-AR');

export const NOTA_CUOTAS = 'Hasta 3 cuotas sin interés';
export const NOTA_SOLO_EFECTIVO = 'Abonando en efectivo o transferencia'; // como se ve hoy

export const tienePrecioTarjeta = (p) => Number.isFinite(p?.precioTarjeta) && p.precioTarjeta > 0 && p.precioTarjeta > (p.precio || 0);

// Efectivo o transferencia (el que se carga en StockMGR).
export const precioEfectivo = (p) => p.precio;

// El que se muestra grande: tarjeta si existe, si no el de siempre.
export const precioLista = (p) => (tienePrecioTarjeta(p) ? p.precioTarjeta : p.precio);

// "Efectivo o transferencia: $X" (solo cuando hay precio de tarjeta; si no, no hace falta aclarar).
export const lineaEfectivo = (p) => (tienePrecioTarjeta(p) ? `Efectivo o transferencia: $${fmtPrecio(p.precio)}` : '');

// Aclaraciones que van debajo del precio grande, en la tarjeta del catálogo y en la ficha.
export const notasPrecio = (p) => (tienePrecioTarjeta(p) ? [NOTA_CUOTAS, lineaEfectivo(p)] : [NOTA_SOLO_EFECTIVO]);

// ══════════════════════════════════════════
// CARRITO — cada ítem guarda los dos precios: `precio` (efectivo o transferencia) y, si el producto lo
// tiene, `precioTarjeta`. El total depende de la forma de pago:
//   Efectivo / Transferencia → precio de efectivo.
//   Tarjeta, y TODOS los ítems tienen precioTarjeta → precio de tarjeta, con total numérico.
//   Tarjeta, pero a algún ítem le falta precioTarjeta (ficha vieja o interruptor apagado) → como siempre:
//   precio de efectivo y "Total: a confirmar" (no se puede prometer un total real).
// ══════════════════════════════════════════
export const itemTieneTarjeta = (it) => tienePrecioTarjeta(it);
export const tarjetaCompleta = (items) => items.length > 0 && items.every(itemTieneTarjeta);
export const usaPrecioTarjeta = (items, formaPago) => formaPago === 'tarjeta' && tarjetaCompleta(items);
export const precioUnitario = (it, items, formaPago) => (usaPrecioTarjeta(items, formaPago) ? it.precioTarjeta : it.precio);
export const subtotalDe = (items, formaPago) => items.reduce((a, it) => a + precioUnitario(it, items, formaPago) * it.cantidad, 0);

// Los dos precios que se guardan al agregar un producto al carrito.
export const preciosParaCarrito = (p) => (tienePrecioTarjeta(p) ? { precio: p.precio, precioTarjeta: p.precioTarjeta } : { precio: p.precio });

// Carritos guardados en el navegador (incluidos los viejos, sin precioTarjeta): se actualizan por ID con lo que
// dice el catálogo hoy. Un ítem cuyo producto ya no está en el catálogo se deja como estaba. Devuelve
// { carrito, cambio } — `cambio` avisa si hay que volver a guardar.
export function resolverCarrito(carrito, productos) {
  let cambio = false;
  const nuevo = carrito.map((it) => {
    const p = productos.find((x) => x.id === it.id);
    if (!p || !(p.precio > 0)) return it;
    const precios = preciosParaCarrito(p);
    if (it.precio === precios.precio && it.precioTarjeta === precios.precioTarjeta) return it;
    cambio = true;
    const { precioTarjeta, ...resto } = it;
    return { ...resto, ...precios };
  });
  return { carrito: nuevo, cambio };
}
