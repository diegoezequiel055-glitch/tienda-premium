// ══════════════════════════════════════════
// PRUEBAS DE LA PORTADA CORTA (vistas.js, app.js, header-menu.js, menu-desplegable.js, portada-corta.css). NO toca el Firestore real: usa el doble de
// test-doble-firebase.mjs y bloquea todo pedido a internet.
//   A) puras: claves y hash de las vistas, título, texto del botón.
//   B) navegador (Chrome, iPhone / Android / PC): la portada no tiene la grilla del catálogo ni carga sus fotos; botón "Ver todo el catálogo (N productos)";
//      "Todo el catálogo" (filtros, paginación, tarjetas) desde el botón, el menú y entrando directo por #cat=todos; chips de categorías;
//      orden de la portada; Atrás y logo vuelven a la portada con su scroll; las secciones de la portada no se ven en las vistas; sin lecturas extra; sin saltos.
// Uso: node test-portada-corta.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
//      CAPTURAS=<carpeta> guarda capturas de la portada y de la vista de catálogo.
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { claveDeHash, hashDeClave, tituloVista, textoBotonCatalogo, CLAVE_TODOS, CLAVE_OFERTAS } from './vistas.js';
import { dobleFirebase, guion, productosPrueba, PNG } from './test-doble-firebase.mjs';

let ok = 0, fallos = 0;
const t = async (n, f) => { if (process.env.SOLO && !n.includes(process.env.SOLO)) return; try { await f(); ok++; console.log('ok', n); } catch (e) { fallos++; console.log('FALLA', n, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); } };

