// ══════════════════════════════════════════
// FOTO PRINCIPAL DE LA FICHA: se ve COMPLETA (object-fit: contain, ver style.css) dentro
// de un contenedor de altura estable. Esa altura sale de la proporción de la PRIMERA foto
// del producto (variable CSS --ficha-ratio en #detalle-foto), con un tope (70 % del alto
// de la pantalla y lo que deja el precio visible sin scroll, ver style.css); las demás fotos, aunque tengan otra proporción, se centran con fondo
// neutro a los costados o arriba y abajo. Así no hay saltos al deslizar entre fotos.
// Mientras no se conoce la proporción se usa 3 / 4 (la de casi todas las fotos).
// Escucha 'detalle-pintado'.
// ══════════════════════════════════════════

const cont = document.getElementById('detalle-foto');

function fijarProporcion() {
  const img = cont.querySelector('img'); // la primera foto (la principal)
  if (!img) return;
  const aplicar = () => {
    if (img.naturalWidth && img.naturalHeight) cont.style.setProperty('--ficha-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
  };
  if (img.complete) aplicar(); else img.addEventListener('load', aplicar, { once: true });
}

if (cont) document.addEventListener('detalle-pintado', fijarProporcion);
