// ══════════════════════════════════════════
// PRUEBAS DEL MODO MANTENIMIENTO (mantenimiento.js). NO toca Firestore real: la prueba de navegador reemplaza firebase-config.js
// por un doble (mock) que entrega la config y un catálogo de mentira, y bloquea todo pedido a internet.
//   A) decidir() y htmlPantalla(): funciones puras (siempre).
//   B) Navegador real (Chrome, emulando iPhone y Android): mantenimiento apagado / encendido sin clave / con clave correcta /
//      con clave incorrecta / error de lectura / Firestore sin respuesta / cambio en vivo / sin parpadeo del catálogo /
//      Analytics sin visitas mientras está bloqueado / la pantalla ocupa todo el celular sin desborde.
// Uso: node test-mantenimiento.mjs      (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Google Chrome)
//      SOLO_PURAS=1 node test-mantenimiento.mjs   (solo A)
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import { dobleFirebase, guion, PNG } from './test-doble-firebase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decidir, htmlPantalla, MENSAJE_DEFECTO, AVISO_ADMIN } from './mantenimiento.js';

let ok = 0, fallos = 0;
const t = (nombre, f) => { try { f(); ok++; console.log('ok', nombre); } catch (e) { fallos++; console.log('FALLA', nombre, '\n   ', String(e.message).split('\n')[0]); } };
const ta = async (nombre, f) => { try { await f(); ok++; console.log('ok', nombre); } catch (e) { fallos++; console.log('FALLA', nombre, '\n   ', String(e.message).split('\n')[0]); } };

// ── A) puras ──
console.log('— A) decidir() y pantalla —');
t('apagado (false): abierto', () => assert.equal(decidir({ mantenimiento: false, mantenimientoClave: 'x' }).estado, 'abierto'));
t('sin el campo / sin config / config vacía: abierto', () => { assert.equal(decidir({}).estado, 'abierto'); assert.equal(decidir(null).estado, 'abierto'); assert.equal(decidir(undefined).estado, 'abierto'); });
t('un valor que no es el booleano true ("true", 1) NO activa el mantenimiento', () => { assert.equal(decidir({ mantenimiento: 'true' }).estado, 'abierto'); assert.equal(decidir({ mantenimiento: 1 }).estado, 'abierto'); });
t('encendido sin clave en la URL: bloqueado', () => assert.equal(decidir({ mantenimiento: true, mantenimientoClave: 'abc' }).estado, 'bloqueado'));
t('encendido con la clave correcta: autorizado', () => { const d = decidir({ mantenimiento: true, mantenimientoClave: 'abc' }, { acceso: 'abc' }); assert.equal(d.estado, 'autorizado'); assert.equal(d.clave, 'abc'); });
t('encendido con clave incorrecta: bloqueado', () => assert.equal(decidir({ mantenimiento: true, mantenimientoClave: 'abc' }, { acceso: 'abd' }).estado, 'bloqueado'));
t('la clave guardada en la sesión también autoriza, pero solo si sigue siendo la vigente', () => { assert.equal(decidir({ mantenimiento: true, mantenimientoClave: 'abc' }, { guardado: 'abc' }).estado, 'autorizado'); assert.equal(decidir({ mantenimiento: true, mantenimientoClave: 'NUEVA' }, { guardado: 'abc' }).estado, 'bloqueado'); });
t('sin clave configurada nadie entra por link (ni con acceso vacío)', () => { assert.equal(decidir({ mantenimiento: true }, { acceso: '' }).estado, 'bloqueado'); assert.equal(decidir({ mantenimiento: true, mantenimientoClave: '  ' }, { acceso: '  ' }).estado, 'bloqueado'); assert.equal(decidir({ mantenimiento: true, mantenimientoClave: '' }, { acceso: null, guardado: null }).estado, 'bloqueado'); });
t('mensaje: el configurado, o el de por defecto si está vacío', () => { assert.equal(decidir({ mantenimiento: true, mantenimientoMensaje: 'Volvemos mañana' }).mensaje, 'Volvemos mañana'); assert.equal(decidir({ mantenimiento: true, mantenimientoMensaje: '   ' }).mensaje, MENSAJE_DEFECTO); assert.equal(MENSAJE_DEFECTO, 'Estamos actualizando la tienda. Volvemos en breve.'); });
t('la pantalla lleva marca, mensaje, WhatsApp 5491156253612 e Instagram, y escapa el texto', () => {
  const h = htmlPantalla({ mensaje: '<b>hola</b>', marca: 'TIENDAPREMIUM.OK', whatsappNumero: '5491156253612', instagram: 'https://www.instagram.com/tiendapremium.ok' });
  assert.ok(h.includes('TIENDAPREMIUM.OK') && h.includes('En mantenimiento') && h.includes('https://wa.me/5491156253612') && h.includes('instagram.com/tiendapremium.ok') && h.includes('@TIENDAPREMIUM.OK'));
  assert.ok(!h.includes('<b>hola</b>') && h.includes('&lt;b&gt;hola&lt;/b&gt;'));
});
t('el aviso del dueño dice lo pedido', () => assert.equal(AVISO_ADMIN, 'Modo mantenimiento activo (solo vos lo ves)'));

