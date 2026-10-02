import { db, collection, onSnapshot } from './firebase-config.js';

const WHATSAPP_NUMERO = '5491156253612'; // número de Diego, con código de país y área, sin + ni espacios

let productos = [];
let busqueda = '';
let categoria = '';
let carrito = cargarCarrito(); // [{id, nombre, categoria, talle, precio, cantidad}]

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

function cargarCarrito() {
  try { return JSON.parse(localStorage.getItem('carrito') || '[]'); } catch { return []; }
}
function guardarCarrito() {
  try { localStorage.setItem('carrito', JSON.stringify(carrito)); } catch {}
}

window.toast = function (msg) {
  const t = $('toast');
  t.textContent = msg;
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
};

// ── catálogo en vivo ──
onSnapshot(collection(db, 'catalogo_publico'), (snap) => {
  productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCategorias();
  renderGrid();
}, () => {
  $('grid').innerHTML = `<div class="empty"><p>El catálogo todavía no está disponible.<br>Volvé a intentar en un rato.</p></div>`;
});

function renderCategorias() {
  const sel = $('sel-cat');
  const cats = [...new Set(productos.map((p) => p.categoria))].sort();
  if (sel.dataset.n == cats.length) return;
  sel.dataset.n = cats.length;
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

window.setBusqueda = function (v) { busqueda = v; renderGrid(); };
window.setCategoria = function (v) { categoria = v; renderGrid(); };

function renderGrid() {
  const grid = $('grid');
  if (!productos.length) { grid.innerHTML = `<div class="empty"><p>Todavía no hay productos cargados.<br>Volvé pronto 🙂</p></div>`; return; }
  const q = busqueda.toLowerCase().trim();
  const filtrados = productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q)) && (!categoria || p.categoria === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  if (!filtrados.length) { grid.innerHTML = `<div class="empty"><p>No encontramos productos con esa búsqueda.</p></div>`; return; }
  grid.innerHTML = filtrados.map((p) => `<div class="card">
    <div class="card-foto">${p.foto ? `<img src="${esc(p.foto)}" loading="lazy" alt="${esc(p.nombre)}" onerror="this.outerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">` : '<span class="sin-foto">Sin foto</span>'}</div>
    <div class="card-body">
      <div class="card-cat">${esc(p.categoria)}</div>
      <div class="card-nombre">${esc(p.nombre)}</div>
      <div class="card-precio">${p.precio ? '$' + fmt(p.precio) : 'Consultar precio'}</div>
      <div class="card-talles">${(p.talles || []).length
        ? p.talles.map((t) => `<button class="talle-btn" onclick="agregarAlCarrito('${esc(p.id)}','${esc(t.talle)}')">${esc(t.talle)}</button>`).join('')
        : '<span class="sin-stock">Sin stock</span>'}</div>
    </div>
  </div>`).join('');
}

// ── carrito ──
window.agregarAlCarrito = function (id, talle) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  const fila = (p.talles || []).find((t) => t.talle === talle); if (!fila) return;
  const existente = carrito.find((c) => c.id === id && c.talle === talle);
  const enCarrito = existente ? existente.cantidad : 0;
  if (enCarrito >= fila.stock) { toast(`No hay más stock de ${p.nombre} talle ${talle}.`); return; }
  if (existente) existente.cantidad++;
  else carrito.push({ id, nombre: p.nombre, categoria: p.categoria, talle, precio: p.precio || 0, cantidad: 1 });
  guardarCarrito(); actualizarContador();
  toast(`${p.nombre} (${talle}) agregado al pedido ✓`);
};
window.cambiarCantidad = function (idx, delta) {
  const item = carrito[idx]; if (!item) return;
  const p = productos.find((x) => x.id === item.id);
  const fila = p?.talles.find((t) => t.talle === item.talle);
  const max = fila ? fila.stock : 99;
  item.cantidad = Math.max(1, Math.min(max, item.cantidad + delta));
  guardarCarrito(); renderCarrito(); actualizarContador();
};
window.quitarDelCarrito = function (idx) {
  carrito.splice(idx, 1);
  guardarCarrito(); renderCarrito(); actualizarContador();
};
function actualizarContador() {
  $('cart-count').textContent = carrito.reduce((a, c) => a + c.cantidad, 0);
}
function totalCarrito() { return carrito.reduce((a, c) => a + c.precio * c.cantidad, 0); }

window.abrirCarrito = function () { renderCarrito(); $('carrito-overlay').classList.add('open'); };
window.cerrarCarrito = function () { $('carrito-overlay').classList.remove('open'); };

function renderCarrito() {
  const body = $('carrito-body');
  if (!carrito.length) {
    body.innerHTML = `<div class="carrito-vacio">Todavía no agregaste nada.<br>Elegí un talle de algún producto para empezar.</div>`;
  } else {
    body.innerHTML = carrito.map((c, i) => `<div class="carrito-item">
      <div class="carrito-item-info"><b>${esc(c.nombre)}</b>Talle ${esc(c.talle)} · $${fmt(c.precio)} c/u</div>
      <div class="carrito-item-ctrl">
        <button class="qty-btn" onclick="cambiarCantidad(${i},-1)">−</button>
        <span>${c.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${i},1)">+</button>
        <button class="carrito-item-quitar" onclick="quitarDelCarrito(${i})" title="Quitar">🗑</button>
      </div>
    </div>`).join('');
  }
  $('carrito-total').textContent = 'Total: $' + fmt(totalCarrito());
  $('btn-pedir').disabled = !carrito.length;
}

window.hacerPedido = function () {
  if (!carrito.length) return;
  const lineas = carrito.map((c) => `• ${c.categoria} — ${c.nombre} (Talle ${c.talle}) x${c.cantidad} = $${fmt(c.precio * c.cantidad)}`).join('\n');
  const msg = `¡Hola! Quiero hacer este pedido:\n${lineas}\n\nTotal: $${fmt(totalCarrito())}`;
  window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`, '_blank');
};

actualizarContador();
