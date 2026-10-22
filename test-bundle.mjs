// ══════════════════════════════════════════
// PRUEBAS DE LA LECTURA POR DOCUMENTO ÚNICO (catalogo-bundle.js + app.js). NO toca el Firestore real: usa el doble de
// test-doble-firebase.mjs (cuenta las lecturas como las contaría Firestore) y bloquea todo pedido a internet.
//   A) funciones puras: hash, unirPartes (partes desordenadas, rotas, faltantes), aSnapshot, compatibilidad con el formato de StockMGR.
//   B) navegador: lecturas por visita (antes ≈226, ahora 3), respaldo (sin documento / error / roto / aparece después), cambios en
//      vivo, varias partes, stock bajo, precios efectivo/tarjeta, ?p=ID, buscador, localidades, carrito y mensaje de WhatsApp.
// Uso: node test-bundle.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hashTexto, unirPartes, aSnapshot, escucharPublico, idParte } from './catalogo-bundle.js';
import { dobleFirebase, guion, productosPrueba, enviosPrueba, PNG } from './test-doble-firebase.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
let n = 0, mal = 0;
const ta = async (t, f) => { if (process.env.SOLO && !t.includes(process.env.SOLO)) return; try { await f(); n++; console.log('ok ' + t); } catch (e) { mal++; console.log('FALLA ' + t + '\n     ' + (e && e.message || e)); } };

// armarPartes de prueba (mismo formato que StockMGR)
const enc = (s) => new TextEncoder().encode(s).length;
function partesDe(base, items, limite = 600000) {
  const orden = [...items].sort((a, b) => (a.id < b.id ? -1 : 1)); const gs = []; let g = [], t = 2;
  for (const it of orden) { const b = enc(JSON.stringify(it)) + 1; if (g.length && t + b > limite) { gs.push(g); g = []; t = 2; } g.push(it); t += b; }
  gs.push(g); const datos = gs.map((x) => JSON.stringify(x)); const hash = hashTexto(datos.join('\u0001'));
  return datos.map((d, i) => ({ v: 1, parte: i + 1, partes: datos.length, total: orden.length, hash, datos: d }));
}

