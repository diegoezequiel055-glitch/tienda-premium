// ══════════════════════════════════════════
// "Producto eliminado · Deshacer" — aviso de 4 segundos abajo cuando se elimina un producto
// del carrito. Deshacer lo vuelve a poner con su talle y cantidad (window.restaurarEliminado,
// de app.js). Escucha 'carrito-eliminado'. Si se elimina otro antes de que termine, el aviso
// pasa a ese (solo se puede deshacer el último).
// ══════════════════════════════════════════

const DURACION_MS = 4000;
let barra = null;
let timer = null;
let ultimo = null;

function crear() {
  barra = document.createElement('div');
  barra.className = 'deshacer-barra';
  barra.setAttribute('role', 'status');
  barra.setAttribute('aria-live', 'polite');
  barra.innerHTML = '<span>Producto eliminado</span><button type="button" class="deshacer-btn">Deshacer</button>';
  barra.querySelector('.deshacer-btn').addEventListener('click', () => {
    if (ultimo && window.restaurarEliminado) window.restaurarEliminado(ultimo.item, ultimo.idx);
    ocultar();
  });
  document.body.appendChild(barra);
}
function ocultar() {
  clearTimeout(timer);
  ultimo = null;
  if (barra) barra.classList.remove('show');
}

document.addEventListener('carrito-eliminado', (e) => {
  if (!barra) crear();
  ultimo = e.detail;
  void barra.offsetWidth;
  barra.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(ocultar, DURACION_MS);
});
