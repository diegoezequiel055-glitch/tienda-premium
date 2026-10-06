import { db, collection, doc, onSnapshot } from './firebase-config.js';
import { datosNegocio } from './datos-negocio.js';

const WHATSAPP_MSG_DEFECTO = '¡Hola! Quería hacer una consulta.';
const FORMAS_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
const NOTAS_PAGO = {
  efectivo: 'Solo para entregas en CABA o zona AMBA.',
  transferencia: '',
  tarjeta: 'El pago con tarjeta puede variar. Te informamos el total antes de cerrar.',
};
const TIPOS_ENTREGA = { retiro: 'Retiro en showroom', motomensajeria: 'Motomensajería (CABA/GBA)', correo: 'Correo Argentino' };
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];

let productos = [];
let envios = [];
let busqueda = '';
let categoria = '';
let formaPago = null;
let tipoEntrega = null; // 'retiro' | 'motomensajeria' | 'correo'
let envioId = null; // id de envios_publico (solo aplica si tipoEntrega === 'motomensajeria')
let correoProvincia = '';
let correoLocalidad = '';
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
  renderCatPills();
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
}, () => {});

function pintarSelectEnvio() {
  const sel = $('envio-select'); if (!sel) return;
  if (sel.dataset.n == envios.length) return;
  sel.dataset.n = envios.length;
  const valorPrevio = sel.value;
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

// ── tarjeta de producto (la usan la grilla, Destacados y Nuevos ingresos) ──
function tarjetaHtml(p) {
  const foto = (p.fotos || [])[0];
  return `<div class="card" onclick="abrirDetalle('${esc(p.id)}')">
      <div class="card-foto">${foto ? `<img src="${esc(foto)}" loading="lazy" alt="${esc(p.nombre)}" onerror="this.outerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">` : '<span class="sin-foto">Sin foto</span>'}</div>
      <div class="card-cat">${esc(p.categoria)}</div>
      <div class="card-nombre">${esc(p.nombre)}</div>
      <div class="card-precio">$${fmt(p.precio)}</div>
      <div class="card-talles">${(p.talles || []).length ? 'Talles: ' + p.talles.map((t) => esc(t.talle)).join(' · ') : 'Sin stock'}</div>
    </div>`;
}

// ── grilla ──
function renderGrid() {
  const grid = $('grid');
  if (!productos.length) { grid.innerHTML = `<div class="empty"><p>Todavía no hay productos cargados.<br>Volvé pronto 🙂</p></div>`; return; }
  const q = busqueda.toLowerCase().trim();
  const filtrados = productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q)) && (!categoria || p.categoria === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  if (!filtrados.length) { grid.innerHTML = `<div class="empty"><p>No encontramos productos con esa búsqueda.</p></div>`; return; }
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
window.elegirFotoDetalle = function (i) { detalleFotoIdx = i; pintarDetalle(); };

function pintarDetalle() {
  const p = productos.find((x) => x.id === detalleId); if (!p) return;
  const fotos = p.fotos || [];
  const foto = fotos[detalleFotoIdx];
  $('detalle-foto').innerHTML = foto ? `<img src="${esc(foto)}" alt="${esc(p.nombre)}" onerror="this.parentElement.innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">` : '<span class="sin-foto">Sin foto</span>';
  $('detalle-miniaturas').innerHTML = fotos.length > 1 ? fotos.map((f, i) => `<button class="mini-foto${i === detalleFotoIdx ? ' active' : ''}" onclick="elegirFotoDetalle(${i})"><img src="${esc(f)}"></button>`).join('') : '';
  $('detalle-cat').textContent = p.categoria;
  $('detalle-nombre').textContent = p.nombre;
  $('detalle-precio').textContent = '$' + fmt(p.precio);
  const talles = p.talles || [];
  $('detalle-talles').innerHTML = talles.length
    ? talles.map((t) => `<button class="talle-btn" onclick="agregarAlCarrito('${esc(p.id)}','${esc(t.talle)}')">${esc(t.talle)}</button>`).join('')
    : '<span class="sin-stock">Sin stock disponible</span>';
}

// ── carrito ──
window.agregarAlCarrito = function (id, talle) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  const fila = (p.talles || []).find((t) => t.talle === talle); if (!fila) return;
  const existente = carrito.find((c) => c.id === id && c.talle === talle);
  const enCarrito = existente ? existente.cantidad : 0;
  if (enCarrito >= fila.stock) { toast(`No hay más stock de ${p.nombre} talle ${talle}.`); return; }
  if (existente) existente.cantidad++;
  else carrito.push({ id, nombre: p.nombre, categoria: p.categoria, talle, precio: p.precio, cantidad: 1 });
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
};
window.setEnvio = function (v) { envioId = v || null; actualizarTotales(); };
window.setCorreoProvincia = function (v) { correoProvincia = v; actualizarTotales(); };
window.setCorreoLocalidad = function (v) { correoLocalidad = v; actualizarBotonPedir(); };

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
  if (tipoEntrega === 'correo') return !!(correoProvincia && correoLocalidad.trim());
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
    totalEl.innerHTML = `Productos: $${fmt(totalCarrito())}<br><span style="font-size:.76rem;color:var(--muted)">+ envío a cotizar por WhatsApp</span><br><strong>Total: $${fmt(totalCarrito())}</strong>`;
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
  if (!entregaCompleta()) { toast(tipoEntrega === 'correo' ? 'Completá provincia y localidad.' : 'Elegí tu localidad.'); return; }
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
    entregaTxt = `Correo Argentino — ${correoLocalidad.trim()}, ${correoProvincia}`;
    envioTxt = 'A cotizar por WhatsApp';
  }

  const pagoTxt = `${FORMAS_PAGO[formaPago]}${NOTAS_PAGO[formaPago] ? ' (' + NOTAS_PAGO[formaPago] + ')' : ''}`;
  const totalTxt = tipoEntrega === 'correo' ? `$${fmt(subtotal)} + envío a cotizar` : `$${fmt(subtotal + costoEnvio())}`;

  const msg = `¡Hola! Quiero hacer este pedido:
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
