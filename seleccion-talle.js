// ══════════════════════════════════════════
// ELEGIR TALLE Y DESPUÉS "AGREGAR AL CARRITO" (ficha del producto).
// Tocar un talle solo lo selecciona; el botón de abajo dice "Elegí tu talle" hasta
// que haya uno elegido (si se toca sin talle, lleva a los talles y los resalta) y
// pasa a "Agregar al carrito". Con un solo talle tampoco se preselecciona.
// app.js dibuja los botones de talle (data-talle) y expone window.agregarAlCarrito,
// que valida el stock contra lo que ya hay en el carrito y devuelve true/false.
// Escucha 'detalle-pintado'. Sin cambios en el carrito ni en el mensaje de WhatsApp.
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);

let sel = { id: null, talle: null };
let producto = null;
let confirmando = false; // mostrando "Agregado ✓"
let timerOk = null;

function pintarBoton() {
  const btn = $('btn-agregar-carrito'); if (!btn) return;
  const hayTalles = !!(producto && (producto.talles || []).length);
  btn.style.display = hayTalles ? '' : 'none';
  if (confirmando) return;
  const listo = !!sel.talle;
  btn.textContent = listo ? 'Agregar al carrito' : 'Elegí tu talle';
  btn.classList.toggle('pendiente', !listo);
  btn.classList.remove('ok');
  btn.setAttribute('aria-disabled', listo ? 'false' : 'true');
}

function pintarTalles() {
  const talles = (producto && producto.talles) || [];
  $('detalle-talles').querySelectorAll('.talle-btn').forEach((b) => {
    const t = talles.find((x) => x.talle === b.dataset.talle);
    const agotado = !t || !(t.stock > 0);
    b.classList.toggle('agotado', agotado); // sin stock: tachado y no se puede elegir
    b.disabled = agotado;
    const on = !agotado && b.dataset.talle === sel.talle;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function crearBoton() {
  if ($('btn-agregar-carrito')) return;
  const talles = $('detalle-talles'); if (!talles) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-agregar-carrito';
  btn.className = 'btn-agregar pendiente';
  btn.addEventListener('click', agregar);
  talles.insertAdjacentElement('afterend', btn); // antes del botón Compartir (compartir.js lo deja justo después de los talles)
}

function resaltarTalles() {
  const cont = $('detalle-talles');
  cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
  cont.classList.remove('pulso'); void cont.offsetWidth; cont.classList.add('pulso');
  clearTimeout(cont._pulso); cont._pulso = setTimeout(() => cont.classList.remove('pulso'), 1300);
}

function agregar() {
  if (!producto || confirmando) return;
  if (!sel.talle) { resaltarTalles(); return; }
  const ok = window.agregarAlCarrito(producto.id, sel.talle); // avisa si no hay más stock
  if (!ok) return;
  const btn = $('btn-agregar-carrito');
  confirmando = true;
  btn.textContent = 'Agregado ✓';
  btn.classList.add('ok');
  clearTimeout(timerOk);
  timerOk = setTimeout(() => { confirmando = false; pintarBoton(); }, 2000);
}

$('detalle-talles').addEventListener('click', (e) => {
  const b = e.target.closest('.talle-btn'); if (!b || b.disabled) return;
  sel.talle = b.dataset.talle;
  pintarTalles();
  if (!confirmando) pintarBoton();
});

document.addEventListener('detalle-pintado', (e) => {
  producto = e.detail;
  if (sel.id !== producto.id) { sel = { id: producto.id, talle: null }; confirmando = false; clearTimeout(timerOk); }
  const talles = producto.talles || [];
  if (sel.talle && !talles.some((t) => t.talle === sel.talle && t.stock > 0)) sel.talle = null; // el talle se agotó
  crearBoton();
  pintarTalles();
  pintarBoton();
});
