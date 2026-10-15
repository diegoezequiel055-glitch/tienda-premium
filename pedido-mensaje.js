import { singularDe } from './categorias-config.js';
import { usaPrecioTarjeta, precioUnitario, subtotalDe } from './precios.js';

// ══════════════════════════════════════════
// MENSAJE DE WHATSAPP Y RESUMEN DEL CARRITO (funciones puras, sin DOM ni estado).
// app.js le pasa los datos del pedido y usa lo que devuelve:
//   armarMensaje(...)   → texto del pedido que se abre en WhatsApp
//   totalesHtml(...)    → resumen de totales que se ve en el carrito antes de enviar
//   notaPago(...)       → aclaración debajo de las formas de pago
// El texto del mensaje se pega después en "Carga rápida" de StockMGR: no cambiar el formato sin avisar.
// Reglas:
// - Efectivo y Transferencia usan el precio de efectivo y llevan el total numérico.
// - Tarjeta, cuando TODOS los productos tienen precioTarjeta (precios.js › usaPrecioTarjeta): los renglones usan
//   el precio de tarjeta, "Forma de pago: Tarjeta (hasta 3 cuotas sin interés)" y el total es numérico.
// - Tarjeta, cuando a algún producto le falta precioTarjeta (ficha vieja o interruptor apagado en StockMGR):
//   como siempre — precio de efectivo, "Subtotal (precio efectivo/transferencia)" y "Total: a confirmar".
// - "Solo para entregas en CABA o zona AMBA." (Efectivo) solo aparece cuando hay envío (no en retiro).
// - Cada línea lleva la categoría en singular ("Camiseta — ..."); si no se conoce, sin prefijo.
// ══════════════════════════════════════════

export const NOTA_EFECTIVO = 'Solo para entregas en CABA o zona AMBA.';
export const NOTA_TARJETA = 'El pago con tarjeta puede variar. Te informamos el total antes de cerrar.';
export const NOTA_TARJETA_CUOTAS = 'Hasta 3 cuotas sin interés.';
const CUOTAS_MSG = 'hasta 3 cuotas sin interés';
const TOTAL_TARJETA_MSG = 'a confirmar (con tarjeta el precio puede variar; te lo informamos antes de cerrar)';

const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const hayEnvio = (tipoEntrega) => tipoEntrega === 'motomensajeria' || tipoEntrega === 'correo';

// Aclaración debajo de las formas de pago (y entre paréntesis en "Forma de pago" del mensaje).
// `tarjetaReal`: true cuando con Tarjeta se usa el precio de tarjeta (total numérico).
export function notaPago(formaPago, tipoEntrega, tarjetaReal = false) {
  if (formaPago === 'efectivo') return hayEnvio(tipoEntrega) ? NOTA_EFECTIVO : '';
  if (formaPago === 'tarjeta') return tarjetaReal ? NOTA_TARJETA_CUOTAS : NOTA_TARJETA;
  return '';
}

// Resumen de totales del carrito (HTML). items: [{precio, precioTarjeta?, cantidad}]
export function totalesHtml({ items, tipoEntrega, costoEnvio, formaPago }) {
  const chico = (t) => `<span style="font-size:.76rem;color:var(--muted)">${t}</span>`;
  const tarjetaReal = usaPrecioTarjeta(items, formaPago);
  const subtotal = subtotalDe(items, formaPago);
  if (formaPago === 'tarjeta' && !tarjetaReal) { // como siempre: sin total fijo
    const envio = tipoEntrega === 'correo' ? `<br>${chico('Envío a cotizar por WhatsApp')}` : '';
    const mas = costoEnvio ? ` + Envío: $${fmt(costoEnvio)}` : '';
    return `Subtotal (precio efectivo/transferencia): $${fmt(subtotal)}${mas}${envio}<br><strong>Total: a confirmar</strong><br>${chico('Con tarjeta el precio puede variar; te lo informamos antes de cerrar.')}`;
  }
  if (tipoEntrega === 'correo') return `Subtotal: $${fmt(subtotal)}<br>${chico('Envío a cotizar por WhatsApp')}`;
  return (costoEnvio
    ? `Productos: $${fmt(subtotal)} + Envío: $${fmt(costoEnvio)}<br><strong>Total: $${fmt(subtotal + costoEnvio)}</strong>`
    : 'Total: $' + fmt(subtotal + costoEnvio));
}

// datos: { marca, nombre, items:[{categoria,nombre,talle,cantidad,precio,precioTarjeta?}], tipoEntrega,
//          envio:{localidad,precio,estimado}|null, costoEnvio, correo:{localidad,provincia,cp},
//          formaPago ('efectivo'|'transferencia'|'tarjeta'), formaPagoLabel }
export function armarMensaje(d) {
  const tarjetaReal = usaPrecioTarjeta(d.items, d.formaPago);
  const subtotal = subtotalDe(d.items, d.formaPago);
  const lineas = d.items.map((c) => {
    const sing = singularDe(c.categoria);
    return `• ${sing ? sing + ' — ' : ''}${c.nombre} (Talle ${c.talle}) x${c.cantidad} = $${fmt(precioUnitario(c, d.items, d.formaPago) * c.cantidad)}`;
  }).join('\n');

  let entregaTxt, envioTxt;
  if (d.tipoEntrega === 'retiro') {
    entregaTxt = 'Retiro en showroom';
    envioTxt = 'Sin costo (retiro)';
  } else if (d.tipoEntrega === 'motomensajeria') {
    entregaTxt = `Motomensajería — ${d.envio.localidad}`;
    envioTxt = `${d.envio.estimado ? '≈' : ''}$${fmt(d.envio.precio)}${d.envio.estimado ? ' (estimado, se confirma por WhatsApp)' : ''}`;
  } else {
    // Localidad y código postal llegan tal cual los escribió el cliente (solo se quitan espacios de los costados).
    entregaTxt = `Correo Argentino — ${d.correo.localidad.trim()}, ${d.correo.provincia} (CP ${d.correo.cp.trim()})`;
    envioTxt = 'A cotizar por WhatsApp';
  }

  const tarjetaViejo = d.formaPago === 'tarjeta' && !tarjetaReal; // sin precio de tarjeta: la aclaración va en la línea del Total
  const nota = tarjetaViejo ? '' : tarjetaReal ? CUOTAS_MSG : notaPago(d.formaPago, d.tipoEntrega);
  const pagoTxt = `${d.formaPagoLabel}${nota ? ' (' + nota + ')' : ''}`;
  const totalTxt = tarjetaViejo
    ? TOTAL_TARJETA_MSG
    : d.tipoEntrega === 'correo' ? `$${fmt(subtotal)} + envío a cotizar` : `$${fmt(subtotal + d.costoEnvio)}`;

  return `¡Hola! Quiero hacer este pedido en ${d.marca}:
Nombre: ${d.nombre.trim()}
${lineas}

${tarjetaViejo ? 'Subtotal (precio efectivo/transferencia)' : 'Subtotal'}: $${fmt(subtotal)}
Entrega: ${entregaTxt}
Envío: ${envioTxt}
Forma de pago: ${pagoTxt}
Total: ${totalTxt}

Pedido a confirmar, sujeto a stock y costo de envío.`;
}
