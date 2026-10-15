// Pruebas puras (sin navegador) de pedido-mensaje.js y del carrito de precios.js.
//   node test-pedido-mensaje.mjs            → corre las pruebas
//   node test-pedido-mensaje.mjs --mensajes → además escribe pruebas-mensajes.md con el texto exacto de cada caso
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { armarMensaje, totalesHtml, notaPago } from './pedido-mensaje.js';
import { resolverCarrito, preciosParaCarrito, subtotalDe, usaPrecioTarjeta } from './precios.js';

const A = { id: 'a', categoria: 'Camisetas', nombre: 'Boca Aniversario Versión Jugador', talle: 'M', cantidad: 1, precio: 40000, precioTarjeta: 51000 };
const B = { id: 'b', categoria: 'Conjuntos', nombre: 'Musculosa y Short Boca Juniors', talle: 'L', cantidad: 2, precio: 67000, precioTarjeta: 85500 };
const sinTarjeta = (it) => { const { precioTarjeta, ...r } = it; return r; };
const CON = [A, B], SIN = [sinTarjeta(A), sinTarjeta(B)], MIXTO = [A, sinTarjeta(B)];

const ENTREGAS = {
  retiro: { tipoEntrega: 'retiro', envio: null, costoEnvio: 0 },
  motomensajeria: { tipoEntrega: 'motomensajeria', envio: { localidad: 'Vicente López', precio: 6000, estimado: false }, costoEnvio: 6000 },
  correo: { tipoEntrega: 'correo', envio: null, costoEnvio: 0, correo: { localidad: 'Rosario', provincia: 'Santa Fe', cp: '2000' } },
};
const PAGOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
const base = { marca: 'TIENDAPREMIUM.OK', nombre: 'Juan Pérez', correo: { localidad: 'Rosario', provincia: 'Santa Fe', cp: '2000' } };
const msg = (items, entrega, pago) => armarMensaje({ ...base, items, ...ENTREGAS[entrega], formaPago: pago, formaPagoLabel: PAGOS[pago] });
const lineaDe = (m, prefijo) => m.split('\n').find((l) => l.startsWith(prefijo));

const SUB_EFECTIVO = 174000, SUB_TARJETA = 222000; // 40.000 + 2×67.000  |  51.000 + 2×85.500
let n = 0; const ok = (t) => { n++; console.log('  ✔ ' + t); };
const md = [];

console.log('Las 9 combinaciones × 2 modos');
for (const [modo, items] of [['con precioTarjeta', CON], ['sin precioTarjeta', SIN]]) {
  for (const entrega of Object.keys(ENTREGAS)) for (const pago of Object.keys(PAGOS)) {
    const m = msg(items, entrega, pago);
    const tarjetaReal = pago === 'tarjeta' && modo === 'con precioTarjeta';
    const sub = tarjetaReal ? SUB_TARJETA : SUB_EFECTIVO;
    const envio = ENTREGAS[entrega].costoEnvio;
    // renglones: formato EXACTO, precio según el caso
    const r1 = `• Camiseta — Boca Aniversario Versión Jugador (Talle M) x1 = $${(tarjetaReal ? 51000 : 40000).toLocaleString('es-AR')}`;
    const r2 = `• Conjunto — Musculosa y Short Boca Juniors (Talle L) x2 = $${(tarjetaReal ? 171000 : 134000).toLocaleString('es-AR')}`;
    assert.ok(m.includes(r1 + '\n' + r2), `renglones ${modo}/${entrega}/${pago}`);
    // total
    const esperadoTotal = pago === 'tarjeta' && !tarjetaReal ? 'a confirmar (con tarjeta el precio puede variar; te lo informamos antes de cerrar)'
      : entrega === 'correo' ? `$${sub.toLocaleString('es-AR')} + envío a cotizar` : `$${(sub + envio).toLocaleString('es-AR')}`;
    assert.equal(lineaDe(m, 'Total: '), 'Total: ' + esperadoTotal, `total ${modo}/${entrega}/${pago}`);
    assert.equal(lineaDe(m, 'Subtotal'), (pago === 'tarjeta' && !tarjetaReal ? 'Subtotal (precio efectivo/transferencia)' : 'Subtotal') + `: $${sub.toLocaleString('es-AR')}`);
    // forma de pago
    const pagoEsperado = pago === 'efectivo' ? (entrega === 'retiro' ? 'Efectivo' : 'Efectivo (Solo para entregas en CABA o zona AMBA.)')
      : pago === 'transferencia' ? 'Transferencia' : tarjetaReal ? 'Tarjeta (hasta 3 cuotas sin interés)' : 'Tarjeta';
    assert.equal(lineaDe(m, 'Forma de pago: '), 'Forma de pago: ' + pagoEsperado);
    assert.ok(!tarjetaReal || !/Total: a confirmar/.test(m), 'sin "a confirmar" con precio de tarjeta');
    // resumen en pantalla
    const h = totalesHtml({ items, ...ENTREGAS[entrega], formaPago: pago });
    if (!(pago === 'tarjeta' && !tarjetaReal)) assert.ok(h.includes(`$${sub.toLocaleString('es-AR')}`) && !h.includes('a confirmar'), `resumen ${modo}/${entrega}/${pago}`);
    else assert.ok(h.includes('Total: a confirmar'));
    md.push(`### ${modo} · ${entrega} · ${PAGOS[pago]}\n\`\`\`\n${m}\n\`\`\`\nResumen en pantalla: ${h.replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '')}\n`);
    ok(`${modo} · ${entrega} · ${PAGOS[pago]} → Total ${esperadoTotal}`);
  }
}

