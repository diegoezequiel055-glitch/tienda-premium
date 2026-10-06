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
const partes = document.title.split(' — ');
document.title = partes.length > 1 ? `${partes[0]} — ${datosNegocio.nombreMarca}` : datosNegocio.nombreMarca;