console.log('— A) lógica pura —');
await t('claveDeHash / hashDeClave: #cat=camisetas, #cat=todos, #cat=ofertas; sin hash o con otro hash = portada', () => {
  assert.equal(claveDeHash('#cat=camisetas'), 'camisetas'); assert.equal(claveDeHash('#cat=todos'), 'todos'); assert.equal(claveDeHash('#cat=ofertas'), 'ofertas'); assert.equal(claveDeHash('#cat=Gorra%20G5'), 'Gorra G5');
  for (const x of ['', '#', '#cat=', '#otra', '#grid-titulo', null, undefined]) assert.equal(claveDeHash(x), null, String(x));
  assert.equal(hashDeClave('camisetas'), '#cat=camisetas'); assert.equal(hashDeClave(''), ''); assert.equal(hashDeClave('todos'), '#cat=todos'); assert.equal(claveDeHash(hashDeClave('a b')), 'a b');
  assert.equal(CLAVE_TODOS, 'todos'); assert.equal(CLAVE_OFERTAS, 'ofertas');
});
await t('tituloVista: Ofertas / Todo el catálogo / nombre de la categoría', () => {
  assert.equal(tituloVista('ofertas'), 'Ofertas'); assert.equal(tituloVista('todos'), 'Todo el catálogo'); assert.equal(tituloVista(''), 'Todo el catálogo'); assert.equal(tituloVista('camisetas', 'Camisetas'), 'Camisetas'); assert.equal(tituloVista('camisetas', ''), 'Todo el catálogo');
});
await t('textoBotonCatalogo: "Ver todo el catálogo (N productos)" con el número real; singular con 1; sin productos no hay botón', () => {
  assert.equal(textoBotonCatalogo(73), 'Ver todo el catálogo (73 productos)'); assert.equal(textoBotonCatalogo(1), 'Ver todo el catálogo (1 producto)'); assert.equal(textoBotonCatalogo(1234), 'Ver todo el catálogo (1.234 productos)');
  for (const x of [0, -3, null, undefined, 'x']) assert.equal(textoBotonCatalogo(x), '');
});

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
  const L = (i) => `https://www.tiktok.com/@tiendapremium.ok/video/77011010062595719${80 + i}`;
  const VIDEOS = [1, 2, 3].map((i) => ({ url: L(i), portada: `https://res.cloudinary.com/d5fzjp10/image/upload/v1/tiktok${i}.jpg`, titulo: 'Video ' + i }));

  async function abrir({ cfg = { videosTiktok: VIDEOS }, url = '/index.html', perfil = 'iphone', mock = {}, productos = 73, catalogo } = {}) {
    const ctx = await browser.newContext(PERFILES[perfil]);
    const imagenes = [];
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) { imagenes.push(u); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); }
      if (/tiktok\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>tiktok</body></html>' });
      pedidosReales.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(guion(productos, 152));
    await page.addInitScript((m) => { window.__MOCK = m; }, { config: cfg, catalogoDemora: 250, ...(catalogo ? { catalogo } : {}), ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 });
    await esp(300);
    return { page, ctx, errores, imagenes };
  }
  const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
  const hash = (page) => page.evaluate(() => location.hash);
  const cartas = (page) => page.evaluate(() => document.querySelectorAll('#grid > .card').length);
  const ID_PORTADA = ['#hero-rot', '#chips-cat', '#nuevos-section', '#destacados-section', '#ofertas-section', '#videos-section', '#ver-todo-caja'];
  const ID_VISTA = ['#grid-titulo', '.filtros', '#grid'];

  await t('PORTADA: no tiene la grilla del catálogo (ni título, filtros, grilla ni "Ver más productos") y NO carga las fotos del catálogo completo', async () => {
    const { page, ctx, imagenes, errores } = await abrir({ perfil: 'iphone' });
    for (const s of [...ID_VISTA, '#ver-mas-caja']) assert.equal(await visible(page, s), false, s + ' no se ve en la portada');
    assert.equal(await cartas(page), 0, 'la grilla no tiene tarjetas'); assert.equal(await page.evaluate(() => document.querySelectorAll('#grid img').length), 0);
    for (const s of ['#chips-cat', '#nuevos-section', '#destacados-section', '#ofertas-section', '#videos-section', '#ver-todo-caja']) assert.equal(await visible(page, s), true, s + ' se ve en la portada');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await esp(700);
    const dom = await page.evaluate(() => [...document.images].map((i) => i.currentSrc || i.src)); const fuera = imagenes.filter((u) => !dom.includes(u)); assert.deepEqual(fuera, [], 'se pidió una foto que no está en la portada: ' + fuera.slice(0, 2));
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });
  await t('ORDEN de la portada: hero, fila de categorías, Nuevos ingresos, Destacados, Ofertas, Nuestros videos, botón "Ver todo el catálogo", texto/envíos, footer', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    const y = await page.evaluate(() => { const t = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : null; }; const f = document.querySelector('footer, .footer, #pie-root'); return { hero: t('#hero-rot'), chips: t('#chips-cat'), nuevos: t('#nuevos-section'), destacados: t('#destacados-section'), ofertas: t('#ofertas-section'), videos: t('#videos-section'), boton: t('#ver-todo-caja'), texto: t('.inicio-texto'), info: t('.info-franja'), footer: f ? f.getBoundingClientRect().top + scrollY : null }; });
    const orden = ['hero', 'chips', 'nuevos', 'destacados', 'ofertas', 'videos', 'boton', 'texto', 'info']; for (let i = 1; i < orden.length; i++) assert.ok(y[orden[i]] > y[orden[i - 1]], `${orden[i]} (${y[orden[i]]}) debajo de ${orden[i - 1]} (${y[orden[i - 1]]})`);
    if (y.footer) assert.ok(y.footer > y.info); await ctx.close();
  });
  await t('BOTÓN: "Ver todo el catálogo (N productos)" con el número real, grande y de ancho completo, con el estilo de "Ver más productos", justo antes del texto de la portada', async () => {
    for (const [perfil, n] of [['iphone', 73], ['pc', 24]]) {
      const { page, ctx } = await abrir({ perfil, productos: n });
      const b = await page.evaluate(() => { const bt = document.getElementById('ver-todo-btn'); const caja = document.getElementById('ver-todo-caja'); const cr = caja.getBoundingClientRect(), br = bt.getBoundingClientRect(); const cs = getComputedStyle(bt); const ref = getComputedStyle(document.getElementById('ver-mas-btn')); return { texto: bt.textContent.trim(), clase: bt.className, anchoCaja: cr.width, ancho: br.width, alto: br.height, borde: cs.borderTopWidth + cs.borderTopStyle, radio: cs.borderTopLeftRadius, refRadio: ref.borderTopLeftRadius, refBorde: ref.borderTopWidth + ref.borderTopStyle, fw: cs.fontWeight, refFw: ref.fontWeight, siguiente: caja.nextElementSibling.className, previo: caja.previousElementSibling.id, bg: cs.backgroundColor, color: cs.color }; });
      assert.equal(b.texto, `Ver todo el catálogo (${n} productos)`); assert.match(b.clase, /ver-mas-btn/); assert.ok(b.ancho >= b.anchoCaja - (perfil === 'iphone' ? 41 : 65), `ancho completo: ${b.ancho} de ${b.anchoCaja}`); assert.ok(b.alto >= 52, 'grande: ' + b.alto);
      assert.equal(b.radio, b.refRadio); assert.equal(b.borde, b.refBorde); assert.equal(b.fw, b.refFw); assert.equal(b.siguiente, 'inicio-texto'); assert.equal(b.previo, 'videos-section'); await ctx.close();
    }
    const u = await abrir({ perfil: 'iphone', catalogo: productosPrueba(1) }); assert.equal(await u.page.evaluate(() => document.getElementById('ver-todo-btn').textContent.trim()), 'Ver todo el catálogo (1 producto)'); await u.ctx.close();
  });
  await t('el botón abre "Todo el catálogo": filtros por categoría, tarjetas, "Ver más productos (N restantes)", y la portada deja de verse (el texto/envíos y el footer siguen)', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.click('#ver-todo-btn'); await esp(500);
    assert.equal(await hash(page), '#cat=todos'); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Todo el catálogo'); assert.equal(await cartas(page), 24);
    const f = await page.evaluate(() => ({ pills: [...document.querySelectorAll('.cat-pill')].map((b) => b.dataset.cat), activa: document.querySelector('.cat-pill.active')?.dataset.cat, vermas: document.getElementById('ver-mas-btn').textContent.trim(), vermasVisible: !document.getElementById('ver-mas-caja').hidden }));
    assert.equal(f.pills[0], 'todos'); assert.ok(f.pills.length >= 3); assert.equal(f.activa, 'todos'); assert.equal(f.vermas, 'Ver más productos (49 restantes)'); assert.ok(f.vermasVisible);
    for (const s of ID_PORTADA) assert.equal(await visible(page, s), false, s + ' no se ve en la vista'); for (const s of ['#grid-titulo', '.filtros', '#grid', '#ver-mas-caja', '.inicio-texto', '.info-franja']) assert.equal(await visible(page, s), true, s + ' se ve');
    await page.click('#ver-mas-btn'); await esp(300); assert.equal(await cartas(page), 48); assert.equal(await page.evaluate(() => document.getElementById('ver-mas-btn').textContent.trim()), 'Ver más productos (25 restantes)');
    await page.click('#ver-mas-btn'); await esp(300); assert.equal(await cartas(page), 72); assert.equal(await page.evaluate(() => document.getElementById('ver-mas-btn').textContent.trim()), 'Ver los 1 restantes'.replace('los 1', 'los 1'));
    await ctx.close();
  });
  await t('los filtros de la vista funcionan: elegir una categoría la filtra (y "Todas" vuelve a todo) sin salir de la vista ni agregar entradas al historial', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    await page.click('#ver-todo-btn'); await esp(400); const largo = await page.evaluate(() => history.length);
    await page.click('.cat-pill[data-cat="camisetas"]'); await esp(300);
    assert.equal(await hash(page), '#cat=camisetas'); assert.ok(await page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-cat')].every((c) => /camiseta/i.test(c.textContent)))); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Camisetas');
    await page.click('.cat-pill[data-cat="todos"]'); await esp(300); assert.equal(await hash(page), '#cat=todos'); assert.equal(await cartas(page), 24); assert.equal(await page.evaluate(() => history.length), largo, 'vista → vista no agrega historial'); await ctx.close();
  });
  await t('el menú: "Todos los productos" → "Ver todos los productos" abre Todo el catálogo (y queda marcado); las categorías del menú abren su vista', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.click('#btn-menu'); await esp(500); await page.click('#menu-toggle'); await esp(300);
    const it = await page.evaluate(() => [...document.querySelectorAll('#menu-cats .menu-cat')].map((b) => [b.dataset.clave, b.textContent.trim()])); assert.deepEqual(it[0], ['todos', 'Ver todos los productos']);
    await page.click('#menu-cats .menu-cat[data-clave="todos"]'); await esp(700);
    assert.equal(await hash(page), '#cat=todos'); assert.equal(await cartas(page), 24); assert.equal(await page.evaluate(() => document.getElementById('menu-overlay').classList.contains('open')), false);
    await page.click('#btn-menu'); await esp(500); assert.equal(await page.evaluate(() => document.querySelector('#menu-cats .menu-cat.active')?.dataset.clave), 'todos');
    await page.click('#menu-cats .menu-cat[data-clave="conjuntos"]'); await esp(700); assert.equal(await hash(page), '#cat=conjuntos'); assert.ok(await page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-cat')].every((c) => /conjunto/i.test(c.textContent)))); await ctx.close();
  });
  await t('CHIPS: fila de categorías debajo del hero, chica y con scroll horizontal; solo categorías con productos; cada chip abre la vista de esa categoría', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const c = await page.evaluate(() => { const f = document.getElementById('chips-cat'); const r = f.getBoundingClientRect(); const chips = [...f.querySelectorAll('.chip-cat')]; return { claves: chips.map((x) => x.dataset.clave), textos: chips.map((x) => x.textContent.trim()), alto: r.height, altoChip: chips[0].getBoundingClientRect().height, ov: getComputedStyle(f).overflowX, scroll: f.scrollWidth > f.clientWidth, sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth, debajoHero: r.top >= document.getElementById('hero-rot').getBoundingClientRect().bottom - 2 }; });
    assert.deepEqual(c.claves, ['camisetas', 'conjuntos', 'chombas', 'remeras'], 'solo las categorías con productos'); assert.deepEqual(c.textos, ['Camisetas', 'Conjuntos', 'Chombas', 'Remeras']); assert.ok(c.alto <= 64 && c.altoChip <= 40, `chica: ${c.alto} / ${c.altoChip}`); assert.equal(c.ov, 'auto'); assert.ok(c.debajoHero); assert.ok(c.sobra <= 1);
    await page.click('.chip-cat[data-clave="remeras"]'); await esp(500); assert.equal(await hash(page), '#cat=remeras'); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Remeras');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-cat')].every((x) => /remera/i.test(x.textContent)))); for (const s of ID_PORTADA) assert.equal(await visible(page, s), false, s); await ctx.close();
    const m = await abrir({ perfil: 'iphone', catalogo: productosPrueba(24).filter((p) => /^(camiseta|conjunto)\|/.test(p.id)) }); assert.deepEqual(await m.page.evaluate(() => [...document.querySelectorAll('.chip-cat')].map((x) => x.dataset.clave)), ['camisetas', 'conjuntos'], 'sin productos de una categoría no hay chip'); await m.ctx.close();
  });
  await t('ENTRAR DIRECTO por #cat=todos / #cat=<categoría> / #cat=ofertas: abre esa vista sin mostrar antes la portada; un link viejo en singular o una clave rara caen en la vista correcta', async () => {
    for (const [url, esperado, titulo] of [['/index.html#cat=todos', 'todos', 'Todo el catálogo'], ['/index.html#cat=camisetas', 'camisetas', 'Camisetas'], ['/index.html#cat=camiseta', 'camisetas', 'Camisetas'], ['/index.html#cat=ofertas', 'ofertas', 'Ofertas'], ['/index.html#cat=zzzz', 'todos', 'Todo el catálogo']]) {
      const { page, ctx } = await abrir({ url, perfil: 'iphone' });
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('en-vista')), true, url); assert.equal(await hash(page), '#cat=' + esperado, url + ' → ' + (await hash(page)));
      assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), titulo, url); assert.ok((await cartas(page)) > 0, url + ': sin tarjetas'); for (const s of ID_PORTADA) assert.equal(await visible(page, s), false, url + ' ' + s);
      assert.equal(await page.evaluate(() => document.querySelector('.cat-pill.active')?.dataset.cat), esperado === 'ofertas' ? undefined : esperado, url); await ctx.close();
    }
    const { page, ctx } = await abrir({ url: '/index.html#cat=todos', perfil: 'pc', mock: { catalogoDemora: 900 } }); // antes de que llegue el catálogo ya está la vista (sin parpadeo de la portada)
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('en-vista')), true); await ctx.close();
  });
  await t('ATRÁS: desde "Todo el catálogo", desde una categoría y desde las ofertas vuelve a la portada y RESTAURA el scroll; Adelante vuelve a la vista', async () => {
    // (los clics son por JavaScript: un clic de Playwright mueve el scroll solo para llegar al elemento y taparía lo que se prueba)
    for (const abrirVista of [(p) => p.evaluate(() => document.getElementById('ver-todo-btn').click()), (p) => p.evaluate(() => document.querySelector('.chip-cat[data-clave="chombas"]').click()), (p) => p.evaluate(() => window.verOfertas())]) {
      const { page, ctx } = await abrir({ perfil: 'iphone' });
      await page.evaluate(() => { const s = document.getElementById('videos-section'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }); }); await esp(400); const y0 = await page.evaluate(() => Math.round(scrollY)); assert.ok(y0 > 800, 'scroll de la portada: ' + y0);
      await abrirVista(page); await esp(600); assert.ok((await hash(page)).startsWith('#cat=')); assert.ok(await page.evaluate(() => scrollY) < 50, 'al entrar a la vista se ve arriba');
      await page.goBack(); await esp(900);
      assert.equal(await hash(page), ''); assert.equal(await visible(page, '#videos-section'), true, 'portada visible'); assert.equal(await visible(page, '#grid'), false); const y1 = await page.evaluate(() => Math.round(scrollY)); assert.ok(Math.abs(y1 - y0) <= 4, `scroll restaurado: ${y0} → ${y1}`);
      await page.goForward(); await esp(600); assert.ok((await hash(page)).startsWith('#cat='), 'Adelante vuelve a la vista'); assert.equal(await visible(page, '#grid'), true); await ctx.close();
    }
  });
  await t('EL LOGO vuelve a la portada y restaura el scroll (desde una vista); en la portada sube; entrando directo por #cat=todos lleva a la portada arriba', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    await page.evaluate(() => { const s = document.getElementById('ofertas-section'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }); }); await esp(300); const y0 = await page.evaluate(() => Math.round(scrollY)); assert.ok(y0 > 300);
    await page.evaluate(() => document.getElementById('ver-todo-btn').click()); await esp(500); await page.click('#hdr-logo'); await esp(900); assert.equal(await hash(page), ''); assert.equal(await visible(page, '#videos-section'), true); assert.ok(Math.abs((await page.evaluate(() => Math.round(scrollY))) - y0) <= 4, 'scroll restaurado');
    await page.click('#hdr-logo'); await esp(500); assert.ok((await page.evaluate(() => scrollY)) < 5, 'en la portada el logo sube'); await ctx.close();
    const d = await abrir({ url: '/index.html#cat=todos', perfil: 'iphone' }); await d.page.click('#hdr-logo'); await esp(700); assert.equal(await hash(d.page), ''); assert.equal(await visible(d.page, '#videos-section'), true); assert.ok((await d.page.evaluate(() => scrollY)) < 5); await d.ctx.close();
  });
  await t('las secciones Ofertas y Nuestros videos NO se ven en la vista de catálogo, de categoría ni de ofertas, y reaparecen al volver a la portada (sin recargar)', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); await page.evaluate(() => { window.__marca = 'sin recargar'; });
    for (const s of ['#ofertas-section', '#videos-section']) assert.equal(await visible(page, s), true, 'portada ' + s);
    for (const ir of [() => page.click('#ver-todo-btn'), () => page.evaluate(() => window.setCategoria('camisetas')), () => page.evaluate(() => window.verOfertas())]) {
      await ir(); await esp(500); for (const s of ['#ofertas-section', '#videos-section']) assert.equal(await visible(page, s), false, s + ' en la vista ' + (await hash(page)));
      await page.click('#hdr-logo'); await esp(700); for (const s of ['#ofertas-section', '#videos-section']) assert.equal(await visible(page, s), true, 'vuelve ' + s);
    }
    assert.equal(await page.evaluate(() => window.__marca), 'sin recargar'); await ctx.close();
  });
  await t('BUSCADOR: buscar desde la portada abre "Todo el catálogo" con los resultados (una sola entrada de historial); Atrás vuelve a la portada y limpia la búsqueda', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); const largo = await page.evaluate(() => history.length);
    await page.click('#btn-lupa'); await esp(300); await page.fill('#hdr-search-input', 'bayern'); await esp(900);
    assert.equal(await hash(page), '#cat=todos'); assert.equal(await visible(page, '#grid'), true); const n = await cartas(page); assert.ok(n > 0 && n < 24, 'resultados filtrados: ' + n); assert.ok(await page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-nombre')].every((c) => /bayern/i.test(c.textContent))));
    await page.fill('#hdr-search-input', 'bayern m'); await esp(500); assert.equal(await page.evaluate(() => history.length), largo + 1, 'una sola entrada');
    await page.goBack(); await esp(800); assert.equal(await hash(page), ''); assert.equal(await visible(page, '#videos-section'), true); assert.equal(await page.evaluate(() => document.getElementById('hdr-search-input').value), '', 'la búsqueda se limpia'); await ctx.close();
  });
  await t('FICHA y links ?p=ID: el link abre la ficha sobre la portada y al cerrarla queda la portada; la ficha abierta desde una vista vuelve a esa vista; abrir una vista con la ficha abierta la cierra', async () => {
    const id = productosPrueba(1)[0].id;
    const a = await abrir({ perfil: 'iphone', url: '/index.html?p=' + encodeURIComponent(id), mock: { catalogoDemora: 400 } });
    await a.page.waitForFunction(() => document.getElementById('detalle-overlay').classList.contains('open'), null, { timeout: 5000 }); await a.page.evaluate(() => window.cerrarDetalle()); await esp(500);
    assert.equal(await hash(a.page), ''); assert.equal(await visible(a.page, '#chips-cat'), true); assert.equal(await visible(a.page, '#grid'), false); await a.ctx.close();
    const { page, ctx } = await abrir({ perfil: 'iphone' }); await page.click('#ver-todo-btn'); await esp(500);
    await page.evaluate((i) => window.abrirDetalle(i), id); await esp(500); assert.ok((await page.evaluate(() => location.search)).includes('p=')); await page.evaluate(() => window.cerrarDetalle()); await esp(700);
    assert.equal(await hash(page), '#cat=todos'); assert.equal(await visible(page, '#grid'), true); assert.equal(await page.evaluate(() => location.search), '');
    await page.evaluate((i) => window.abrirDetalle(i), id); await esp(500); await page.evaluate(() => window.setCategoria('camisetas')); await esp(900);
    assert.equal(await page.evaluate(() => document.getElementById('detalle-overlay').classList.contains('open')), false); assert.equal(await hash(page), '#cat=camisetas'); await page.goBack(); await esp(900); assert.equal(await hash(page), ''); assert.equal(await visible(page, '#chips-cat'), true); await ctx.close();
  });
  await t('"Nuevos ingresos" y "Destacados" de la barra: desde una vista vuelven a la portada y bajan a la sección', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); await page.click('#ver-todo-btn'); await esp(500);
    await page.click('a[onclick*="irANuevos"]'); await esp(1500); assert.equal(await hash(page), ''); assert.equal(await visible(page, '#nuevos-section'), true); const top = await page.evaluate(() => document.getElementById('nuevos-section').getBoundingClientRect().top); assert.ok(top > -60 && top < 200, 'quedó a la vista: ' + top); await ctx.close();
  });
  await t('el footer ("Productos") apunta a #cat=todos y, estando en la portada, abre Todo el catálogo', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' }); const h = await page.evaluate(() => [...document.querySelectorAll('#pie-root a')].map((a) => a.getAttribute('href'))); assert.ok(h.includes('index.html#cat=todos'), h.join(' | '));
    await page.click('#pie-root a[href="index.html#cat=todos"]'); await esp(700); assert.equal(await hash(page), '#cat=todos'); assert.equal(await cartas(page), 24); await page.goBack(); await esp(700); assert.equal(await visible(page, '#chips-cat'), true); await ctx.close();
  });
  await t('SIN LECTURAS EXTRA: portada, abrir el catálogo, categorías, chips, buscar y volver siguen leyendo 3 documentos', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.click('#ver-todo-btn'); await esp(300); await page.evaluate(() => window.setCategoria('camisetas')); await esp(300); await page.goBack(); await esp(500); await page.click('.chip-cat[data-clave="remeras"]'); await esp(300); await page.click('#hdr-logo'); await esp(500);
    const l = await page.evaluate(() => ({ ...window.__LECT })); assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.catalogo_col + l.envios_col, 0); await ctx.close();
  });
  await t('SIN SALTOS (CLS ≈ 0) en la portada y entrando directo a una vista; sin desborde horizontal, en iPhone, Android y PC', async () => {
    for (const perfil of ['iphone', 'android', 'pc']) for (const url of ['/index.html', '/index.html#cat=todos']) {
      const ctx = await browser.newContext(PERFILES[perfil]);
      await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); } if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return r.abort(); });
      const page = await ctx.newPage(); const errores = []; page.on('pageerror', (e) => errores.push(e.message));
      await page.addInitScript(guion(73, 152));
      await page.addInitScript(({ VIDEOS }) => { window.__MOCK = { config: { videosTiktok: VIDEOS }, catalogoDemora: 700 }; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, { VIDEOS });
      await page.goto(BASE + url, { waitUntil: 'load' }); await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(900);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); const v = await page.evaluate(() => window.__cls);
      if (process.env.DEBUG) console.log(`   ${perfil} ${url}: CLS ${v.toFixed(3)}`);
      assert.ok(d <= 1, `${perfil} ${url} desborde ${d}`); assert.equal(errores.length, 0, errores.join(' | ')); assert.ok(v <= 0.03, `${perfil} ${url}: CLS ${v.toFixed(3)}`); await ctx.close();
    }
  });
  if (process.env.CAPTURAS) {
    await t('CAPTURAS: portada corta (completa) y vista "Todo el catálogo" en iPhone, Android y PC', async () => {
      fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
      for (const perfil of ['iphone', 'android', 'pc']) {
        const { page, ctx } = await abrir({ perfil }); await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); }); await esp(900);
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `portada-${perfil}-completa.png`), fullPage: true });
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `portada-${perfil}-arriba.png`) });
        await page.click('#ver-todo-btn'); await esp(800); await page.screenshot({ path: path.join(process.env.CAPTURAS, `catalogo-${perfil}.png`) });
        console.log('   alto de la portada', perfil, await page.evaluate(() => { document.getElementById('hdr-logo').click(); return 0; }), '');
        await esp(600); console.log('   alto', perfil, await page.evaluate(() => document.documentElement.scrollHeight));
        await ctx.close();
      }
    });
  }
  await t('ninguna prueba salió a internet real (solo el doble y el servidor local)', () => assert.deepEqual(pedidosReales.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
