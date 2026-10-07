import { db, collection, doc, onSnapshot } from './firebase-config.js';
import { datosNegocio } from './datos-negocio.js';
import { categoriasDisponibles, claveDe, normalizar } from './categorias-config.js';

const WHATSAPP_MSG_DEFECTO = '¡Hola! Quería hacer una consulta.';
const FORMAS_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
const NOTAS_PAGO = {
  efectivo: 'Solo para entregas en CABA o zona AMBA.',
  transferencia: '',
  tarjeta: 'El pago con tarjeta puede variar. Te informamos el total antes de cerrar.',
};
const TIPOS_ENTREGA = { retiro: 'Retiro en showroom', motomensajeria: 'Motomensajería (CABA/GBA)', correo: 'Correo Argentino' };
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
// Código postal argentino: 4 dígitos (viejo formato) o CPA (1 letra + 4 dígitos + 3 letras, ej. B1657ABC).
const validarCP = (cp) => { const v = cp.trim().toUpperCase(); return /^\d{4}$/.test(v) || /^[A-Z]\d{4}[A-Z]{3}$/.test(v); };

let productos = [];
let envios = [];
let busqueda = '';
let categoria = '';
let formaPago = null;
let tipoEntrega = null; // 'retiro' | 'motomensajeria' | 'correo'
let envioId = null; // id de envios_publico (solo aplica si tipoEntrega === 'motomensajeria')
let correoProvincia = '';
let correoLocalidad = '';
let correoCP = '';
let clienteNombre = '';
let detalleId = null;
let detalleFotoIdx = 0;
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
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
};

// ── catálogo en vivo (ya viene filtrado: solo lo publicable con foto, precio y stock) ──
onSnapshot(collection(db, 'catalogo_publico'), (snap) => {
  productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (categoria && !categoriasDisponibles(productos).some((c) => c.clave === categoria)) window.setCategoria('');
  renderCatPills();
  document.dispatchEvent(new CustomEvent('catalogo-actualizado', { detail: productos }));
  renderGrid();
  pintarHeroTriptico();
  renderDestacados();
  renderNuevos();
}, () => {
  $('grid').innerHTML = `<div class="empty"><p>El catálogo todavía no está disponible.<br>Volvé a intentar en un rato.</p></div>`;
});

// ── configuración del sitio en vivo (textos y fotos editables desde el panel) ──
let heroFotosManual = null; // [url|null, url|null, url|null] elegidas a mano, o null si Diego no configuró ninguna
onSnapshot(doc(db, 'config_sitio', 'config'), (snap) => {
  aplicarConfigSitio(snap.exists() ? snap.data() : {});
}, () => {});

function aplicarConfigSitio(cfg) {
  if (cfg.heroTitulo) $('hero-titulo').textContent = cfg.heroTitulo;
  if (cfg.heroSubtitulo) $('hero-subtitulo').textContent = cfg.heroSubtitulo;
  if (cfg.promoBarra) $('promo-bar-texto').textContent = cfg.promoBarra;
  if (cfg.bandaNegra) $('banda-negra-texto').textContent = cfg.bandaNegra;
  const msg = cfg.whatsappMensaje || WHATSAPP_MSG_DEFECTO;
  const flotante = $('whatsapp-float');
  if (flotante) flotante.href = `https://wa.me/${datosNegocio.whatsappNumero}?text=${encodeURIComponent(msg)}`;
  heroFotosManual = cfg.heroFotos || null;
  pintarHeroTriptico();
}

// ── datos del negocio (showroom, redes, mayorista) — estáticos, no dependen de Firestore ──
function aplicarDatosNegocio() {
  document.querySelectorAll('.btn-mayorista').forEach((el) => {
    if (datosNegocio.canalMayoristaWhatsApp) { el.href = datosNegocio.canalMayoristaWhatsApp; el.style.display = ''; }
  });

  const maps = $('showroom-maps'); if (maps) maps.href = datosNegocio.showroomMapsUrl;
  const dir = $('showroom-direccion'); if (dir) dir.textContent = datosNegocio.showroomDireccion;
  const hor = $('showroom-horarios'); if (hor) hor.textContent = datosNegocio.showroomHorarios ? ' · ' + datosNegocio.showroomHorarios : '';
}