console.log('— A) puras —');
await ta('hash: vector fijo idéntico al de StockMGR', () => assert.equal(hashTexto('hola'), hashTexto('hola')) || assert.notEqual(hashTexto('hola'), hashTexto('holA')));
await ta('idParte: catalogo, catalogo_2, catalogo_3', () => assert.deepEqual([1, 2, 3].map((k) => idParte('catalogo', k)), ['catalogo', 'catalogo_2', 'catalogo_3']));
await ta('unirPartes: una parte', () => { const it = productosPrueba(10); const r = unirPartes(partesDe('catalogo', it)); assert.ok(r.ok); assert.equal(r.items.length, 10); });
await ta('unirPartes: varias partes en cualquier orden', () => { const it = productosPrueba(30); const p = partesDe('catalogo', it, 3000); assert.ok(p.length > 3); const r = unirPartes([...p].reverse()); assert.ok(r.ok); assert.equal(r.items.length, 30); });
await ta('unirPartes: falta una parte / parte de otra versión / hash roto / JSON roto / sin id / versión rara → no ok', () => {
  const p = partesDe('catalogo', productosPrueba(30), 3000);
  assert.equal(unirPartes(p.slice(0, -1)).ok, false);
  assert.equal(unirPartes([p[0], { ...p[1], hash: 'otro' }, ...p.slice(2)]).ok, false);
  assert.equal(unirPartes([{ ...p[0], datos: p[0].datos.replace('Negro', 'Rojo') }, ...p.slice(1)]).ok, false);
  const j = partesDe('x', [{ id: 'a' }]); j[0].datos = '[{'; j[0].hash = hashTexto(j[0].datos); assert.equal(unirPartes(j).ok, false);
  const s = partesDe('x', [{ nombre: 'sin id' }]); assert.equal(unirPartes(s).ok, false);
  assert.equal(unirPartes([{ ...p[0], v: 2 }, ...p.slice(1)]).ok, false);
  assert.equal(unirPartes([]).ok, false); assert.equal(unirPartes(null).ok, false);
});
await ta('aSnapshot: docs con id y data() sin el id (igual que una colección)', () => { const s = aSnapshot(productosPrueba(3)); assert.equal(s.docs.length, 3); assert.ok(s.docs[0].id.includes('|')); assert.equal(s.docs[0].data().id, undefined); assert.equal(s.docs[0].data().categoria, 'Camisetas'); });
const SM = path.join(RAIZ, '..', 'Stock Ropa', 'catalogo-bundle.js');
await ta('compatibilidad: lo que arma StockMGR (su catalogo-bundle.js real) lo lee esta tienda', async () => {
  if (!fs.existsSync(SM)) { console.log('     (no está ../Stock Ropa: se omite)'); return; }
  const sm = await import('file:///' + SM.replace(/\\/g, '/'));
  assert.equal(sm.hashTexto('Camiseta Ñandú 26/27 — ¡Solo quedan 2!'), hashTexto('Camiseta Ñandú 26/27 — ¡Solo quedan 2!'));
  const it = productosPrueba(40);
  for (const lim of [600000, 3000]) { const p = sm.armarPartes('catalogo', it, { limite: lim }).map((x) => x.data); const r = unirPartes(p); assert.ok(r.ok, r.motivo); assert.equal(r.items.length, 40); }
  const deseados = new Map(it.map((f) => { const { id, ...r } = f; return [id, { ...r, actualizado: 123 }]; }));
  const r = unirPartes(sm.armarPartes('catalogo', sm.itemsCatalogo(deseados)).map((x) => x.data)); assert.ok(r.ok); assert.equal(r.items[0].actualizado, undefined);
});
await ta('escucharPublico (sin navegador): documento único → entrega; si no existe → colección de respaldo; vuelve al único si aparece', async () => {
  const docs = new Map(), oy = []; const lect = { col: 0, doc: 0 };
  const fb = { db: {}, collection: (_d, c) => ({ t: 'col', c }), doc: (_d, c, id) => ({ t: 'doc', k: c + '/' + id }),
    onSnapshot: (ref, ok) => { const o = { ref, ok }; oy.push(o); setTimeout(() => entrega(o), 1); return () => oy.splice(oy.indexOf(o), 1); } };
  const entrega = (o) => { if (o.ref.t === 'doc') { lect.doc++; const d = docs.get(o.ref.k); o.ok({ exists: () => !!d, data: () => d }); } else { lect.col += 3; o.ok(aSnapshot([{ id: 'a' }, { id: 'b' }, { id: 'c' }])); } };
  const vistos = []; const e = escucharPublico({ base: 'catalogo', coleccion: 'catalogo_publico', fb, alSnap: (s) => vistos.push(s.docs.length) });
  await new Promise((r) => setTimeout(r, 30)); assert.equal(e.modo(), 'respaldo'); assert.deepEqual(vistos, [3]);
  docs.set('config_sitio/catalogo', partesDe('catalogo', productosPrueba(5))[0]); oy.filter((o) => o.ref.k === 'config_sitio/catalogo').forEach(entrega);
  await new Promise((r) => setTimeout(r, 30)); assert.equal(e.modo(), 'unico'); assert.equal(vistos.at(-1), 5); assert.equal(oy.filter((o) => o.ref.t === 'col').length, 0, 'el respaldo se dejó de escuchar');
  e.parar();
});

