// ══════════════════════════════════════════
// PRUEBAS DE "COMPRAR POR CATEGORÍA" (categorias-foto.js, categorias-foto-ui.js, categorias-foto.css, app.js). NO toca el Firestore real: usa el doble de
// test-doble-firebase.mjs (la config con `fotosCategorias` la pone cada prueba) y bloquea todo pedido a internet.
//   A) puras: qué foto le toca a cada categoría (cargada > foto del último producto > no se muestra), tarjeta, claves.
//   B) navegador (Chrome, iPhone / Android / PC): ubicación (después de Nuevos ingresos, antes de Destacados; sin chips), tarjeta con foto cargada / sin foto /
//      sin productos / cantidad impar / quitar la foto en vivo, fotos lazy y acotadas, el clic abre la vista y Atrás vuelve a la portada en el mismo scroll,
//      sin lecturas extra, sin desborde ni saltos.
// Uso: node test-categorias-foto.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
//      CAPTURAS=<carpeta> guarda capturas de la sección en iPhone, Android y PC.
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fotosPorClave, ultimaFotoDe, tarjetasCategorias, tarjetaCategoriaHtml } from './categorias-foto.js';
import { fotoCloudinary } from './fotos-cloudinary.js';
import { dobleFirebase, guion, productosPrueba, PNG } from './test-doble-firebase.mjs';

let ok = 0, fallos = 0;
const t = async (n, f) => { if (process.env.SOLO && !n.includes(process.env.SOLO)) return; try { await f(); ok++; console.log('ok', n); } catch (e) { fallos++; console.log('FALLA', n, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); } };

const CLD = (n) => `https://res.cloudinary.com/d5fzjp10/image/upload/v1/${n}.jpg`;
const prod = (id, cat, creadoEn, fotos = [CLD(id)]) => ({ id: `${cat.toLowerCase().slice(0, -1)}|${id}|x`, nombre: id, categoria: cat, precio: 30000, fotos, talles: [{ talle: 'M', stock: 2 }], creadoEn });

