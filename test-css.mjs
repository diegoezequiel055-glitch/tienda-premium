// Verifica que tienda.css (portada) esté al día con los CSS de origen y que index.html lo use.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { armar, ORIGEN } from './build-css.mjs';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('ok', n); };
const actual = readFileSync(new URL('./tienda.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

t('tienda.css está al día (si falla: node build-css.mjs)', () => assert.equal(actual, armar()));
t('index.html carga tienda.css', () => assert.match(html, /<link rel="stylesheet" href="tienda\.css">/));
t('index.html ya no carga los CSS sueltos', () => { for (const f of ORIGEN) assert.ok(!html.includes(`href="${f}"`), f); });
t('las llaves de tienda.css están balanceadas', () => { const a = (actual.match(/{/g) || []).length, b = (actual.match(/}/g) || []).length; assert.equal(a, b); });
console.log(`\n${ok} pruebas OK`);
