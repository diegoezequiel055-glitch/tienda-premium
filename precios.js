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
