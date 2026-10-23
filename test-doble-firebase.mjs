// ══════════════════════════════════════════
// DOBLE DE firebase-config.js PARA LAS PRUEBAS — NINGUNA PRUEBA DEBE LEER EL FIRESTORE REAL (plan Spark: 50.000 lecturas por día;
// cada carga de la tienda leía ~226 documentos y las pruebas contra producción agotaron la cuota el 20–21/10/2026).
// Las pruebas de navegador reemplazan firebase-config.js (ruta de Playwright, también contra producción) por este doble: sirve un
// catálogo y unas localidades de mentira, la configuración que pida cada prueba, y CUENTA las lecturas como las contaría Firestore
// (cada documento entregado a un oyente = 1 lectura; un documento que no existe = 1). Uso:
//   import { dobleFirebase, productosPrueba, enviosPrueba, PNG } from './test-doble-firebase.mjs';
//   await ctx.route('**/firebase-config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: dobleFirebase() }));
//   await page.addInitScript((m) => { window.__MOCK = m; }, { config: {...}, fuente: 'unico' });
// __MOCK: config, configModo ('ok'|'error'|'silencio'), configDemora, catalogo (arreglo de fichas con id), envios,
//   fuente: 'unico' (documento único + colecciones, como en producción) | 'respaldo' (solo colecciones, el documento único no existe) |
//           'error-unico' (falla la lectura del documento único) | 'roto' (documento único con hash que no coincide) |
//           'partes' (documento único repartido en varias partes, limiteParte bytes) | 'solo-unico' (colecciones vacías: prueba que NO se leen),
//   catalogoDemora, enviosDemora, unicoAparece (ms: el documento único recién se publica pasado ese tiempo).
// Controles en la página: window.__LECT (contadores), window.__SERVIDOR.publicarCatalogo(items) / publicarEnvios(items) / quitarUnico(base) / emitirConfig(cfg).
// ══════════════════════════════════════════

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const CATS = ['Camisetas', 'Conjuntos', 'Chombas', 'Remeras'];
const NOMBRES = ['Boca Juniors', 'River Plate Titular 26/27 Versión Jugador', 'Arsenal', 'Real Madrid Suplente', 'Nike Dri-Fit Remera y Short (Negro)', 'Manchester City x Abeja', 'Retro Milan G5', 'Icon Bayern Múnich'];
// Cada 6.º producto (i % 6 === 3) está en oferta (~15 % menos, con su precio de tarjeta), como lo arma StockMGR.
export function productosPrueba(n = 73) {
  return Array.from({ length: n }, (_, i) => {
    const cat = CATS[i % CATS.length], fotos = 1 + (i % 4), precio = 25000 + (i % 9) * 5000;
    const f = { id: `${cat.toLowerCase().slice(0, -1)}|prueba ${i + 1}|color`, nombre: `${NOMBRES[i % NOMBRES.length]} ${i + 1}`, categoria: cat, color: 'Negro', precio, precioTarjeta: Math.round(precio * 1.27 / 500) * 500,
      fotos: Array.from({ length: fotos }, (_, j) => `https://res.cloudinary.com/d5fzjp10/image/upload/v1/prueba${i + 1}_${j + 1}.jpg`),
      talles: [{ talle: 'S', stock: 3 }, { talle: 'M', stock: 4 }, { talle: 'L', stock: 2 }], destacado: i % 11 === 0 || i < 3, creadoEn: 1700000000000 - i * 86400000 * 3 };
    if (i % 7 === 0) f.stockBajo = 2;
    if (i % 6 === 3) { f.precioOferta = Math.round(precio * 0.85 / 500) * 500; f.precioOfertaTarjeta = Math.ceil(f.precioOferta * 1.27 / 500) * 500; }
    return f;
  });
}
export const enviosPrueba = (n = 152) => Array.from({ length: n }, (_, i) => ({ id: `localidad-${i}`, localidad: i === 0 ? 'Ciudadela' : i === 1 ? 'Loma Hermosa' : `Localidad ${i}`, precio: 10000 + i * 100, estimado: i === 5 }));

