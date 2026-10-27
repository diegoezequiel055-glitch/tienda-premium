// ══════════════════════════════════════════
// PRUEBAS DE "COMPRAR POR CATEGORÍA" (carrusel con foto): categorias-portada.js, categorias-portada-ui.js, categorias-portada.css, app.js, analytics.js.
// NO toca el Firestore real: usa el doble de test-doble-firebase.mjs (la config con `categoriasPortada` la pone cada prueba) y bloquea todo pedido a internet.
//   A) puras: qué foto y qué frase le toca a cada categoría (cargada > foto del último producto > no se muestra), tarjeta, puntos, evento de Analytics.
//   B) navegador (Chrome, iPhone / Android / PC): ubicación (después de Nuevos ingresos, antes de Destacados; sin chips); carrusel con scroll-snap sin autoplay
//      (celular ~80 % del ancho con un pedazo de la siguiente; PC 3 o 4 a la vez con flechas ‹ ›); puntitos; con foto cargada / sin foto / frase / sin productos /
//      una sola / muchas; el clic abre la vista y Atrás vuelve a la portada en el mismo scroll; click_categoria; imágenes lazy (la primera prioritaria) y acotadas;
//      sin lecturas extra, sin desborde ni saltos.
// Uso: node test-categorias-portada.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
//      CAPTURAS=<carpeta> guarda capturas de la sección en iPhone, Android y PC.
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { portadaPorClave, ultimaFotoDe, tarjetasCategorias, tarjetaCategoriaHtml, puntosHtml, indiceActivo, limpiarFrase, MAX_FRASE } from './categorias-portada.js';
import { fotoCloudinary } from './fotos-cloudinary.js';
import { eventos } from './analytics.js';
import { dobleFirebase, guion, productosPrueba, PNG } from './test-doble-firebase.mjs';

let ok = 0, fallos = 0;
const t = async (n, f) => { if (process.env.SOLO && !n.includes(process.env.SOLO)) return; try { await f(); ok++; console.log('ok', n); } catch (e) { fallos++; console.log('FALLA', n, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); } };

const CLD = (n) => `https://res.cloudinary.com/d5fzjp10/image/upload/v1/${n}.jpg`;
const prod = (id, cat, creadoEn, fotos = [CLD(id)]) => ({ id: `${cat.toLowerCase().slice(0, -1)}|${id}|x`, nombre: id, categoria: cat, precio: 30000, fotos, talles: [{ talle: 'M', stock: 2 }], creadoEn });

