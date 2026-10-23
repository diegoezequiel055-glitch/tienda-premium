// ══════════════════════════════════════════
// OFERTAS — lógica pura (sin DOM ni Firebase). Se prueba con `node test-ofertas.mjs`.
//
// StockMGR (ofertas.js de ese repo) agrega a la ficha, solo si el producto está en oferta:
//   precioOferta         → precio en oferta, efectivo o transferencia (mayor a 0 y menor que `precio`)
//   precioOfertaTarjeta  → su precio de lista con tarjeta (mismo recargo y redondeo que el normal; puede faltar)
// `precio` y `precioTarjeta` siguen siendo los NORMALES.
//
// aplicarOferta() se llama UNA vez por producto cuando llega el catálogo (app.js) y deja la ficha lista para todo el sitio:
//   precio / precioTarjeta   → pasan a ser los de la OFERTA. Así el carrito, el total, el mensaje de WhatsApp, Analytics, la ficha,
//                              los relacionados y el hero usan siempre el precio que paga el cliente, sin tocar ninguna otra cuenta.
//   enOferta, pctOferta      → para la etiqueta ("-15 %"): se calcula con los precios de EFECTIVO (normal vs. oferta), redondeado.
//   precioNormal, precioNormalTarjeta → para el precio anterior tachado (con tarjeta si el precio grande es el de tarjeta).
// Una ficha sin esos campos, o con una oferta inválida (no número, ≤ 0, no menor que el normal) queda EXACTAMENTE igual: se ve como siempre.
// ══════════════════════════════════════════

export const CLAVE_OFERTAS = 'ofertas'; // "categoría" de la vista "Ver todas →" (setCategoria('ofertas'), link #cat=ofertas)

const esNum = (n) => typeof n === 'number' && Number.isFinite(n);
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ¿La ficha cruda trae una oferta que sirve?
export const ofertaValida = (p) => !!p && esNum(p.precioOferta) && p.precioOferta > 0 && esNum(p.precio) && p.precio > 0 && p.precioOferta < p.precio;

export function aplicarOferta(p) {
  if (!ofertaValida(p)) {
    if (p && ('precioOferta' in p || 'precioOfertaTarjeta' in p)) { const { precioOferta, precioOfertaTarjeta, ...resto } = p; return resto; }
    return p;
  }
  const { precioOferta, precioOfertaTarjeta, ...resto } = p;
  const tarjetaNormal = esNum(p.precioTarjeta) && p.precioTarjeta > p.precio ? p.precioTarjeta : null;
  const tarjetaOferta = esNum(precioOfertaTarjeta) && precioOfertaTarjeta > precioOferta ? precioOfertaTarjeta : null;
  const salida = { ...resto, enOferta: true, precioNormal: p.precio, pctOferta: Math.round((1 - precioOferta / p.precio) * 100), precio: precioOferta };
  if (tarjetaNormal && tarjetaOferta) { salida.precioTarjeta = tarjetaOferta; salida.precioNormalTarjeta = tarjetaNormal; }
  else delete salida.precioTarjeta; // sin los dos precios de tarjeta no se mezclan: todo en efectivo/transferencia, como cuando no hay tarjeta
  return salida;
}

export const enOferta = (p) => !!p && p.enOferta === true;
export const ofertasList = (productos) => (productos || []).filter(enOferta);

// El precio anterior (tachado) en los mismos términos que el precio grande: de tarjeta si el grande es el de tarjeta.
export const precioAnterior = (p) => (!enOferta(p) ? 0 : (p.precioTarjeta && p.precioNormalTarjeta ? p.precioNormalTarjeta : p.precioNormal));

// Etiqueta roja sobre la foto ("-15%"). Sin porcentaje (menos de 1 %) no se muestra, pero el precio tachado sí.
export const etiquetaHtml = (p) => (enOferta(p) && p.pctOferta >= 1 ? `<span class="badge-oferta" aria-label="${p.pctOferta} por ciento de descuento">-${p.pctOferta}%</span>` : '');
export const anteriorHtml = (p, clase = 'card-precio-ant', tag = 'div') => (enOferta(p) ? `<${tag} class="${clase}"><span class="solo-lectores">Precio anterior </span><s>$${fmt(precioAnterior(p))}</s></${tag}>` : '');
