// ══════════════════════════════════════════
// PRUEBAS DE LA SECCIÓN "NUESTROS VIDEOS" (TikTok): videos-tiktok.js, videos-tiktok-ui.js, portada-normal.js, app.js, analytics.js.
// NO toca el Firestore real: usa el doble de test-doble-firebase.mjs (la config con `videosTiktok` la pone cada prueba) y bloquea internet.
//   A) puras: limpieza/validación de links, normalización de la lista, tarjeta, que el campo falte, evento de Analytics.
//   B) navegador (Chrome, iPhone / Android / PC): sin videos no hay sección ni hueco; con videos se ve (al final, debajo de Ofertas, antes del texto
//      de la portada y del footer); solo en la portada normal; links con target/rel correctos; sin scripts ni iframes de TikTok; evento click_tiktok;
//      imágenes lazy con 9:16 reservado; sin desborde ni saltos; sin lecturas extra.
// Uso: node test-tiktok.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
//      CAPTURAS=<carpeta> guarda capturas de la sección en iPhone, Android y PC.
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { limpiarLinkTiktok, portadaValida, limpiarTitulo, normalizarVideos, tarjetaVideoHtml, URL_PERFIL, MAX_VIDEOS } from './videos-tiktok.js';
import { eventos } from './analytics.js';
import { dobleFirebase, guion, productosPrueba, PNG } from './test-doble-firebase.mjs';

let ok = 0, fallos = 0;
const t = async (n, f) => { if (process.env.SOLO && !n.includes(process.env.SOLO)) return; try { await f(); ok++; console.log('ok', n); } catch (e) { fallos++; console.log('FALLA', n, '\n   ', String(e.message).split('\n').slice(0, 3).join('\n    ')); } };

const L1 = 'https://www.tiktok.com/@tiendapremium.ok/video/7701101006259571989';
const L2 = 'https://www.tiktok.com/@tiendapremium.ok/video/7699253846605892885';
const L3 = 'https://www.tiktok.com/@tiendapremium.ok/video/7698876670391979284';
const PORT = (i) => `https://res.cloudinary.com/d5fzjp10/image/upload/v1/tiktok${i}.jpg`;
const VIDEOS = [{ url: L1, portada: PORT(1), titulo: 'Nuevos ingresos de la semana' }, { url: L2, portada: PORT(2), titulo: '' }, { url: L3, portada: PORT(3), titulo: 'Así llega tu pedido' }];