// ── B) navegador ──
if (!process.env.SOLO_PURAS) {
  console.log('— B) navegador (Firestore simulado) —');
  const RAIZ = path.dirname(fileURLToPath(import.meta.url));
  async function cargarPlaywright() {
    try { return await import('playwright'); } catch {}
    if (process.env.PLAYWRIGHT_DIR) { try { return createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js'))('playwright'); } catch {} }
    console.error('No se pudo cargar Playwright. Instalalo fuera del repo y corré con PLAYWRIGHT_DIR=<carpeta> (o SOLO_PURAS=1).'); process.exit(1);
  }
  const { chromium, devices } = await cargarPlaywright();
  const servidor = await new Promise((okp) => { const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    const s = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(RAIZ, u);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(f)); }).listen(0, '127.0.0.1', () => okp(s)); });
  const BASE = `http://127.0.0.1:${servidor.address().port}`;

  // Doble compartido de firebase-config.js (test-doble-firebase.mjs): no habla con Firebase y cuenta las lecturas.
  const STUB = dobleFirebase();
  const DATOS = guion(6, 2);
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));

  // Abre la portada con un mock y devuelve { page, ctx, ... }
  async function abrir({ mock, url = '/index.html', perfil = 'iphone', preparar, analytics = false }) {
    const opciones = perfil === 'android' ? { ...devices['Pixel 7'] } : perfil === 'escritorio' ? { viewport: { width: 1366, height: 768 } } : { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const ctx = await browser.newContext(opciones);
    const page = await ctx.newPage();
    const pedidosAnalytics = [], logs = [], errores = [];
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }); return r.continue(); }
      if (/google-analytics|googletagmanager/.test(u)) { pedidosAnalytics.push(u); return r.abort(); }
      if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return r.abort(); // nada de internet real
    });
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { logs.push(m.text()); });
    await page.addInitScript(DATOS);
    await page.addInitScript((mk) => { window.__MOCK = mk; window.__tarjetasVistas = 0; new MutationObserver(() => { window.__tarjetasVistas = Math.max(window.__tarjetasVistas, document.querySelectorAll('.card').length); }).observe(document, { childList: true, subtree: true }); }, mock);
    if (preparar) await page.addInitScript(preparar);
    await page.goto(BASE + url, { waitUntil: 'load' });
    return { page, ctx, pedidosAnalytics, logs, errores };
  }
  const tarjetas = (p) => p.evaluate(() => document.querySelectorAll('.card').length);
  const hayPantalla = (p) => p.evaluate(() => { const e = document.getElementById('mant-pantalla'); return !!e && getComputedStyle(e).display !== 'none'; });
  const visibleFuera = (p) => p.evaluate(() => [...document.body.children].filter((el) => el.id !== 'mant-pantalla' && el.tagName !== 'SCRIPT' && getComputedStyle(el).display !== 'none').map((e) => e.id || e.className || e.tagName));
  const CFG = (extra) => ({ mantenimiento: true, mantenimientoMensaje: 'Estamos actualizando la tienda. Volvemos en breve.', mantenimientoClave: 'clave-correcta-123', ...extra });

  await ta('mantenimiento=false: tienda normal (catálogo, sin pantalla ni aviso ni noindex)', async () => {
    const { page, ctx, errores } = await abrir({ mock: { config: { mantenimiento: false, mantenimientoClave: 'x' } } });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false);
    assert.equal(await page.evaluate(() => !!document.getElementById('mant-aviso') || !!document.querySelector('meta[name="robots"]')), false);
    assert.equal(await page.evaluate(() => typeof window.abrirCarrito), 'function');
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });

  await ta('sin el campo mantenimiento (config vieja): tienda normal', async () => {
    const { page, ctx } = await abrir({ mock: { config: { heroTitulo: 'Hola' } } });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false); await ctx.close();
  });

  for (const perfil of ['iphone', 'android']) {
    await ta(`mantenimiento=true sin clave (${perfil}): pantalla de mantenimiento; sin catálogo ni carrito; noindex; Analytics apagado`, async () => {
      const { page, ctx, logs, pedidosAnalytics, errores } = await abrir({ mock: { config: CFG() }, perfil, url: '/index.html?analytics_debug=1' });
      await page.waitForSelector('#mant-pantalla', { timeout: 8000 }); await esp(900);
      assert.equal(await hayPantalla(page), true);
      assert.equal(await tarjetas(page), 0, 'no debe haber tarjetas en el catálogo');
      assert.equal(await page.evaluate(() => window.__tarjetasVistas), 0, 'el catálogo nunca debe haberse dibujado');
      assert.deepEqual(await visibleFuera(page), [], 'nada más visible: catálogo, carrito, menú, botón flotante');
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('carrito-overlay')).display), 'none');
      const txt = await page.evaluate(() => document.getElementById('mant-pantalla').innerText);
      assert.ok(txt.includes('TIENDAPREMIUM.OK') && /en mantenimiento/i.test(txt) && txt.includes('Estamos actualizando la tienda. Volvemos en breve.'), 'texto de la pantalla: ' + txt.split('\n').join(' / ').slice(0, 160));
      assert.equal(await page.evaluate(() => document.querySelector('.mant-btn-wa').href.includes('wa.me/5491156253612')), true);
      assert.equal(await page.evaluate(() => /instagram\.com\/tiendapremium\.ok/i.test(document.querySelector('.mant-btn-ig').href)), true);
      assert.equal(await page.evaluate(() => !!document.querySelector('meta[name="robots"][content="noindex"]')), true, 'falta noindex');
      assert.equal(await page.evaluate(() => window.__mantenimiento.bloqueado()), true);
      assert.equal(logs.filter((l) => l.includes('[analytics]')).length, 0, 'Analytics no debe registrar nada: ' + logs.filter((l) => l.includes('[analytics]')).join(' | '));
      assert.equal(pedidosAnalytics.length, 0);
      assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
    });
  }

  await ta('con mantenimiento y la clave CORRECTA: tienda normal + barra de aviso, noindex, la clave sale de la URL y se recuerda en la sesión', async () => {
    const { page, ctx, errores } = await abrir({ mock: { config: CFG() }, url: '/index.html?acceso=clave-correcta-123' });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false);
    assert.equal(await page.evaluate(() => document.getElementById('mant-aviso') && document.getElementById('mant-aviso').textContent), 'Modo mantenimiento activo (solo vos lo ves)');
    assert.equal(await page.evaluate(() => document.body.firstElementChild.id), 'mant-aviso', 'la barra va arriba de todo');
    assert.equal(await page.evaluate(() => !!document.querySelector('meta[name="robots"][content="noindex"]')), true);
    assert.equal(await page.evaluate(() => location.search.includes('acceso')), false, 'la clave no debe quedar en la URL');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mantenimientoAcceso')), 'clave-correcta-123');
    await page.goto(BASE + '/index.html', { waitUntil: 'load' }); // recarga SIN la clave: sigue autorizado en esa pestaña
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false); assert.equal(await page.evaluate(() => !!document.getElementById('mant-aviso')), true);
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });

  await ta('con mantenimiento y clave INCORRECTA: pantalla de mantenimiento y no se guarda nada', async () => {
    const { page, ctx } = await abrir({ mock: { config: CFG() }, url: '/index.html?acceso=clave-equivocada' });
    await page.waitForSelector('#mant-pantalla', { timeout: 8000 }); await esp(500);
    assert.equal(await hayPantalla(page), true); assert.equal(await tarjetas(page), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mantenimientoAcceso')), null);
    assert.equal(await page.evaluate(() => !!document.getElementById('mant-aviso')), false); await ctx.close();
  });

  await ta('mantenimiento sin clave configurada: ningún link entra', async () => {
    const { page, ctx } = await abrir({ mock: { config: { mantenimiento: true } }, url: '/index.html?acceso=' });
    await page.waitForSelector('#mant-pantalla', { timeout: 8000 }); assert.equal(await hayPantalla(page), true); await ctx.close();
  });

  await ta('error de lectura de Firestore: la tienda queda ABIERTA (sin pantalla)', async () => {
    const { page, ctx, errores } = await abrir({ mock: { configModo: 'error' } });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false); assert.equal(await page.evaluate(() => window.__mantenimiento.estado()), 'abierto');
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });

  await ta('Firestore no responde: tras ~1,5 s la tienda queda ABIERTA', async () => {
    const t0 = Date.now();
    const { page, ctx } = await abrir({ mock: { configModo: 'silencio' } });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    const ms = Date.now() - t0;
    assert.equal(await hayPantalla(page), false); assert.ok(ms >= 1300 && ms < 4000, `se abrió a los ${ms} ms (esperado ≈1500)`); await ctx.close();
  });

  await ta('SIN PARPADEO: el catálogo llega antes que la config y nunca se dibuja si hay mantenimiento', async () => {
    const { page, ctx } = await abrir({ mock: { config: CFG(), catalogoDemora: 10, configDemora: 600 } });
    await page.waitForSelector('#mant-pantalla', { timeout: 8000 }); await esp(300);
    assert.equal(await page.evaluate(() => window.__tarjetasVistas), 0, 'el catálogo se llegó a dibujar'); assert.equal(await tarjetas(page), 0); await ctx.close();
  });

  await ta('quien ya vio el mantenimiento lo ve de inmediato (antes de que responda Firestore) y se abre solo si ya no corresponde', async () => {
    const { page, ctx } = await abrir({ mock: { config: { mantenimiento: false }, configDemora: 900 }, preparar: () => { try { localStorage.setItem('mantenimientoUltimo', '1'); } catch {} } });
    await esp(250);
    assert.equal(await hayPantalla(page), true, 'la pantalla debía verse desde el principio');
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    assert.equal(await hayPantalla(page), false); await ctx.close();
  });

  await ta('EN VIVO: se activa y se desactiva con la página abierta (el catálogo reaparece al desactivar)', async () => {
    const { page, ctx } = await abrir({ mock: { config: { mantenimiento: false } } });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 });
    await page.evaluate((c) => window.__SERVIDOR.emitirConfig(c), CFG()); await page.waitForSelector('#mant-pantalla', { timeout: 4000 });
    assert.equal(await hayPantalla(page), true); assert.deepEqual(await visibleFuera(page), []);
    await page.evaluate(() => window.__SERVIDOR.emitirConfig({ mantenimiento: false })); await page.waitForFunction(() => !document.getElementById('mant-pantalla'), null, { timeout: 4000 });
    assert.ok((await tarjetas(page)) > 0); assert.equal(await page.evaluate(() => !!document.querySelector('meta[name="robots"]')), false); await ctx.close();
  });

  await ta('Analytics: con la tienda abierta sí registra (page_view en modo debug)', async () => {
    const { page, ctx, logs } = await abrir({ mock: { config: { mantenimiento: false } }, url: '/index.html?analytics_debug=1' });
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 8000 }); await esp(400);
    assert.ok(logs.some((l) => l.includes('[analytics] page_view')), 'no salió page_view'); await ctx.close();
  });

  for (const [nombre, perfil, w] of [['iPhone 375 px', 'iphone', 375], ['Android 412 px', 'android', 412], ['escritorio', 'escritorio', 1366]]) {
    await ta(`la pantalla ocupa todo el alto/ancho, sin desborde y con botones de 44 px o más (${nombre})`, async () => {
      const { page, ctx } = await abrir({ mock: { config: CFG({ mantenimientoMensaje: 'Estamos actualizando la tienda. Volvemos en breve.' }) }, perfil });
      await page.waitForSelector('#mant-pantalla', { timeout: 8000 }); await esp(300);
      const g = await page.evaluate(() => { const e = document.getElementById('mant-pantalla').getBoundingClientRect(); const b = [...document.querySelectorAll('.mant-btn')].map((x) => Math.round(x.getBoundingClientRect().height)); const int = document.querySelector('.mant-int').getBoundingClientRect();
        return { w: Math.round(e.width), h: Math.round(e.height), iw: innerWidth, ih: innerHeight, botones: b, desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth, intDentro: int.left >= 0 && int.right <= innerWidth, fondo: getComputedStyle(document.getElementById('mant-pantalla')).backgroundColor }; });
      assert.ok(g.w >= g.iw && g.h >= g.ih, `no cubre toda la pantalla: ${g.w}x${g.h} vs ${g.iw}x${g.ih}`);
      assert.equal(g.fondo, 'rgb(0, 0, 0)'); assert.ok(g.botones.length === 2 && g.botones.every((x) => x >= 44), 'botones: ' + g.botones); assert.ok(g.desborde <= 0 && g.intDentro, 'desborde ' + g.desborde); await ctx.close();
    });
  }
  await browser.close(); servidor.close();
}

console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
