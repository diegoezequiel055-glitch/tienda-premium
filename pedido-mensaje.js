import { singularDe } from './categorias-config.js';

// ══════════════════════════════════════════
// MENSAJE DE WHATSAPP Y RESUMEN DEL CARRITO (funciones puras, sin DOM ni estado).
// app.js le pasa los datos del pedido y usa lo que devuelve:
//   armarMensaje(...)   → texto del pedido que se abre en WhatsApp
//   totalesHtml(...)    → resumen de totales que se ve en el carrito antes de enviar
//   notaPago(...)       → aclaración debajo de las formas de pago
// El texto del mensaje se pega después en "Carga rápida" de StockMGR: no cambiar el formato sin avisar.
// Reglas:
// - Con Tarjeta no hay total fijo: el precio de la tienda es de efectivo/transferencia, así que se
//   muestra el subtotal "precio efectivo/transferencia" y "Total: a confirmar".
// - Efectivo y Transferencia llevan el total numérico.
// - "Solo para entregas en CABA o zona AMBA." (Efectivo) solo aparece cuando hay envío (no en retiro).
// - Cada línea lleva la categoría en singular ("Camiseta — ..."); si no se conoce, sin prefijo.
// ══════════════════════════════════════════

export const NOTA_EFECTIVO = 'Solo para entregas en CABA o zona AMBA.';
export const NOTA_TARJETA = 'El pago con tarjeta puede variar. Te informamos el total antes de cerrar.';
const TOTAL_TARJETA_MSG = 'a confirmar (con tarjeta el precio puede variar; te lo informamos antes de cerrar)';

const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const hayEnvio = (tipoEntrega) => tipoEntrega === 'motomensajeria' || tipoEntrega === 'correo';

// Aclaración debajo de las formas de pago (y entre paréntesis en "Forma de pago" del mensaje).
export function notaPago(formaPago, tipoEntrega) {
  if (formaPago === 'efectivo') return hayEnvio(tipoEntrega) ? NOTA_EFECTIVO : '';
  if (formaPago === 'tarjeta') return NOTA_TARJETA;
  return '';
}

// Resumen de totales del carrito (HTML). Efectivo/Transferencia: igual que siempre.
export function totalesHtml({ subtotal, tipoEntrega, costoEnvio, formaPago }) {
  const chico = (t) => `<span style="font-size:.76rem;color:var(--muted)">${t}</span>`;
  if (formaPago === 'tarjeta') {
    const envio = tipoEntrega === 'correo' ? `<br>${chico('Envío a cotizar por WhatsApp')}` : '';
    const mas = costoEnvio ? ` + Envío: $${fmt(costoEnvio)}` : '';
    return `Subtotal (precio efectivo/transferencia): $${fmt(subtotal)}${mas}${envio}<br><strong>Total: a confirmar</strong><br>${chico('Con tarjeta el precio puede variar; te lo informamos antes de cerrar.')}`;
  }
  if (tipoEntrega === 'correo') return `Subtotal: $${fmt(subtotal)}<br>${chico('Envío a cotizar por WhatsApp')}`;
  return costoEnvio
    ? `Productos: $${fmt(subtotal)} + Envío: $${fmt(costoEnvio)}<br><strong>Total: $${fmt(subtotal + costoEnvio)}</strong>`
    : 'Total: $' + fmt(subtotal + costoEnvio);
}

// datos: { marca, nombre, items:[{categoria,nombre,talle,cantidad,precio}], subtotal, tipoEntrega,
//          envio:{localidad,precio,estimado}|null, costoEnvio, correo:{localidad,provincia,cp},
//          formaPago ('efectivo'|'transferencia'|'tarjeta'), formaPagoLabel }
export function armarMensaje(d) {
  const lineas = d.items.map((c) => {
    const sing = singularDe(c.categoria);
    return `• ${sing ? sing + ' — ' : ''}${c.nombre} (Talle ${c.talle}) x${c.cantidad} = $${fmt(c.precio * c.cantidad)}`;
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

  const tarjeta = d.formaPago === 'tarjeta';
  const nota = tarjeta ? '' : notaPago(d.formaPago, d.tipoEntrega); // con tarjeta la aclaración va en la línea del Total
  const pagoTxt = `${d.formaPagoLabel}${nota ? ' (' + nota + ')' : ''}`;
  const totalTxt = tarjeta
    ? TOTAL_TARJETA_MSG
    : d.tipoEntrega === 'correo' ? `$${fmt(d.subtotal)} + envío a cotizar` : `$${fmt(d.subtotal + d.costoEnvio)}`;

  return `¡Hola! Quiero hacer este pedido en ${d.marca}:
Nombre: ${d.nombre.trim()}
${lineas}

${tarjeta ? 'Subtotal (precio efectivo/transferencia)' : 'Subtotal'}: $${fmt(d.subtotal)}
Entrega: ${entregaTxt}
Envío: ${envioTxt}
Forma de pago: ${pagoTxt}
Total: ${totalTxt}

Pedido a confirmar, sujeto a stock y costo de envío.`;
}
