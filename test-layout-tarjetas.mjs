// ══════════════════════════════════════════
// CONTROL DE CALIDAD DE LAS TARJETAS DE LA PORTADA (prueba de navegador real).
// Abre la portada en Chrome con emulación de celular/PC en 360, 375, 390, 414, 768 y 1366 px, con red lenta (Slow 4G) + CPU lenta,
// y con imágenes tardías (6 s) y bloqueadas, y verifica en "Nuevos ingresos", "Destacados", "Catálogo" y "Relacionados":
//   (a) todas las tarjetas de cada fila tienen el mismo ancho (±1 px) y la misma proporción de foto (4/5),
//   (b) ninguna mide más que un máximo razonable ni menos que un mínimo,
//   (c) la página no tiene desborde horizontal,
//   (d) el CLS (saltos de diseño) es bajo.
// Falla (exit 1) si algo se rompe. CORRERLA ANTES DE PUBLICAR cualquier cambio que toque la portada, las tarjetas o el CSS.
//
// NO LEE EL FIRESTORE REAL (ni siquiera con BASE_URL de producción): firebase-config.js se reemplaza por el doble de test-doble-firebase.mjs
// (73 productos de mentira) y las fotos de Cloudinary se sirven desde la prueba.
// Uso:   node test-layout-tarjetas.mjs            (sirve este repo solo)
//        BASE_URL=https://tiendapremium.com.ar node test-layout-tarjetas.mjs   (prueba el código ya publicado, con datos de mentira)
//        RAPIDO=1 node test-layout-tarjetas.mjs   (solo 360, 414 y 1366 px, sin imágenes tardías)
// Necesita Playwright y Google Chrome instalado. Playwright NO es parte del repo: instalarlo en otra carpeta
// (npm i playwright) y apuntar PLAYWRIGHT_DIR=<esa carpeta> (o instalarlo globalmente / en un node_modules superior).
// ══════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dobleFirebase, guion, PNG } from './test-doble-firebase.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const RAPIDO = !!process.env.RAPIDO;
const TAMANOS = (RAPIDO ? [[360, 740], [414, 896], [1366, 768]] : [[360, 740], [375, 667], [390, 844], [414, 896], [768, 1024], [1366, 768]]);
const ESCENARIOS = RAPIDO ? ['lenta', 'imagenes-bloqueadas'] : ['lenta', 'imagenes-tardias', 'imagenes-bloqueadas'];
const LIMITES = { // ancho de tarjeta permitido (px) y alto máximo
  strip: { min: 150, max: 260, altoMin: 250, altoMax: 620 },
  grid: { min: 140, max: 360, altoMin: 250, altoMax: 700 },
  relacionados: { min: 120, max: 260, altoMin: 200, altoMax: 620 },
};
const CLS_MAX = 0.1;

async function cargarPlaywright() {
  try { return await import('playwright'); } catch {}
  const dir = process.env.PLAYWRIGHT_DIR;
  if (dir) { try { return createRequire(path.join(path.resolve(dir), 'x.js'))('playwright'); } catch {} }
  console.error('No se pudo cargar Playwright. Instalalo fuera del repo (npm i playwright en otra carpeta) y corré con PLAYWRIGHT_DIR=<esa carpeta>.');
  process.exit(1);
}