console.log('— A) lógica pura —');
await t('limpiarLinkTiktok: los 3 links de ejemplo quedan iguales; los parámetros de rastreo se sacan; www/m/http/barra final se normalizan', () => {
  for (const l of [L1, L2, L3]) assert.deepEqual(limpiarLinkTiktok(l), { url: l, id: l.split('/').pop() });
  assert.equal(limpiarLinkTiktok(L1 + '?is_from_webapp=1&sender_device=pc&web_id=7433').url, L1);
  assert.equal(limpiarLinkTiktok(L1 + '?_r=1&_t=ZM-8x#frag').url, L1); assert.equal(limpiarLinkTiktok('  ' + L1 + '/ ').url, L1);
  assert.equal(limpiarLinkTiktok('http://tiktok.com/@tiendapremium.ok/video/7701101006259571989').url, L1); assert.equal(limpiarLinkTiktok('https://m.tiktok.com/@tiendapremium.ok/video/7701101006259571989?x=1').url, L1);
  assert.equal(limpiarLinkTiktok('https://WWW.TikTok.com/@Tienda_Premium.ok/video/7701101006259571989').url, 'https://www.tiktok.com/@Tienda_Premium.ok/video/7701101006259571989');
});
await t('limpiarLinkTiktok: rechaza lo que no es un video de tiktok.com con forma /@usuario/video/NÚMERO', () => {
  for (const mal of ['', '   ', null, undefined, 42, 'hola', 'https://www.tiktok.com/@tiendapremium.ok', 'https://www.tiktok.com/@tiendapremium.ok/video/', 'https://www.tiktok.com/@tiendapremium.ok/video/abc', 'https://www.tiktok.com/@tiendapremium.ok/video/123', 'https://www.tiktok.com/tiendapremium.ok/video/7701101006259571989', 'https://vm.tiktok.com/ZMabc123/', 'https://www.tiktok.com/t/ZTabc/', 'https://evil.com/@tiendapremium.ok/video/7701101006259571989', 'https://www.tiktok.com.evil.com/@a/video/7701101006259571989', 'https://evil.com/?u=https://www.tiktok.com/@a/video/7701101006259571989', 'javascript:alert(1)', 'https://www.tiktok.com/@a b/video/7701101006259571989', 'https://www.tiktok.com/@a/video/7701101006259571989/extra', 'https://www.youtube.com/watch?v=abc']) assert.equal(limpiarLinkTiktok(mal), null, String(mal));
});
await t('portada y título: solo https; el título se acomoda (espacios, máximo 60)', () => {
  assert.equal(portadaValida(PORT(1)), true); for (const mal of ['', null, undefined, 'http://x.com/a.jpg', 'javascript:alert(1)', 'https://x.com/a b.jpg', 'https://x.com/"onerror=1', 42, {}]) assert.equal(portadaValida(mal), false, String(mal));
  assert.equal(limpiarTitulo('  Hola    mundo \n'), 'Hola mundo'); assert.equal(limpiarTitulo('x'.repeat(100)).length, 60); assert.equal(limpiarTitulo(null), '');
});
await t('normalizarVideos: los 3 videos de ejemplo quedan en orden, con id y título; entra de a 6 como máximo', () => {
  const n = normalizarVideos(VIDEOS); assert.deepEqual(n.map((v) => v.url), [L1, L2, L3]); assert.equal(n[0].id, '7701101006259571989'); assert.equal(n[1].titulo, ''); assert.equal(n[2].titulo, 'Así llega tu pedido');
  const muchos = Array.from({ length: 9 }, (_, i) => ({ url: `https://www.tiktok.com/@a/video/77011010062595719${10 + i}`, portada: PORT(i) })); assert.equal(MAX_VIDEOS, 6); assert.equal(normalizarVideos(muchos).length, 6);
});
await t('normalizarVideos: el campo no existe, no es lista o trae basura → lista vacía; descarta links inválidos, sin portada, repetidos y limpia parámetros', () => {
  for (const x of [undefined, null, 'x', 5, {}, [], [null, 1, 'a', []]]) assert.deepEqual(normalizarVideos(x), [], JSON.stringify(x));
  const n = normalizarVideos([{ url: L1 + '?is_from_webapp=1', portada: PORT(1) }, { url: L1, portada: PORT(9) }, { url: 'https://vm.tiktok.com/abc', portada: PORT(2) }, { url: L2 }, { url: L2, portada: 'http://x.com/a.jpg' }, { url: L3, portada: PORT(3), titulo: '<b>Hola</b>' }]);
  assert.deepEqual(n.map((v) => v.url), [L1, L3]); assert.equal(n[0].portada, PORT(1), 'el repetido se descarta'); assert.equal(n[1].titulo, '<b>Hola</b>', 'el título se guarda tal cual (se escapa al dibujar)');
});
await t('tarjetaVideoHtml: link con target="_blank" y rel="noopener noreferrer", portada lazy, ícono de play, título y "Ver en TikTok"; escapa el título; sin título no hay línea de título', () => {
  const v = normalizarVideos(VIDEOS); const h = tarjetaVideoHtml(v[0], 0, PORT(1));
  assert.match(h, new RegExp('^<a class="vt-card" href="' + L1.replace(/[.]/g, '\\.') + '" target="_blank" rel="noopener noreferrer"')); assert.match(h, /data-tiktok="tarjeta" data-pos="1"/); assert.match(h, /<img src="[^"]+" width="180" height="320" loading="lazy"/); assert.match(h, /class="vt-play"/); assert.match(h, /Nuevos ingresos de la semana/); assert.match(h, /Ver en TikTok</);
  assert.equal(/vt-titulo/.test(tarjetaVideoHtml(v[1], 1, PORT(2))), false, 'sin título'); const x = tarjetaVideoHtml({ url: L1, portada: PORT(1), titulo: '"><img src=x onerror=alert(1)>' }, 0, PORT(1)); assert.equal(/<img src=x/.test(x), false); assert.match(x, /&lt;img src=x onerror=alert\(1\)&gt;/);
  for (const prohibido of [/<script/i, /<iframe/i, /<video/i, /<embed/i, /<blockquote/i]) assert.equal(prohibido.test(h), false, 'no incrusta nada: ' + prohibido);
});
await t('ANALYTICS: click_tiktok = ubicación (tarjeta / ver_mas) + posición 1–6; sin datos del visitante', () => {
  assert.deepEqual(eventos.click_tiktok({ ubicacion: 'tarjeta', posicion: '2' }), { ubicacion: 'tarjeta', posicion: 2 }); assert.deepEqual(eventos.click_tiktok({ ubicacion: 'ver_mas' }), { ubicacion: 'ver_mas' });
  assert.deepEqual(Object.keys(eventos.click_tiktok({ ubicacion: 'tarjeta', posicion: 1, url: L1, titulo: 'x' })).sort(), ['posicion', 'ubicacion']);
});
await t('el perfil del enlace "Ver más en TikTok →" es @tiendapremium.ok', () => assert.equal(URL_PERFIL, 'https://www.tiktok.com/@tiendapremium.ok'));

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
  const PERFILES = { iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, android: { ...devices['Pixel 7'] }, pc: { viewport: { width: 1366, height: 800 } } };
  const pedidos = [], tiktokPedidos = [];

  async function abrir({ cfg = { videosTiktok: VIDEOS }, url = '/index.html', perfil = 'iphone', mock = {}, catalogo } = {}) {
    const ctx = await browser.newContext(PERFILES[perfil]);
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      if (/tiktok\.com/.test(u)) { tiktokPedidos.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>tiktok de mentira</body></html>' }); }
      pedidos.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [], consola = [];
    page.on('pageerror', (e) => errores.push(e.message)); page.on('console', (m) => consola.push(m.text()));
    await page.addInitScript(guion(24, 152));
    await page.addInitScript((m) => { window.__MOCK = m; }, { config: cfg, catalogoDemora: 250, ...(catalogo ? { catalogo } : {}), ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 });
    await esp(350);
    return { page, ctx, errores, consola };
  }
  const visible = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, id);

  await t('SIN videos (campo inexistente, lista vacía o solo basura): no hay sección ni hueco; la tienda anda igual', async () => {
    for (const cfg of [{}, null, { videosTiktok: [] }, { videosTiktok: 'x' }, { videosTiktok: [{ url: 'https://vm.tiktok.com/abc', portada: PORT(1) }, { url: L1 }] }]) {
      const { page, ctx, errores } = await abrir({ cfg, perfil: 'iphone' });
      assert.equal(await visible(page, 'videos-section'), false, JSON.stringify(cfg)); assert.equal(await page.evaluate(() => document.getElementById('videos-section').getBoundingClientRect().height), 0, 'sin hueco');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.vt-card').length), 0); assert.ok(await page.evaluate(() => document.querySelectorAll('.card').length) > 0, 'la tienda anda igual');
      assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
    }
  });
  await t('CON videos: la sección "NUESTROS VIDEOS" está al final de la portada: debajo de Nuevos ingresos, Destacados y Ofertas, y antes del botón "Ver todo el catálogo" y del texto/datos de envío; título igual de grande que el de Ofertas', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    assert.equal(await visible(page, 'videos-section'), true);
    const p = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; const sec = document.getElementById('videos-section'); const tit = sec.querySelector('.section-title'); const of = document.querySelector('#ofertas-section .section-title');
      return { videos: y(sec), ofertas: y(document.getElementById('ofertas-section')), boton: y(document.getElementById('ver-todo-caja')), destacados: y(document.getElementById('destacados-section')), nuevos: y(document.getElementById('nuevos-section')), inicio: y(document.querySelector('.inicio-texto')), info: y(document.querySelector('.info-franja')), titulo: tit.innerText.trim(), fs: getComputedStyle(tit).fontSize, fsOf: getComputedStyle(of).fontSize, ff: getComputedStyle(tit).fontFamily, verMas: sec.querySelector('.videos-ver-mas').innerText.trim() }; });
    assert.ok(p.videos > p.ofertas, 'debajo de Ofertas'); assert.ok(p.videos > p.destacados && p.videos > p.nuevos, 'debajo de Nuevos ingresos y Destacados'); assert.ok(p.videos < p.boton, 'antes del botón "Ver todo el catálogo"'); assert.ok(p.videos < p.inicio && p.videos < p.info, 'antes del texto y los datos de envío');
    assert.equal(p.titulo.toUpperCase(), 'NUESTROS VIDEOS'); assert.equal(p.fs, p.fsOf, 'mismo tamaño que el título de Ofertas'); assert.ok(p.ff.includes('Anton')); assert.equal(p.verMas, 'Ver más en TikTok →'); await ctx.close();
  });
  await t('sin ofertas cargadas igual queda al final (debajo de Destacados y antes del botón "Ver todo el catálogo" y del texto de la portada)', async () => {
    const sin = productosPrueba(24).map(({ precioOferta, precioOfertaTarjeta, ...r }) => r); const { page, ctx } = await abrir({ perfil: 'iphone', catalogo: sin });
    assert.equal(await visible(page, 'ofertas-section'), false); assert.equal(await visible(page, 'videos-section'), true);
    const p = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; return { videos: y(document.getElementById('videos-section')), destacados: y(document.getElementById('destacados-section')), boton: y(document.getElementById('ver-todo-caja')), inicio: y(document.querySelector('.inicio-texto')) }; });
    assert.ok(p.videos > p.destacados && p.videos < p.boton && p.boton < p.inicio); await ctx.close();
  });
  await t('LINKS: cada tarjeta es un <a> con el link del video (limpio), target="_blank" y rel="noopener noreferrer"; el enlace "Ver más en TikTok →" va al perfil con los mismos atributos', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone', cfg: { videosTiktok: [{ url: L1 + '?is_from_webapp=1&sender_device=pc', portada: PORT(1), titulo: 'Uno' }, { url: L2, portada: PORT(2) }, { url: L3, portada: PORT(3), titulo: 'Tres' }] } });
    const c = await page.evaluate(() => [...document.querySelectorAll('#videos-strip a')].map((a) => ({ tag: a.tagName, href: a.href, target: a.target, rel: a.rel, pos: a.dataset.pos })));
    assert.deepEqual(c.map((x) => x.href), [L1, L2, L3]); for (const x of c) { assert.equal(x.tag, 'A'); assert.equal(x.target, '_blank'); assert.equal(x.rel, 'noopener noreferrer'); } assert.deepEqual(c.map((x) => x.pos), ['1', '2', '3']);
    const v = await page.evaluate(() => { const a = document.querySelector('.videos-ver-mas'); return { href: a.href, target: a.target, rel: a.rel }; }); assert.deepEqual(v, { href: URL_PERFIL, target: '_blank', rel: 'noopener noreferrer' }); await ctx.close();
  });
  await t('al tocar una tarjeta se abre el video en una pestaña NUEVA (sin opener) y la tienda queda como estaba', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#videos-strip .vt-card:nth-child(2)')]);
    await popup.waitForURL(L2, { timeout: 5000 }).catch(() => {}); assert.equal(popup.url(), L2, 'url de la pestaña nueva: ' + popup.url()); assert.equal(await popup.evaluate(() => window.opener), null, 'noopener: la pestaña nueva no puede tocar la tienda');
    assert.equal(page.url().startsWith(BASE), true); assert.equal(await visible(page, 'videos-section'), true); await popup.close(); await ctx.close();
  });
  await t('SIN scripts ni reproductor de TikTok: ningún <script>, <iframe>, <video>, <embed> ni <blockquote> de TikTok; ningún pedido a tiktok.com al cargar la tienda', async () => {
    tiktokPedidos.length = 0; const { page, ctx } = await abrir({ perfil: 'iphone' });
    const d = await page.evaluate(() => ({ scripts: [...document.scripts].map((s) => s.src).filter((s) => { try { return /tiktok|ttwstatic|byteoversea/i.test(new URL(s).hostname); } catch { return false; } }), iframes: document.querySelectorAll('iframe').length, videos: document.querySelectorAll('video, embed, blockquote.tiktok-embed, [class*="tiktok-embed"]').length, inline: [...document.scripts].some((s) => /tiktok\.com\/embed|embed\.js/i.test(s.textContent)) }));
    assert.deepEqual(d, { scripts: [], iframes: 0, videos: 0, inline: false }, JSON.stringify(d)); assert.deepEqual(tiktokPedidos, [], 'no se pidió nada a tiktok.com'); await ctx.close();
    for (const f of ['videos-tiktok.js', 'videos-tiktok-ui.js', 'portada-normal.js']) assert.equal(/createElement\(['"]script['"]\)|embed\.js|tiktok\.com\/embed/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')), false, f + ' no carga scripts');
  });
  await t('ANALYTICS: tocar una tarjeta o "Ver más en TikTok →" registra click_tiktok (ubicación y posición, sin datos personales)', async () => {
    const { page, ctx, consola } = await abrir({ perfil: 'pc', url: '/index.html?analytics_debug=1' });
    await page.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest('[data-tiktok]')) e.preventDefault(); }, true)); // sin abrir pestañas
    await page.click('#videos-strip .vt-card:nth-child(3)'); await esp(200); await page.click('.videos-ver-mas'); await esp(200);
    const ev = consola.filter((m) => m.startsWith('[analytics] click_tiktok')); assert.equal(ev.length, 2, consola.join('\n'));
    assert.match(ev[0], /ubicacion: tarjeta/); assert.match(ev[0], /posicion: 3/); assert.match(ev[1], /ubicacion: ver_mas/); assert.equal(/posicion/.test(ev[1]), false);
    for (const m of ev) assert.equal(/tiktok\.com|http|@|Juan|nombre/i.test(m.replace('click_tiktok', '')), false, 'nada de links ni datos: ' + m); await ctx.close();
  });
  await t('IMÁGENES: lazy, con width/height y el espacio 9:16 reservado antes de que carguen (CLS); portadas de Cloudinary achicadas', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const m = await page.evaluate(() => [...document.querySelectorAll('.vt-card')].map((c) => { const f = c.querySelector('.vt-portada'); const r = f.getBoundingClientRect(); const i = f.querySelector('img'); return { lazy: i.loading, wh: i.getAttribute('width') + 'x' + i.getAttribute('height'), prop: r.width / r.height, ar: getComputedStyle(f).aspectRatio, src: i.getAttribute('src') }; }));
    assert.equal(m.length, 3); for (const x of m) { assert.equal(x.lazy, 'lazy'); assert.equal(x.wh, '180x320'); assert.ok(Math.abs(x.prop - 9 / 16) < 0.01, 'proporción 9:16: ' + x.prop); assert.match(x.ar, /9\s*\/\s*16/); assert.match(x.src, /f_auto,q_auto/); } await ctx.close();
  });
  await t('CARRUSEL: ~2,5 tarjetas por pantalla en celular (2 enteras + media tercera) y ~6 en PC (con un pedazo de la siguiente); scroll-snap; sin desborde horizontal', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ url: `https://www.tiktok.com/@tiendapremium.ok/video/77011010062595719${80 + i}`, portada: PORT(i), titulo: i % 2 ? 'Un título bastante largo para ver que no se encima con nada' : '' }));
    const medir = (page) => page.evaluate(() => { const vw = innerWidth; const rs = [...document.querySelectorAll('#videos-strip .vt-card')].map((c) => c.getBoundingClientRect()); const par = rs.find((r) => r.left < vw - 6 && r.right > vw + 6); return { enteras: rs.filter((r) => r.left >= -1 && r.right <= vw + 1).length, parcial: !!par, frac: par ? (vw - par.left) / par.width : 0, snap: getComputedStyle(document.getElementById('videos-strip')).scrollSnapType, sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth, w: Math.round(rs[0].width) }; });
    for (const [perfil, enteras] of [['iphone', 2], ['android', 2], ['pc', 6]]) {
      const { page, ctx, errores } = await abrir({ perfil, cfg: { videosTiktok: seis } }); const m = await medir(page);
      assert.equal(m.enteras, enteras, `${perfil}: enteras ${m.enteras} (ancho ${m.w})`); if (perfil !== 'pc') assert.ok(m.parcial, perfil + ': asoma un pedazo de la siguiente'); // en PC caben los 6 (el máximo) enteros assert.match(m.snap, /x mandatory/); assert.ok(m.sobra <= 1, perfil + ' desborde ' + m.sobra); if (perfil !== 'pc') assert.ok(m.frac > 0.25 && m.frac < 0.8, `${perfil}: ~la mitad de la tercera (${m.frac.toFixed(2)})`);
      assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
    }
  });
  await t('TEXTOS sin encimarse: título largo en dos líneas, etiqueta "Ver en TikTok" debajo, y el play centrado sobre la portada', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone', cfg: { videosTiktok: [{ url: L1, portada: PORT(1), titulo: 'Un título bastante largo para ver que se corta en dos líneas y no pisa nada' }, { url: L2, portada: PORT(2) }] } });
    const m = await page.evaluate(() => { const c = document.querySelector('#videos-strip .vt-card'); const p = c.querySelector('.vt-portada').getBoundingClientRect(), t = c.querySelector('.vt-titulo').getBoundingClientRect(), v = c.querySelector('.vt-ver').getBoundingClientRect(), pl = c.querySelector('.vt-play').getBoundingClientRect(), cr = c.getBoundingClientRect(); return { debajoT: t.top >= p.bottom - 1, debajoV: v.top >= t.bottom - 1, dentro: v.right <= cr.right + 1 && t.right <= cr.right + 1, lineas: Math.round(t.height / parseFloat(getComputedStyle(c.querySelector('.vt-titulo')).lineHeight)), cx: Math.abs((pl.left + pl.width / 2) - (p.left + p.width / 2)), cy: Math.abs((pl.top + pl.height / 2) - (p.top + p.height / 2)) }; });
    assert.ok(m.debajoT && m.debajoV && m.dentro); assert.ok(m.lineas <= 2, 'líneas ' + m.lineas); assert.ok(m.cx < 1.5 && m.cy < 1.5, `play centrado (${m.cx}, ${m.cy})`); await ctx.close();
  });
  await t('SOLO EN LA PORTADA: se ve en la portada y NO en "Todo el catálogo", en una categoría, en la vista de ofertas ni al buscar; reaparece al volver (logo o Atrás) sin recargar; la ficha es una capa que lo tapa', async () => {
    for (const perfil of ['iphone', 'pc']) {
      const { page, ctx } = await abrir({ perfil }); const vis = () => visible(page, 'videos-section'); assert.equal(await vis(), true, perfil + ': portada');
      await page.evaluate(() => { window.__marca = 'sin recargar'; });
      for (const [nombre, ir] of [['Todo el catálogo', () => page.evaluate(() => document.getElementById('ver-todo-btn').click())], ['categoría', () => page.evaluate(() => document.querySelector('.cat-card').click())], ['vista de ofertas', () => page.evaluate(() => window.verOfertas())]]) {
        await ir(); await esp(500); assert.equal(await vis(), false, nombre); await page.click('#hdr-logo'); await esp(700); assert.equal(await vis(), true, 'logo → portada (' + nombre + ')');
      }
      await page.click('#btn-lupa'); await esp(250); await page.fill('#hdr-search-input', 'boca'); await esp(700); assert.equal(await vis(), false, 'buscando'); await page.goBack(); await esp(800); assert.equal(await vis(), true, 'Atrás → portada');
      const id = await page.evaluate(() => document.querySelector('#nuevos-strip .card').getAttribute('onclick').match(/'([^']+)'/)[1]); await page.evaluate((i) => window.abrirDetalle(i), id); await esp(400);
      assert.deepEqual(await page.evaluate(() => { const o = document.getElementById('detalle-overlay'); const r = o.getBoundingClientRect(); return { fijo: getComputedStyle(o).position, ancho: Math.round(r.width) === innerWidth, alto: Math.round(r.height) === innerHeight }; }), { fijo: 'fixed', ancho: true, alto: true }, 'la ficha cubre toda la pantalla');
      await page.evaluate(() => window.cerrarDetalle()); await esp(400); assert.equal(await vis(), true, 'cerrar la ficha: sigue'); assert.equal(await page.evaluate(() => window.__marca), 'sin recargar'); await ctx.close();
    }
    const a = await abrir({ url: '/index.html#cat=ofertas', perfil: 'iphone', mock: { catalogoDemora: 300 } }); await esp(500); assert.equal(await visible(a.page, 'videos-section'), false, 'carga directa #cat=ofertas'); await a.ctx.close();
    const b = await abrir({ url: '/index.html#cat=camisetas', perfil: 'iphone', mock: { catalogoDemora: 300 } }); await esp(500); assert.equal(await visible(b.page, 'videos-section'), false, 'carga directa #cat=camisetas'); await b.ctx.close();
    const c = await abrir({ url: '/index.html#cat=todos', perfil: 'iphone', mock: { catalogoDemora: 300 } }); await esp(500); assert.equal(await visible(c.page, 'videos-section'), false, 'carga directa #cat=todos'); await c.ctx.close();
  });
  await t('EN VIVO: StockMGR carga o saca videos con la tienda abierta → aparece / desaparece la sección sin recargar', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc', cfg: {} }); assert.equal(await visible(page, 'videos-section'), false);
    await page.evaluate((v) => window.__SERVIDOR.emitirConfig({ videosTiktok: v }), VIDEOS); await esp(400); assert.equal(await visible(page, 'videos-section'), true); assert.equal(await page.evaluate(() => document.querySelectorAll('.vt-card').length), 3);
    await page.evaluate((v) => window.__SERVIDOR.emitirConfig({ videosTiktok: v.slice(0, 1) }), VIDEOS); await esp(400); assert.equal(await page.evaluate(() => document.querySelectorAll('.vt-card').length), 1);
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({})); await esp(400); assert.equal(await visible(page, 'videos-section'), false); assert.equal(await page.evaluate(() => document.getElementById('videos-section').getBoundingClientRect().height), 0); await ctx.close();
  });
  await t('SIN LECTURAS EXTRA: la visita lee 3 documentos (config + catálogo + localidades), igual que antes de los videos; un cambio de videos en vivo es la lectura de la config', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' }); const l = await page.evaluate(() => ({ ...window.__LECT })); assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.config, 1); assert.equal(l.catalogo_col + l.envios_col, 0); await ctx.close();
  });
  await t('LAYOUT: sin desborde horizontal y sin saltos de diseño (CLS ≈ 0) con y sin videos, en iPhone, Android y PC (la sección está al final)', async () => {
    for (const perfil of ['iphone', 'android', 'pc']) for (const conVideos of [true, false]) {
      const ctx = await browser.newContext(PERFILES[perfil]);
      await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); } if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return r.abort(); });
      const page = await ctx.newPage(); const errores = []; page.on('pageerror', (e) => errores.push(e.message));
      await page.addInitScript(guion(24, 152));
      await page.addInitScript(({ conVideos, VIDEOS }) => { window.__MOCK = { config: conVideos ? { videosTiktok: VIDEOS } : {}, catalogoDemora: 700 }; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, { conVideos, VIDEOS });
      await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await page.waitForSelector('html[data-catalogo-listo]', { timeout: 8000 }); await esp(900);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); const v = await page.evaluate(() => window.__cls);
      assert.ok(d <= 1, perfil + ' desborde ' + d); assert.equal(errores.length, 0, errores.join(' | ')); assert.ok(v <= 0.03, `${perfil} ${conVideos ? 'con' : 'sin'} videos: CLS ${v.toFixed(3)}`); await ctx.close();
    }
  });
  if (process.env.CAPTURAS) {
    await t('CAPTURAS de la sección "Nuestros videos" en iPhone, Android y PC', async () => {
      fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
      for (const perfil of ['iphone', 'android', 'pc']) {
        const seis = Array.from({ length: 6 }, (_, i) => ({ url: [L1, L2, L3][i % 3].replace(/\d$/, String(i)), portada: PORT(i), titulo: ['Nuevos ingresos de la semana', '', 'Así llega tu pedido', 'Camisetas retro', 'Unboxing', ''][i] }));
        const { page, ctx } = await abrir({ perfil, cfg: { videosTiktok: seis } });
        await page.evaluate(() => { const s = document.getElementById('videos-section'); window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + scrollY - 110), behavior: 'instant' }); }); await esp(900);
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-videos-${perfil}.png`) }); await ctx.close();
      }
    });
  }
  await t('ninguna prueba salió a internet real (solo el doble, el servidor local y el TikTok de mentira de la pestaña nueva)', () => assert.deepEqual(pedidos.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
