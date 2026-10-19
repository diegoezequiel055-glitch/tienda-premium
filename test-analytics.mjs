// Pruebas puras de analytics.js (decisión de envío y armado de eventos). Correr: node test-analytics.mjs
import assert from 'node:assert/strict';
import { debeEnviar, accionInterno, eventos, terminoSeguro, ID_MEDICION } from './analytics.js';

let n = 0; const ok = (t) => { n++; console.log('  ✔ ' + t); };

console.log('Solo se envía desde tiendapremium.com.ar, sin marca interna y sin modo debug');
assert.equal(ID_MEDICION, 'G-XMQQ0PMRDY');
assert.equal(debeEnviar({ host: 'tiendapremium.com.ar', interno: false, debug: false }), true);
assert.equal(debeEnviar({ host: 'www.tiendapremium.com.ar', interno: false, debug: false }), true);
for (const host of ['localhost', '127.0.0.1', '192.168.1.107', 'diegoezequiel055-glitch.github.io', 'otro.com', '']) assert.equal(debeEnviar({ host, interno: false, debug: false }), false);
ok('localhost, IP local, github.io y otros dominios: no se envía');
assert.equal(debeEnviar({ host: 'tiendapremium.com.ar', interno: true, debug: false }), false);
assert.equal(debeEnviar({ host: 'tiendapremium.com.ar', interno: false, debug: true }), false);
ok('con la marca interna o en modo debug tampoco se envía, aunque sea el dominio de producción');

console.log('\n?interno=1 guarda la marca, ?interno=0 la quita');
assert.equal(accionInterno('?interno=1'), 'guardar');
assert.equal(accionInterno('?p=abc&interno=1'), 'guardar');
assert.equal(accionInterno('?interno=0'), 'quitar');
assert.equal(accionInterno('?interno=2'), null); assert.equal(accionInterno(''), null); assert.equal(accionInterno('?p=1'), null);
ok('1 → guardar · 0 → quitar · otro valor o sin parámetro → nada');

console.log('\nEventos con currency ARS y solo datos de producto');
const p = { id: 'conjunto|deportivo de italia g5|', nombre: 'Deportivo de Italia G5', categoria: 'Conjuntos', precio: 70000, precioTarjeta: 89000 };
const vi = eventos.view_item(p);
assert.deepEqual(vi, { currency: 'ARS', value: 70000, items: [{ item_id: p.id, item_name: 'Deportivo de Italia G5', item_category: 'Conjuntos', price: 70000 }] });
ok('view_item: item_id, item_name, item_category y price = precio de efectivo/transferencia (no el de tarjeta)');
const ac = eventos.add_to_cart({ id: p.id, nombre: p.nombre, categoria: p.categoria, talle: 'M', cantidad: 1, precio: 70000 });
assert.deepEqual(ac, { currency: 'ARS', value: 70000, items: [{ item_id: p.id, item_name: p.nombre, item_category: 'Conjuntos', item_variant: 'M', price: 70000, quantity: 1 }] });
ok('add_to_cart: talle (item_variant), cantidad y valor');

const carrito = [
  { id: 'a', nombre: 'Camiseta A', categoria: 'Camiseta', talle: 'S', cantidad: 2, precio: 40000, precioTarjeta: 51000 },
  { id: 'b', nombre: 'Conjunto B', categoria: 'Conjuntos', talle: 'L', cantidad: 1, precio: 70000, precioTarjeta: 89000 },
];
const bcE = eventos.begin_checkout({ items: carrito, formaPago: 'efectivo', tipoEntrega: 'motomensajeria', costoEnvio: 13000 });
assert.equal(bcE.value, 40000 * 2 + 70000 + 13000); assert.equal(bcE.payment_type, 'efectivo'); assert.equal(bcE.shipping_tier, 'motomensajeria'); assert.equal(bcE.currency, 'ARS');
assert.deepEqual(bcE.items.map((i) => [i.item_id, i.price, i.quantity, i.item_variant]), [['a', 40000, 2, 'S'], ['b', 70000, 1, 'L']]);
ok('begin_checkout con efectivo: valor = subtotal de efectivo + envío; payment_type y shipping_tier');
const bcT = eventos.begin_checkout({ items: carrito, formaPago: 'tarjeta', tipoEntrega: 'retiro', costoEnvio: 0 });
assert.equal(bcT.value, 51000 * 2 + 89000); assert.equal(bcT.payment_type, 'tarjeta'); assert.equal(bcT.shipping_tier, 'retiro');
assert.deepEqual(bcT.items.map((i) => i.price), [51000, 89000]);
ok('begin_checkout con tarjeta: usa el precio de lista (tarjeta) cuando todos lo tienen');
const bcC = eventos.begin_checkout({ items: carrito, formaPago: 'transferencia', tipoEntrega: 'correo', costoEnvio: 0 });
assert.equal(bcC.value, 150000); assert.equal(bcC.shipping_tier, 'correo');
ok('begin_checkout con Correo Argentino: sin envío en el valor (se cotiza por WhatsApp)');

