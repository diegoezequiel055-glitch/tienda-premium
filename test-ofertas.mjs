// ══════════════════════════════════════════
// PRUEBAS DE LAS OFERTAS (ofertas.js, ofertas-ui.js, app.js, relacionados.js). NO toca el Firestore real: usa el doble de
// test-doble-firebase.mjs y bloquea todo pedido a internet.
//   A) puras: aplicarOferta (tarjeta/efectivo, campos que faltan o inválidos), etiqueta, precio tachado, carrito y mensaje de WhatsApp
//      con productos con y sin oferta mezclados (precios.js + pedido-mensaje.js), eventos de Analytics.
//   B) navegador (Chrome, iPhone / Android / PC): sección, menú, "Ver todas →", tarjetas, ficha, relacionados, buscador, ?p=ID, carrito
//      y WhatsApp con el precio de oferta, cambios en vivo, sin ofertas no hay hueco, y NINGUNA lectura extra (3 por visita).
// Uso: node test-ofertas.mjs   (B necesita Playwright fuera del repo: PLAYWRIGHT_DIR=<carpeta> y Chrome)   SOLO_PURAS=1 → solo A
//      CAPTURAS=<carpeta> guarda capturas (portada, ficha y carrito) en iPhone, Android y PC.
// ══════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { aplicarOferta, ofertaValida, enOferta, ofertasList, precioAnterior, etiquetaHtml, anteriorHtml, tarjetaCompactaHtml, CLAVE_OFERTAS } from './ofertas.js';
import { precioLista, textoCuotas, textoEfectivoVerde, preciosParaCarrito, subtotalDe, precioUnitario, resolverCarrito, extrasPrecioHtml } from './precios.js';
import { armarMensaje } from './pedido-mensaje.js';
import { eventos } from './analytics.js';
import { dobleFirebase, guion, productosPrueba, PNG } from './test-doble-firebase.mjs';

let ok = 0, fallos = 0;
const t = async (n, f) => { if (process.env.SOLO && !n.includes(process.env.SOLO)) return; try { await f(); ok++; console.log('ok', n); } catch (e) { fallos++; console.log('FALLA', n, '\n   ', String(e.message).split('\n').slice(0, 3).join('\n    ')); } };

// 40.000 normal (tarjeta 51.000) → oferta 34.000 (tarjeta 44.000), como lo arma StockMGR.
const crudo = (extra = {}) => ({ id: 'remera|x|negro', nombre: 'Remera X', categoria: 'Remeras', precio: 40000, precioTarjeta: 51000, precioOferta: 34000, precioOfertaTarjeta: 44000, fotos: ['f'], talles: [{ talle: 'M', stock: 3 }], ...extra });
const normal = { id: 'camiseta|y|azul', nombre: 'Camiseta Y', categoria: 'Camisetas', precio: 25000, precioTarjeta: 32000, fotos: ['f'], talles: [{ talle: 'M', stock: 3 }] };

