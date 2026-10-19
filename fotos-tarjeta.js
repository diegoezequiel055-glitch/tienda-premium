// ══════════════════════════════════════════
// FOTOS DE LAS TARJETAS — carga diferida de las fotos extra.
// Una tarjeta con varias fotos trae solo la PRIMERA con src (app.js › cardFotoHtml); las demás
// llevan data-src y se activan acá cuando la persona interactúa con la tarjeta:
//   · toca / apoya el dedo o el mouse sobre la foto (pointerdown, touchstart)
//   · pasa el mouse por encima (escritorio)
//   · desliza el carril (scroll) o navega con el teclado (focusin)
// Así la portada no descarga ~175 fotos que casi nadie llega a ver. Una vez activadas no se
// vuelve a hacer nada. No toca datos ni precios: solo pasa data-src → src.
// ══════════════════════════════════════════

export function activarFotos(carril) {
  if (!carril || !carril.querySelectorAll) return 0;
  let n = 0;
  carril.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; }); // también la primera, por si se desliza antes de que cargue
  carril.querySelectorAll('img[data-src]').forEach((img) => {
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
    n++;
  });
  return n;
}

if (typeof document !== 'undefined') {
  const carrilDe = (t) => (t && t.closest ? t.closest('.card-foto')?.querySelector('.card-foto-scroll') : null);
  const alInteractuar = (e) => { const c = carrilDe(e.target); if (c) activarFotos(c); };
  ['pointerdown', 'touchstart', 'mouseover', 'focusin'].forEach((ev) => document.addEventListener(ev, alInteractuar, { passive: true, capture: true }));
  // scroll no burbujea: se escucha en captura. Solo importa el del carril de la tarjeta.
  document.addEventListener('scroll', (e) => { if (e.target.classList && e.target.classList.contains('card-foto-scroll')) activarFotos(e.target); }, { passive: true, capture: true });
}