export function dobleFirebase() {
  return `
import { hashTexto } from '/catalogo-bundle.js';
const M = () => window.__MOCK || {};
const copia = (x) => JSON.parse(JSON.stringify(x));
const L = window.__LECT = { total: 0, config: 0, catalogo_unico: 0, catalogo_col: 0, envios_unico: 0, envios_col: 0, otros: 0 };
const cuenta = (clave, n = 1) => { L.total += n; L[clave] = (L[clave] || 0) + n; };
// ── "servidor" en memoria ──
const S = { docs: new Map(), cols: { catalogo_publico: new Map(), envios_publico: new Map() }, oyentes: [] };
const sinId = (it) => { const { id, ...r } = it; return r; };
function armarPartes(base, items, limite) {
  const orden = [...items].sort((a, b) => (a.id < b.id ? -1 : 1)); const grupos = []; let g = [], tam = 2;
  for (const it of orden) { const t = new TextEncoder().encode(JSON.stringify(it)).length + 1; if (g.length && tam + t > limite) { grupos.push(g); g = []; tam = 2; } g.push(it); tam += t; }
  grupos.push(g); const datos = grupos.map((x) => JSON.stringify(x)); const hash = hashTexto(datos.join('\\u0001'));
  return datos.map((d, i) => [i === 0 ? base : base + '_' + (i + 1), { v: 1, parte: i + 1, partes: datos.length, total: orden.length, hash, datos: d, actualizado: Date.now() }]);
}
function notificarDoc(clave) { for (const o of S.oyentes) if (o.tipo === 'doc' && o.clave === clave) entregarDoc(o); }
function entregarDoc(o) {
  const d = S.docs.get(o.clave);
  if (o.clave === 'config_sitio/config') { cuenta('config'); } else if (/^config_sitio\\/catalogo/.test(o.clave)) cuenta('catalogo_unico'); else if (/^config_sitio\\/envios/.test(o.clave)) cuenta('envios_unico'); else cuenta('otros');
  o.okf({ exists: () => d !== undefined, data: () => copia(d) });
}
function notificarCol(nombre, cambiados) {
  for (const o of S.oyentes) if (o.tipo === 'col' && o.nombre === nombre) { cuenta(nombre === 'catalogo_publico' ? 'catalogo_col' : 'envios_col', cambiados); o.okf(snapCol(nombre)); }
}
const snapCol = (n) => ({ size: S.cols[n].size, docs: [...S.cols[n]].map(([id, d]) => ({ id, data: () => copia(d) })) });
function publicar(base, nombreCol, items, limite) {
  const m = S.cols[nombreCol]; let cambiados = 0; const nuevos = new Map(items.map((i) => [i.id, sinId(i)]));
  for (const [id, d] of nuevos) if (JSON.stringify(m.get(id)) !== JSON.stringify(d)) { m.set(id, d); cambiados++; }
  for (const id of [...m.keys()]) if (!nuevos.has(id)) { m.delete(id); cambiados++; }
  if (cambiados) notificarCol(nombreCol, cambiados);
  const f = M().fuente || 'unico'; if (f === 'respaldo' || f === 'error-unico') return;
  const partes = armarPartes(base, items, limite);
  if (f === 'roto') partes[0][1].hash = 'hash-que-no-coincide';
  const viejas = [...S.docs.keys()].filter((k) => k === 'config_sitio/' + base || k.startsWith('config_sitio/' + base + '_'));
  const nuevas = new Set(partes.map(([id]) => 'config_sitio/' + id));
  for (const k of viejas) if (!nuevas.has(k)) { S.docs.delete(k); notificarDoc(k); }
  for (const [id, d] of partes) { const k = 'config_sitio/' + id; const antes = S.docs.get(k); const cambio = !antes || antes.hash !== d.hash || antes.datos !== d.datos; if (cambio) { S.docs.set(k, d); notificarDoc(k); } }
}
const itemsCat = () => (M().catalogo || productosDef());
const itemsEnv = () => (M().envios || enviosDef());
function productosDef() { return window.__PRODUCTOS_DEF || []; }
function enviosDef() { return window.__ENVIOS_DEF || []; }
const limite = () => (M().fuente === 'partes' ? (M().limiteParte || 4000) : 600000);
function iniciar() {
  if (S.listo) return; S.listo = true; const m = M();
  S.docs.set('config_sitio/config', m.config === undefined ? undefined : m.config); if (m.config == null) S.docs.delete('config_sitio/config');
  const sembrar = () => { publicar('catalogo', 'catalogo_publico', itemsCat(), limite()); publicar('envios', 'envios_publico', itemsEnv(), 600000); };
  if (m.fuente === 'solo-unico') { const f = m.fuente; const col = S.cols; sembrar(); col.catalogo_publico.clear(); col.envios_publico.clear(); }
  else if (m.unicoAparece) { const f = m.fuente; m.fuente = 'respaldo'; sembrar(); m.fuente = f; setTimeout(sembrar, m.unicoAparece); }
  else sembrar();
}
window.__SERVIDOR = {
  publicarCatalogo: (items) => { window.__MOCK.catalogo = items; publicar('catalogo', 'catalogo_publico', items, limite()); },
  publicarEnvios: (items) => { window.__MOCK.envios = items; publicar('envios', 'envios_publico', items, 600000); },
  quitarUnico: (base) => { for (const k of [...S.docs.keys()]) if (k === 'config_sitio/' + base || k.startsWith('config_sitio/' + base + '_')) { S.docs.delete(k); notificarDoc(k); } },
  emitirConfig: (cfg) => { window.__MOCK.config = cfg; if (cfg == null) S.docs.delete('config_sitio/config'); else S.docs.set('config_sitio/config', cfg); notificarDoc('config_sitio/config'); },
};
export const db = {};
export const collection = (_d, nombre) => ({ tipo: 'col', nombre });
export const doc = (_d, coleccion, id) => ({ tipo: 'doc', coleccion, id });
export const setDoc = async () => { throw new Error('el doble de pruebas no escribe'); };
export const onSnapshot = (ref, okf, errf) => {
  iniciar(); const m = M();
  if (ref.tipo === 'doc') {
    const clave = ref.coleccion + '/' + ref.id; const o = { tipo: 'doc', clave, okf, errf }; S.oyentes.push(o);
    if (clave === 'config_sitio/config') {
      if (m.configModo === 'error') setTimeout(() => errf && errf(new Error('mock: sin permiso')), m.configDemora ?? 20);
      else if (m.configModo !== 'silencio') setTimeout(() => entregarDoc(o), m.configDemora ?? 20);
    } else if (clave === 'config_sitio/catalogo' && m.fuente === 'error-unico') setTimeout(() => errf && errf(new Error('mock: sin permiso')), 20);
    else setTimeout(() => entregarDoc(o), (clave.startsWith('config_sitio/catalogo') ? m.catalogoDemora : m.enviosDemora) ?? 20);
    return () => { S.oyentes = S.oyentes.filter((x) => x !== o); };
  }
  const o = { tipo: 'col', nombre: ref.nombre, okf, errf }; S.oyentes.push(o);
  setTimeout(() => { const n = S.cols[ref.nombre] ? S.cols[ref.nombre].size : 0; cuenta(ref.nombre === 'catalogo_publico' ? 'catalogo_col' : ref.nombre === 'envios_publico' ? 'envios_col' : 'otros', n); okf(snapCol(ref.nombre)); }, (ref.nombre === 'catalogo_publico' ? m.catalogoDemora : m.enviosDemora) ?? 20);
  return () => { S.oyentes = S.oyentes.filter((x) => x !== o); };
};
export const writeBatch = () => { throw new Error('el doble de pruebas no escribe'); };
`;
}

// Datos por defecto que el doble necesita en la página (se inyectan antes de cargar): window.__PRODUCTOS_DEF / __ENVIOS_DEF.
export const guion = (n = 24, e = 152) => `window.__PRODUCTOS_DEF = ${JSON.stringify(productosPrueba(n))}; window.__ENVIOS_DEF = ${JSON.stringify(enviosPrueba(e))};`;