// ── envíos (motomensajería) en vivo ──
onSnapshot(collection(db, 'envios_publico'), (snap) => {
  envios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  pintarSelectEnvio();
  avisarEntrega();
}, () => {});

function pintarSelectEnvio() {
  const sel = $('envio-select'); if (!sel) return;
  if (sel.dataset.n == envios.length) return;
  sel.dataset.n = envios.length;
  const valorPrevio = sel.value || envioId || '';
  const ordenadas = [...envios].sort((a, b) => a.localidad.localeCompare(b.localidad, 'es'));
  sel.innerHTML = '<option value="">Elegí tu localidad...</option>' +
    ordenadas.map((e) => `<option value="${esc(e.id)}">${esc(e.localidad)} — ${e.estimado ? '≈' : ''}$${fmt(e.precio)}</option>`).join('');
  if (valorPrevio) sel.value = valorPrevio;
}

// ── hero: tríptico. Si Diego eligió fotos a mano, esas ganan siempre.
// Si no, se arma solo con fotos de productos ⭐ destacados (una vez, al cargar).
const HTR_PLACEHOLDER = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 3 4 6l1.5 3L8 8v12h8V8l2.5 1L20 6l-4-3-1 2H9z"/></svg>';
function pintarHeroTriptico() {
  const cont = $('hero-triptych'); if (!cont) return;
  const divs = [...cont.querySelectorAll('.htr-ph')];
  if (heroFotosManual && heroFotosManual.some(Boolean)) {
    divs.forEach((div, i) => {
      const url = heroFotosManual[i];
      div.innerHTML = url ? `<img src="${esc(url)}" alt="" loading="lazy">` : HTR_PLACEHOLDER;
    });
    return;
  }
  if (cont.dataset.pintado) return;
  const destacadosConFoto = destacadosList().filter((p) => (p.fotos || [])[0]);
  const conFoto = productos.filter((p) => (p.fotos || [])[0]);
  if (!conFoto.length) return;
  cont.dataset.pintado = '1';
  const base = destacadosConFoto.length >= 2 ? destacadosConFoto : conFoto;
  const elegidos = [base[0], base[Math.floor(base.length / 2)], base[base.length - 1]];
  divs.forEach((div, i) => {
    const p = elegidos[i]; if (!p) return;
    div.innerHTML = `<img src="${esc(p.fotos[0])}" alt="${esc(p.nombre)}" loading="lazy">`;
  });
}