console.log('— A) lógica pura —');
await t('fotosPorClave: "Camisetas", "Camiseta" y "camisetas" son la misma categoría; solo urls https; basura se ignora; si se repite gana la primera', () => {
  assert.deepEqual(fotosPorClave({ Camisetas: CLD('a'), Conjuntos: CLD('b') }), { camisetas: CLD('a'), conjuntos: CLD('b') });
  assert.deepEqual(fotosPorClave({ Camiseta: CLD('a') }), { camisetas: CLD('a') }); assert.deepEqual(fotosPorClave({ camisetas: CLD('a'), Camisetas: CLD('b') }), { camisetas: CLD('a') });
  assert.deepEqual(fotosPorClave({ Gorras: CLD('g') }), { gorras: CLD('g') }); assert.deepEqual(fotosPorClave({ 'Gorra G5': CLD('g') }), { gorras: CLD('g') });
  for (const x of [undefined, null, 'x', 5, [], [CLD('a')], {}, { Camisetas: 'http://x.com/a.jpg' }, { Camisetas: 'javascript:alert(1)' }, { Camisetas: '' }, { Camisetas: null }, { Camisetas: 'https://x.com/a b.jpg' }, { '': CLD('a') }]) assert.deepEqual(fotosPorClave(x), {}, JSON.stringify(x));
});
await t('ultimaFotoDe: la foto principal del producto de la categoría con la fecha de alta más nueva (no importa el orden de la lista); ignora los sin foto y los de otras categorías', () => {
  const lista = [prod('viejo', 'Camisetas', 100), prod('nuevo', 'Camisetas', 900), prod('medio', 'Camisetas', 500), prod('otra', 'Conjuntos', 5000), prod('sinfoto', 'Camisetas', 9999, [])];
  assert.equal(ultimaFotoDe(lista, 'camisetas'), CLD('nuevo')); assert.equal(ultimaFotoDe(lista, 'conjuntos'), CLD('otra')); assert.equal(ultimaFotoDe(lista, 'chombas'), null);
  assert.equal(ultimaFotoDe([prod('a', 'Camisetas', 1, ['http://x/a.jpg', CLD('segunda')])], 'camisetas'), CLD('segunda'), 'la primera foto válida'); assert.equal(ultimaFotoDe([], 'camisetas'), null); assert.equal(ultimaFotoDe(null, 'camisetas'), null);
  assert.equal(ultimaFotoDe([prod('x', 'Camisetas', 0), prod('y', 'Camisetas', undefined)], 'camisetas'), CLD('x'), 'sin fecha de alta: queda la primera');
});
await t('tarjetasCategorias: 1) la foto cargada gana; 2) si no hay, la del último producto; 3) sin productos no hay tarjeta aunque tenga foto cargada', () => {
  const lista = [prod('c1', 'Camisetas', 100), prod('c2', 'Camisetas', 800), prod('k1', 'Conjuntos', 300), prod('r1', 'Remeras', 50)];
  const t1 = tarjetasCategorias(lista, { Camisetas: CLD('CARGADA-camisetas'), Gorras: CLD('CARGADA-gorras') });
  assert.deepEqual(t1.map((x) => [x.clave, x.nombre, x.foto, x.origen]), [['camisetas', 'Camisetas', CLD('CARGADA-camisetas'), 'cargada'], ['conjuntos', 'Conjuntos', CLD('k1'), 'ultimo'], ['remeras', 'Remeras', CLD('r1'), 'ultimo']]);
  assert.equal(t1.some((x) => x.clave === 'gorras'), false, 'sin productos no se muestra');
  assert.deepEqual(tarjetasCategorias(lista, null).map((x) => [x.clave, x.foto]), [['camisetas', CLD('c2')], ['conjuntos', CLD('k1')], ['remeras', CLD('r1')]], 'quitar la foto = usar la última');
  assert.deepEqual(tarjetasCategorias([], { Camisetas: CLD('a') }), []); assert.deepEqual(tarjetasCategorias(undefined, undefined), []);
  assert.deepEqual(tarjetasCategorias([prod('s', 'Camisetas', 1, [])], { Camisetas: CLD('c') }), [], 'una categoría cuyos únicos productos no son publicables (sin foto) no se muestra: la tienda solo cuenta productos publicables');
  assert.equal(tarjetasCategorias([prod('s', 'Camisetas', 1, []), prod('v', 'Camisetas', 0)], { Camisetas: CLD('c') })[0].foto, CLD('c'));
});
await t('tarjetasCategorias: en el orden del menú (categorias-config.js), con singular o plural en los productos', () => {
  const lista = [prod('r', 'Remeras', 1), prod('k', 'Conjunto', 1), prod('c', 'Camiseta', 1), prod('x', 'Perfume', 1)];
  assert.deepEqual(tarjetasCategorias(lista, {}).map((x) => x.clave), ['camisetas', 'conjuntos', 'remeras', 'perfumes']);
});
await t('tarjetaCategoriaHtml: link a #cat=<clave>, foto lazy con width/height, nombre y flecha →; escapa el nombre', () => {
  const h = tarjetaCategoriaHtml({ clave: 'camisetas', nombre: 'Camisetas', foto: CLD('a') }, 'https://x/y.jpg');
  assert.match(h, /^<a class="cat-foto" href="#cat=camisetas" data-clave="camisetas"/); assert.match(h, /<img src="https:\/\/x\/y\.jpg" width="400" height="300" loading="lazy"/); assert.match(h, />Camisetas</); assert.match(h, /cat-foto-flecha[^>]*>→</);
  const x = tarjetaCategoriaHtml({ clave: 'a"b', nombre: '<i>x</i>', foto: CLD('a') }); assert.equal(/<i>x/.test(x), false); assert.match(x, /&lt;i&gt;x&lt;\/i&gt;/);
});
await t('las fotos de Cloudinary se piden achicadas (600 px de ancho como máximo)', () => { assert.match(fotoCloudinary(CLD('a'), 'categoria'), /\/image\/upload\/f_auto,q_auto:eco,c_limit,w_600\/v1\/a\.jpg$/); assert.equal(fotoCloudinary('https://x.com/a.jpg', 'categoria'), 'https://x.com/a.jpg'); });

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
  const PERFILES = { iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, android: { ...devices['Pixel 7'] }, pc: { viewport: { width: 1366, height: 800 } } };
  const CARGADA = CLD('categoria-camisetas-1200x900');

  async function abrir({ cfg = { fotosCategorias: { Camisetas: CARGADA } }, url = '/index.html', perfil = 'iphone', mock = {}, catalogo } = {}) {
    const ctx = await browser.newContext(PERFILES[perfil]);
    const imagenes = [];
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) { imagenes.push(u); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); }
      pedidosReales.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(guion(24, 152));
    await page.addInitScript((m) => { window.__MOCK = m; }, { config: cfg, catalogoDemora: 250, ...(catalogo ? { catalogo } : {}), ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(400);
    return { page, ctx, errores, imagenes };
  }
  const tarjetas = (page) => page.evaluate(() => [...document.querySelectorAll('#categorias-grid .cat-foto')].map((a) => ({ clave: a.dataset.clave, nombre: a.querySelector('.cat-foto-nombre span').textContent.trim(), src: a.querySelector('img').getAttribute('src'), href: a.getAttribute('href') })));
  const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
  const SIN_OFERTAS = (n = 24) => productosPrueba(n).map(({ precioOferta, precioOfertaTarjeta, ...r }) => r);

  await t('UBICACIÓN: la sección "COMPRAR POR CATEGORÍA" está justo después de "Nuevos ingresos" y antes de "Destacados"; ya no hay fila de chips debajo del banner; el título tiene la tipografía de los demás', async () => {
    const { page, ctx, errores } = await abrir({ perfil: 'pc' });
    const p = await page.evaluate(() => { const y = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : null; }; const tit = (s) => { const e = document.querySelector(s + ' .section-title'); const cs = getComputedStyle(e); return { texto: e.innerText.trim(), ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, ls: cs.letterSpacing, tt: cs.textTransform }; };
      return { hero: document.getElementById('hero-rot').getBoundingClientRect().bottom + scrollY, nuevos: y('#nuevos-section'), cat: y('#categorias-section'), destacados: y('#destacados-section'), ofertas: y('#ofertas-section'), chips: document.querySelectorAll('#chips-cat, .chip-cat, .chips-cat').length, tNuevos: tit('#nuevos-section'), tCat: tit('#categorias-section'), tDest: tit('#destacados-section') }; });
    assert.ok(p.nuevos < p.cat && p.cat < p.destacados && p.destacados < p.ofertas, 'orden: nuevos < categorías < destacados < ofertas'); assert.equal(p.chips, 0, 'sin chips'); assert.ok(p.nuevos - p.hero < 80, 'Nuevos ingresos pegado al banner: ' + (p.nuevos - p.hero));
    assert.equal(p.tCat.texto.toUpperCase(), 'COMPRAR POR CATEGORÍA'); assert.deepEqual(p.tCat, { ...p.tNuevos, texto: p.tCat.texto }); assert.deepEqual(p.tCat, { ...p.tDest, texto: p.tCat.texto }); assert.ok(p.tCat.ff.includes('Anton'));
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });
  await t('FOTO CARGADA: la categoría con foto cargada en StockMGR la usa (achicada); las demás usan la foto principal de su último producto; solo las categorías con productos', async () => {
    const { page, ctx, imagenes } = await abrir({ perfil: 'iphone' });
    const c = await tarjetas(page); assert.deepEqual(c.map((x) => x.clave), ['camisetas', 'conjuntos', 'chombas', 'remeras']); assert.deepEqual(c.map((x) => x.nombre), ['Camisetas', 'Conjuntos', 'Chombas', 'Remeras']);
    assert.equal(c[0].src, fotoCloudinary(CARGADA, 'categoria')); assert.match(c[0].src, /w_600/);
    // último producto de cada categoría = el de fecha de alta más nueva (en los datos de prueba, el de menor número): prueba2, prueba3, prueba4
    assert.match(c[1].src, /prueba2_1\.jpg$/); assert.match(c[2].src, /prueba3_1\.jpg$/); assert.match(c[3].src, /prueba4_1\.jpg$/);
    assert.deepEqual(c.map((x) => x.href), ['#cat=camisetas', '#cat=conjuntos', '#cat=chombas', '#cat=remeras']); await ctx.close();
  });
  await t('SIN FOTO CARGADA (campo inexistente, vacío o inválido): todas usan la foto del último producto de su categoría, elegido por FECHA DE ALTA (no por el orden de la lista)', async () => {
    const lista = SIN_OFERTAS(24); lista[4].creadoEn = 1800000000000; // otra camiseta (prueba5) pasa a ser la más nueva de su categoría
    for (const cfg of [{}, null, { fotosCategorias: {} }, { fotosCategorias: 'x' }, { fotosCategorias: { Camisetas: 'http://x.com/a.jpg' } }]) {
      const { page, ctx } = await abrir({ perfil: 'iphone', cfg, catalogo: lista }); const c = await tarjetas(page);
      assert.equal(c.length, 4, JSON.stringify(cfg)); assert.match(c[0].src, /prueba5_1\.jpg$/, 'camisetas: la más nueva por fecha de alta'); assert.match(c[1].src, /prueba2_1\.jpg$/); await ctx.close();
    }
  });
  await t('CATEGORÍA SIN PRODUCTOS: no se muestra aunque tenga foto cargada (Gorras); y si no queda ninguna categoría con productos no hay sección ni hueco', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone', cfg: { fotosCategorias: { Gorras: CLD('gorras'), Camisetas: CARGADA } } }); assert.equal((await tarjetas(page)).some((x) => x.clave === 'gorras'), false); assert.equal((await tarjetas(page)).length, 4); await ctx.close();
    const v = await abrir({ perfil: 'iphone', cfg: { fotosCategorias: { Camisetas: CARGADA } }, catalogo: [] }); assert.equal(await visible(v.page, '#categorias-section'), false); assert.equal(await v.page.evaluate(() => document.getElementById('categorias-section').getBoundingClientRect().height), 0, 'sin hueco'); await v.ctx.close();
    const s = await abrir({ perfil: 'iphone', catalogo: SIN_OFERTAS(24).filter((p) => /^(camiseta|conjunto)\|/.test(p.id)) }); assert.deepEqual((await tarjetas(s.page)).map((x) => x.clave), ['camisetas', 'conjuntos']); await s.ctx.close();
  });
  await t('CANTIDAD IMPAR: en celular (2 columnas) la última ocupa todo el ancho; con cantidad par ninguna; en PC son 4 columnas', async () => {
    const geom = (page) => page.evaluate(() => { const g = document.getElementById('categorias-grid'); const gr = g.getBoundingClientRect(); const gcs = getComputedStyle(g); const util = gr.width - parseFloat(gcs.paddingLeft) - parseFloat(gcs.paddingRight); const cs = [...g.querySelectorAll('.cat-foto')].map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left - gr.left) }; }); return { ancho: Math.round(util), cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, cs }; });
    const tres = SIN_OFERTAS(24).filter((p) => /^(camiseta|conjunto|chomba)/.test(p.id));
    for (const perfil of ['iphone', 'android']) {
      const { page, ctx } = await abrir({ perfil, catalogo: tres }); const g = await geom(page); assert.equal(g.cols, 2); assert.equal(g.cs.length, 3);
      assert.ok(Math.abs(g.cs[2].w - g.ancho) <= 1, `${perfil}: la tercera ocupa el ancho completo (${g.cs[2].w} de ${g.ancho})`); assert.ok(g.cs[0].w < g.ancho / 2 + 1 && Math.abs(g.cs[0].w - g.cs[1].w) <= 1); await ctx.close();
      const p4 = await abrir({ perfil }); const g4 = await geom(p4.page); assert.equal(g4.cs.length, 4); assert.ok(g4.cs.every((c) => Math.abs(c.w - g4.cs[0].w) <= 1), perfil + ': con 4 todas iguales'); await p4.ctx.close();
    }
    const pc = await abrir({ perfil: 'pc' }); const gp = await geom(pc.page); assert.equal(gp.cols, 4); assert.ok(gp.cs.every((c) => Math.abs(c.w - gp.cs[0].w) <= 1) && new Set(gp.cs.map((c) => c.x)).size === 4, 'PC: 4 columnas en una fila'); await pc.ctx.close();
  });
  await t('LA TARJETA: horizontal 4:3, foto a pantalla completa (cover), esquinas redondeadas, degradé oscuro abajo y el nombre en blanco (Anton) con flecha →; fotos lazy y achicadas', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const c = await page.evaluate(() => { const a = document.querySelector('#categorias-grid .cat-foto'); const r = a.getBoundingClientRect(), i = a.querySelector('img'), ir = i.getBoundingClientRect(), n = a.querySelector('.cat-foto-nombre'), nr = n.getBoundingClientRect(); const cs = getComputedStyle(a); const af = getComputedStyle(a, '::after'); return { prop: r.width / r.height, radio: parseFloat(cs.borderTopLeftRadius), fit: getComputedStyle(i).objectFit, imgLlena: Math.abs(ir.width - r.width) < 1 && Math.abs(ir.height - r.height) < 1, grad: af.backgroundImage, color: getComputedStyle(n).color, ff: getComputedStyle(n).fontFamily, flecha: a.querySelector('.cat-foto-flecha').textContent, nombreAbajo: nr.top > r.top + r.height * 0.55, dentro: nr.left >= r.left && nr.right <= r.right + 0.5, lazy: i.loading, wh: i.getAttribute('width') + 'x' + i.getAttribute('height'), tag: a.tagName }; });
    assert.ok(Math.abs(c.prop - 4 / 3) < 0.02, '4:3: ' + c.prop); assert.ok(c.radio >= 12); assert.equal(c.fit, 'cover'); assert.ok(c.imgLlena); assert.match(c.grad, /linear-gradient/); assert.match(c.grad, /rgba\(0, 0, 0/); assert.equal(c.color, 'rgb(255, 255, 255)'); assert.ok(c.ff.includes('Anton')); assert.equal(c.flecha, '→'); assert.ok(c.nombreAbajo && c.dentro); assert.equal(c.lazy, 'lazy'); assert.equal(c.wh, '400x300'); assert.equal(c.tag, 'A'); await ctx.close();
  });
  await t('IMÁGENES: solo se piden las fotos de la sección cuando se acerca a la pantalla (lazy) y todas de Cloudinary achicadas (w_600), nunca la foto de 1200 px entera', async () => {
    const { page, ctx, imagenes } = await abrir({ perfil: 'iphone' });
    await page.evaluate(() => { const s = document.getElementById('categorias-section'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 80, behavior: 'instant' }); }); await esp(900);
    const dom = await page.evaluate(() => [...document.querySelectorAll('#categorias-grid img')].map((i) => i.currentSrc)); assert.equal(dom.length, 4); assert.ok(dom.every((u) => /f_auto,q_auto:eco,c_limit,w_600\//.test(u)), dom.join('\n'));
    assert.equal(imagenes.some((u) => u === CARGADA), false, 'no se pidió la original sin achicar'); assert.ok(dom.every((u) => imagenes.includes(u)), 'las 4 ya cargaron'); await ctx.close();
  });
  await t('QUITAR / CAMBIAR en vivo: si StockMGR cambia o quita la foto con la tienda abierta, la tarjeta se actualiza sola (quitar = vuelve a la última foto)', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); assert.equal((await tarjetas(page))[0].src, fotoCloudinary(CARGADA, 'categoria'));
    await page.evaluate((u) => window.__SERVIDOR.emitirConfig({ fotosCategorias: { Camisetas: u } }), CLD('otra-camisetas')); await esp(400); assert.equal((await tarjetas(page))[0].src, fotoCloudinary(CLD('otra-camisetas'), 'categoria'));
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({ fotosCategorias: {} })); await esp(400); const c = await tarjetas(page); assert.match(c[0].src, /prueba1_1\.jpg$/, 'quitada: la del último producto'); assert.equal(c.length, 4);
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({})); await esp(400); assert.equal((await tarjetas(page)).length, 4); await ctx.close();
  });
  await t('EL CLIC abre la vista de esa categoría (#cat=…, mismo título y productos que los chips de antes) y ATRÁS vuelve a la portada en el MISMO scroll; Ctrl/Cmd+clic no se toca', async () => {
    for (const perfil of ['iphone', 'pc']) {
      const { page, ctx } = await abrir({ perfil }); await page.evaluate(() => { const s = document.getElementById('categorias-section'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); }); await esp(500); const y0 = await page.evaluate(() => Math.round(scrollY)); assert.ok(y0 > 300, 'scroll de la portada: ' + y0);
      await page.evaluate(() => document.querySelector('#categorias-grid .cat-foto[data-clave="remeras"]').click()); await esp(600);
      assert.equal(await page.evaluate(() => location.hash), '#cat=remeras'); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Remeras'); assert.ok(await page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-cat')].every((x) => /remera/i.test(x.textContent))));
      assert.equal(await visible(page, '#categorias-section'), false, 'en la vista no se ve la portada'); assert.ok((await page.evaluate(() => scrollY)) < 50);
      await page.goBack(); await esp(900); assert.equal(await page.evaluate(() => location.hash), ''); assert.equal(await visible(page, '#categorias-section'), true); const y1 = await page.evaluate(() => Math.round(scrollY)); assert.ok(Math.abs(y1 - y0) <= 4, `${perfil}: scroll restaurado ${y0} → ${y1}`);
      const dp = await page.evaluate(() => { const e = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }); document.querySelector('#categorias-grid .cat-foto').dispatchEvent(e); return e.defaultPrevented; }); assert.equal(dp, false, 'Ctrl+clic: el navegador lo abre en otra pestaña');
      await ctx.close();
    }
  });
  await t('cada tarjeta lleva a SU categoría (las 4) y entrando directo por ese link anda igual', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    for (const [clave, re] of [['camisetas', /camiseta/i], ['conjuntos', /conjunto/i], ['chombas', /chomba/i], ['remeras', /remera/i]]) {
      await page.evaluate((c) => document.querySelector(`#categorias-grid .cat-foto[data-clave="${c}"]`).click(), clave); await esp(450); assert.equal(await page.evaluate(() => location.hash), '#cat=' + clave); assert.ok(await page.evaluate((s) => { const x = [...document.querySelectorAll('#grid > .card .card-cat')]; return x.length > 0 && x.every((e) => new RegExp(s, 'i').test(e.textContent)); }, re.source)); await page.goBack(); await esp(500);
    }
    await ctx.close(); const d = await abrir({ perfil: 'iphone', url: '/index.html#cat=conjuntos' }); assert.equal(await d.page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Conjuntos'); await d.ctx.close();
  });
  await t('SIN LECTURAS EXTRA: la visita sigue leyendo 3 documentos (config + catálogo + localidades) con las fotos de categorías; abrir una categoría y volver tampoco lee nada', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' }); await page.evaluate(() => document.querySelector('#categorias-grid .cat-foto').click()); await esp(300); await page.goBack(); await esp(500);
    const l = await page.evaluate(() => ({ ...window.__LECT })); assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.config, 1); assert.equal(l.catalogo_col + l.envios_col, 0); await ctx.close();
  });
  await t('SIN SALTOS (CLS ≈ 0) y sin desborde horizontal, con y sin foto cargada, en iPhone, Android y PC', async () => {
    for (const perfil of ['iphone', 'android', 'pc']) for (const cfg of [{ fotosCategorias: { Camisetas: CARGADA } }, {}]) {
      const ctx = await browser.newContext(PERFILES[perfil]);
      await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); } if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return r.abort(); });
      const page = await ctx.newPage(); const errores = []; page.on('pageerror', (e) => errores.push(e.message));
      await page.addInitScript(guion(24, 152));
      await page.addInitScript(({ cfg }) => { window.__MOCK = { config: cfg, catalogoDemora: 700 }; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, { cfg });
      await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(900);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); const v = await page.evaluate(() => window.__cls);
      if (process.env.DEBUG) console.log(`   ${perfil} ${Object.keys(cfg).length ? 'con' : 'sin'} foto cargada: CLS ${v.toFixed(3)}`);
      assert.ok(d <= 1, `${perfil} desborde ${d}`); assert.equal(errores.length, 0, errores.join(' | ')); assert.ok(v <= 0.03, `${perfil}: CLS ${v.toFixed(3)}`); await ctx.close();
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
        const { page, ctx } = await abrir({ perfil, catalogo: SIN_OFERTAS(48) });
        await page.evaluate(() => { const s = document.getElementById('categorias-section'); window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + scrollY - 80), behavior: 'instant' }); }); await esp(1200);
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `categorias-${perfil}.png`) }); await ctx.close();
      }
    });
  }
  await t('ninguna prueba salió a internet real (solo el doble y el servidor local)', () => assert.deepEqual(pedidosReales.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
