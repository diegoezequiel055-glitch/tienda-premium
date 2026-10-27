// ══════════════════════════════════════════
// VIDEOS DE TIKTOK — lógica pura (sin DOM ni Firebase). Se prueba con `node test-tiktok.mjs`.
//
// StockMGR guarda en `config_sitio/config` (el documento que la tienda YA lee: sin lecturas extra, sin colecciones nuevas) el campo
//   videosTiktok: [{ url, portada, titulo }, ...]   (hasta 6)
//     url      → https://www.tiktok.com/@usuario/video/NÚMERO   (StockMGR ya le saca los parámetros de rastreo)
//     portada  → URL https de la imagen de portada (Cloudinary)
//     titulo   → texto corto opcional
// Si el campo no existe o no es una lista, no hay sección. Acá se vuelve a validar todo (nunca se confía en lo guardado): un video con un
// link que no sea de TikTok con la forma /@usuario/video/NÚMERO, o sin portada https, se descarta.
// La tarjeta es un LINK común (target="_blank", rel="noopener noreferrer"): NO se incrusta el reproductor ni se carga ningún script de TikTok.
// ══════════════════════════════════════════

export const URL_PERFIL = 'https://www.tiktok.com/@tiendapremium.ok';
export const MAX_VIDEOS = 6;
export const MAX_TITULO = 60;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Link de un video → { url limpia, id } o null. Acepta tiktok.com, www.tiktok.com y m.tiktok.com (http o https); saca todo lo que va después de ? o #.
export function limpiarLinkTiktok(texto) {
  const t = String(texto ?? '').trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const m = t.match(/^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,40})\/video\/(\d{6,25})$/i);
  return m ? { url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}`, id: m[2] } : null;
}

// Portada: solo https (la imagen vive en Cloudinary), sin espacios ni comillas.
export const portadaValida = (p) => typeof p === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(p.trim());

export const limpiarTitulo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITULO);

// Lo guardado en config → lista lista para mostrar: [{ url, id, portada, titulo }] (máximo 6, sin repetidos, sin los inválidos).
export function normalizarVideos(lista) {
  if (!Array.isArray(lista)) return [];
  const salida = [], vistos = new Set();
  for (const v of lista) {
    if (!v || typeof v !== 'object') continue;
    const l = limpiarLinkTiktok(v.url); if (!l || vistos.has(l.url)) continue;
    if (!portadaValida(v.portada)) continue;
    vistos.add(l.url);
    salida.push({ url: l.url, id: l.id, portada: v.portada.trim(), titulo: limpiarTitulo(v.titulo) });
    if (salida.length >= MAX_VIDEOS) break;
  }
  return salida;
}

// Tarjeta vertical 9:16. urlPortada: la imagen ya achicada (fotos-cloudinary.js). posicion: lugar en la fila (para Analytics, sin datos personales).
export const tarjetaVideoHtml = (v, posicion, urlPortada) => `<a class="vt-card" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer" data-tiktok="tarjeta" data-pos="${Number(posicion) + 1}" aria-label="Ver en TikTok${v.titulo ? ': ' + esc(v.titulo) : ''} (se abre en una pestaña nueva)">
    <span class="vt-portada"><img src="${esc(urlPortada || v.portada)}" width="180" height="320" loading="lazy" decoding="async" alt=""><span class="vt-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span></span>
    ${v.titulo ? `<span class="vt-titulo">${esc(v.titulo)}</span>` : ''}
    <span class="vt-ver">Ver en TikTok</span>
  </a>`;
