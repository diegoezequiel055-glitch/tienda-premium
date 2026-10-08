import { datosNegocio } from './datos-negocio.js';

// ══════════════════════════════════════════
// BARRA DE PROMO — mini-eslogan rotativo de la barra negra de arriba.
// Los textos viven en datos-negocio.js (mensajesPromo). Se incluye en todas
// las páginas; la barra (#promo-bar-texto) está en el HTML con alto fijo.
// Con un solo texto queda fijo; con "reducir movimiento" cambia sin fade.
// ══════════════════════════════════════════

const INTERVALO_MS = 4000;
const FADE_MS = 400;

const barra = document.getElementById('promo-bar-texto');
const mensajes = (datosNegocio.mensajesPromo || []).filter(Boolean);

if (!barra || mensajes.length === 0) {
  if (barra) barra.style.display = 'none';
} else {
  barra.textContent = mensajes[0];
  if (mensajes.length > 1) {
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
    let i = 0;
    setInterval(() => {
      if (document.hidden) return;
      i = (i + 1) % mensajes.length;
      if (sinMovimiento.matches) {
        barra.textContent = mensajes[i];
        return;
      }
      barra.classList.add('promo-oculta');
      setTimeout(() => {
        barra.textContent = mensajes[i];
        barra.classList.remove('promo-oculta');
      }, FADE_MS);
    }, INTERVALO_MS);
  }
}