console.log('— A) lógica pura —');
await t('aplicarOferta: el precio grande pasa a ser el de la oferta (efectivo y tarjeta); guarda el normal para el tachado', () => {
  const p = aplicarOferta(crudo());
  assert.equal(p.precio, 34000); assert.equal(p.precioTarjeta, 44000); assert.equal(p.enOferta, true);
  assert.equal(p.precioNormal, 40000); assert.equal(p.precioNormalTarjeta, 51000); assert.equal(p.pctOferta, 15);
  assert.equal('precioOferta' in p, false); assert.equal(precioLista(p), 44000);
  assert.equal(textoCuotas(p), '3 cuotas de $14.667 sin interés'); assert.equal(textoEfectivoVerde(p), '$34.000 con transferencia o efectivo');
  assert.equal(precioAnterior(p), 51000, 'el tachado es el normal con tarjeta (mismos términos que el precio grande)');
});
await t('porcentaje: sale de efectivo vs. oferta, redondeado (40.000→34.000 = 15 %; 35.000→30.000 = 14 %; 3 % chicos también)', () => {
  assert.equal(aplicarOferta(crudo()).pctOferta, 15);
  assert.equal(aplicarOferta(crudo({ precio: 35000, precioOferta: 30000 })).pctOferta, 14);
  assert.equal(aplicarOferta(crudo({ precio: 10000, precioOferta: 9700 })).pctOferta, 3);
  assert.equal(aplicarOferta(crudo({ precio: 3, precioOferta: 1 })).pctOferta, 67);
});
await t('el porcentaje NO depende del precio de tarjeta (aunque el recargo cambie)', () => {
  assert.equal(aplicarOferta(crudo({ precioOfertaTarjeta: 99000, precioTarjeta: 120000 })).pctOferta, 15);
  assert.equal(aplicarOferta(crudo({ precioTarjeta: undefined, precioOfertaTarjeta: undefined })).pctOferta, 15);
});
await t('sin precio de tarjeta (interruptor apagado en StockMGR): solo efectivo, como siempre, y el tachado es el efectivo normal', () => {
  const p = aplicarOferta(crudo({ precioTarjeta: undefined, precioOfertaTarjeta: undefined }));
  assert.equal(p.precio, 34000); assert.equal('precioTarjeta' in p, false); assert.equal(precioLista(p), 34000); assert.equal(precioAnterior(p), 40000);
  assert.match(extrasPrecioHtml(p, 'card'), /Abonando en efectivo o transferencia/);
});
await t('solo uno de los dos precios de tarjeta: no se mezclan (se muestra todo en efectivo/transferencia)', () => {
  for (const c of [crudo({ precioOfertaTarjeta: undefined }), crudo({ precioTarjeta: undefined })]) { const p = aplicarOferta(c); assert.equal('precioTarjeta' in p, false); assert.equal(precioLista(p), 34000); assert.equal(precioAnterior(p), 40000); }
});
await t('SIN oferta o con campos faltantes: la ficha queda EXACTAMENTE igual (la tienda anda igual que antes)', () => {
  assert.deepEqual(aplicarOferta(normal), normal); assert.equal(aplicarOferta(normal), normal, 'misma referencia');
  assert.deepEqual(aplicarOferta({ ...normal, precioOferta: null }), normal); assert.deepEqual(aplicarOferta({ ...normal, precioOferta: undefined }), normal);
  assert.equal(enOferta(normal), false); assert.equal(etiquetaHtml(normal), ''); assert.equal(anteriorHtml(normal), ''); assert.equal(precioAnterior(normal), 0);
});
await t('oferta INVÁLIDA (igual o mayor al normal, 0, negativa, texto, NaN, Infinity): se ignora y se ve el precio normal', () => {
  for (const x of [25000, 26000, 0, -5, '20000', NaN, Infinity, {}, true]) {
    const p = aplicarOferta({ ...normal, precioOferta: x, precioOfertaTarjeta: 9999 });
    assert.equal(p.precio, 25000, String(x)); assert.equal(p.precioTarjeta, 32000); assert.equal(enOferta(p), false); assert.equal('precioOferta' in p, false); assert.equal('precioOfertaTarjeta' in p, false);
  }
  assert.equal(ofertaValida({ precio: 0, precioOferta: 5 }), false); assert.equal(ofertaValida(null), false);
});
await t('el documento viene sin el campo (catálogo viejo) o con basura: no se rompe nada', () => {
  assert.doesNotThrow(() => aplicarOferta({ id: 'a' })); assert.doesNotThrow(() => aplicarOferta({}));
  assert.deepEqual(aplicarOferta({ id: 'a', precio: 100 }), { id: 'a', precio: 100 });
});
await t('etiqueta y precio anterior: HTML con -15%, tachado y texto para lectores; con menos de 1 % no hay etiqueta pero sí tachado', () => {
  const p = aplicarOferta(crudo());
  assert.match(etiquetaHtml(p), /class="badge-oferta"[^>]*>-15%</); assert.match(anteriorHtml(p), /<s>\$51\.000<\/s>/);
  const chico = aplicarOferta(crudo({ precio: 100000, precioOferta: 99800, precioTarjeta: undefined, precioOfertaTarjeta: undefined }));
  assert.equal(etiquetaHtml(chico), ''); assert.match(anteriorHtml(chico), /<s>\$100\.000<\/s>/);
});
await t('tarjeta compacta (pura): foto, etiqueta, nombre, precio anterior tachado y precio nuevo; SIN cuotas, talles ni línea de efectivo; sin foto dice "Sin foto"', () => {
  const p = aplicarOferta(crudo()); const h = tarjetaCompactaHtml(p, 'https://x/f.jpg');
  assert.match(h, /class="of-card" data-id="remera\|x\|negro"/); assert.match(h, /<img src="https:\/\/x\/f\.jpg"[^>]*loading="lazy"/); assert.match(h, />-15%</); assert.match(h, /<s>\$51\.000<\/s>/); assert.match(h, /of-precio">\$44\.000</); assert.match(h, /Remera X/);
  for (const prohibido of [/cuotas/i, /interés/i, /Talles/i, /transferencia/i, /efectivo/i, /px-extras/]) assert.equal(prohibido.test(h), false, String(prohibido));
  assert.match(tarjetaCompactaHtml(p, ''), /Sin foto/); assert.equal(/<img/.test(tarjetaCompactaHtml(p, '')), false);
  const sinT = aplicarOferta(crudo({ precioTarjeta: undefined, precioOfertaTarjeta: undefined })); assert.match(tarjetaCompactaHtml(sinT, 'f'), /<s>\$40\.000<\/s>/); assert.match(tarjetaCompactaHtml(sinT, 'f'), /of-precio">\$34\.000</);
  assert.match(tarjetaCompactaHtml(aplicarOferta(crudo({ nombre: 'A "B" <i>' })), 'f'), /A &quot;B&quot; &lt;i&gt;/);
});
await t('ofertasList: solo los que están en oferta', () => assert.deepEqual(ofertasList([aplicarOferta(crudo()), aplicarOferta(normal)]).map((p) => p.id), ['remera|x|negro']));
await t('CARRITO: con y sin oferta mezclados — efectivo: 34.000 + 25.000; tarjeta: 44.000 + 32.000 (nunca los normales 40.000 / 51.000)', () => {
  const a = aplicarOferta(crudo()), b = aplicarOferta(normal);
  const items = [{ id: a.id, ...preciosParaCarrito(a), cantidad: 2, talle: 'M' }, { id: b.id, ...preciosParaCarrito(b), cantidad: 1, talle: 'M' }];
  assert.equal(subtotalDe(items, 'efectivo'), 2 * 34000 + 25000); assert.equal(subtotalDe(items, 'transferencia'), 93000);
  assert.equal(subtotalDe(items, 'tarjeta'), 2 * 44000 + 32000);
  assert.equal(precioUnitario(items[0], items, 'tarjeta'), 44000);
});
await t('CARRITO: oferta sin precio de tarjeta + otro con tarjeta → con tarjeta se cobra como siempre (efectivo y "a confirmar")', () => {
  const a = aplicarOferta(crudo({ precioOfertaTarjeta: undefined })), b = aplicarOferta(normal);
  const items = [{ id: a.id, ...preciosParaCarrito(a), cantidad: 1 }, { id: b.id, ...preciosParaCarrito(b), cantidad: 1 }];
  assert.equal(subtotalDe(items, 'tarjeta'), 34000 + 25000);
});
await t('MENSAJE DE WHATSAPP: usa el precio de oferta (y el de tarjeta de la oferta); el precio normal NO aparece', () => {
  const a = aplicarOferta(crudo()), b = aplicarOferta(normal);
  const items = [{ ...preciosParaCarrito(a), id: a.id, nombre: a.nombre, categoria: a.categoria, talle: 'M', cantidad: 2 }, { ...preciosParaCarrito(b), id: b.id, nombre: b.nombre, categoria: b.categoria, talle: 'M', cantidad: 1 }];
  const base = { marca: 'TIENDAPREMIUM.OK', nombre: 'Juan', items, tipoEntrega: 'retiro', envio: null, costoEnvio: 0 };
  const ef = armarMensaje({ ...base, formaPago: 'efectivo', formaPagoLabel: 'Efectivo' });
  assert.match(ef, /Subtotal: \$93\.000/); assert.match(ef, /Total: \$93\.000/); assert.match(ef, /x2 = \$68\.000/);
  for (const normalPrecio of ['$40.000', '$80.000', '$51.000', '$102.000']) assert.equal(ef.includes(normalPrecio), false, 'no debe aparecer ' + normalPrecio);
  const tj = armarMensaje({ ...base, formaPago: 'tarjeta', formaPagoLabel: 'Tarjeta' });
  assert.match(tj, /Total: \$120\.000/); assert.match(tj, /x2 = \$88\.000/); for (const m of ['$51.000', '$102.000', '$40.000']) assert.equal(tj.includes(m), false, 'no debe aparecer ' + m);
});
await t('un carrito guardado con el precio normal se actualiza solo al de oferta (y vuelve al normal cuando la oferta termina)', () => {
  const viejo = [{ id: 'remera|x|negro', nombre: 'Remera X', talle: 'M', precio: 40000, precioTarjeta: 51000, cantidad: 1 }];
  const conOferta = resolverCarrito(viejo, [aplicarOferta(crudo())]); assert.equal(conOferta.cambio, true); assert.equal(conOferta.carrito[0].precio, 34000); assert.equal(conOferta.carrito[0].precioTarjeta, 44000);
  const sin = resolverCarrito(conOferta.carrito, [aplicarOferta(crudo({ precioOferta: undefined, precioOfertaTarjeta: undefined }))]); assert.equal(sin.carrito[0].precio, 40000); assert.equal(sin.carrito[0].precioTarjeta, 51000);
});
await t('ANALYTICS: view_item, add_to_cart y begin_checkout llevan el precio que paga el cliente (oferta)', () => {
  const a = aplicarOferta(crudo());
  assert.equal(eventos.view_item(a).value, 34000); assert.equal(eventos.view_item(a).items[0].price, 34000);
  const ac = eventos.add_to_cart({ id: a.id, nombre: a.nombre, categoria: a.categoria, talle: 'M', cantidad: 1, precio: a.precio }); assert.equal(ac.value, 34000); assert.equal(ac.items[0].price, 34000);
  const items = [{ id: a.id, nombre: a.nombre, categoria: a.categoria, talle: 'M', ...preciosParaCarrito(a), cantidad: 2 }];
  const bc = eventos.begin_checkout({ items, formaPago: 'efectivo', tipoEntrega: 'retiro', costoEnvio: 0 }); assert.equal(bc.value, 68000); assert.equal(bc.items[0].price, 34000);
  const bt = eventos.begin_checkout({ items, formaPago: 'tarjeta', tipoEntrega: 'retiro', costoEnvio: 0 }); assert.equal(bt.value, 88000); assert.equal(bt.items[0].price, 44000);
});
await t('CLAVE_OFERTAS no choca con ninguna categoría real', async () => {
  const { CATEGORIAS, claveDe } = await import('./categorias-config.js');
  for (const c of CATEGORIAS) assert.notEqual(claveDe(c.visible), CLAVE_OFERTAS);
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
  const SIN_OFERTAS = () => productosPrueba(24).map(({ precioOferta, precioOfertaTarjeta, ...r }) => r);
  const CON = productosPrueba(24); // ofertas: i = 3, 9, 15, 21
  const OFERTAS = CON.filter((p) => p.precioOferta);

  async function abrir({ mock = {}, url = '/index.html', perfil = 'iphone', catalogo } = {}) {
    const ctx = await browser.newContext(PERFILES[perfil]);
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); }
      if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      pedidosReales.push(u); return r.abort();
    });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(guion(24, 152));
    await page.addInitScript((m) => { window.__MOCK = m; window.__abiertos = []; window.__ev = []; window.open = (u) => { window.__abiertos.push(u); return null; };
      for (const n of ['carrito-agregado', 'pedido-iniciado', 'detalle-pintado']) document.addEventListener(n, (e) => window.__ev.push([n, JSON.parse(JSON.stringify(e.detail))])); }, { config: null, catalogoDemora: 250 /* Firestore real tarda cientos de ms: con 20 ms el catálogo llega antes de que carguen los módulos del final (relacionados, compartir) */, ...(catalogo ? { catalogo } : {}), ...mock });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#grid > .card').length > 0, null, { timeout: 8000 });
    await esp(250);
    return { page, ctx, errores };
  }
  const visible = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, id);
  const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
  const abrirFicha = async (page, id) => { await page.evaluate((i) => window.abrirDetalle(i), id); await esp(350); };

  await t('SIN ofertas: no hay sección, ni ítem en la barra, ni en el menú, ni hueco vacío; nada de etiquetas', async () => {
    const { page, ctx, errores } = await abrir({ catalogo: SIN_OFERTAS(), perfil: 'pc' });
    assert.equal(await visible(page, 'ofertas-section'), false); assert.equal(await visible(page, 'nav-ofertas'), false);
    assert.equal(await page.evaluate(() => document.getElementById('menu-ofertas').hidden), true);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.badge-oferta, .card-precio-ant').length), 0);
    // sin hueco: "Nuevos ingresos" queda pegado al hero como antes
    assert.equal(await page.evaluate(() => document.getElementById('ofertas-section').getBoundingClientRect().height), 0);
    assert.equal(errores.length, 0, errores.join(' | ')); await ctx.close();
  });
  await t('catálogo viejo (sin ningún campo de oferta): todo se ve como siempre', async () => {
    const viejo = productosPrueba(24).map(({ precioOferta, precioOfertaTarjeta, stockBajo, ...r }) => r);
    const { page, ctx } = await abrir({ catalogo: viejo }); assert.equal(await visible(page, 'ofertas-section'), false);
    assert.match(await txt(page, '#grid .card .card-precio'), /\$\d/); await ctx.close();
  });
  await t('CON ofertas: la sección "Ofertas" está AL FINAL (después de "Ver más productos" y de Nuevos ingresos/Destacados/catálogo, arriba del footer) y NO entre el hero y "Nuevos ingresos"', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    const pos = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; const b = (el) => el.getBoundingClientRect().bottom + scrollY; const f = document.querySelector('footer, .footer, #footer');
      return { hero: b(document.getElementById('hero-rot')), nuevos: y(document.getElementById('nuevos-section')), destacados: y(document.getElementById('destacados-section')), grid: b(document.getElementById('grid')), vermas: y(document.getElementById('ver-mas-caja')), ofertas: y(document.getElementById('ofertas-section')), footer: f ? y(f) : null, alto: document.documentElement.scrollHeight }; });
    assert.ok(pos.ofertas > pos.nuevos && pos.ofertas > pos.destacados, 'después de Nuevos ingresos y Destacados'); assert.ok(pos.ofertas > pos.grid - 2, 'debajo de todos los productos del catálogo'); assert.ok(pos.ofertas >= pos.vermas, 'después del botón "Ver más productos"');
    if (pos.footer) assert.ok(pos.ofertas < pos.footer, 'arriba del footer'); else assert.ok(pos.ofertas < pos.alto);
    assert.ok(pos.nuevos - pos.hero < 120, 'Nuevos ingresos sigue pegado al hero (sin sección Ofertas en el medio): ' + (pos.nuevos - pos.hero));
    assert.equal((await txt(page, '#ofertas-section .section-title')).trim().toUpperCase(), 'OFERTAS'); assert.match(await txt(page, '.ofertas-ver'), /Ver todas →/);
    const f = await page.evaluate(() => ({ of: parseFloat(getComputedStyle(document.querySelector('#ofertas-section .section-title')).fontSize), otro: parseFloat(getComputedStyle(document.querySelector('#nuevos-section .section-title')).fontSize), anton: getComputedStyle(document.querySelector('#ofertas-section .section-title')).fontFamily.includes('Anton') }));
    assert.ok(f.of <= f.otro, `título más chico o igual que el de las otras secciones (${f.of} vs ${f.otro})`); assert.ok(f.anton);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#ofertas-strip .of-card').length), OFERTAS.length); await ctx.close();
  });
  await t('TARJETA CHICA: foto 4:5 con etiqueta roja "-15%", nombre, precio anterior tachado y precio nuevo; SIN cuotas, SIN "Talles" y SIN la línea de efectivo', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const c = await page.evaluate(() => { const card = document.querySelector('#ofertas-strip .of-card'); const f = card.querySelector('.of-foto').getBoundingClientRect(); const b = card.querySelector('.badge-oferta'); const br = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      return { badge: b.textContent, bg: cs.backgroundColor, color: cs.color, izq: br.left - f.left, arriba: br.top - f.top, prop: f.width / f.height, nombre: card.querySelector('.of-nombre').textContent, ant: card.querySelector('.of-ant s').textContent, antTach: getComputedStyle(card.querySelector('.of-ant s')).textDecorationLine, antColor: getComputedStyle(card.querySelector('.of-ant')).color, nuevo: card.querySelector('.of-precio').textContent, texto: card.innerText, img: card.querySelector('img') ? card.querySelector('img').getAttribute('loading') : null, tag: card.tagName, wCard: card.getBoundingClientRect().width }; });
    const o = OFERTAS.find((x) => x.nombre === c.nombre); assert.ok(o, 'es un producto en oferta: ' + c.nombre); const fm = (n) => '$' + n.toLocaleString('es-AR');
    assert.equal(c.badge, `-${Math.round((1 - o.precioOferta / o.precio) * 100)}%`); assert.equal(c.bg, 'rgb(229, 37, 42)'); assert.equal(c.color, 'rgb(255, 255, 255)'); assert.ok(c.izq >= 0 && c.izq < 12 && c.arriba >= 0 && c.arriba < 12, `etiqueta arriba a la izquierda: ${c.izq},${c.arriba}`);
    assert.ok(Math.abs(c.prop - 0.8) < 0.02, 'foto 4:5: ' + c.prop); assert.equal(c.ant, fm(o.precioTarjeta)); assert.equal(c.antTach, 'line-through'); assert.equal(c.antColor, 'rgb(138, 138, 138)'); assert.equal(c.nuevo, fm(o.precioOfertaTarjeta));
    assert.equal(/cuotas|interés/i.test(c.texto), false, 'sin línea de cuotas: ' + c.texto); assert.equal(/Talles/i.test(c.texto), false, 'sin talles'); assert.equal(/efectivo|transferencia/i.test(c.texto), false, 'sin línea de efectivo'); assert.equal(c.tag, 'BUTTON'); assert.equal(c.img, 'lazy'); assert.ok(c.wCard < 200, 'tarjeta chica: ' + c.wCard); await ctx.close();
  });
  await t('al tocar una tarjeta del carrusel se abre la ficha de ese producto (con su precio de oferta y el link ?p=ID)', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const o = OFERTAS[1]; await page.evaluate((id) => { document.querySelector(`#ofertas-strip .of-card[data-id="${id}"]`).click(); }, o.id); await esp(500);
    assert.equal(await page.evaluate(() => document.getElementById('detalle-overlay').classList.contains('open')), true);
    assert.equal(await page.evaluate(() => document.getElementById('detalle-nombre').textContent), o.nombre); assert.equal(await page.evaluate(() => document.getElementById('detalle-precio').textContent), '$' + o.precioOfertaTarjeta.toLocaleString('es-AR'));
    assert.ok((await page.evaluate(() => location.search)).includes('p=')); await ctx.close();
  });
  await t('CARRUSEL: ~2,5 tarjetas por pantalla en celular (2 enteras + la mitad de la tercera) y ~6 en PC (con un pedazo de la siguiente), con scroll-snap y sin desborde', async () => {
    const medir = (page) => page.evaluate(() => { const vw = innerWidth; const rs = [...document.querySelectorAll('#ofertas-strip .of-card')].map((c) => c.getBoundingClientRect()); const par = rs.find((r) => r.left < vw - 6 && r.right > vw + 6); return { enteras: rs.filter((r) => r.left >= -1 && r.right <= vw + 1).length, parcial: rs.filter((r) => r.left < vw - 6 && r.right > vw + 6).length, frac: par ? (vw - par.left) / par.width : 0, snap: getComputedStyle(document.getElementById('ofertas-strip')).scrollSnapType, sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth, w: Math.round(rs[0].width) }; });
    const prod = productosPrueba(72).map((p, i) => (i % 3 === 0 ? { ...p, precioOferta: Math.round(p.precio * 0.8 / 500) * 500, precioOfertaTarjeta: Math.round(p.precio * 0.8 * 1.27 / 500) * 500 } : p)); // 24 ofertas
    for (const [perfil, enteras] of [['iphone', 2], ['android', 2], ['pc', 6]]) {
      const { page, ctx } = await abrir({ perfil, catalogo: prod });
      const m = await medir(page); assert.equal(m.enteras, enteras, `${perfil}: tarjetas enteras ${m.enteras} (ancho ${m.w})`); assert.equal(m.parcial, 1, `${perfil}: tiene que asomar un pedazo de la siguiente`); assert.match(m.snap, /x mandatory/); assert.ok(m.sobra <= 1, perfil + ' desborde ' + m.sobra);
      if (perfil !== 'pc') assert.ok(m.frac > 0.25 && m.frac < 0.8, `${perfil}: se ve más o menos la mitad de la tercera (${m.frac.toFixed(2)})`); await ctx.close();
    }
  });
  await t('BARRA (PC): "Ofertas" es solo texto rojo (sin fondo de píldora), del mismo tamaño que los otros ítems; al tocarlo va a la vista de todas las ofertas', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc' });
    const n = await page.evaluate(() => { const a = document.getElementById('nav-ofertas'); const cs = getComputedStyle(a); const otro = getComputedStyle(document.querySelector('.hdr-nav a:not(.nav-ofertas):not(.btn-mayorista)')); return { bg: cs.backgroundColor, color: cs.color, radio: cs.borderTopLeftRadius, pad: cs.paddingLeft, fs: cs.fontSize, fsOtro: otro.fontSize, h: a.getBoundingClientRect().height, hOtro: document.querySelector('.hdr-nav a:not(.nav-ofertas):not(.btn-mayorista)').getBoundingClientRect().height, texto: a.textContent.trim() }; });
    assert.equal(n.color, 'rgb(229, 37, 42)'); assert.equal(n.bg, 'rgba(0, 0, 0, 0)', 'sin fondo'); assert.equal(n.radio, '0px'); assert.equal(n.pad, '0px'); assert.equal(n.fs, n.fsOtro, 'mismo tamaño de letra'); assert.ok(Math.abs(n.h - n.hOtro) < 1, 'misma altura'); assert.equal(n.texto, 'Ofertas');
    await page.click('#nav-ofertas'); await esp(900);
    const v = await page.evaluate(() => ({ n: document.querySelectorAll('#grid > .card').length, todas: [...document.querySelectorAll('#grid > .card')].every((c) => c.querySelector('.badge-oferta')), titulo: document.getElementById('grid-titulo').textContent }));
    assert.equal(v.n, OFERTAS.length); assert.ok(v.todas); assert.equal(v.titulo, 'Ofertas'); await ctx.close();
  });
  await t('MENÚ LATERAL (celular): NO hay botón rojo; hay una fila "Ofertas" (rojo #e5252a, negrita, ›) justo debajo de "Todos los productos", con el mismo estilo; al tocarla se cierra el menú y abre la vista de ofertas', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.click('#btn-menu'); await esp(700);
    const n = await page.evaluate(() => { const fila = document.getElementById('menu-ofertas-fila'); const tog = document.getElementById('menu-toggle'); const cs = getComputedStyle(fila), ct = getComputedStyle(tog); const r = fila.getBoundingClientRect(), rt = tog.getBoundingClientRect();
      return { color: cs.color, peso: cs.fontWeight, bg: cs.backgroundColor, bgTog: ct.backgroundColor, fs: cs.fontSize, fsTog: ct.fontSize, alto: r.height, altoTog: rt.height, borde: cs.borderBottomWidth, bordeTog: ct.borderBottomWidth, pad: cs.paddingLeft, padTog: ct.paddingLeft, flecha: fila.querySelector('.menu-flecha').textContent, texto: fila.querySelector('span').textContent, debajo: r.top >= rt.bottom - 1, pegada: r.top - rt.bottom, visible: r.width > 0 && r.top < innerHeight, botonRojo: !!document.querySelector('.menu-ofertas-btn'), hermano: document.getElementById('menu-cats').nextElementSibling.id }; });
    assert.equal(n.botonRojo, false, 'ya no existe el botón rojo grande'); assert.equal(n.color, 'rgb(229, 37, 42)'); assert.ok(Number(n.peso) >= 700, 'negrita'); assert.equal(n.bg, n.bgTog, 'sin fondo de color'); assert.equal(n.fs, n.fsTog); assert.equal(n.alto, n.altoTog, 'misma altura que "Todos los productos"'); assert.equal(n.borde, n.bordeTog); assert.equal(n.pad, n.padTog);
    assert.equal(n.flecha, '›'); assert.equal(n.texto, 'Ofertas'); assert.ok(n.debajo && n.pegada < 20, 'justo debajo de "Todos los productos": ' + n.pegada); assert.ok(n.visible); assert.equal(n.hermano, 'menu-ofertas');
    await page.click('#menu-ofertas-fila'); await esp(1000);
    assert.equal(await page.evaluate(() => document.getElementById('menu-overlay').classList.contains('open')), false, 'el menú se cierra');
    const v = await page.evaluate(() => ({ n: document.querySelectorAll('#grid > .card').length, todas: [...document.querySelectorAll('#grid > .card')].every((c) => c.querySelector('.badge-oferta')), titulo: document.getElementById('grid-titulo').textContent, hash: location.hash }));
    assert.equal(v.n, OFERTAS.length); assert.ok(v.todas); assert.equal(v.titulo, 'Ofertas'); assert.equal(v.hash, '#cat=ofertas');
    await ctx.close();
  });
  await t('"Ver todas →": vista con TODAS las ofertas (mismo mecanismo que una categoría: filtro, título y #cat=ofertas); el logo vuelve al catálogo completo', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.click('.ofertas-ver'); await esp(700);
    const v = await page.evaluate(() => ({ n: document.querySelectorAll('#grid > .card').length, todas: [...document.querySelectorAll('#grid > .card')].every((c) => c.querySelector('.badge-oferta')), titulo: document.getElementById('grid-titulo').textContent, hash: location.hash }));
    assert.equal(v.n, OFERTAS.length); assert.ok(v.todas); assert.equal(v.titulo, 'Ofertas'); assert.equal(v.hash, '#cat=ofertas');
    await page.click('#hdr-logo'); await esp(500);
    const w = await page.evaluate(() => ({ n: document.querySelectorAll('#grid > .card').length, titulo: document.getElementById('grid-titulo').textContent })); assert.equal(w.n, 24); assert.equal(w.titulo, 'Catálogo completo'); await ctx.close();
  });
  await t('el link #cat=ofertas abre la vista de ofertas; con una categoría común sigue andando', async () => {
    const a = await abrir({ url: '/index.html#cat=ofertas', mock: { catalogoDemora: 300 } }); await esp(500);
    assert.equal(await a.page.evaluate(() => document.querySelectorAll('#grid > .card').length), OFERTAS.length); await a.ctx.close();
    const b = await abrir({ url: '/index.html#cat=camisetas', mock: { catalogoDemora: 300 } }); await esp(500);
    assert.ok(await b.page.evaluate(() => document.querySelectorAll('#grid > .card').length) > 0); assert.ok(await b.page.evaluate(() => [...document.querySelectorAll('#grid > .card .card-cat')].every((c) => /camiseta/i.test(c.textContent)))); await b.ctx.close();
  });
  await t('el filtro "Ofertas" se combina con el buscador y no rompe las categorías', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.evaluate(() => window.verOfertas()); await esp(300);
    await page.evaluate(() => window.setBusqueda('zzzz')); await esp(200); // al buscar se busca en todo el catálogo
    assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card').length), 0);
    await page.evaluate(() => window.setBusqueda('')); await page.evaluate(() => window.setCategoria('camisetas')); await esp(200);
    assert.ok(await page.evaluate(() => document.querySelectorAll('#grid > .card').length) > 0); await ctx.close();
  });
  await t('la etiqueta y el precio tachado también están en el CATÁLOGO, el BUSCADOR y NUEVOS INGRESOS (los productos sin oferta no llevan nada)', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const enGrid = await page.evaluate(() => [...document.querySelectorAll('#grid > .card')].map((c) => ({ n: c.querySelector('.card-nombre').textContent, b: !!c.querySelector('.badge-oferta'), a: !!c.querySelector('.card-precio-ant') })));
    assert.ok(enGrid.some((x) => x.b && x.a)); assert.ok(enGrid.every((x) => x.b === x.a)); assert.ok(enGrid.some((x) => !x.b));
    const nombreOferta = OFERTAS[0].nombre; await page.evaluate((n) => window.setBusqueda(n), nombreOferta); await esp(200);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card .badge-oferta').length), 1, 'el buscador muestra la etiqueta');
    assert.match(await txt(page, '#grid .card .card-precio-ant'), /\$51\.000|\$\d/);
    const nuevos = await page.evaluate(() => [...document.querySelectorAll('#nuevos-strip .card')].map((c) => ({ b: !!c.querySelector('.badge-oferta'), a: !!c.querySelector('.card-precio-ant') })));
    assert.ok(nuevos.length >= 2); assert.ok(nuevos.every((x) => x.b === x.a)); await ctx.close();
  });
  await t('FICHA de un producto en oferta: etiqueta "-15%", precio anterior tachado, precio nuevo, cuotas y línea verde; la de un producto normal no lleva nada', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const o = OFERTAS[0]; await abrirFicha(page, o.id);
    const f = await page.evaluate(() => ({ badge: document.querySelector('#detalle-oferta .badge-oferta')?.textContent, ant: document.querySelector('#detalle-oferta s')?.textContent, antTach: getComputedStyle(document.querySelector('#detalle-oferta s')).textDecorationLine, precio: document.getElementById('detalle-precio').textContent, nota: document.getElementById('detalle-precio-nota').innerText }));
    assert.equal(f.badge, '-15%'); assert.equal(f.ant, '$' + o.precioTarjeta.toLocaleString('es-AR')); assert.equal(f.antTach, 'line-through'); assert.equal(f.precio, '$' + o.precioOfertaTarjeta.toLocaleString('es-AR'));
    assert.match(f.nota, new RegExp('3 cuotas de \\$' + Math.round(o.precioOfertaTarjeta / 3).toLocaleString('es-AR').replace('.', '\\.'))); assert.match(f.nota, new RegExp('\\$' + o.precioOferta.toLocaleString('es-AR').replace('.', '\\.') + ' con transferencia o efectivo'));
    await page.evaluate(() => window.cerrarDetalle()); await esp(300); await abrirFicha(page, CON[0].id);
    assert.equal(await page.evaluate(() => document.getElementById('detalle-oferta').innerHTML), ''); assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('detalle-oferta')).display), 'none'); await ctx.close();
  });
  await t('?p=ID: el link de un producto en oferta abre su ficha con el precio de oferta', async () => {
    const o = OFERTAS[1]; const { page, ctx } = await abrir({ url: '/index.html?p=' + encodeURIComponent(o.id), mock: { catalogoDemora: 400 } });
    await page.waitForFunction(() => document.getElementById('detalle-overlay').classList.contains('open'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.getElementById('detalle-precio').textContent), '$' + o.precioOfertaTarjeta.toLocaleString('es-AR')); assert.ok(await page.evaluate(() => !!document.querySelector('#detalle-oferta .badge-oferta'))); await ctx.close();
  });
  await t('RELACIONADOS: los productos en oferta llevan etiqueta y precio tachado dentro de la ficha', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    // ficha de un producto de la misma categoría que una oferta (i = 3 es "Remeras"; i = 7, 11… también)
    await abrirFicha(page, CON[7].id); await esp(500);
    const r = await page.evaluate(() => [...document.querySelectorAll('.rel-card')].map((c) => ({ b: !!c.querySelector('.badge-oferta'), a: !!c.querySelector('.rel-precio-ant') })));
    assert.ok(r.length > 0, 'hay relacionados'); assert.ok(r.some((x) => x.b && x.a), 'alguno en oferta: ' + JSON.stringify(r)); assert.ok(r.every((x) => x.b === x.a)); await ctx.close();
  });
  await t('CARRITO + WHATSAPP (producto en oferta y otro normal): efectivo y tarjeta usan SIEMPRE el precio de oferta; nunca el normal; Analytics también', async () => {
    const o = OFERTAS[0], n = CON[0]; // n: normal 25.000 / tarjeta 32.000
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    const msg = (pago, agregar) => page.evaluate(({ o, n, pago, agregar }) => { window.__abiertos.length = 0; if (agregar) { window.agregarAlCarrito(o, 'M'); window.agregarAlCarrito(n, 'M'); } window.setClienteNombre('Juan Prueba'); window.setTipoEntrega('retiro'); window.setFormaPago(pago); window.hacerPedido(); return decodeURIComponent((window.__abiertos[0] || '').split('text=')[1] || ''); }, { o: o.id, n: n.id, pago, agregar });
    const ef = await msg('efectivo', true), tj = await msg('tarjeta', false);
    assert.match(ef, new RegExp('Total: \\$' + (o.precioOferta + n.precio).toLocaleString('es-AR').replace('.', '\\.'))); assert.equal(ef.includes('$' + o.precio.toLocaleString('es-AR')), false, 'precio normal en el mensaje:\n' + ef);
    assert.match(tj, new RegExp('Total: \\$' + (o.precioOfertaTarjeta + n.precioTarjeta).toLocaleString('es-AR').replace('.', '\\.'))); assert.equal(tj.includes('$' + o.precioTarjeta.toLocaleString('es-AR')), false, 'precio de tarjeta normal en el mensaje:\n' + tj);
    const ev = await page.evaluate(() => window.__ev);
    const add = ev.find((x) => x[0] === 'carrito-agregado'); assert.equal(add[1].precio, o.precioOferta, 'add_to_cart con el precio de oferta');
    const ped = ev.filter((x) => x[0] === 'pedido-iniciado').at(-1)[1]; assert.equal(ped.items.find((i) => i.id === o.id).precio, o.precioOferta); assert.equal(ped.items.find((i) => i.id === o.id).precioTarjeta, o.precioOfertaTarjeta);
    const vi = ev.filter((x) => x[0] === 'detalle-pintado'); void vi; await ctx.close();
  });
  await t('CARRITO en pantalla: el renglón y el total muestran el precio de oferta', async () => {
    const o = OFERTAS[0]; const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.evaluate((id) => { window.agregarAlCarrito(id, 'M'); window.abrirCarrito(); }, o.id); await esp(300);
    const c = await txt(page, '#carrito-overlay'); assert.ok(c.includes('$' + o.precioOferta.toLocaleString('es-AR') + ' c/u'), c); assert.equal(c.includes('$' + o.precio.toLocaleString('es-AR')), false); await ctx.close();
  });
  await t('EN VIVO: StockMGR carga una oferta → aparece la sección y los ítems; la saca → desaparecen (y si se estaba viendo "Ver todas", vuelve al catálogo)', async () => {
    const { page, ctx } = await abrir({ perfil: 'pc', catalogo: SIN_OFERTAS() });
    assert.equal(await visible(page, 'ofertas-section'), false);
    await page.evaluate((items) => window.__SERVIDOR.publicarCatalogo(items), CON); await esp(500);
    assert.equal(await visible(page, 'ofertas-section'), true); assert.equal(await visible(page, 'nav-ofertas'), true);
    await page.evaluate(() => window.verOfertas()); await esp(300); assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card').length), OFERTAS.length);
    await page.evaluate((items) => window.__SERVIDOR.publicarCatalogo(items), SIN_OFERTAS()); await esp(500);
    assert.equal(await visible(page, 'ofertas-section'), false); assert.equal(await visible(page, 'nav-ofertas'), false); assert.equal(await page.evaluate(() => document.querySelectorAll('#grid > .card').length), 24); assert.equal(await page.evaluate(() => document.getElementById('grid-titulo').textContent), 'Catálogo completo');
    await ctx.close();
  });
  await t('EN VIVO: si la oferta termina con el producto en el carrito, el carrito vuelve al precio normal', async () => {
    const o = OFERTAS[0]; const { page, ctx } = await abrir({ perfil: 'iphone' });
    await page.evaluate((id) => { window.agregarAlCarrito(id, 'M'); window.setFormaPago('efectivo'); }, o.id);
    await page.evaluate((items) => window.__SERVIDOR.publicarCatalogo(items), SIN_OFERTAS()); await esp(500);
    await page.evaluate(() => window.abrirCarrito()); await esp(300);
    const c = await txt(page, '#carrito-overlay'); assert.ok(c.includes('$' + o.precio.toLocaleString('es-AR') + ' c/u'), 'vuelve al precio normal: ' + c); await ctx.close();
  });
  await t('oferta inválida en el catálogo (≥ normal): no se muestra la sección ni etiqueta y el precio es el normal', async () => {
    const malas = productosPrueba(24).map((p, i) => ({ ...p, precioOferta: i % 4 === 0 ? p.precio : i % 4 === 1 ? p.precio + 1000 : i % 4 === 2 ? '1000' : 0, precioOfertaTarjeta: 1 }));
    const { page, ctx } = await abrir({ catalogo: malas }); assert.equal(await visible(page, 'ofertas-section'), false);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.badge-oferta').length), 0);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.card-precio-ant').length), 0); await ctx.close();
  });
  await t('SIN LECTURAS EXTRA: una visita con ofertas lee 3 documentos (config + catálogo + localidades), y un cambio de oferta en vivo suma 1', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' }); let l = await page.evaluate(() => ({ ...window.__LECT }));
    assert.equal(l.total, 3, JSON.stringify(l)); assert.equal(l.catalogo_col + l.envios_col, 0);
    await page.evaluate((items) => window.__SERVIDOR.publicarCatalogo(items), CON.map((p, i) => (i === 3 ? { ...p, precioOferta: 30000 } : p))); await esp(400);
    const l2 = await page.evaluate(() => ({ ...window.__LECT })); assert.equal(l2.catalogo_unico - l.catalogo_unico, 1); await ctx.close();
  });
  await t('LAYOUT: sin desborde horizontal y sin saltos de diseño (CLS ≈ 0) con y sin ofertas, en iPhone, Android y PC (la sección está al final: ya no empuja nada)', async () => {
    for (const perfil of ['iphone', 'android', 'pc']) for (const sinOfertas of [false, true]) {
      const ctx = await browser.newContext(PERFILES[perfil]);
      await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(BASE)) { if (u.includes('/firebase-config.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }); return r.continue(); } if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return r.abort(); });
      const page = await ctx.newPage(); const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      await page.addInitScript(guion(24, 152));
      await page.addInitScript(({ sinOfertas }) => { window.__MOCK = { config: null, catalogoDemora: 700, ...(sinOfertas ? { catalogo: window.__PRODUCTOS_DEF.map(({ precioOferta, precioOfertaTarjeta, ...r }) => r) } : {}) }; window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, { sinOfertas });
      await page.goto(BASE + '/index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('#grid > .card').length > 0, null, { timeout: 8000 }); await esp(900);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(d <= 1, perfil + ' desborde ' + d); assert.equal(errores.length, 0, errores.join(' | '));
      const v = await page.evaluate(() => window.__cls); if (process.env.DEBUG) console.log(`   ${perfil} ${sinOfertas ? 'sin' : 'con'} ofertas: CLS ${v.toFixed(3)}`);
      assert.ok(v <= 0.03, `${perfil} ${sinOfertas ? 'sin' : 'con'} ofertas: CLS ${v.toFixed(3)}`);
      await ctx.close();
    }
  });
  await t('se quitó la reserva de lugar: no hay "reservando" en la sección de ofertas, ni pista en localStorage, ni script inline', async () => {
    const { page, ctx } = await abrir({ perfil: 'iphone' });
    assert.equal(await page.evaluate(() => document.getElementById('ofertas-section').classList.contains('reservando')), false); assert.equal(await page.evaluate(() => localStorage.getItem('tpOfertas')), null);
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'); assert.equal(/tpOfertas/.test(html), false); assert.equal(/tpOfertas|reservando/.test(fs.readFileSync(path.join(RAIZ, 'ofertas.css'), 'utf8')), false); await ctx.close();
  });
  if (process.env.CAPTURAS) {
    await t('CAPTURAS (portada con la sección al final, menú, barra, ficha y carrito) en iPhone, Android y PC', async () => {
      fs.mkdirSync(process.env.CAPTURAS, { recursive: true });
      for (const perfil of ['iphone', 'android', 'pc']) {
        const { page, ctx } = await abrir({ perfil, catalogo: productosPrueba(48) });
        await page.evaluate(() => { const s = document.getElementById('ofertas-section'); window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + scrollY - 110), behavior: 'instant' }); }); await esp(900);
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-portada-${perfil}.png`) });
        if (perfil === 'iphone') { await page.evaluate(() => window.scrollTo(0, 0)); await page.click('#btn-menu'); await esp(450); await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-menu-${perfil}.png`) }); await page.click('#menu-cerrar'); await esp(300); }
        await abrirFicha(page, OFERTAS[0].id); await esp(500); await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-ficha-${perfil}.png`) });
        await page.evaluate(() => { window.cerrarDetalle(); }); await esp(300);
        await page.evaluate((id) => { window.agregarAlCarrito(id, 'M'); window.setTipoEntrega('retiro'); window.setFormaPago('efectivo'); window.abrirCarrito(); }, OFERTAS[0].id); await esp(500);
        await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-carrito-${perfil}.png`) });
        if (perfil === 'pc') { await page.evaluate(() => window.cerrarCarrito()); await page.evaluate(() => window.scrollTo(0, 0)); await esp(300); await page.screenshot({ path: path.join(process.env.CAPTURAS, `tienda-barra-${perfil}.png`) }); }
        await ctx.close();
      }
    });
  }
  await t('ninguna prueba salió a internet real (solo el doble y el servidor local)', () => assert.deepEqual(pedidosReales.filter((u) => !/google-analytics|googletagmanager|fonts\.g/.test(u)), []));
  await browser.close(); servidor.close();
}
console.log(fallos ? `\n${fallos} prueba(s) FALLARON, ${ok} bien` : `\nTodo OK: ${ok} pruebas pasaron.`);
process.exit(fallos ? 1 : 0);