function servirRepo() {
  const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.xml': 'text/xml', '.txt': 'text/plain' };
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(RAIZ, u);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => ok({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

async function medirEscenario(browser, devices, base, [w, h], escenario) {
  const movil = w <= 768;
  const ctx = await browser.newContext(movil ? { ...devices['Pixel 7'], viewport: { width: w, height: h } } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const fallos = [];
  await page.route('**/firebase-config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }));
  await page.addInitScript(guion(73, 152));
  await page.addInitScript(() => { window.__MOCK = { config: null }; });
  if (escenario === 'lenta' || escenario === 'imagenes-tardias') {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  if (escenario === 'imagenes-tardias') await page.route(/res\.cloudinary\.com/, (r) => setTimeout(() => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {}), 6000));
  else if (escenario !== 'imagenes-bloqueadas') await page.route(/res\.cloudinary\.com/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  if (escenario === 'imagenes-bloqueadas') await page.route(/res\.cloudinary\.com/, (r) => r.abort());
  await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  // esperar al catálogo (hasta 40 s con la red lenta) y dejar que terminen de cargar/fallar las fotos
  try { await page.waitForFunction(() => document.querySelectorAll('#grid > .card').length > 0, null, { timeout: 40000 }); }
  catch { fallos.push('el catálogo no cargó (no hay tarjetas en #grid)'); }
  await esp(escenario === 'imagenes-tardias' ? 9000 : 3000);

  const filas = await page.evaluate(() => {
    const leer = (sel) => [...document.querySelectorAll(sel)].map((c) => { const r = c.getBoundingClientRect(), f = c.querySelector('.card-foto, .rel-foto'); const fr = f ? f.getBoundingClientRect() : { width: 0, height: 0 }; return { w: r.width, h: r.height, fw: fr.width, fh: fr.height }; });
    const visible = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return {
      nuevos: visible('nuevos-section') ? leer('#nuevos-strip .card') : null,
      destacados: visible('destacados-section') ? leer('#destacados-strip .card') : null,
      grid: leer('#grid > .card'),
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cls: window.__cls,
    };
  });
  let rel = null;
  if (escenario === 'lenta') { // fichas: relacionados (cuadrícula y carril "Completá tu look")
    rel = await page.evaluate(async () => {
      const esp = (ms) => new Promise((r) => setTimeout(r, ms));
      const ids = [...document.querySelectorAll('#grid > .card')].map((c) => c.getAttribute('onclick').match(/'([^']+)'/)[1]);
      const leer = (sel) => [...document.querySelectorAll(sel)].map((c) => { const r = c.getBoundingClientRect(), f = c.querySelector('.rel-foto').getBoundingClientRect(); return { w: r.width, h: r.height, fw: f.width, fh: f.height }; });
      for (const id of ids) {
        if (!/^conjunto\|/.test(id) && !/^camiseta\|/.test(id)) continue;
        abrirDetalle(id); await esp(900);
        const grid = leer('.rel-grid .rel-card'), carril = leer('.rel-carril .rel-card');
        if (grid.length >= 2) return { grid, carril, id };
        cerrarDetalle(); await esp(500);
      }
      return null;
    });
  }
  await ctx.close();

  const chequeo = (nombre, tarjetas, lim) => {
    if (!tarjetas || !tarjetas.length) return;
    const ws = tarjetas.map((t) => t.w), med = mediana(ws);
    const mal = tarjetas.filter((t) => Math.abs(t.w - med) > 1);
    if (mal.length) fallos.push(`${nombre}: ${mal.length} de ${tarjetas.length} tarjetas con ancho distinto al resto (${Math.round(Math.min(...ws))}–${Math.round(Math.max(...ws))} px, mediana ${Math.round(med)})`);
    const props = tarjetas.map((t) => t.fw / t.fh);
    if (Math.max(...props) - Math.min(...props) > 0.02) fallos.push(`${nombre}: la proporción de la foto no es igual en todas (${Math.min(...props).toFixed(2)}–${Math.max(...props).toFixed(2)})`);
    if (Math.max(...ws) > lim.max || Math.min(...ws) < lim.min) fallos.push(`${nombre}: ancho fuera de rango [${lim.min}–${lim.max}]: ${Math.round(Math.min(...ws))}–${Math.round(Math.max(...ws))} px`);
    const hs = tarjetas.map((t) => t.h);
    if (Math.max(...hs) > lim.altoMax || Math.min(...hs) < lim.altoMin) fallos.push(`${nombre}: alto fuera de rango [${lim.altoMin}–${lim.altoMax}]: ${Math.round(Math.min(...hs))}–${Math.round(Math.max(...hs))} px`);
  };
  chequeo('Nuevos ingresos', filas.nuevos, LIMITES.strip);
  chequeo('Destacados', filas.destacados, LIMITES.strip);
  chequeo('Catálogo', filas.grid, LIMITES.grid);
  if (escenario === 'lenta' && !rel) fallos.push('no se encontró ninguna ficha con productos relacionados para probar');
  if (rel) { chequeo('Relacionados (cuadrícula)', rel.grid, LIMITES.relacionados); chequeo('Relacionados (Completá tu look)', rel.carril, LIMITES.relacionados); }
  if (filas.desborde > 1) fallos.push(`desborde horizontal de la página: ${filas.desborde} px`);
  if (filas.cls > CLS_MAX) fallos.push(`CLS alto: ${filas.cls.toFixed(3)} (máximo ${CLS_MAX})`);
  return { w, escenario, fallos, resumen: `nuevos=${filas.nuevos ? filas.nuevos.length : '-'} destacados=${filas.destacados ? filas.destacados.length : '-'} catálogo=${filas.grid.length} cls=${filas.cls.toFixed(3)}` };
}

const { chromium, devices } = await cargarPlaywright();
let servidor = null, base = process.env.BASE_URL;
if (!base) { servidor = await servirRepo(); base = servidor.url; }
let browser;
try { browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true }); }
catch { browser = await chromium.launch({ headless: true }); }

let total = 0, malos = 0;
for (const tam of TAMANOS) {
  const res = await Promise.all(ESCENARIOS.map((e) => medirEscenario(browser, devices, base, tam, e)));
  for (const r of res) {
    total++;
    if (r.fallos.length) { malos++; console.log(`FALLA  ${String(r.w).padStart(4)} px · ${r.escenario}  (${r.resumen})`); r.fallos.forEach((f) => console.log('         - ' + f)); }
    else console.log(`ok     ${String(r.w).padStart(4)} px · ${r.escenario}  (${r.resumen})`);
  }
}
await browser.close();
if (servidor) servidor.s.close();
console.log(malos ? `\n${malos} de ${total} combinaciones FALLARON` : `\nTodo OK: ${total} combinaciones (tamaño × escenario) sin problemas`);
process.exit(malos ? 1 : 0);