console.log('\nCarrito mixto (un producto con precioTarjeta y otro sin)');
assert.equal(usaPrecioTarjeta(MIXTO, 'tarjeta'), false);
const mm = msg(MIXTO, 'retiro', 'tarjeta');
assert.equal(lineaDe(mm, 'Total: '), 'Total: a confirmar (con tarjeta el precio puede variar; te lo informamos antes de cerrar)');
assert.equal(subtotalDe(MIXTO, 'tarjeta'), SUB_EFECTIVO);
assert.ok(mm.includes('x1 = $40.000'));
const me = msg(MIXTO, 'retiro', 'efectivo');
assert.equal(lineaDe(me, 'Total: '), 'Total: $174.000');
ok('con Tarjeta se comporta como hoy (precio de efectivo, "a confirmar"); con Efectivo, total normal');

console.log('\nNotas de pago');
assert.equal(notaPago('efectivo', 'retiro'), '');
assert.equal(notaPago('efectivo', 'correo'), 'Solo para entregas en CABA o zona AMBA.');
assert.equal(notaPago('tarjeta', 'retiro', true), 'Hasta 3 cuotas sin interés.');
assert.equal(notaPago('tarjeta', 'retiro', false), 'El pago con tarjeta puede variar. Te informamos el total antes de cerrar.');
assert.equal(notaPago('transferencia', 'correo'), '');
ok('Efectivo solo con envío; Tarjeta con/sin precio de tarjeta; Transferencia sin nota');

console.log('\nCarritos guardados en el navegador (resolverCarrito)');
const catalogo = [{ id: 'a', precio: 40000, precioTarjeta: 51000 }, { id: 'b', precio: 67000 }, { id: 'c', precio: 30000, precioTarjeta: 30000 }];
const viejo = [{ id: 'a', nombre: 'A', talle: 'M', precio: 38000, cantidad: 1 }, { id: 'b', nombre: 'B', talle: 'L', precio: 67000, cantidad: 2 }, { id: 'zzz', nombre: 'Ya no está', talle: 'S', precio: 5000, cantidad: 1 }, { id: 'c', nombre: 'C', talle: 'S', precio: 30000, cantidad: 1 }];
const r = resolverCarrito(viejo, catalogo);
assert.equal(r.cambio, true);
assert.deepEqual(r.carrito[0], { id: 'a', nombre: 'A', talle: 'M', cantidad: 1, precio: 40000, precioTarjeta: 51000 }); // se completó el de tarjeta y se actualizó el de efectivo
assert.deepEqual(r.carrito[1], viejo[1]); // sin precioTarjeta en el catálogo: igual
assert.deepEqual(r.carrito[2], viejo[2]); // producto que ya no está: se deja como estaba
assert.equal('precioTarjeta' in r.carrito[3], false); // precioTarjeta inválido (= efectivo): no se guarda
assert.equal(resolverCarrito(r.carrito, catalogo).cambio, false); // idempotente
// si StockMGR apaga el interruptor, el ítem pierde precioTarjeta
const apagado = resolverCarrito([{ id: 'a', precio: 40000, precioTarjeta: 51000, cantidad: 1 }], [{ id: 'a', precio: 40000 }]);
assert.deepEqual(apagado.carrito[0], { id: 'a', precio: 40000, cantidad: 1 });
assert.deepEqual(preciosParaCarrito({ precio: 10 }), { precio: 10 });
ok('carrito viejo se completa por ID; producto ausente queda igual; interruptor apagado quita precioTarjeta; idempotente');

console.log(`\nTodo OK: ${n} pruebas pasaron.`);
if (process.argv.includes('--mensajes')) { writeFileSync('pruebas-mensajes.md', '# Mensajes de WhatsApp — 9 combinaciones × 2 modos\n\n' + md.join('\n')); console.log('Escrito: pruebas-mensajes.md'); }
