// Pruebas puras de los textos de precio de la tienda (precios.js). Correr: node test-precios.mjs
import assert from 'node:assert/strict';
import { textoCuotas, textoEfectivoVerde, extrasPrecioHtml, montoCuota, precioLista } from './precios.js';
import { totalesHtml } from './pedido-mensaje.js';

let n = 0; const ok = (t) => { n++; console.log('  ✔ ' + t); };
const f = (precio, precioTarjeta) => ({ id: 'x', precio, precioTarjeta });

console.log('Cuotas = precioTarjeta / 3 redondeado al peso, sin decimales, con separador de miles argentino');
assert.equal(textoCuotas(f(30000, 38000)), '3 cuotas de $12.667 sin interés');   // 12.666,67
assert.equal(textoCuotas(f(35000, 44500)), '3 cuotas de $14.833 sin interés');   // 14.833,33
assert.equal(textoCuotas(f(40000, 51000)), '3 cuotas de $17.000 sin interés');   // exacto
assert.equal(textoCuotas(f(38000, 48500)), '3 cuotas de $16.167 sin interés');   // 16.166,67 → sube
assert.equal(textoCuotas(f(1000, 1300)), '3 cuotas de $433 sin interés');         // sin punto de miles por debajo de 1.000
assert.equal(textoCuotas(f(500000, 635000)), '3 cuotas de $211.667 sin interés'); // precio largo
assert.equal(montoCuota(f(1, 4)), 1); assert.equal(montoCuota(f(1, 5)), 2);
ok('38.000 → $12.667 · 44.500 → $14.833 · 51.000 → $17.000 · 48.500 → $16.167 · precio largo');
assert.equal(textoEfectivoVerde(f(40000, 51000)), '$40.000 con transferencia o efectivo');
assert.equal(textoEfectivoVerde(f(1234567, 1700000)), '$1.234.567 con transferencia o efectivo');
ok('"$Y con transferencia o efectivo" con el precio de efectivo');

console.log('\nSin precioTarjeta (o inválido): como siempre');
for (const p of [{ id: 'x', precio: 40000 }, f(40000, 40000), f(40000, 30000), f(40000, 'abc'), f(40000, 0), f(40000, null)]) {
  assert.equal(textoCuotas(p), ''); assert.equal(textoEfectivoVerde(p), '');
  assert.equal(extrasPrecioHtml(p, 'card'), '<div class="card-precio-nota">Abonando en efectivo o transferencia</div>');
  assert.equal(extrasPrecioHtml(p, 'ficha'), 'Abonando en efectivo o transferencia');
  assert.equal(extrasPrecioHtml(p, 'hero'), ''); assert.equal(extrasPrecioHtml(p, 'rel'), '');
  assert.equal(precioLista(p), 40000);
}
ok('precioTarjeta ausente/igual/menor/cero/texto/null: listado y ficha con "Abonando en efectivo o transferencia"; hero y relacionados sin nada; precio = efectivo');

console.log('\nUn solo formato para todas las pantallas');
const p = f(40000, 51000);
const quitar = (h) => h.replace(/ px-v-\w+/, '');
const base = quitar(extrasPrecioHtml(p, 'card'));
for (const v of ['ficha', 'hero', 'rel']) assert.equal(quitar(extrasPrecioHtml(p, v)), base);
assert.ok(base.includes('3 cuotas de $17.000 sin interés') && base.includes('$40.000 con transferencia o efectivo'));
assert.ok(!base.includes('Hasta 3 cuotas') && !base.includes('Efectivo o transferencia:'));
ok('card / ficha / hero / rel generan el mismo HTML (solo cambia la clase de variante); sin las líneas viejas');
assert.ok(extrasPrecioHtml({ ...p, nombre: '<b>' }, 'card').indexOf('<script') === -1);
ok('el HTML solo lleva números formateados (sin texto del usuario)');

console.log('\nCarrito: una sola leyenda de cuotas con Tarjeta');
const items = [{ precio: 40000, precioTarjeta: 51000, cantidad: 1 }];
for (const entrega of ['retiro', 'motomensajeria', 'correo']) {
  const h = totalesHtml({ items, tipoEntrega: entrega, costoEnvio: entrega === 'motomensajeria' ? 6000 : 0, formaPago: 'tarjeta' });
  assert.ok(!/cuotas/i.test(h), `el resumen no repite la leyenda (${entrega}): ${h}`);
  assert.ok(h.includes('$51.000') || h.includes('$57.000'));
}
ok('el resumen del total ya no dice "Con tarjeta: hasta 3 cuotas sin interés." (queda la de arriba, debajo de las formas de pago)');

console.log(`\nTodo OK: ${n} grupos de pruebas pasaron.`);