console.log('— A) lógica pura —');
await t('portadaPorClave: "Camisetas", "Camiseta" y "camisetas" son la misma categoría; foto https y frase (máx. 30, sin espacios de más); entradas vacías o raras se ignoran; gana la primera', () => {
  assert.deepEqual(portadaPorClave({ Camisetas: { foto: CLD('a'), frase: 'Las de la temporada' }, Conjuntos: { frase: 'Para entrenar' } }), { camisetas: { foto: CLD('a'), frase: 'Las de la temporada' }, conjuntos: { foto: '', frase: 'Para entrenar' } });
  assert.deepEqual(portadaPorClave({ Camiseta: { foto: CLD('a') }, camisetas: { foto: CLD('z') } }), { camisetas: { foto: CLD('a'), frase: '' } }); assert.deepEqual(portadaPorClave({ 'Gorra G5': { foto: CLD('g') } }), { gorras: { foto: CLD('g'), frase: '' } });
  assert.equal(portadaPorClave({ Camisetas: { frase: '  Hola    mundo  ' } }).camisetas.frase, 'Hola mundo'); assert.equal(portadaPorClave({ Camisetas: { frase: 'x'.repeat(80) } }).camisetas.frase.length, MAX_FRASE); assert.equal(MAX_FRASE, 30);
  assert.equal(portadaPorClave({ Camisetas: { foto: 'http://x.com/a.jpg', frase: 'ok' } }).camisetas.foto, '', 'una foto que no es https no sirve (la frase sí)');
  for (const x of [undefined, null, 'x', 5, [], [{ foto: CLD('a') }], {}, { Camisetas: null }, { Camisetas: 'https://x/a.jpg' }, { Camisetas: [] }, { Camisetas: {} }, { Camisetas: { foto: 'javascript:alert(1)' } }, { Camisetas: { foto: '', frase: '   ' } }, { '': { foto: CLD('a') } }]) assert.deepEqual(portadaPorClave(x), {}, JSON.stringify(x));
  assert.equal(limpiarFrase(null), '');
});
await t('ultimaFotoDe: la foto principal del producto de la categoría con la fecha de alta más nueva (no importa el orden de la lista); ignora los sin foto y los de otras categorías', () => {
  const lista = [prod('viejo', 'Camisetas', 100), prod('nuevo', 'Camisetas', 900), prod('medio', 'Camisetas', 500), prod('otra', 'Conjuntos', 5000), prod('sinfoto', 'Camisetas', 9999, [])];
  assert.equal(ultimaFotoDe(lista, 'camisetas'), CLD('nuevo')); assert.equal(ultimaFotoDe(lista, 'conjuntos'), CLD('otra')); assert.equal(ultimaFotoDe(lista, 'chombas'), null);
  assert.equal(ultimaFotoDe([prod('a', 'Camisetas', 1, ['http://x/a.jpg', CLD('segunda')])], 'camisetas'), CLD('segunda'), 'la primera foto válida'); assert.equal(ultimaFotoDe([], 'camisetas'), null); assert.equal(ultimaFotoDe(null, 'camisetas'), null);
});
await t('tarjetasCategorias: 1) la foto cargada gana; 2) si no hay, la del último producto; 3) sin productos no hay tarjeta aunque tenga foto o frase cargada; la frase vale con cualquiera de las dos fotos', () => {
  const lista = [prod('c1', 'Camisetas', 100), prod('c2', 'Camisetas', 800), prod('k1', 'Conjuntos', 300), prod('r1', 'Remeras', 50)];
  const t1 = tarjetasCategorias(lista, { Camisetas: { foto: CLD('CARGADA'), frase: 'Nuevas' }, Conjuntos: { frase: 'Para entrenar' }, Gorras: { foto: CLD('g'), frase: 'x' } });
  assert.deepEqual(t1.map((x) => [x.clave, x.nombre, x.foto, x.origen, x.frase]), [['camisetas', 'Camisetas', CLD('CARGADA'), 'cargada', 'Nuevas'], ['conjuntos', 'Conjuntos', CLD('k1'), 'ultimo', 'Para entrenar'], ['remeras', 'Remeras', CLD('r1'), 'ultimo', '']]);
  assert.equal(t1.some((x) => x.clave === 'gorras'), false, 'sin productos no se muestra');
  assert.deepEqual(tarjetasCategorias(lista, null).map((x) => [x.clave, x.foto, x.frase]), [['camisetas', CLD('c2'), ''], ['conjuntos', CLD('k1'), ''], ['remeras', CLD('r1'), '']], 'quitar la foto = usar la última');
  assert.deepEqual(tarjetasCategorias([], { Camisetas: { foto: CLD('a') } }), []); assert.deepEqual(tarjetasCategorias(undefined, undefined), []); assert.deepEqual(tarjetasCategorias([prod('s', 'Camisetas', 1, [])], { Camisetas: { foto: CLD('c') } }), [], 'solo cuentan productos publicables');
  assert.deepEqual(tarjetasCategorias([prod('r', 'Remeras', 1), prod('k', 'Conjunto', 1), prod('c', 'Camiseta', 1), prod('x', 'Perfume', 1)], {}).map((x) => x.clave), ['camisetas', 'conjuntos', 'remeras', 'perfumes'], 'en el orden del menú');
});
await t('tarjetaCategoriaHtml: UN link a #cat=<clave> con foto, frase (opcional), nombre y botón "Comprar"; la primera foto carga con prioridad y las demás lazy; escapa; lleva el nombre para Analytics', () => {
  const c = { clave: 'camisetas', nombre: 'Camisetas', foto: CLD('a'), frase: 'Las de la temporada' };
  const h0 = tarjetaCategoriaHtml(c, 'https://x/y.jpg', 0), h1 = tarjetaCategoriaHtml(c, 'https://x/y.jpg', 1);
  assert.match(h0, /^<a class="cat-card" role="listitem" href="#cat=camisetas" data-clave="camisetas" data-click-categoria="Camisetas"/); assert.match(h0, /loading="eager" fetchpriority="high"/); assert.match(h1, /loading="lazy"/); assert.equal(/fetchpriority/.test(h1), false);
  assert.match(h0, /cat-card-frase">Las de la temporada</); assert.match(h0, /cat-card-nombre">Camisetas</); assert.match(h0, /cat-card-boton[^>]*>Comprar</); assert.equal(/cat-card-frase/.test(tarjetaCategoriaHtml({ ...c, frase: '' }, 'x', 1)), false, 'sin frase no hay línea');
  const x = tarjetaCategoriaHtml({ clave: 'a"b', nombre: '<i>x</i>', foto: CLD('a'), frase: '<b>f</b>' }); assert.equal(/<i>x|<b>f/.test(x), false); assert.match(x, /&lt;i&gt;x&lt;\/i&gt;/);
});
await t('puntos e índice activo: un punto por tarjeta (el activo marcado); el activo sale del scroll y al final del recorrido es el último', () => {
  const tj = [{ nombre: 'A' }, { nombre: 'B' }, { nombre: 'C' }]; const h = puntosHtml(tj, 1);
  assert.equal((h.match(/class="cat-punto/g) || []).length, 3); assert.equal((h.match(/ activo/g) || []).length, 1); assert.match(h, /cat-punto activo" data-i="1"/); assert.match(h, /aria-label="Ir a B"/);
  assert.equal(indiceActivo({ scrollLeft: 0, paso: 300, cantidad: 3 }), 0); assert.equal(indiceActivo({ scrollLeft: 160, paso: 300, cantidad: 3 }), 1); assert.equal(indiceActivo({ scrollLeft: 290, paso: 300, cantidad: 3 }), 1);
  assert.equal(indiceActivo({ scrollLeft: 100, paso: 300, cantidad: 3, alFinal: true }), 2, 'al final, la última'); assert.equal(indiceActivo({ scrollLeft: 9999, paso: 300, cantidad: 3 }), 2); assert.equal(indiceActivo({ scrollLeft: 0, paso: 0, cantidad: 3 }), 0); assert.equal(indiceActivo({ scrollLeft: 0, paso: 300, cantidad: 0 }), 0);
});
await t('ANALYTICS: click_categoria lleva solo el nombre de la categoría (máx. 40); sin datos del visitante', () => {
  assert.deepEqual(eventos.click_categoria({ categoria: 'Camisetas' }), { categoria: 'Camisetas' }); assert.deepEqual(eventos.click_categoria({ categoria: 'x'.repeat(90) }).categoria.length, 40);
  assert.deepEqual(Object.keys(eventos.click_categoria({ categoria: 'Camisetas', nombre: 'Juan', telefono: '1155' })), ['categoria']); assert.deepEqual(eventos.click_categoria(), { categoria: '' });
});
await t('las fotos de Cloudinary se piden achicadas (720 px de ancho como máximo)', () => { assert.match(fotoCloudinary(CLD('a'), 'categoria'), /\/image\/upload\/f_auto,q_auto:eco,c_limit,w_720\/v1\/a\.jpg$/); assert.equal(fotoCloudinary('https://x.com/a.jpg', 'categoria'), 'https://x.com/a.jpg'); });

if (!process.env.SOLO_PURAS) {
  console.log('— B) navegador (Firestore simulado, cero lecturas reales) —');
  async function cargarPlaywright() {
    try { return await import('playwright'); } catch {}
    if (process.env.PLAYWRIGHT_DIR) { try { return createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js'))('playwright'); } catch {} }
    console.error('No se pudo cargar Playwright. Instalalo fuera del repo y corré con PLAYWRIGHT_DIR=<carpeta> (o SOLO_PURAS=1).'); process.exit(1);
  }
  const { chromium, devices } = await cargarPlaywright();
  const RAIZ = path.dirname(fileURLToPath(import.meta.url));
  const servidor = await new Promise((okp) => { const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    const s = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(RAIZ, u);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1', () => okp(s)); });
  const BASE = `http://127.0.0.1:${servidor.address().port}`;
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));
  const pedidosReales = [];
  const PERFILES = { iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, android: { ...devices['Pixel 7'] }, tablet: { viewport: { width: 900, height: 900 } }, pc: { viewport: { width: 1366, height: 800 } } };
  const CARGADA = CLD('categoria-camisetas-1080x1350');
  const CFG = { categoriasPortada: { Camisetas: { foto: CARGADA, frase: 'Las de la temporada' }, Conjuntos: { frase: 'Para entrenar' } } };
  const MUCHAS = ['Camisetas', 'Conjuntos', 'Camperas', 'Chombas', 'Chalecos', 'Remeras', 'Buzos', 'Pantalones'].map((c, i) => prod('m' + (i + 1), c, 1700000000000 - i * 1000));
  const SIN_OFERTAS = (n = 24) => productosPrueba(n).map(({ precioOferta, precioOfertaTarjeta, ...r }) => r);

  async function abrir({ cfg = CFG, url = '/index.html', perfil = 'iphone', mock = {}, catalogo } = {}) {
    const ctx = await browser.newContext(PERFILES[perfil]);
    const imagenes = [];
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) { imagenes.push(u); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); }
      pedidosReales.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [], consola = [];
    page.on('pageerror', (e) => errores.push(e.message)); page.on('console', (m) => consola.push(m.text()));
    await page.addInitScript(guion(24, 152));
    await page.addInitScript((m) => { window.__MOCK = m; }, { config: cfg, catalogoDemora: 250, ...(catalogo ? { catalogo } : {}), ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(450);
    return { page, ctx, errores, imagenes, consola };
  }
  const tarjetas = (page) => page.evaluate(() => [...document.querySelectorAll('#categorias-carril .cat-card')].map((a) => ({ clave: a.dataset.clave, nombre: a.querySelector('.cat-card-nombre').textContent.trim(), frase: a.querySelector('.cat-card-frase')?.textContent.trim() ?? null, src: a.querySelector('img').getAttribute('src'), href: a.getAttribute('href') })));
  const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
  const irASeccion = (page) => page.evaluate(() => { const s = document.getElementById('categorias-section'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' }); });

  await t('UBICACIÓN: "COMPRAR POR CATEGORÍA" va justo después de "Nuevos ingresos" y antes de "Destacados"; ya no hay fila de chips; el título tiene la tipografía de los demás', async () => {
    const { page, ctx, errores } = await abrir({ perfil: 'pc' });
    const p = await page.evaluate(() => { const y = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : null; }; const tit = (s) => { const e = document.querySelector(s + ' .section-title'); const cs = getComputedStyle(e); return { texto: e.innerText.trim(), ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, ls: cs.letterSpacing, tt: cs.textTransform }; };
      return { hero: document.getElementById('hero-rot').getBoundingClientRect().bottom + scrollY, nuevos: y('#nuevos-section'), cat: y('#categorias-section'), destacados: y('#destacados-section'), ofertas: y('#ofertas-section'), chips: document.querySelectorAll('#chips-cat, .chip-cat, .chips-cat').length, tNuevos: tit('#nuevos-section'), tCat: tit('#categorias-section'), tDest: tit('#destacados-section') }; });
    assert.ok(p.nuevos < p.cat && p.cat < p.destacados && p.destacados < p.ofertas, 'orden: nuevos < categorías < destacados < ofertas'); assert.equal(p.chips, 0, 'sin chips'); assert.ok(p.nuevos - p.hero < 80, 'Nuevos ingresos pegado al banner: ' + (p.nuevos - p.hero));
    assert.equal(p.tCat.texto.toUpperCase(), 'COMPRAR POR CATEGORÍA'); assert.deepEqual(p.tCat, { ...p.tNuevos, texto: p.tCat.texto }); assert.deepEqual(p.tCat, { ...p.tDest, texto: p.tCat.texto }); assert.ok(p.tCat.ff.includes('Anton'));
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });
  await t('FOTO CARGADA / SIN FOTO / FRASE: Camisetas usa la foto cargada (achicada) y su frase; Conjuntos solo tiene frase (foto del último producto); el resto, la foto del último producto sin frase', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const c = await tarjetas(page); assert.deepEqual(c.map((x) => x.clave), ['camisetas', 'conjuntos', 'chombas', 'remeras']); assert.deepEqual(c.map((x) => x.nombre), ['Camisetas', 'Conjuntos', 'Chombas', 'Remeras']);
    assert.equal(c[0].src, fotoCloudinary(CARGADA, 'categoria')); assert.match(c[0].src, /w_720/); assert.equal(c[0].frase, 'Las de la temporada');
    assert.match(c[1].src, /prueba2_1\.jpg$/); assert.equal(c[1].frase, 'Para entrenar'); assert.match(c[2].src, /prueba3_1\.jpg$/); assert.equal(c[2].frase, null, 'sin frase no hay línea'); assert.match(c[3].src, /prueba4_1\.jpg$/); assert.equal(c[3].frase, null);
    assert.deepEqual(c.map((x) => x.href), ['#cat=camisetas', '#cat=conjuntos', '#cat=chombas', '#cat=remeras']); await ctx.close();
  });
  await t('SIN FOTO CARGADA (campo inexistente, vacío o inválido): todas usan la foto del último producto de su categoría, elegido por FECHA DE ALTA (no por el orden de la lista)', async () => {
    const lista = SIN_OFERTAS(24); lista[4].creadoEn = 1800000000000; // otra camiseta (prueba5) pasa a ser la más nueva de su categoría
    for (const cfg of [{}, null, { categoriasPortada: {} }, { categoriasPortada: 'x' }, { categoriasPortada: { Camisetas: { foto: 'http://x.com/a.jpg' } } }, { categoriasPortada: { Camisetas: 'https://x/a.jpg' } }]) {
      const { page, ctx } = await abrir({ perfil: 'iphone', cfg, catalogo: lista }); const c = await tarjetas(page);
      assert.equal(c.length, 4, JSON.stringify(cfg)); assert.match(c[0].src, /prueba5_1\.jpg$/, 'camisetas: la más nueva por fecha de alta'); assert.match(c[1].src, /prueba2_1\.jpg$/); await ctx.close();
    }
  });
  await t('SIN PRODUCTOS: la categoría sin productos no se muestra aunque tenga foto y frase (Gorras); si no queda ninguna con productos no hay sección ni hueco', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone', cfg: { categoriasPortada: { Gorras: { foto: CLD('gorras'), frase: 'x' }, Camisetas: { foto: CARGADA } } } }); const c = await tarjetas(page); assert.equal(c.some((x) => x.clave === 'gorras'), false); assert.equal(c.length, 4); await ctx.close();
    const v = await abrir({ perfil: 'iphone', catalogo: [] }); assert.equal(await visible(v.page, '#categorias-section'), false); assert.equal(await v.page.evaluate(() => document.getElementById('categorias-section').getBoundingClientRect().height), 0, 'sin hueco'); await v.ctx.close();
    const s = await abrir({ perfil: 'iphone', catalogo: SIN_OFERTAS(24).filter((p) => /^(camiseta|conjunto)\|/.test(p.id)) }); assert.deepEqual((await tarjetas(s.page)).map((x) => x.clave), ['camisetas', 'conjuntos']); await s.ctx.close();
  });
  await t('UNA SOLA CATEGORÍA: una tarjeta (sin puntitos ni flechas, sin pedazo de otra), se ve entera y no se estira; abre su vista', async () => {
    for (const perfil of ['iphone', 'pc']) {
      const { page, ctx } = await abrir({ perfil, catalogo: SIN_OFERTAS(24).filter((p) => /^camiseta\|/.test(p.id)) });
      const g = await page.evaluate(() => { const car = document.getElementById('categorias-carril'); const cs = [...car.querySelectorAll('.cat-card')]; const r = cs[0].getBoundingClientRect(); return { n: cs.length, w: Math.round(r.width), h: Math.round(r.height), puntos: !document.getElementById('categorias-puntos').hidden, prev: !document.getElementById('categorias-prev').hidden, sig: !document.getElementById('categorias-next').hidden, desborda: car.scrollWidth > car.clientWidth + 2, dentro: r.left >= 0 && r.right <= innerWidth }; });
      assert.equal(g.n, 1); assert.ok(g.w <= 421 && Math.abs(g.h - g.w * 1.25) <= 2, `${perfil}: 4:5 y no se estira (${g.w}×${g.h})`); assert.deepEqual([g.puntos, g.prev, g.sig, g.desborda, g.dentro], [false, false, false, false, true], perfil);
      await page.evaluate(() => document.querySelector('#categorias-carril .cat-card').click()); await esp(500); assert.equal(await page.evaluate(() => location.hash), '#cat=camisetas'); await ctx.close();
    }
  });
  await t('MUCHAS CATEGORÍAS (8): un punto por tarjeta, el activo más largo y sigue al scroll; tocar un punto lleva a esa tarjeta; el carrusel scrollea y no se corta nada', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone', cfg: {}, catalogo: MUCHAS });
    const g = await page.evaluate(() => ({ cards: document.querySelectorAll('#categorias-carril .cat-card').length, puntos: document.querySelectorAll('#categorias-puntos .cat-punto').length, activos: document.querySelectorAll('#categorias-puntos .cat-punto.activo').length, visible: !document.getElementById('categorias-puntos').hidden }));
    assert.deepEqual([g.cards, g.puntos, g.activos, g.visible], [8, 8, 1, true]);
    const ancho = (i) => page.evaluate((k) => document.querySelectorAll('.cat-punto')[k].getBoundingClientRect().width, i); assert.ok((await ancho(0)) > (await ancho(1)) * 2, 'el activo es más largo');
    await page.evaluate(() => document.querySelectorAll('.cat-punto')[3].click()); await esp(900); const a = await page.evaluate(() => ({ act: [...document.querySelectorAll('.cat-punto')].findIndex((p) => p.classList.contains('activo')), x: Math.round(document.querySelectorAll('.cat-card')[3].getBoundingClientRect().left) }));
    assert.equal(a.act, 3); assert.ok(a.x >= 0 && a.x <= 40, 'la tarjeta quedó a la izquierda: ' + a.x);
    await page.evaluate(() => { const c = document.getElementById('categorias-carril'); c.scrollTo({ left: c.scrollWidth, behavior: 'instant' }); }); await esp(500); assert.equal(await page.evaluate(() => [...document.querySelectorAll('.cat-punto')].findIndex((p) => p.classList.contains('activo'))), 7, 'al final, el último');
    await page.evaluate(() => { const c = document.getElementById('categorias-carril'); c.scrollTo({ left: 0, behavior: 'instant' }); }); await esp(500); assert.equal(await page.evaluate(() => [...document.querySelectorAll('.cat-punto')].findIndex((p) => p.classList.contains('activo'))), 0); await ctx.close();
  });
  await t('CELULAR: cada tarjeta mide ~80 % del ancho (se ve un pedazo de la siguiente), relación 4:5, esquinas apenas redondeadas, scroll-snap, sin autoplay y sin flechas', async () => {
    for (const perfil of ['iphone', 'android']) {
      const { page, ctx } = await abrir({ perfil, cfg: {}, catalogo: MUCHAS }); await irASeccion(page); await esp(300);
      const m = await page.evaluate(() => { const car = document.getElementById('categorias-carril'); const cs = [...car.querySelectorAll('.cat-card')].map((c) => c.getBoundingClientRect()); const cs0 = getComputedStyle(car.querySelector('.cat-card')); return { vw: innerWidth, w: cs[0].width, h: cs[0].height, siguienteAsoma: cs[1].left < innerWidth - 8 && cs[1].right > innerWidth + 8, visible2: innerWidth - cs[1].left, radio: parseFloat(cs0.borderTopLeftRadius), snap: getComputedStyle(car).scrollSnapType, fle: [...document.querySelectorAll('.cat-flecha')].some((f) => getComputedStyle(f).display !== 'none'), sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      assert.ok(Math.abs(m.w / m.vw - 0.8) < 0.03, `${perfil}: ~80 % del ancho (${m.w} de ${m.vw})`); assert.ok(Math.abs(m.h / m.w - 1.25) < 0.02, '4:5'); assert.ok(m.siguienteAsoma && m.visible2 > 20, 'asoma un pedazo de la siguiente: ' + m.visible2); assert.ok(m.radio > 0 && m.radio <= 10, 'esquinas apenas redondeadas: ' + m.radio);
      assert.match(m.snap, /x mandatory/); assert.equal(m.fle, false, 'sin flechas en celular'); assert.ok(m.sobra <= 1);
      const x0 = await page.evaluate(() => document.getElementById('categorias-carril').scrollLeft); await esp(3500); assert.equal(await page.evaluate(() => document.getElementById('categorias-carril').scrollLeft), x0, 'sin autoplay: no se mueve solo'); await ctx.close();
    }
  });
  await t('PC: 4 tarjetas a la vez desde 1100 px y 3 en pantallas medianas; flechas ‹ › solo si hay más para ver (‹ oculta al inicio, › oculta al final) y desplazan el carrusel', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc', cfg: {}, catalogo: MUCHAS });
    const v = () => page.evaluate(() => { const car = document.getElementById('categorias-carril'); const cr = car.getBoundingClientRect(); const cs = [...car.querySelectorAll('.cat-card')].map((c) => c.getBoundingClientRect()); const enteras = cs.filter((r) => r.left >= cr.left - 1 && r.right <= cr.right + 1).length; const vis = (id) => { const e = document.getElementById(id); return !e.hidden && getComputedStyle(e).display !== 'none'; }; return { enteras, w: Math.round(cs[0].width), prev: vis('categorias-prev'), sig: vis('categorias-next'), x: car.scrollLeft, sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    let s = await v(); assert.equal(s.enteras, 4, 'PC 1366: 4 enteras'); assert.ok(s.w >= 280 && s.w <= 330, 'ancho de tarjeta: ' + s.w); assert.deepEqual([s.prev, s.sig], [false, true]); assert.ok(s.sobra <= 1);
    await page.evaluate(() => document.getElementById('categorias-next').click()); await esp(1000); const s2 = await v(); assert.ok(s2.x > 200, 'el › desplazó: ' + s2.x); assert.equal(s2.prev, true);
    await page.evaluate(() => { const c = document.getElementById('categorias-carril'); c.scrollTo({ left: c.scrollWidth, behavior: 'instant' }); }); await esp(500); const s3 = await v(); assert.deepEqual([s3.prev, s3.sig], [true, false], 'al final no hay ›');
    await page.evaluate(() => document.getElementById('categorias-prev').click()); await esp(1000); assert.ok((await v()).x < s3.x, 'el ‹ vuelve'); await ctx.close();
    const t3 = await abrir({ perfil: 'tablet', cfg: {}, catalogo: MUCHAS }); assert.equal((await t3.page.evaluate(() => { const car = document.getElementById('categorias-carril'); const cr = car.getBoundingClientRect(); return [...car.querySelectorAll('.cat-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.left >= cr.left - 1 && r.right <= cr.right + 1; }).length; })), 3, 'pantalla mediana: 3 enteras'); await t3.ctx.close();
    const c4 = await abrir({ perfil: 'pc' }); const s4 = await c4.page.evaluate(() => ({ n: document.querySelectorAll('.cat-card').length, flechas: [...document.querySelectorAll('.cat-flecha')].some((f) => !f.hidden && getComputedStyle(f).display !== 'none'), puntos: !document.getElementById('categorias-puntos').hidden })); assert.deepEqual([s4.n, s4.flechas, s4.puntos], [4, false, false], 'con 4 categorías en PC entran todas: sin flechas ni puntos'); await c4.ctx.close();
  });
  await t('LA TARJETA: foto a tarjeta completa (cover) con degradé oscuro abajo; abajo a la izquierda frase chica, nombre en blanco (Anton) y botón blanco redondeado "Comprar"', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' }); await irASeccion(page); await esp(300);
    const c = await page.evaluate(() => { const a = document.querySelector('#categorias-carril .cat-card'); const r = a.getBoundingClientRect(), i = a.querySelector('img'), ir = i.getBoundingClientRect(); const fr = a.querySelector('.cat-card-frase'), nom = a.querySelector('.cat-card-nombre'), bo = a.querySelector('.cat-card-boton'); const rf = fr.getBoundingClientRect(), rn = nom.getBoundingClientRect(), rb = bo.getBoundingClientRect(); const cb = getComputedStyle(bo), cn = getComputedStyle(nom);
      return { fit: getComputedStyle(i).objectFit, llena: Math.abs(ir.width - r.width) < 1 && Math.abs(ir.height - r.height) < 1, grad: getComputedStyle(a, '::after').backgroundImage, izq: rn.left - r.left, orden: rf.top < rn.top && rn.top < rb.top, abajo: rb.bottom <= r.bottom && rb.top > r.top + r.height * 0.6, colorNombre: cn.color, ffNombre: cn.fontFamily, fsFrase: parseFloat(getComputedStyle(fr).fontSize), fsNombre: parseFloat(cn.fontSize), bg: cb.backgroundColor, radio: parseFloat(cb.borderTopLeftRadius), altoBoton: rb.height, textoBoton: bo.textContent.trim(), tag: a.tagName, rol: a.getAttribute('role') }; });
    assert.equal(c.fit, 'cover'); assert.ok(c.llena); assert.match(c.grad, /linear-gradient/); assert.match(c.grad, /rgba\(0, 0, 0/); assert.ok(c.izq >= 8 && c.izq <= 24, 'abajo a la izquierda: ' + c.izq); assert.ok(c.orden && c.abajo); assert.equal(c.colorNombre, 'rgb(255, 255, 255)'); assert.ok(c.ffNombre.includes('Anton')); assert.ok(c.fsFrase < c.fsNombre / 1.5, 'frase chica');
    assert.equal(c.bg, 'rgb(255, 255, 255)'); assert.ok(c.radio >= c.altoBoton / 2 - 1, 'botón redondeado'); assert.ok(c.altoBoton >= 36); assert.equal(c.textoBoton, 'Comprar'); assert.equal(c.tag, 'A'); assert.equal(c.rol, 'listitem'); await ctx.close();
  });
  await t('IMÁGENES: la primera foto carga con prioridad (eager + fetchpriority=high) y las demás lazy; todas de Cloudinary achicadas (w_720), nunca la original de 1080×1350 entera', async () => {
    const { page, ctx, imagenes } = await abrir({ perfil: 'iphone', catalogo: MUCHAS, cfg: { categoriasPortada: { Camisetas: { foto: CARGADA } } } });
    const im = await page.evaluate(() => [...document.querySelectorAll('#categorias-carril img')].map((i) => ({ loading: i.loading, fp: i.fetchPriority, src: i.getAttribute('src'), wh: i.getAttribute('width') + 'x' + i.getAttribute('height') })));
    assert.equal(im.length, 8); assert.deepEqual([im[0].loading, im[0].fp], ['eager', 'high']); assert.ok(im.slice(1).every((x) => x.loading === 'lazy' && x.fp !== 'high'), 'las demás lazy'); assert.ok(im.every((x) => x.wh === '400x500'));
    assert.ok(im.every((x) => !/res\.cloudinary\.com/.test(x.src) || /f_auto,q_auto:eco,c_limit,w_720\//.test(x.src)), im.map((x) => x.src).join('\n')); assert.equal(imagenes.some((u) => u === CARGADA), false, 'no se pidió la original sin achicar');
    await esp(400); assert.ok(imagenes.some((u) => /w_720\/v1\/m1\.jpg|w_720\/v1\/categoria/.test(u)) || imagenes.some((u) => /w_720/.test(u)), 'la primera foto se pidió ya (carga con prioridad)'); await ctx.close();
  });
  await t('EN VIVO: si StockMGR cambia o quita la foto o la frase con la tienda abierta, la tarjeta se actualiza sola (quitar la foto = vuelve a la última foto)', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); assert.equal((await tarjetas(page))[0].src, fotoCloudinary(CARGADA, 'categoria'));
    await page.evaluate((u) => window.__SERVIDOR.emitirConfig({ categoriasPortada: { Camisetas: { foto: u, frase: 'Otra frase' } } }), CLD('otra-camisetas')); await esp(400); const a = (await tarjetas(page))[0]; assert.equal(a.src, fotoCloudinary(CLD('otra-camisetas'), 'categoria')); assert.equal(a.frase, 'Otra frase');
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({ categoriasPortada: { Camisetas: { frase: 'Solo frase' } } })); await esp(400); const b = (await tarjetas(page))[0]; assert.match(b.src, /prueba1_1\.jpg$/, 'quitada la foto: la del último producto'); assert.equal(b.frase, 'Solo frase');
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({})); await esp(400); const c = await tarjetas(page); assert.equal(c.length, 4); assert.equal(c[0].frase, null); await ctx.close();
  });
  await t('EL CLIC (en la tarjeta o en el botón "Comprar") abre la vista de esa categoría y ATRÁS vuelve a la portada en el MISMO scroll (y el carrusel donde estaba); Ctrl/Cmd+clic no se toca', async () => {
    for (const perfil of ['iphone', 'pc']) for (const blanco of ['.cat-card', '.cat-card-boton']) {
      const { page, ctx } = await abrir({ perfil, cfg: {}, catalogo: MUCHAS });
      await irASeccion(page); await esp(300); if (perfil === 'iphone') { await page.evaluate(() => document.querySelector('.cat-punto:nth-child(4)').click()); await esp(900); }
      const y0 = await page.evaluate(() => Math.round(scrollY)), x0 = await page.evaluate(() => Math.round(document.getElementById('categorias-carril').scrollLeft)); assert.ok(y0 > 300, 'scroll de la portada: ' + y0);
      const clave = await page.evaluate((s) => { const a = [...document.querySelectorAll('#categorias-carril .cat-card')].find((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }); (s === '.cat-card' ? a : a.querySelector(s)).click(); return a.dataset.clave; }, blanco); await esp(600);
      assert.equal(await page.evaluate(() => location.hash), '#cat=' + clave); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), await page.evaluate((c) => document.querySelector(`#categorias-carril .cat-card[data-clave="${c}"] .cat-card-nombre`).textContent, clave));
      assert.ok(await page.evaluate((c) => { const x = [...document.querySelectorAll('#grid > .card')]; return x.length > 0 && x.every((e) => e.querySelector('.card-cat') && e.getAttribute('onclick').includes(c.slice(0, 4))); }, clave), 'productos de esa categoría'); assert.equal(await visible(page, '#categorias-section'), false);
      await page.goBack(); await esp(1000); assert.equal(await page.evaluate(() => location.hash), ''); assert.equal(await visible(page, '#categorias-section'), true);
      const y1 = await page.evaluate(() => Math.round(scrollY)), x1 = await page.evaluate(() => Math.round(document.getElementById('categorias-carril').scrollLeft)); assert.ok(Math.abs(y1 - y0) <= 4, `${perfil}: scroll de la página ${y0} → ${y1}`); assert.ok(Math.abs(x1 - x0) <= 4, `${perfil}: carrusel ${x0} → ${x1}`);
      const dp = await page.evaluate(() => { const e = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }); document.querySelector('#categorias-carril .cat-card').dispatchEvent(e); return e.defaultPrevented; }); assert.equal(dp, false, 'Ctrl+clic: el navegador lo abre en otra pestaña'); await ctx.close();
    }
  });
  await t('cada tarjeta lleva a SU categoría (las 4) y entrando directo por ese link anda igual', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    for (const [clave, re] of [['camisetas', /camiseta/i], ['conjuntos', /conjunto/i], ['chombas', /chomba/i], ['remeras', /remera/i]]) {
      await page.evaluate((c) => document.querySelector(`#categorias-carril .cat-card[data-clave="${c}"]`).click(), clave); await esp(450); assert.equal(await page.evaluate(() => location.hash), '#cat=' + clave); assert.ok(await page.evaluate((s) => { const x = [...document.querySelectorAll('#grid > .card .card-cat')]; return x.length > 0 && x.every((e) => new RegExp(s, 'i').test(e.textContent)); }, re.source)); await page.goBack(); await esp(500);
    }
    await ctx.close(); const d = await abrir({ perfil: 'iphone', url: '/index.html#cat=conjuntos' }); assert.equal(await d.page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Conjuntos'); await d.ctx.close();
  });
  await t('ANALYTICS: tocar una tarjeta o el botón registra click_categoria con el nombre de la categoría (sin datos personales)', async () => {
    const { page, ctx, consola } = await abrir({ perfil: 'pc', url: '/index.html?analytics_debug=1' });
    await page.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest('.cat-card')) e.preventDefault(); }, true)); // sin salir de la portada
    await page.click('#categorias-carril .cat-card:nth-child(2)'); await esp(200); await page.click('#categorias-carril .cat-card:nth-child(1) .cat-card-boton'); await esp(200);
    const ev = consola.filter((m) => m.startsWith('[analytics] click_categoria')); assert.equal(ev.length, 2, consola.join('\n')); assert.match(ev[0], /categoria: Conjuntos/); assert.match(ev[1], /categoria: Camisetas/); for (const m of ev) assert.equal(/http|@|Juan|nombre|tel/i.test(m.replace('click_categoria', '')), false, m); await ctx.close();
  });
  await t('SIN LECTURAS EXTRA: la visita sigue leyendo 3 documentos (config + catálogo + localidades) con las categorías de la portada; abrir una categoría y volver tampoco lee nada', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' }); await page.evaluate(() => document.querySelector('#categorias-carril .cat-card').click()); await esp(300); await page.goBack(); await esp(500);
    const l = await page.evaluate(() => ({ ...window.__LECT })); assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.config, 1); assert.equal(l.catalogo_col + l.envios_col, 0); await ctx.close();
  });
  await t('SIN SALTOS (CLS ≈ 0) y sin desborde horizontal, con y sin foto cargada y con muchas categorías, en iPhone, Android y PC', async () => {
    for (const perfil of ['iphone', 'android', 'pc']) for (const [nombre, cfg, cat] of [['con foto cargada', CFG, null], ['sin foto cargada', {}, null], ['8 categorías', {}, MUCHAS]]) {
      const ctx = await browser.newContext(PERFILES[perfil]);
      await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); } if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return r.abort(); });
      const page = await ctx.newPage(); const errores = []; page.on('pageerror', (e) => errores.push(e.message));
      await page.addInitScript(guion(24, 152));
      await page.addInitScript(({ cfg, cat }) => { window.__MOCK = { config: cfg, catalogoDemora: 700, ...(cat ? { catalogo: cat } : {}) }; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, { cfg, cat });
      await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(900);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); const v = await page.evaluate(() => window.__cls);
      if (process.env.DEBUG) console.log(`   ${perfil} ${nombre}: CLS ${v.toFixed(3)}`);
      assert.ok(d <= 1, `${perfil} ${nombre}: desborde ${d}`); assert.equal(errores.length, 0, errores.join(' | ')); assert.ok(v <= 0.03, `${perfil} ${nombre}: CLS ${v.toFixed(3)}`); await ctx.close();
    }
  });
  await t('la sección es solo de la portada: no se ve en "Todo el catálogo", en categorías ni en ofertas, y vuelve con el logo', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); assert.equal(await visible(page, '#categorias-section'), true);
    for (const ir of [() => page.evaluate(() => document.getElementById('ver-todo-btn').click()), () => page.evaluate(() => window.setCategoria('camisetas')), () => page.evaluate(() => window.verOfertas())]) { await ir(); await esp(450); assert.equal(await visible(page, '#categorias-section'), false); await page.click('#hdr-logo'); await esp(700); assert.equal(await visible(page, '#categorias-section'), true); } await ctx.close();
  });
  if (process.env.CAPTURAS) {
    await t('CAPTURAS de la sección "Comprar por categoría" en iPhone, Android y PC', async () => {
      fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
      for (const perfil of ['iphone', 'android', 'pc']) {
        const { page, ctx } = await abrir({ perfil, catalogo: MUCHAS.map((p) => ({ ...p })) });
        await irASeccion(page); await esp(1500); await page.screenshot({ path: path.join(process.env.CAPTURAS, `categorias-${perfil}.png`) }); await ctx.close();
      }
    });
  }
  await t('ninguna prueba salió a internet real (solo el doble y el servidor local)', () => assert.deepEqual(pedidosReales.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
