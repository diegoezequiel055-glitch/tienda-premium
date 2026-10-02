import { db, collection, onSnapshot } from './firebase-config.js';

const WHATSAPP_NUMERO = '5491156253612'; // número de Diego, con código de país y área, sin + ni espacios
const MODOS = { menor: 'Por menor', mayorista: 'Por mayor', curva: 'Curva' };
const CAMPO_PRECIO = { menor: 'precio', mayorista: 'precioMayorista', curva: 'precioCurva' };
const NOTAS_MODO = {
  menor: '',
  mayorista: 'Precio por mayor sujeto a cantidad mínima — lo confirmamos al recibir tu pedido por WhatsApp.',
  curva: 'Precio por curva (comprando el surtido de talles) sujeto a cantidad mínima — lo confirmamos por WhatsApp.',
};

let productos = [];
let busqueda = '';
let categoria = '';
let modo = localStorage.getItem('modoPrecio') || 'menor';
let detalleId = null;
let carrito = cargarCarrito(); // [{id, nombre, categoria, talle, precio, modo, cantidad}]

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const precioDe = (p, m) => p[CAMPO_PRECIO[m]] || null;

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
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
};

// ── catálogo en vivo ──
onSnapshot(collection(db, 'catalogo_publico'), (snap) => {
  productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCatPills();
  renderGrid();
}, () => {
  $('grid').innerHTML = `<div class="empty"><p>El catálogo todavía no está disponible.<br>Volvé a intentar en un rato.</p></div>`;
});

// ── selector de precio (menor / mayorista / curva) ──
function pintarSelectoresModo() {
  const html = Object.entries(MODOS).map(([k, l]) => `<button class="modo-btn${modo === k ? ' active' : ''}" onclick="setModo('${k}')">${l}</button>`).join('');
  $('modo-selector-top').innerHTML = html;
  const sel2 = $('modo-selector-detalle');
  if (sel2) sel2.innerHTML = html;
  $('modo-nota').textContent = NOTAS_MODO[modo];
}
window.setModo = function (m) {
  modo = m;
  try { localStorage.setItem('modoPrecio', m); } catch {}
  pintarSelectoresModo();
  renderGrid();
  if (detalleId) pintarDetalle();
};

// ── categorías (pills) ──
function renderCatPills() {
  const cats = [...new Set(productos.map((p) => p.categoria))].sort();
  const cont = $('cat-pills');
  if (cont.dataset.n == cats.length) return;
  cont.dataset.n = cats.length;
  cont.innerHTML = `<button class="cat-pill active" onclick="setCategoria('')">Todas</button>` +
    cats.map((c) => `<button class="cat-pill" onclick="setCategoria('${esc(c)}')" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
window.setBusqueda = function (v) { busqueda = v; renderGrid(); };
window.setCategoria = function (v) {
  categoria = v;
  document.querySelectorAll('.cat-pill').forEach((b) => b.classList.toggle('active', (b.dataset.cat || '') === v));
  renderGrid();
};

// ── grilla ──
function renderGrid() {
  pintarSelectoresModo();
  const grid = $('grid');
  if (!productos.length) { grid.innerHTML = `<div class="empty"><p>Todavía no hay productos cargados.<br>Volvé pronto 🙂</p></div>`; return; }
  const q = busqueda.toLowerCase().trim();
  const filtrados = productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q)) && (!categoria || p.categoria === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  if (!filtrados.length) { grid.innerHTML = `<div class="empty"><p>No encontramos productos con esa búsqueda.</p></div>`; return; }
  grid.innerHTML = filtrados.map((p) => {
    const precio = precioDe(p, modo);
    return `<div class="card" onclick="abrirDetalle('${esc(p.id)}')">
      <div class="card-foto">${p.foto ? `<img src="${esc(p.foto)}" loading="lazy" alt="${esc(p.nombre)}" onerror="this.outerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">` : '<span class="sin-foto">Sin foto</span>'}</div>
      <div class="card-cat">${esc(p.categoria)}</div>
      <div class="card-nombre">${esc(p.nombre)}</div>
      <div class="card-precio">${precio ? '$' + fmt(precio) : '<small>Consultar precio ' + MODOS[modo].toLowerCase() + '</small>'}</div>
      <div class="card-talles">${(p.talles || []).length ? 'Talles: ' + p.talles.map((t) => esc(t.talle)).join(' · ') : 'Sin stock'}</div>
    </div>`;
  }).join('');
}

// ── ficha de producto ──
window.abrirDetalle = function (id) {
  detalleId = id;
  pintarDetalle();
  $('detalle-overlay').classList.add('open');
};
window.cerrarDetalle = function () { $('detalle-overlay').classList.remove('open'); detalleId = null; };

function pintarDetalle() {
  const p = productos.find((x) => x.id === detalleId); if (!p) return;
  pintarSelectoresModo();
  $('detalle-foto').innerHTML = p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nombre)}" onerror="this.parentElement.innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">` : '<span class="sin-foto">Sin foto</span>';
  $('detalle-cat').textContent = p.categoria;
  $('detalle-nombre').textContent = p.nombre;
  const precio = precioDe(p, modo);
  $('detalle-precio').innerHTML = precio ? '$' + fmt(precio) : `<span style="font-size:1rem;color:var(--muted)">Sin precio ${MODOS[modo].toLowerCase()} cargado — consultanos</span>`;
  const talles = p.talles || [];
  $('detalle-talles').innerHTML = talles.length
    ? talles.map((t) => `<button class="talle-btn" ${precio ? '' : 'disabled'} onclick="agregarAlCarrito('${esc(p.id)}','${esc(t.talle)}')">${esc(t.talle)}</button>`).join('')
    : '<span class="sin-stock">Sin stock disponible</span>';
}

// ── carrito ──
window.agregarAlCarrito = function (id, talle) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  const precio = precioDe(p, modo);
  if (!precio) { toast(`Todavía no hay precio ${MODOS[modo].toLowerCase()} para este producto.`); return; }
  const fila = (p.talles || []).find((t) => t.talle === talle); if (!fila) return;
  const existente = carrito.find((c) => c.id === id && c.talle === talle && c.modo === modo);
  const enCarrito = existente ? existente.cantidad : 0;
  if (enCarrito >= fila.stock) { toast(`No hay más stock de ${p.nombre} talle ${talle}.`); return; }
  if (existente) existente.cantidad++;
  else carrito.push({ id, nombre: p.nombre, categoria: p.categoria, talle, precio, modo, cantidad: 1 });
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
    body.innerHTML = `<div class="carrito-vacio">Todavía no agregaste nada.<br>Elegí un producto para empezar.</div>`;
  } else {
    body.innerHTML = carrito.map((c, i) => `<div class="carrito-item">
      <div class="carrito-item-info"><b>${esc(c.nombre)}</b>Talle ${esc(c.talle)} · $${fmt(c.precio)} c/u ${c.modo !== 'menor' ? `<em>${esc(MODOS[c.modo])}</em>` : ''}</div>
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
  const lineas = carrito.map((c) => `• ${c.categoria} — ${c.nombre} (Talle ${c.talle}${c.modo !== 'menor' ? ' · ' + MODOS[c.modo] : ''}) x${c.cantidad} = $${fmt(c.precio * c.cantidad)}`).join('\n');
  const msg = `¡Hola! Quiero hacer este pedido:\n${lineas}\n\nTotal: $${fmt(totalCarrito())}`;
  window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`, '_blank');
};

actualizarContador();
pintarSelectoresModo();
