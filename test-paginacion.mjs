import assert from 'node:assert/strict';
import { paginar, textoVerMas, TAMANO_PAGINA } from './paginacion.js';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok', n); };
const L = (n) => Array.from({ length: n }, (_, i) => i);

t('58 productos: primera página 24, quedan 34', () => { const r = paginar(L(58)); assert.equal(r.visibles.length, 24); assert.equal(r.restantes, 34); });
t('"Ver más" suma otra tanda (48) y quedan 10', () => { const r = paginar(L(58), 48); assert.equal(r.visibles.length, 48); assert.equal(r.restantes, 10); });
t('última tanda: 72 pedidos con 58 → todos y 0 restantes', () => { const r = paginar(L(58), 72); assert.equal(r.visibles.length, 58); assert.equal(r.restantes, 0); });
t('menos de 24 productos: no hay botón', () => { const r = paginar(L(5)); assert.equal(r.visibles.length, 5); assert.equal(r.restantes, 0); assert.equal(textoVerMas(r.restantes), ''); });
t('exactamente 24: sin botón', () => { assert.equal(paginar(L(24)).restantes, 0); });
t('lista vacía', () => { const r = paginar([]); assert.equal(r.visibles.length, 0); assert.equal(r.restantes, 0); });
t('mostrados inválido usa la primera página', () => { assert.equal(paginar(L(58), undefined).visibles.length, 24); assert.equal(paginar(L(58), 'x').visibles.length, 24); });
t('paginar no pierde ni repite elementos al sumar tandas', () => { const a = paginar(L(58), 24).visibles, b = paginar(L(58), 48).visibles; assert.deepEqual(b.slice(0, 24), a); assert.equal(new Set(b).size, 48); });
t('texto del botón', () => { assert.equal(textoVerMas(34), 'Ver más productos (34 restantes)'); assert.equal(textoVerMas(10), 'Ver los 10 restantes'); assert.equal(TAMANO_PAGINA, 24); });
console.log(`\n${ok} pruebas OK`);