// ── botón "Comprar ahora" sobre el tríptico: baja hasta el catálogo completo ──
window.irACatalogo = function (ev) {
  if (ev) ev.preventDefault();
  $('grid-titulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── categorías (pills) ──
function renderCatPills() {
  const cats = categoriasDisponibles(productos);
  const cont = $('cat-pills');
  const firma = cats.map((c) => c.clave).join('|');
  if (cont.dataset.firma === firma) return;
  cont.dataset.firma = firma;
  cont.innerHTML = `<button class="cat-pill" onclick="setCategoria('')" data-cat="">Todas</button>` +
    cats.map((c) => `<button class="cat-pill" onclick="setCategoria('${esc(c.clave)}')" data-cat="${esc(c.clave)}">${esc(c.nombre)}</button>`).join('');
  marcarPill();
}
function marcarPill() {
  document.querySelectorAll('.cat-pill').forEach((b) => b.classList.toggle('active', (b.dataset.cat || '') === categoria));
}
window.setBusqueda = function (v) { busqueda = v; renderGrid(); };
window.setCategoria = function (v) {
  categoria = v;
  marcarPill();
  renderGrid();
  document.dispatchEvent(new CustomEvent('categoria-cambiada', { detail: v }));
};

// ── tarjeta de producto (la usan la grilla, Destacados y Nuevos ingresos) ──
function textoStockBajo(p) {
  if (!p.stockBajo) return '';
  return p.stockBajo === 1 ? '¡Última unidad!' : `¡Solo quedan ${p.stockBajo} en stock!`;
}

// Si hay más de una foto, arma un mini-carril deslizable con contador (1/3);
// con una sola foto (o ninguna) queda igual que antes, sin el overhead del carril.
window.actualizarContadorCard = function (scrollEl) {
  const total = scrollEl.children.length;
  const idx = Math.round(scrollEl.scrollLeft / (scrollEl.clientWidth || 1));
  const contador = scrollEl.nextElementSibling;
  if (contador) contador.textContent = `${Math.min(idx + 1, total)}/${total}`;
};
function cardFotoHtml(p) {
  const fotos = p.fotos || [];
  if (!fotos.length) return '<div class="card-foto"><span class="sin-foto">Sin foto</span></div>';
  if (fotos.length === 1) {
    return `<div class="card-foto"><img src="${esc(fotos[0])}" loading="lazy" alt="${esc(p.nombre)}" onerror="this.closest('.card-foto').innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'"></div>`;
  }
  return `<div class="card-foto">
      <div class="card-foto-scroll" onscroll="actualizarContadorCard(this)">
        ${fotos.map((f) => `<img src="${esc(f)}" loading="lazy" alt="${esc(p.nombre)}">`).join('')}
      </div>
      <span class="card-foto-contador">1/${fotos.length}</span>
    </div>`;
}

function tarjetaHtml(p) {
  const avisoStock = textoStockBajo(p);
  return `<div class="card" onclick="abrirDetalle('${esc(p.id)}')">
      ${cardFotoHtml(p)}
      <div class="card-cat">${esc(p.categoria)}</div>
      <div class="card-nombre">${esc(p.nombre)}</div>
      <div class="card-precio">$${fmt(p.precio)}</div>
      <div class="card-precio-nota">Abonando en efectivo o transferencia</div>
      <div class="card-talles">${(p.talles || []).length ? 'Talles: ' + p.talles.map((t) => esc(t.talle)).join(' · ') : 'Sin stock'}</div>
      ${avisoStock ? `<div class="aviso-stock-bajo">${avisoStock}</div>` : ''}
    </div>`;
}

// ── grilla ──
function renderGrid() {
  const grid = $('grid');
  if (!productos.length) { grid.innerHTML = `<div class="empty"><p>Todavía no hay productos cargados.<br>Volvé pronto 🙂</p></div>`; return; }
  const q = normalizar(busqueda);
  const filtrados = productos.filter((p) => (!q || normalizar(p.nombre).includes(q)) && (!categoria || claveDe(p.categoria) === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  if (!filtrados.length) { grid.innerHTML = `<div class="empty"><p>${q ? 'No encontramos productos con ese nombre' : 'No hay productos en esta categoría.'}</p></div>`; return; }
  grid.innerHTML = filtrados.map(tarjetaHtml).join('');
}

// ── destacados (productos tildados ⭐ desde el panel) — se oculta con menos de 2 ──
function destacadosList() {
  return productos.filter((p) => p.destacado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
function renderDestacados() {
  const sec = $('destacados-section'), strip = $('destacados-strip'); if (!sec || !strip) return;
  const lista = destacadosList();
  sec.style.display = lista.length >= 2 ? '' : 'none';
  if (lista.length >= 2) strip.innerHTML = lista.map(tarjetaHtml).join('');
}
window.irADestacados = function (ev) {
  if (ev) ev.preventDefault();
  const sec = $('destacados-section');
  (sec && sec.style.display !== 'none' ? sec : $('grid')).scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── nuevos ingresos (automático, por fecha real de alta) — se oculta con menos de 2 ──
const MAX_NUEVOS = 10;
function nuevosList() {
  return [...productos].filter((p) => p.creadoEn).sort((a, b) => b.creadoEn - a.creadoEn).slice(0, MAX_NUEVOS);
}
function renderNuevos() {
  const sec = $('nuevos-section'), strip = $('nuevos-strip'); if (!sec || !strip) return;
  const lista = nuevosList();
  sec.style.display = lista.length >= 2 ? '' : 'none';
  if (lista.length >= 2) strip.innerHTML = lista.map(tarjetaHtml).join('');
}
window.irANuevos = function (ev) {
  if (ev) ev.preventDefault();
  const sec = $('nuevos-section');
  (sec && sec.style.display !== 'none' ? sec : $('grid')).scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── ficha de producto ──
window.abrirDetalle = function (id) {
  detalleId = id;
  detalleFotoIdx = 0;
  pintarDetalle();
  $('detalle-overlay').classList.add('open');
};
window.cerrarDetalle = function () { $('detalle-overlay').classList.remove('open'); detalleId = null; };

// Varias fotos: carril deslizable (scroll-snap, igual que en las tarjetas) +
// flechas de escritorio + contador, sincronizado con la miniatura activa.
// Una sola foto (o ninguna): sin carril, sin flechas, sin contador.
function detalleFotoHtml(p, fotos) {
  if (!fotos.length) return '<span class="sin-foto">Sin foto</span>';
  if (fotos.length === 1) {
    return `<img src="${esc(fotos[0])}" alt="${esc(p.nombre)}" onerror="this.parentElement.innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">`;
  }
  return `
    <div class="detalle-foto-scroll" id="detalle-foto-scroll" onscroll="onScrollDetalleFoto(this)">
      ${fotos.map((f) => `<img src="${esc(f)}" alt="${esc(p.nombre)}">`).join('')}
    </div>
    <button class="detalle-foto-flecha detalle-foto-prev" onclick="moverFotoDetalle(-1)" aria-label="Foto anterior">‹</button>
    <button class="detalle-foto-flecha detalle-foto-next" onclick="moverFotoDetalle(1)" aria-label="Foto siguiente">›</button>
    <span class="detalle-foto-contador" id="detalle-foto-contador">${detalleFotoIdx + 1}/${fotos.length}</span>`;
}
function irAFotoDetalle(i, smooth) {
  detalleFotoIdx = i;
  const el = $('detalle-foto-scroll');
  if (el) el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  actualizarUIFotoDetalle();
}
function actualizarUIFotoDetalle() {
  const p = productos.find((x) => x.id === detalleId); if (!p) return;
  const total = (p.fotos || []).length;
  const contador = $('detalle-foto-contador');
  if (contador) contador.textContent = `${detalleFotoIdx + 1}/${total}`;
  const prev = document.querySelector('.detalle-foto-prev');
  const next = document.querySelector('.detalle-foto-next');
  if (prev) prev.classList.toggle('oculta', detalleFotoIdx === 0);
  if (next) next.classList.toggle('oculta', detalleFotoIdx === total - 1);
  document.querySelectorAll('#detalle-miniaturas .mini-foto').forEach((el, i) => el.classList.toggle('active', i === detalleFotoIdx));
}
window.elegirFotoDetalle = function (i) { irAFotoDetalle(i, true); };
window.moverFotoDetalle = function (delta) {
  const p = productos.find((x) => x.id === detalleId); if (!p) return;
  const total = (p.fotos || []).length;
  const nuevo = detalleFotoIdx + delta;
  if (nuevo < 0 || nuevo >= total) return;
  irAFotoDetalle(nuevo, true);
};
window.onScrollDetalleFoto = function (el) {
  const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
  const clamped = Math.max(0, Math.min(idx, el.children.length - 1));
  if (clamped !== detalleFotoIdx) { detalleFotoIdx = clamped; actualizarUIFotoDetalle(); }
};
document.addEventListener('keydown', (e) => {
  if (!detalleId || !$('detalle-overlay').classList.contains('open')) return;
  if (e.key === 'ArrowLeft') moverFotoDetalle(-1);
  else if (e.key === 'ArrowRight') moverFotoDetalle(1);
});

function pintarDetalle() {
  const p = productos.find((x) => x.id === detalleId); if (!p) return;
  const fotos = p.fotos || [];
  if (detalleFotoIdx >= fotos.length) detalleFotoIdx = 0;
  $('detalle-foto').innerHTML = detalleFotoHtml(p, fotos);
  if (fotos.length > 1) {
    const el = $('detalle-foto-scroll');
    if (el) el.scrollTo({ left: detalleFotoIdx * el.clientWidth, behavior: 'auto' });
  }
  $('detalle-miniaturas').innerHTML = fotos.length > 1 ? fotos.map((f, i) => `<button class="mini-foto${i === detalleFotoIdx ? ' active' : ''}" onclick="elegirFotoDetalle(${i})"><img src="${esc(f)}"></button>`).join('') : '';
  actualizarUIFotoDetalle();
  $('detalle-cat').textContent = p.categoria;
  $('detalle-nombre').textContent = p.nombre;
  $('detalle-precio').textContent = '$' + fmt(p.precio);
  $('detalle-precio-nota').textContent = 'Abonando en efectivo o transferencia';
  const talles = p.talles || [];
  $('detalle-talles').innerHTML = talles.length
    ? talles.map((t) => `<button class="talle-btn" onclick="agregarAlCarrito('${esc(p.id)}','${esc(t.talle)}')">${esc(t.talle)}</button>`).join('')
    : '<span class="sin-stock">Sin stock disponible</span>';
  const avisoStock = textoStockBajo(p);
  $('detalle-stock-bajo').textContent = avisoStock;
  $('detalle-stock-bajo').style.display = avisoStock ? '' : 'none';
  document.dispatchEvent(new CustomEvent('detalle-pintado', { detail: p }));
}

// ── carrito ──
window.agregarAlCarrito = function (id, talle) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  const fila = (p.talles || []).find((t) => t.talle === talle); if (!fila) return;
  const existente = carrito.find((c) => c.id === id && c.talle === talle);
  const enCarrito = existente ? existente.cantidad : 0;
  if (enCarrito >= fila.stock) { toast(`No hay más stock de ${p.nombre} talle ${talle}.`); return; }
  if (existente) existente.cantidad++;
  else carrito.push({ id, nombre: p.nombre, categoria: p.categoria, talle, precio: p.precio, cantidad: 1, foto: (p.fotos || [])[0] || null });
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
function envioElegido() { return envios.find((e) => e.id === envioId) || null; }
function costoEnvio() { return tipoEntrega === 'motomensajeria' ? (envioElegido()?.precio || 0) : 0; }

window.abrirCarrito = function () { renderCarrito(); $('carrito-overlay').classList.add('open'); };
window.cerrarCarrito = function () { $('carrito-overlay').classList.remove('open'); };

window.setClienteNombre = function (v) { clienteNombre = v; actualizarBotonPedir(); };

// ── entrega: Retiro en showroom / Motomensajería / Correo Argentino ──
window.setTipoEntrega = function (t) {
  tipoEntrega = t;
  if (t !== 'motomensajeria') envioId = null;
  pintarSelectorEntrega();
  actualizarTotales();
  avisarEntrega();
};
window.setEnvio = function (v) { envioId = v || null; actualizarTotales(); avisarEntrega(); };

// Puente con envio-ficha.js: la ficha lee y escribe la misma elección de entrega que el carrito.
function avisarEntrega() { document.dispatchEvent(new CustomEvent('entrega-cambiada')); }
window.getEntrega = function () { return { tipoEntrega, envioId, envios }; };
window.setEntregaDesdeFicha = function (t, id) {
  tipoEntrega = t || null;
  envioId = t === 'motomensajeria' ? (id || null) : null;
  pintarSelectorEntrega();
  actualizarTotales();
};
window.setCorreoProvincia = function (v) { correoProvincia = v; actualizarTotales(); };
window.setCorreoLocalidad = function (v) { correoLocalidad = v; actualizarBotonPedir(); };
window.setCorreoCP = function (v) {
  correoCP = v;
  const err = $('correo-cp-error');
  if (err) {
    const vacio = !v.trim();
    err.style.display = !vacio && !validarCP(v) ? '' : 'none';
  }
  actualizarBotonPedir();
};

function pintarSelectorEntrega() {
  const cont = $('entrega-selector'); if (!cont) return;
  cont.innerHTML = Object.entries(TIPOS_ENTREGA).map(([k, l]) => `<button class="modo-btn${tipoEntrega === k ? ' active' : ''}" onclick="setTipoEntrega('${k}')">${l}</button>`).join('');
  renderEntregaDetalle();
}
function renderEntregaDetalle() {
  const cont = $('entrega-detalle'); if (!cont) return;
  if (tipoEntrega === 'retiro') {
    cont.innerHTML = `<p class="modo-nota" style="margin:8px 0 0;text-align:left">${esc(datosNegocio.showroomDireccion)}${datosNegocio.showroomHorarios ? ' · ' + esc(datosNegocio.showroomHorarios) : ''}. Sin costo.</p>`;
  } else if (tipoEntrega === 'motomensajeria') {
    cont.innerHTML = `<select id="envio-select" onchange="setEnvio(this.value)" style="margin-top:8px"><option value="">Elegí tu localidad...</option></select><p class="modo-nota" id="envio-nota" style="margin-top:6px"></p>`;
    pintarSelectEnvio();
  } else if (tipoEntrega === 'correo') {
    cont.innerHTML = `
      <select id="correo-provincia" onchange="setCorreoProvincia(this.value)" style="margin-top:8px">
        <option value="">Elegí tu provincia...</option>
        ${PROVINCIAS.map((p) => `<option value="${esc(p)}"${p === correoProvincia ? ' selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
      <input type="text" id="correo-localidad" placeholder="Tu localidad" value="${esc(correoLocalidad)}" oninput="setCorreoLocalidad(this.value)" style="margin-top:8px">
      <input type="text" id="correo-cp" placeholder="Código postal (ej: 1657 o B1657ABC)" value="${esc(correoCP)}" oninput="setCorreoCP(this.value)" style="margin-top:8px" maxlength="8">
      <p class="modo-nota" id="correo-cp-error" style="display:none;color:var(--danger);text-align:left;margin-top:4px">El código postal no es válido (ej: 1657 o B1657ABC).</p>
      <p class="modo-nota" style="margin-top:6px">Te cotizamos el envío por WhatsApp.</p>`;
  } else {
    cont.innerHTML = '';
  }
}

function pintarSelectorPago() {
  $('pago-selector').innerHTML = Object.entries(FORMAS_PAGO).map(([k, l]) => `<button class="modo-btn${formaPago === k ? ' active' : ''}" onclick="setFormaPago('${k}')">${l}</button>`).join('');
  $('pago-nota').textContent = formaPago ? NOTAS_PAGO[formaPago] : 'Elegí cómo preferís pagar.';
}
window.setFormaPago = function (f) { formaPago = f; pintarSelectorPago(); actualizarBotonPedir(); };

function entregaCompleta() {
  if (tipoEntrega === 'retiro') return true;
  if (tipoEntrega === 'motomensajeria') return !!envioId;
  if (tipoEntrega === 'correo') return !!(correoProvincia && correoLocalidad.trim() && correoCP.trim() && validarCP(correoCP));
  return false;
}
function actualizarBotonPedir() {
  $('btn-pedir').disabled = !carrito.length || !formaPago || !clienteNombre.trim() || !entregaCompleta();
}
function actualizarTotales() {
  const env = envioElegido();
  const notaEl = $('envio-nota');
  if (notaEl) notaEl.textContent = tipoEntrega === 'motomensajeria' && env?.estimado ? 'Precio estimado — tarifa por horario, se confirma por WhatsApp.' : '';
  const totalEl = $('carrito-total');
  if (tipoEntrega === 'correo') {
    totalEl.innerHTML = `Subtotal: $${fmt(totalCarrito())}<br><span style="font-size:.76rem;color:var(--muted)">Envío a cotizar por WhatsApp</span>`;
  } else {
    const totalConEnvio = totalCarrito() + costoEnvio();
    totalEl.innerHTML = costoEnvio()
      ? `Productos: $${fmt(totalCarrito())} + Envío: $${fmt(costoEnvio())}<br><strong>Total: $${fmt(totalConEnvio)}</strong>`
      : 'Total: $' + fmt(totalConEnvio);
  }
  actualizarBotonPedir();
}

function renderCarrito() {
  const body = $('carrito-body');
  if (!carrito.length) {
    body.innerHTML = `<div class="carrito-vacio">Todavía no agregaste nada.<br>Elegí un producto para empezar.</div>`;
  } else {
    body.innerHTML = carrito.map((c, i) => `<div class="carrito-item">
      <div class="carrito-item-foto">${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy">` : ''}</div>
      <div class="carrito-item-info"><b>${esc(c.nombre)}</b>Talle ${esc(c.talle)} · $${fmt(c.precio)} c/u</div>
      <div class="carrito-item-ctrl">
        <button class="qty-btn" onclick="cambiarCantidad(${i},-1)">−</button>
        <span>${c.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${i},1)">+</button>
        <button class="carrito-item-quitar" onclick="quitarDelCarrito(${i})" title="Quitar">🗑</button>
      </div>
    </div>`).join('');
  }
  const nombreInput = $('cliente-nombre'); if (nombreInput && document.activeElement !== nombreInput) nombreInput.value = clienteNombre;
  pintarSelectorEntrega();
  pintarSelectorPago();
  actualizarTotales();
}

window.hacerPedido = function () {
  if (!carrito.length) return;
  if (!clienteNombre.trim()) { toast('Ingresá tu nombre para continuar.'); return; }
  if (!tipoEntrega) { toast('Elegí cómo querés recibir tu pedido.'); return; }
  if (!entregaCompleta()) { toast(tipoEntrega === 'correo' ? 'Completá provincia, localidad y un código postal válido.' : 'Elegí tu localidad.'); return; }
  if (!formaPago) { toast('Elegí una forma de pago para continuar.'); return; }

  const lineas = carrito.map((c) => `• ${c.categoria} — ${c.nombre} (Talle ${c.talle}) x${c.cantidad} = $${fmt(c.precio * c.cantidad)}`).join('\n');
  const subtotal = totalCarrito();

  let entregaTxt, envioTxt;
  if (tipoEntrega === 'retiro') {
    entregaTxt = 'Retiro en showroom';
    envioTxt = 'Sin costo (retiro)';
  } else if (tipoEntrega === 'motomensajeria') {
    const env = envioElegido();
    entregaTxt = `Motomensajería — ${env.localidad}`;
    envioTxt = `${env.estimado ? '≈' : ''}$${fmt(env.precio)}${env.estimado ? ' (estimado, se confirma por WhatsApp)' : ''}`;
  } else {
    entregaTxt = `Correo Argentino — ${correoLocalidad.trim()}, ${correoProvincia} (CP ${correoCP.trim().toUpperCase()})`;
    envioTxt = 'A cotizar por WhatsApp';
  }

  const pagoTxt = `${FORMAS_PAGO[formaPago]}${NOTAS_PAGO[formaPago] ? ' (' + NOTAS_PAGO[formaPago] + ')' : ''}`;
  const totalTxt = tipoEntrega === 'correo' ? `$${fmt(subtotal)} + envío a cotizar` : `$${fmt(subtotal + costoEnvio())}`;

  const msg = `¡Hola! Quiero hacer este pedido en ${datosNegocio.nombreMarca}:
Nombre: ${clienteNombre.trim()}
${lineas}

Subtotal: $${fmt(subtotal)}
Entrega: ${entregaTxt}
Envío: ${envioTxt}
Forma de pago: ${pagoTxt}
Total: ${totalTxt}

Pedido a confirmar, sujeto a stock y costo de envío.`;

  window.open(`https://wa.me/${datosNegocio.whatsappNumero}?text=${encodeURIComponent(msg)}`, '_blank');
};

actualizarContador();
aplicarDatosNegocio();
