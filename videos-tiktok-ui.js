import { normalizarVideos, tarjetaVideoHtml } from './videos-tiktok.js';
import { enPortadaNormal, alCambiarPortada } from './portada-normal.js';
import { fotoCloudinary } from './fotos-cloudinary.js';

// ══════════════════════════════════════════
// SECCIÓN "NUESTROS VIDEOS" (TikTok) — al final de la portada, debajo de Ofertas y antes del texto/datos de envío y el footer.
//   • Los videos vienen de config_sitio/config › videosTiktok (app.js los publica en window.__videosTiktok y avisa con
//     'videos-tiktok-actualizados'): ninguna lectura extra. Sin videos (o campo inexistente) no se muestra nada ni queda hueco.
//   • Se ve SOLO en la portada normal (portada-normal.js): no en categorías, ni en la vista de ofertas, ni al buscar.
//   • Cada tarjeta es un link a tiktok.com en pestaña nueva. No se carga ningún script ni reproductor de TikTok.
//   • Analytics: click en una tarjeta o en "Ver más en TikTok →" → evento click_tiktok (analytics.js, delegado por [data-tiktok]).
// ══════════════════════════════════════════
const $ = (id) => document.getElementById(id);
let hay = false;

function mostrar() { const sec = $('videos-section'); if (sec) sec.style.display = hay && enPortadaNormal() ? '' : 'none'; }

function alCambiarVideos(lista) {
  const videos = normalizarVideos(lista);
  hay = videos.length > 0;
  const carril = $('videos-strip');
  if (carril) carril.innerHTML = videos.map((v, i) => tarjetaVideoHtml(v, i, fotoCloudinary(v.portada, 'tarjeta'))).join('');
  mostrar();
}

alCambiarPortada(mostrar);
document.addEventListener('videos-tiktok-actualizados', (e) => alCambiarVideos(e.detail));
if (Array.isArray(window.__videosTiktok) || window.__videosTiktok === null) alCambiarVideos(window.__videosTiktok); // la config llegó antes que este archivo
