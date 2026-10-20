import assert from 'node:assert/strict';
import { filtrarLocalidades, textoFila, MENSAJE_SIN_RESULTADOS } from './buscador-localidades.js';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok', n); };

const E = (id, localidad, precio = 3000, estimado = false) => ({ id, localidad, precio, estimado });
const envios = [
  E('a', 'San Martín'), E('b', 'Ciudadela'), E('c', 'José C. Paz'), E('d', 'San Isidro'),
  E('e', 'Ciudad Evita'), E('f', 'Muñiz', 4500, true), E('g', 'Villa Ciudad Jardín'), E('h', 'Boulogne Sur Mer'), E('i', 'Álvarez'),
];
const nombres = (r) => r.map((x) => x.localidad);

t('sin texto: todas, en orden alfabético', () => {
  const r = nombres(filtrarLocalidades(envios, ''));
  assert.equal(r.length, envios.length);
  assert.deepEqual(r, [...r].sort((a, b) => a.localeCompare(b, 'es')));
  assert.equal(r[0], 'Álvarez');
});
t('"ciu": primero las que empiezan, después las que contienen', () => {
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'ciu')), ['Ciudad Evita', 'Ciudadela', 'Villa Ciudad Jardín']);
});
t('ignora mayúsculas y acentos: "jose" encuentra "José C. Paz"', () => {
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'jose')), ['José C. Paz']);
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'JOSÉ')), ['José C. Paz']);
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'muniz')), ['Muñiz']);
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'alvarez')), ['Álvarez']);
});
t('"san": las dos que empiezan con San y ninguna otra', () => {
  assert.deepEqual(nombres(filtrarLocalidades(envios, 'san')), ['San Isidro', 'San Martín']);
});
t('texto inexistente: lista vacía', () => assert.equal(filtrarLocalidades(envios, 'zzzz').length, 0));
t('espacios sobrantes no cambian el resultado', () => assert.deepEqual(nombres(filtrarLocalidades(envios, '  san   isi ')), ['San Isidro']));
t('no modifica la lista original', () => { const copia = envios.map((x) => x.id).join(); filtrarLocalidades(envios, 'san'); assert.equal(envios.map((x) => x.id).join(), copia); });
t('la fila muestra lo mismo que el selector anterior (con ≈ si es estimado)', () => {
  assert.equal(textoFila(E('x', 'Ciudadela', 3000)), 'Ciudadela — $3.000');
  assert.equal(textoFila(E('y', 'Muñiz', 4500, true)), 'Muñiz — ≈$4.500');
});
t('mensaje sin resultados', () => assert.equal(MENSAJE_SIN_RESULTADOS, 'No encontramos esa localidad. Elegí la más cercana o consultanos por WhatsApp'));
console.log(`\n${ok} pruebas OK`);
