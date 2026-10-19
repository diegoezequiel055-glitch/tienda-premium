import { datosNegocio } from './datos-negocio.js';

// ══════════════════════════════════════════
// MARCA — se incluye en todas las páginas junto con footer.js. Pone el
// nombre de marca en el logo del header (si existe en esa página) y en el
// título de la pestaña, tomando siempre el valor de datos-negocio.js.
// ══════════════════════════════════════════

const logo = document.getElementById('hdr-logo');
if (logo) logo.textContent = datosNegocio.nombreMarca;

// El título de cada página ya trae su propio prefijo en el HTML
// (ej. "Contacto — TIENDAPREMIUM.OK"); acá solo se reemplaza la marca
// después del guión, por si cambia.
// La portada usa el formato "MARCA | descripción" (ej. "TIENDAPREMIUM.OK | Camisetas de fútbol y ropa urbana"):
// la marca va primero y el resto se conserva.
const portada = document.title.split(' | ');
const partes = document.title.split(' — ');
if (portada.length > 1) document.title = `${datosNegocio.nombreMarca} | ${portada.slice(1).join(' | ')}`;
else document.title = partes.length > 1 ? `${partes[0]} — ${datosNegocio.nombreMarca}` : datosNegocio.nombreMarca;