if (!process.env.SOLO_PURAS) {
  console.log('— B) navegador (Firestore simulado, cero lecturas reales) —');
  async function cargarPlaywright() {
    try { return await import('playwright'); } catch {}
    if (process.env.PLAYWRIGHT_DIR) { try { return createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js'))('playwright'); } catch {} }
    console.error('No se pudo cargar Playwright. Instalalo fuera del repo y corré con PLAYWRIGHT_DIR=<carpeta> (o SOLO_PURAS=1).'); process.exit(1);
  }
  const { chromium } = await cargarPlaywright();
  const servidor = await new Promise((okp) => { const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    const s = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(RAIZ, u);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1', () => okp(s)); });
  const BASE = `http://127.0.0.1:${servidor.address().port}`;
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));
  const pedidosReales = [];

  async function abrir({ mock = {}, url = '/index.html', ctx: ctxExistente, productos = 73, envios = 152 } = {}) {
    const ctx = ctxExistente || await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    if (!ctxExistente) await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      pedidosReales.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(guion(productos, envios));
    await page.addInitScript((m) => { window.__MOCK = m; window.__abiertos = []; window.open = (u) => { window.__abiertos.push(u); return null; }; }, { config: null, ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#grid > .card').length > 0, null, { timeout: 8000 });
    await esp(250);
    return { page, ctx, errores };
  }
  const lect = (p) => p.evaluate(() => ({ ...window.__LECT }));
  const textoGrid = (p) => p.evaluate(() => document.getElementById('grid').innerText);
  const entregas = (p) => p.evaluate(() => window.getEntrega().envios.length);

  await ta('VISITA NUEVA con documento único: 3 lecturas (config + catálogo + localidades), 0 de las colecciones; catálogo y localidades completos', async () => {
    const { page, ctx, errores } = await abrir({});
    const l = await lect(page);
    assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.catalogo_col + l.envios_col, 0); assert.equal(l.catalogo_unico, 1); assert.equal(l.envios_unico, 1);
    assert.equal(await entregas(page), 152);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card').length), 24, 'primera página del catálogo');
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });
  await ta('VISITA REPETIDA (misma sesión del navegador): otra vez 3 lecturas, sin caché que las baje ni que las suba', async () => {
    const a = await abrir({}); const ctx = a.ctx; await a.page.close();
    const b = await abrir({ ctx }); const l = await lect(b.page); assert.equal(l.total, 3, JSON.stringify(l)); await ctx.close();
  });
  await ta('RESPALDO (el documento único todavía no existe): lee las colecciones de siempre y la tienda anda igual', async () => {
    const { page, ctx } = await abrir({ mock: { fuente: 'respaldo' } }); const l = await lect(page);
    assert.equal(l.catalogo_col, 73); assert.equal(l.envios_col, 152); assert.equal(await entregas(page), 152); await ctx.close();
  });
  await ta('RESPALDO (falla la lectura del documento único): idem', async () => {
    const { page, ctx } = await abrir({ mock: { fuente: 'error-unico' } }); const l = await lect(page); assert.equal(l.catalogo_col, 73); assert.ok((await textoGrid(page)).length > 50); await ctx.close();
  });
  await ta('RESPALDO (documento único roto: el hash no coincide): no se muestra nada raro, se usan las colecciones', async () => {
    const { page, ctx } = await abrir({ mock: { fuente: 'roto' } }); const l = await lect(page); assert.equal(l.catalogo_col, 73); assert.equal(await entregas(page), 152); await ctx.close();
  });
  await ta('el documento único APARECE DESPUÉS (StockMGR lo publica con la tienda abierta): cambia solo y deja de escuchar las colecciones', async () => {
    const { page, ctx } = await abrir({ mock: { unicoAparece: 1200 } });
    assert.equal((await lect(page)).catalogo_col, 73);
    await page.waitForFunction(() => window.__LECT.catalogo_unico >= 1, null, { timeout: 6000 }); await esp(200);
    const antes = await lect(page);
    await page.evaluate(() => { const it = window.__MOCK.catalogo || window.__PRODUCTOS_DEF; window.__SERVIDOR.publicarCatalogo(it.map((x, i) => (i === 0 ? { ...x, nombre: 'Nombre Nuevo Tras Cambio' } : x))); });
    await esp(300); const despues = await lect(page);
    assert.equal(despues.catalogo_col, antes.catalogo_col + 1, 'la colección (respaldo) solo cuenta el cambio de la doble escritura de StockMGR, no la relee entera');
    await ctx.close();
  });
  await ta('solo existe el documento único (colecciones vacías): la tienda NO las necesita', async () => {
    const { page, ctx } = await abrir({ mock: { fuente: 'solo-unico' } }); const l = await lect(page); assert.equal(l.catalogo_col + l.envios_col, 0); assert.equal(await entregas(page), 152); await ctx.close();
  });
  await ta('CAMBIO EN VIVO: un cambio de StockMGR (precio, nombre y stock) aparece en la tienda sin recargar, y se lee 1 documento más', async () => {
    const { page, ctx } = await abrir({}); const a = await lect(page);
    await page.evaluate(() => { const it = window.__PRODUCTOS_DEF.map((x, i) => (i === 0 ? { ...x, nombre: 'Camiseta Cambiada En Vivo', precio: 99000, stockBajo: 1 } : x)); window.__SERVIDOR.publicarCatalogo(it); });
    await page.waitForFunction(() => document.getElementById('grid').innerText.includes('Cambiada En Vivo'), null, { timeout: 5000 });
    const t = await textoGrid(page); assert.ok(t.includes('99.000')); assert.ok(t.includes('¡Última unidad!'));
    const b = await lect(page); assert.equal(b.catalogo_unico - a.catalogo_unico, 1); await ctx.close();
  });
  await ta('VARIAS PARTES (límite por documento): 73 fichas en varias partes → una lectura por parte, catálogo completo', async () => {
    const { page, ctx } = await abrir({ mock: { fuente: 'partes', limiteParte: 9000 } }); const l = await lect(page);
    assert.ok(l.catalogo_unico >= 3, 'partes: ' + l.catalogo_unico); assert.equal(l.catalogo_col, 0);
    assert.equal(await page.evaluate(() => window.__PRODUCTOS_DEF.length), 73);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.verMasProductos && window.verMasProductos(); });
    assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card').length), 73, 'las 73 fichas llegaron de todas las partes'); await ctx.close();
  });
  await ta('STOCK BAJO: tarjeta y ficha muestran "¡Solo quedan 2 en stock!" y "¡Última unidad!"', async () => {
    const it = productosPrueba(24); it[1].stockBajo = 2; it[2].stockBajo = 1;
    const { page, ctx } = await abrir({ mock: { catalogo: it }, productos: 24 });
    const t = await textoGrid(page); assert.ok(t.includes('¡Solo quedan 2 en stock!')); assert.ok(t.includes('¡Última unidad!'));
    await page.evaluate((id) => window.abrirDetalle(id), it[1].id); await esp(300);
    assert.equal(await page.evaluate(() => document.getElementById('detalle-stock-bajo').textContent), '¡Solo quedan 2 en stock!'); await ctx.close();
  });
  await ta('BUSCADOR: encuentra por nombre, ignora tildes/mayúsculas y vuelve a mostrar todo al borrar', async () => {
    const { page, ctx } = await abrir({});
    const cuenta = () => page.evaluate(() => document.querySelectorAll('#grid > .card').length);
    await page.evaluate(() => window.setBusqueda('bayern munich')); await esp(150); const c = await cuenta();
    assert.ok(c > 0 && c < 24, 'resultados: ' + c); assert.ok((await textoGrid(page)).includes('Bayern'));
    await page.evaluate(() => window.setBusqueda('zzzz no existe')); await esp(150); assert.equal(await cuenta(), 0);
    await page.evaluate(() => window.setBusqueda('')); await esp(150); assert.equal(await cuenta(), 24); await ctx.close();
  });
  await ta('LINK ?p=ID: abre la ficha del producto (también con el documento único)', async () => {
    const id = productosPrueba(1)[0].id;
    const { page, ctx } = await abrir({ url: '/index.html?p=' + encodeURIComponent(id) });
    await page.waitForFunction(() => document.getElementById('detalle-overlay').classList.contains('open'), null, { timeout: 5000 });
    assert.ok((await page.evaluate(() => document.getElementById('detalle-overlay').innerText)).includes('Boca Juniors 1')); await ctx.close();
  });
  await ta('CARRITO + WHATSAPP: precio de efectivo y de tarjeta, localidad de envío y mensaje (WhatsApp interceptado, no se abre nada)', async () => {
    const it = productosPrueba(24); // it[0]: precio 25000, tarjeta 32000 (redondeo a 500)
    const { page, ctx } = await abrir({ mock: { catalogo: it }, productos: 24 });
    const p = it[0];
    const armar = async (pago, agregar) => page.evaluate(async ({ id, pago, agregar }) => {
      window.__abiertos.length = 0;
      if (agregar) window.agregarAlCarrito(id, 'M'); window.setClienteNombre('Juan Prueba'); window.setTipoEntrega('motomensajeria'); window.setEnvio('localidad-0'); window.setFormaPago(pago); window.hacerPedido();
      return decodeURIComponent((window.__abiertos[0] || '').split('text=')[1] || '');
    }, { id: p.id, pago, agregar });
    const ef = await armar('efectivo', true), ta2 = await armar('tarjeta', false); // el mismo renglón (1 unidad) con los dos precios
    assert.ok(ef.includes('Juan Prueba') && ef.includes('Ciudadela'), ef);
    assert.ok(ef.includes((p.precio).toLocaleString('es-AR')), 'precio efectivo en el mensaje:\n' + ef);
    assert.ok(ta2.includes((p.precioTarjeta).toLocaleString('es-AR')), 'precio tarjeta en el mensaje:\n' + ta2);
    assert.ok(ef.includes('Total: $' + (p.precio + 10000).toLocaleString('es-AR')), 'total efectivo = precio + envío:\n' + ef);
    assert.ok(ta2.includes('Total: $' + (p.precioTarjeta + 10000).toLocaleString('es-AR')), 'total tarjeta = precio tarjeta + envío:\n' + ta2);
    assert.ok(await page.evaluate(() => window.__abiertos.every((u) => u.startsWith('https://wa.me/5491156253612?text='))));
    await ctx.close();
  });
  await ta('ninguna prueba salió a internet real (solo el doble y el servidor local)', () => assert.deepEqual(pedidosReales.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(mal ? `\n${mal} de ${n + mal} pruebas FALLARON` : `\nTodo OK: ${n} pruebas pasaron.`);
process.exit(mal ? 1 : 0);
