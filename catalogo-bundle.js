// ══════════════════════════════════════════
// LECTURA DEL CATÁLOGO Y DE LAS LOCALIDADES DE ENVÍO COMO DOCUMENTO ÚNICO (config_sitio/catalogo y config_sitio/envios).
// Antes cada visita leía dos colecciones enteras (catalogo_publico ≈ 73 fichas + envios_publico = 152 localidades ≈ 226 lecturas).
// Ahora lee UN documento de catálogo y UNO de localidades: 2 lecturas (3 con la configuración). StockMGR los arma al sincronizar.
//
// FORMATO (el mismo que escribe StockMGR › catalogo-bundle.js): documentos `<base>`, `<base>_2`, `<base>_3`... en `config_sitio`:
//   { v: 1, parte: k, partes: N, total, hash, datos: "<JSON de un arreglo de elementos>", actualizado }
//   Si el contenido pasa de ~600 KB StockMGR lo reparte solo en más partes (el límite de Firestore es 1 MiB por documento).
//
// RESPALDO: si el documento no existe todavía, falla la lectura, está roto (JSON o hash que no coinciden) o le falta una parte,
// la tienda lee las colecciones de siempre (catalogo_publico / envios_publico), que StockMGR sigue sincronizando. Así el orden de
// publicación no rompe nada y se puede volver atrás. Si el documento único aparece o se arregla después, se cambia solo.
// escucharPublico() entrega lo mismo que entregaba onSnapshot de la colección ({ docs: [{ id, data() }] }): el resto de la
// tienda no cambia. unirPartes(), aSnapshot() y hashTexto() son puras y se prueban en test-bundle.mjs.
// ══════════════════════════════════════════

export const VERSION = 1;
export const ESPERA_PARTES_MS = 5000; // si faltan partes pasado este tiempo, se usa el respaldo

export const idParte = (base, k) => (k === 1 ? base : `${base}_${k}`);

// Hash de 53 bits (cyrb53), IDÉNTICO al de StockMGR.
export function hashTexto(s, semilla = 0) {
  let h1 = 0xdeadbeef ^ semilla, h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// partes: arreglo con los datos (data()) de cada documento, en cualquier orden. Devuelve { ok: true, items } o { ok: false, motivo }.
export function unirPartes(partes) {
  const p1 = (partes || []).find((p) => p && p.parte === 1);
  if (!p1) return { ok: false, motivo: 'falta la parte 1' };
  if (p1.v !== VERSION) return { ok: false, motivo: 'versión desconocida: ' + p1.v };
  if (!Number.isInteger(p1.partes) || p1.partes < 1 || p1.partes > 50) return { ok: false, motivo: 'cantidad de partes inválida' };
  const orden = [];
  for (let k = 1; k <= p1.partes; k++) {
    const p = partes.find((x) => x && x.parte === k);
    if (!p) return { ok: false, motivo: `falta la parte ${k} de ${p1.partes}` };
    if (p.hash !== p1.hash || p.partes !== p1.partes) return { ok: false, motivo: `la parte ${k} es de otra versión` };
    if (typeof p.datos !== 'string') return { ok: false, motivo: `la parte ${k} no tiene datos` };
    orden.push(p.datos);
  }
  if (hashTexto(orden.join('\u0001')) !== p1.hash) return { ok: false, motivo: 'el contenido no coincide con su hash' };
  const items = [];
  try { for (const d of orden) { const a = JSON.parse(d); if (!Array.isArray(a)) return { ok: false, motivo: 'datos no es un arreglo' }; items.push(...a); } }
  catch { return { ok: false, motivo: 'JSON inválido' }; }
  if (items.some((i) => !i || typeof i.id !== 'string')) return { ok: false, motivo: 'hay elementos sin id' };
  if (typeof p1.total === 'number' && p1.total !== items.length) return { ok: false, motivo: 'la cantidad no coincide' };
  return { ok: true, items };
}

// Mismo formato que un snapshot de colección: el resto de la tienda hace snap.docs.map((d) => ({ id: d.id, ...d.data() })).
export function aSnapshot(items) {
  return { size: items.length, docs: items.map(({ id, ...resto }) => ({ id, data: () => resto })) };
}

// Escucha el documento único y, si no sirve, la colección de respaldo.
//   base: 'catalogo' | 'envios'   coleccion: 'catalogo_publico' | 'envios_publico'
//   fb: { db, collection, doc, onSnapshot } (de firebase-config.js)
//   alSnap(snapshotLike)  alError(err): solo si TAMBIÉN falla el respaldo.
// Devuelve { parar(), modo() } con modo() = 'pendiente' | 'unico' | 'respaldo'.
export function escucharPublico({ base, coleccion, fb, alSnap, alError = () => {}, esperaPartes = ESPERA_PARTES_MS }) {
  const { db, collection, doc, onSnapshot } = fb;
  let modo = 'pendiente', parado = false;
  const partes = new Map(), bajas = new Map();
  let bajaRespaldo = null, temporizador = null;

  const iniciarRespaldo = () => {
    if (bajaRespaldo || parado) return;
    modo = 'respaldo';
    bajaRespaldo = onSnapshot(collection(db, coleccion), (snap) => { if (modo === 'respaldo') alSnap(snap); }, alError);
  };
  const detenerRespaldo = () => { if (bajaRespaldo) { bajaRespaldo(); bajaRespaldo = null; } };
  const fallo = () => { clearTimeout(temporizador); temporizador = null; iniciarRespaldo(); };

  function evaluar() {
    const p1 = partes.get(1); if (!p1) return;
    const lista = [...partes.values()];
    const r = unirPartes(lista);
    if (r.ok) { clearTimeout(temporizador); temporizador = null; modo = 'unico'; detenerRespaldo(); alSnap(aSnapshot(r.items)); return; }
    // ¿todavía faltan partes que están por llegar? se espera un poco; cualquier otro motivo = respaldo
    if (r.motivo.startsWith('falta la parte') || r.motivo.includes('otra versión')) {
      if (!temporizador) temporizador = setTimeout(() => { temporizador = null; if (modo !== 'unico') fallo(); }, esperaPartes);
      return;
    }
    fallo();
  }

  function suscribirParte(k) {
    if (bajas.has(k) || parado) return;
    bajas.set(k, onSnapshot(doc(db, 'config_sitio', idParte(base, k)), (snap) => {
      if (!snap.exists()) { partes.delete(k); if (k === 1) { fallo(); } else evaluar(); return; }
      const d = snap.data(); partes.set(k, d);
      if (k === 1) { const n = Number.isInteger(d.partes) ? Math.min(d.partes, 50) : 1; for (let i = 2; i <= n; i++) suscribirParte(i); for (const [j, baja] of [...bajas]) if (j > n) { baja(); bajas.delete(j); partes.delete(j); } }
      evaluar();
    }, () => { if (k === 1) fallo(); else if (modo !== 'unico') fallo(); }));
  }
  suscribirParte(1);
  return { parar() { parado = true; detenerRespaldo(); clearTimeout(temporizador); for (const b of bajas.values()) b(); }, modo: () => modo };
}