assert.deepEqual(eventos.click_whatsapp(), { ubicacion: 'boton_flotante' });
assert.deepEqual(eventos.share({ id: 'x', metodo: 'web_share' }), { method: 'web_share', content_type: 'product', item_id: 'x' });
assert.deepEqual(eventos.share({ id: 'x', metodo: 'copy_link' }), { method: 'copy_link', content_type: 'product', item_id: 'x' });
assert.deepEqual(eventos.search('  Arsenal  '), { search_term: 'arsenal' });
assert.equal(eventos.search('x'.repeat(300)).search_term.length, 100);
ok('click_whatsapp, share (web_share / copy_link) y search (minúsculas, máx. 100 caracteres)');

console.log('\nBúsquedas: no se envía el término si parece un dato personal');
for (const t of ['1155551234', '123456', 'pedido 987654 ok', '11 5555-1234', '+54 9 11 5555 1234', '(011) 4555-1234', '011-4555-1234', 'juan@gmail.com', 'a@b', 'mi mail es x@y.com', '11.5555.1234', '4000 5000 600'])
  assert.equal(terminoSeguro(t), false, 'debería bloquearse: ' + t);
ok('teléfonos (con y sin separadores), emails y 6+ dígitos seguidos: bloqueados');
for (const t of ['arsenal', 'river 26/27', 'camiseta boca 10', 'g5 2024', '12345', 'adidas 3 tiras', 'retro milan 1990', 'icon bayern múnich', ''])
  assert.equal(terminoSeguro(t), true, 'debería permitirse: ' + t);
ok('búsquedas normales de producto (con años, números cortos o 5 dígitos): permitidas');

console.log('\nNunca datos personales');
const sucio = { ...carrito[0], nombreCliente: 'Juan Pérez', telefono: '1155551234', direccion: 'Calle Falsa 123', localidad: 'Rosario', cp: '2000', mensaje: '¡Hola! Quiero hacer este pedido' };
const todo = JSON.stringify([
  eventos.view_item({ ...p, ...sucio, id: p.id, nombre: p.nombre }),
  eventos.add_to_cart({ ...sucio, id: 'a', nombre: 'Camiseta A', categoria: 'Camiseta', talle: 'S', precio: 40000 }),
  eventos.begin_checkout({ items: [sucio], formaPago: 'efectivo', tipoEntrega: 'correo', costoEnvio: 0, nombre: 'Juan Pérez', correo: { localidad: 'Rosario', provincia: 'Santa Fe', cp: '2000' }, msg: 'texto del mensaje' }),
  eventos.share({ id: 'x', metodo: 'copy_link', nombre: 'Juan Pérez', telefono: '1155551234' }),
]);
for (const prohibido of ['Juan', 'Pérez', '1155551234', 'Calle Falsa', 'Rosario', 'Santa Fe', '2000', 'Hola', 'texto del mensaje', 'telefono', 'direccion', 'localidad', 'mensaje']) assert.ok(!todo.includes(prohibido), 'aparece: ' + prohibido);
ok('aunque el evento reciba nombre, teléfono, dirección, localidad, CP o mensaje, no sale ninguno');

console.log(`\nTodo OK: ${n} pruebas pasaron.`);
