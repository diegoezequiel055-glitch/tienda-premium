import { db, collection, doc, onSnapshot } from './firebase-config.js';
import { datosNegocio } from './datos-negocio.js';
import { fotoCloudinary } from './fotos-cloudinary.js';
import { pintarHeroRotativo, esperarHeroRotativo, idsHero } from './hero-rotativo.js';
import { categoriasDisponibles, claveDe } from './categorias-config.js';
import { palabrasDe, coincide, actualizarInfoBusqueda, htmlSinResultados } from './buscador.js';
import { armarMensaje, notaPago, totalesHtml } from './pedido-mensaje.js';
import './fotos-tarjeta.js';
import { recibirConfig, decisionPendiente, estaBloqueado, alCambiarMantenimiento } from './mantenimiento.js';
import { escucharPublico } from './catalogo-bundle.js';
import { montarBuscadorLocalidades } from './buscador-localidades.js';
import { paginar, textoVerMas, TAMANO_PAGINA } from './paginacion.js';
import { precioLista, extrasPrecioHtml, preciosParaCarrito, resolverCarrito, precioUnitario, usaPrecioTarjeta } from './precios.js';

const WHATSAPP_MSG_DEFECTO = '¡Hola! Quería hacer una consulta.';
const FORMAS_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
const TIPOS_ENTREGA = { retiro: 'Retiro en showroom', motomensajeria: 'Motomensajería (CABA/GBA)', correo: 'Correo Argentino' };
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];
// Código postal argentino: 4 dígitos (viejo formato) o CPA (1 letra + 4 dígitos + 3 letras, ej. B1657ABC).
const validarCP = (cp) => { const v = cp.trim().toUpperCase(); return /^\d{4}$/.test(v) || /^[A-Z]\d{4}[A-Z]{3}$/.test(v); };

let productos = [];
let envios = [];
let busqueda = '';
let categoria = '';
let mostrados = TAMANO_PAGINA; // cuántos productos del catálogo filtrado se ven ("Ver más" suma otra tanda)
let filtradosActuales = [];
let formaPago = null;
let tipoEntrega = null; // 'retiro' | 'motomensajeria' | 'correo'
let envioId = null; // id de envios_publico (solo aplica si tipoEntrega === 'motomensajeria')
let correoProvincia = '';
let correoLocalidad = '';
let correoCP = '';
let clienteNombre = '';
let detalleId = null;
let detalleFotoIdx = 0;
let carrito = cargarCarrito(); // [{id, nombre, categoria, talle, precio, precioTarjeta?, cantidad}] — precio = efectivo/transferencia

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
// Modo mantenimiento (mantenimiento.js): mientras la decisión está pendiente o la tienda está bloqueada, el catálogo NO se dibuja
// (se guarda el último snapshot y se dibuja si la tienda se abre). Si Firestore falla o tarda, la tienda queda abierta.
let catalogoPendiente = null;
// El catálogo se lee como UN documento (config_sitio/catalogo, 1 lectura) y, si no existe o falla, de la colección de respaldo
// catalogo_publico (catalogo-bundle.js). Las dos entregan lo mismo.
escucharPublico({
  base: 'catalogo', coleccion: 'catalogo_publico', fb: { db, collection, doc, onSnapshot },
  alSnap: (snap) => {
    if (decisionPendiente() || estaBloqueado()) { catalogoPendiente = snap; return; }
    procesarCatalogo(snap);
  },
  alError: () => {
    if (estaBloqueado()) return;
    liberarReservas();
    document.querySelectorAll('.reservando').forEach((s) => { s.style.display = 'none'; });
    $('grid').innerHTML = `<div class="empty"><p>El catálogo todavía no está disponible.<br>Volvé a intentar en un rato.</p></div>`;
  },
});
alCambiarMantenimiento(() => {
  if (!decisionPendiente() && !estaBloqueado() && catalogoPendiente) { const s = catalogoPendiente; catalogoPendiente = null; procesarCatalogo(s); }
});

function procesarCatalogo(snap) {
  productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rc = resolverCarrito(carrito, productos); // carritos guardados (incluso viejos): precios al día por ID
  if (rc.cambio) { carrito = rc.carrito; guardarCarrito(); renderCarrito(); }
  if (categoria && !categoriasDisponibles(productos).some((c) => c.clave === categoria)) window.setCategoria('');
  renderCatPills();
  document.dispatchEvent(new CustomEvent('catalogo-actualizado', { detail: productos }));
  renderGrid();
  pintarHeroRotativo(productos, { alFallback: mostrarTriptico });
  renderDestacados();
  renderNuevos();
}

// Quita el espacio reservado (esqueletos.css) cuando ya hay contenido real o se decidió no mostrar la sección.
function liberarReservas() {
  const g = $('grid'); g.classList.remove('grid-reservando'); g.removeAttribute('aria-busy');
}

// ── configuración del sitio en vivo (textos y fotos editables desde el panel) ──
let heroFotosManual = null; // [url|null, url|null, url|null] elegidas a mano, o null si Diego no configuró ninguna
onSnapshot(doc(db, 'config_sitio', 'config'), (snap) => {
  const cfg = snap.exists() ? snap.data() : {};
  recibirConfig(cfg); // modo mantenimiento (mantenimiento.js)
  aplicarConfigSitio(cfg);
}, (e) => { recibirConfig(null, e || new Error('config')); }); // si falla la lectura, la tienda queda abierta

function aplicarConfigSitio(cfg) {
  if (cfg.heroTitulo) $('hero-titulo').textContent = cfg.heroTitulo;
  if (cfg.heroSubtitulo) $('hero-subtitulo').textContent = cfg.heroSubtitulo;
  if (cfg.bandaNegra) $('banda-negra-texto').textContent = cfg.bandaNegra;
  const msg = cfg.whatsappMensaje || WHATSAPP_MSG_DEFECTO;
  const flotante = $('whatsapp-float');
  if (flotante) flotante.href = `https://wa.me/${datosNegocio.whatsappNumero}?text=${encodeURIComponent(msg)}`;
  heroFotosManual = cfg.heroFotos || null;
  pintarHeroTriptico();
  document.dispatchEvent(new CustomEvent('config-sitio-aplicada')); // hero-rotativo.js copia título y subtítulo
}

// ── datos del negocio (showroom, redes, mayorista) — estáticos, no dependen de Firestore ──
function aplicarDatosNegocio() {
  document.querySelectorAll('.btn-mayorista').forEach((el) => {
    if (datosNegocio.canalMayoristaWhatsApp) {
      el.href = datosNegocio.canalMayoristaWhatsApp; el.style.display = '';
      const bloque = el.closest('.mayorista-bloque'); if (bloque) bloque.style.display = '';
    }
  });

  // Franja de información: "Showroom" en negrita y el resto del texto público (sin dirección exacta).
  const sh = $('showroom-texto');
  if (sh) { const m = datosNegocio.showroomTexto.match(/^(Showroom)(.*)$/); sh.innerHTML = m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(datosNegocio.showroomTexto); }
}

// ── envíos (motomensajería) en vivo ──
// Igual que el catálogo: documento único config_sitio/envios (1 lectura) con respaldo en la colección envios_publico.
escucharPublico({
  base: 'envios', coleccion: 'envios_publico', fb: { db, collection, doc, onSnapshot },
  alSnap: (snap) => {
    envios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintarSelectEnvio();
    avisarEntrega();
  },
});

// Buscador de localidades del carrito (buscador-localidades.js): se actualiza cuando cambia la tabla de envíos.
let buscadorEnvio = null;
function pintarSelectEnvio() {
  if (buscadorEnvio && $('envio-buscador')) buscadorEnvio.actualizar(envios);
}

// ── hero: tríptico. Si Diego eligió fotos a mano, esas ganan siempre.
// Si no, se arma solo con fotos de productos ⭐ destacados (una vez, al cargar).
const HTR_PLACEHOLDER = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 3 4 6l1.5 3L8 8v12h8V8l2.5 1L20 6l-4-3-1 2H9z"/></svg>';
// Tira de 3 fotos: solo se usa si no hay productos para el hero rotativo (hero-rotativo.js).
function mostrarTriptico() {
  const cont = $('hero-triptych'); if (cont) cont.style.display = '';
  pintarHeroTriptico();
}
esperarHeroRotativo(mostrarTriptico);
function pintarHeroTriptico() {
  const cont = $('hero-triptych'); if (!cont || cont.style.display === 'none') return;
  const divs = [...cont.querySelectorAll('.htr-ph')];
  if (heroFotosManual && heroFotosManual.some(Boolean)) {
    divs.forEach((div, i) => {
      const url = heroFotosManual[i];
      div.innerHTML = url ? `<img src="${esc(fotoCloudinary(url, 'tarjeta'))}" alt="">` : HTR_PLACEHOLDER;
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
    div.innerHTML = `<img src="${esc(fotoCloudinary(p.fotos[0], 'tarjeta'))}" alt="${esc(p.nombre)}">`;
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
window.setBusqueda = function (v) {
  busqueda = v;
  // Al buscar se busca en todo el catálogo: se limpia el filtro de categoría.
  if (palabrasDe(v).length && categoria) {
    categoria = '';
    marcarPill();
    document.dispatchEvent(new CustomEvent('categoria-cambiada', { detail: '' }));
  }
  mostrados = TAMANO_PAGINA;
  renderGrid();
};
window.setCategoria = function (v) {
  categoria = v;
  mostrados = TAMANO_PAGINA;
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
    return `<div class="card-foto"><img src="${esc(fotoCloudinary(fotos[0], 'tarjeta'))}" width="400" height="500" loading="lazy" alt="${esc(p.nombre)}" onerror="this.closest('.card-foto').innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'"></div>`;
  }
  return `<div class="card-foto">
      <div class="card-foto-scroll" onscroll="actualizarContadorCard(this)">
        ${fotos.map((f, i) => i === 0 ? `<img src="${esc(fotoCloudinary(f, 'tarjeta'))}" width="400" height="500" loading="lazy" alt="${esc(p.nombre)}">` : `<img data-src="${esc(fotoCloudinary(f, 'tarjeta'))}" data-alt="${esc(p.nombre)}" width="400" height="500" loading="lazy" alt="">`).join('')}
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
      <div class="card-precio">$${fmt(precioLista(p))}</div>
      ${extrasPrecioHtml(p, 'card')}
      <div class="card-talles">${(p.talles || []).length ? 'Talles: ' + p.talles.map((t) => esc(t.talle)).join(' · ') : 'Sin stock'}</div>
      ${avisoStock ? `<div class="aviso-stock-bajo">${avisoStock}</div>` : ''}
    </div>`;
}

// ── grilla ──
function renderGrid() {
  const grid = $('grid');
  liberarReservas();
  if (!productos.length) { filtradosActuales = []; pintarVerMas(0); actualizarInfoBusqueda('', 0); grid.innerHTML = `<div class="empty"><p>Todavía no hay productos cargados.<br>Volvé pronto 🙂</p></div>`; return; }
  const palabras = palabrasDe(busqueda);
  const filtrados = productos.filter((p) => coincide(p, palabras) && (!categoria || claveDe(p.categoria) === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  actualizarInfoBusqueda(palabras.length ? busqueda : '', filtrados.length);
  filtradosActuales = filtrados;
  const { visibles, restantes } = paginar(filtrados, mostrados);
  pintarVerMas(restantes);
  if (!filtrados.length) { grid.innerHTML = palabras.length ? htmlSinResultados(busqueda) : `<div class="empty"><p>No hay productos en esta categoría.</p></div>`; return; }
  grid.innerHTML = visibles.map(tarjetaHtml).join('');
}

// Botón "Ver más": agrega otra tanda al final sin repintar lo que ya está (no salta el scroll).
function pintarVerMas(restantes) {
  const caja = $('ver-mas-caja'); if (!caja) return;
  caja.hidden = restantes <= 0;
  $('ver-mas-btn').textContent = textoVerMas(restantes);
}
window.verMasProductos = function () {
  const grid = $('grid');
  const ya = grid.querySelectorAll(':scope > .card').length;
  mostrados = ya + TAMANO_PAGINA;
  const { visibles, restantes } = paginar(filtradosActuales, mostrados);
  grid.insertAdjacentHTML('beforeend', visibles.slice(ya).map(tarjetaHtml).join(''));
  pintarVerMas(restantes);
};

// ── destacados (productos tildados ⭐ desde el panel) — se oculta con menos de 2 ──
function destacadosList() {
  return productos.filter((p) => p.destacado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
function renderDestacados() {
  const sec = $('destacados-section'), strip = $('destacados-strip'); if (!sec || !strip) return;
  const lista = destacadosList();
  sec.classList.remove('reservando'); sec.style.display = lista.length >= 2 ? '' : 'none';
  if (lista.length >= 2) strip.innerHTML = lista.map(tarjetaHtml).join('');
}
window.irADestacados = function (ev) {
  if (ev) ev.preventDefault();
  const sec = $('destacados-section');
  (sec && sec.style.display !== 'none' ? sec : $('grid')).scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── nuevos ingresos (automático, por fecha real de alta) — se oculta con menos de 2 ──
const MAX_NUEVOS = 8;
function nuevosList() {
  const enHero = idsHero(productos); // los del hero rotativo no se repiten acá
  return [...productos].filter((p) => p.creadoEn && !enHero.has(p.id)).sort((a, b) => b.creadoEn - a.creadoEn).slice(0, MAX_NUEVOS);
}
function renderNuevos() {
  const sec = $('nuevos-section'), strip = $('nuevos-strip'); if (!sec || !strip) return;
  const lista = nuevosList();
  sec.classList.remove('reservando'); sec.style.display = lista.length >= 2 ? '' : 'none';
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
  document.dispatchEvent(new CustomEvent('detalle-abierto', { detail: id })); // compartir.js: URL ?p=ID
};
window.cerrarDetalle = function () {
  $('detalle-overlay').classList.remove('open'); detalleId = null;
  document.dispatchEvent(new CustomEvent('detalle-cerrado'));
};

// Varias fotos: carril deslizable (scroll-snap, igual que en las tarjetas) +
// flechas de escritorio + contador, sincronizado con la miniatura activa.
// Una sola foto (o ninguna): sin carril, sin flechas, sin contador.
function detalleFotoHtml(p, fotos) {
  if (!fotos.length) return '<span class="sin-foto">Sin foto</span>';
  if (fotos.length === 1) {
    return `<img src="${esc(fotoCloudinary(fotos[0], 'ficha'))}" alt="${esc(p.nombre)}" onerror="this.parentElement.innerHTML='<span class=&quot;sin-foto&quot;>Sin foto</span>'">`;
  }
  return `
    <div class="detalle-foto-scroll" id="detalle-foto-scroll" onscroll="onScrollDetalleFoto(this)">
      ${fotos.map((f) => `<img data-src="${esc(fotoCloudinary(f, 'ficha'))}" data-alt="${esc(p.nombre)}" alt="">`).join('')}
    </div>
    <button class="detalle-foto-flecha detalle-foto-prev" onclick="moverFotoDetalle(-1)" aria-label="Foto anterior">‹</button>
    <button class="detalle-foto-flecha detalle-foto-next" onclick="moverFotoDetalle(1)" aria-label="Foto siguiente">›</button>
    <span class="detalle-foto-contador" id="detalle-foto-contador">${detalleFotoIdx + 1}/${fotos.length}</span>`;
}
// Fotos grandes de la ficha: se descargan de a una. Al abrir, solo la actual;
// cuando esa carga, se precargan la siguiente y la anterior. Una foto con
// src ya puesto no se vuelve a pedir. Las miniaturas cargan todas de entrada.
function cargarFotoDetalle(i, alCargar) {
  const scroll = $('detalle-foto-scroll');
  const img = scroll && scroll.children[i];
  if (!img || !img.dataset.src) { if (alCargar) alCargar(); return; }
  if (!img.getAttribute('src')) {
    if (alCargar) img.addEventListener('load', alCargar, { once: true });
    img.alt = img.dataset.alt || '';
    img.src = img.dataset.src;
  } else if (alCargar) {
    if (img.complete) alCargar(); else img.addEventListener('load', alCargar, { once: true });
  }
}
function cargarFotosDetalle(i) {
  const scroll = $('detalle-foto-scroll');
  cargarFotoDetalle(i, () => {
    if ($('detalle-foto-scroll') !== scroll) return; // se cerró o cambió de producto
    cargarFotoDetalle(i + 1);
    cargarFotoDetalle(i - 1);
  });
}
let detalleScrollTimer = null;
function irAFotoDetalle(i, smooth) {
  detalleFotoIdx = i;
  cargarFotoDetalle(i); // si saltó a una foto sin cargar (miniatura), se pide ya
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
  // Recién cuando el scroll se frena se cargan la actual y sus vecinas, así un salto
  // por miniatura no descarga las fotos intermedias.
  clearTimeout(detalleScrollTimer);
  detalleScrollTimer = setTimeout(() => cargarFotosDetalle(detalleFotoIdx), 150);
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
    cargarFotosDetalle(detalleFotoIdx);
  }
  $('detalle-miniaturas').innerHTML = fotos.length > 1 ? fotos.map((f, i) => { const txt = esc(`Foto ${i + 1} de ${fotos.length} de ${p.nombre}`); return `<button class="mini-foto${i === detalleFotoIdx ? ' active' : ''}" onclick="elegirFotoDetalle(${i})" aria-label="${txt}"><img src="${esc(fotoCloudinary(f, 'carrito'))}" alt="${txt}"></button>`; }).join('') : '';
  actualizarUIFotoDetalle();
  $('detalle-cat').textContent = p.categoria || ''; // sin categoría: queda vacío y se oculta (style.css)
  $('detalle-nombre').textContent = p.nombre;
  $('detalle-precio').textContent = '$' + fmt(precioLista(p));
  $('detalle-precio-nota').innerHTML = extrasPrecioHtml(p, 'ficha');
  const talles = p.talles || [];
  $('detalle-talles').innerHTML = talles.length
    ? talles.map((t) => `<button type="button" class="talle-btn" data-talle="${esc(t.talle)}" aria-pressed="false">${esc(t.talle)}</button>`).join('')
    : '<span class="sin-stock">Sin stock disponible</span>';
  const avisoStock = textoStockBajo(p);
  $('detalle-stock-bajo').textContent = avisoStock;
  $('detalle-stock-bajo').style.display = avisoStock ? '' : 'none';
  document.dispatchEvent(new CustomEvent('detalle-pintado', { detail: p }));
}

// ── carrito ──
// Devuelve true si se agregó (seleccion-talle.js muestra "Agregado ✓"), false si no.
window.agregarAlCarrito = function (id, talle) {
  const p = productos.find((x) => x.id === id); if (!p) return false;
  const fila = (p.talles || []).find((t) => t.talle === talle); if (!fila) return false;
  const existente = carrito.find((c) => c.id === id && c.talle === talle);
  const enCarrito = existente ? existente.cantidad : 0;
  if (enCarrito >= fila.stock) { toast(`No hay más stock de ${p.nombre} talle ${talle}.`); return false; }
  if (existente) existente.cantidad++;
  else carrito.push({ id, nombre: p.nombre, categoria: p.categoria, talle, ...preciosParaCarrito(p), cantidad: 1, foto: (p.fotos || [])[0] || null });
  guardarCarrito(); actualizarContador();
  toast(`${p.nombre} (${talle}) agregado al pedido ✓`);
  document.dispatchEvent(new CustomEvent('carrito-agregado', { detail: { id, nombre: p.nombre, categoria: p.categoria, talle, cantidad: 1, precio: p.precio } })); // analytics.js
  return true;
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
  const item = carrito[idx]; if (!item) return;
  carrito.splice(idx, 1);
  guardarCarrito(); renderCarrito(); actualizarContador();
  document.dispatchEvent(new CustomEvent('carrito-eliminado', { detail: { item, idx } })); // deshacer-eliminar.js muestra "Deshacer"
};
// Vuelve a poner un producto eliminado (mismo talle y cantidad, en su lugar). Si mientras tanto se volvió a
// agregar el mismo producto y talle, se suman las cantidades sin pasar el stock.
window.restaurarEliminado = function (item, idx) {
  const p = productos.find((x) => x.id === item.id);
  const fila = p && (p.talles || []).find((t) => t.talle === item.talle);
  const max = fila ? fila.stock : item.cantidad;
  const existente = carrito.find((c) => c.id === item.id && c.talle === item.talle);
  if (existente) existente.cantidad = Math.min(max, existente.cantidad + item.cantidad);
  else carrito.splice(Math.min(idx, carrito.length), 0, { ...item, cantidad: Math.min(max, item.cantidad) });
  guardarCarrito(); renderCarrito(); actualizarContador();
};
function actualizarContador() {
  $('cart-count').textContent = carrito.reduce((a, c) => a + c.cantidad, 0);
}
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
    cont.innerHTML = `<p class="modo-nota" style="margin:8px 0 0;text-align:left">${esc(datosNegocio.showroomTexto)}. Sin costo.</p>`;
  } else if (tipoEntrega === 'motomensajeria') {
    cont.innerHTML = `<div id="envio-buscador" style="margin-top:8px"></div><p class="modo-nota" id="envio-nota" style="margin-top:6px"></p>`;
    buscadorEnvio = montarBuscadorLocalidades($('envio-buscador'), { envios, seleccionId: envioId, alElegir: (id) => window.setEnvio(id) });
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
  $('pago-nota').textContent = formaPago ? notaPago(formaPago, tipoEntrega, usaPrecioTarjeta(carrito, formaPago)) : 'Elegí cómo preferís pagar.';
}
window.setFormaPago = function (f) { formaPago = f; renderCarrito(); }; // con Tarjeta cambian los precios de cada renglón y el total

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
  $('carrito-total').innerHTML = totalesHtml({ items: carrito, tipoEntrega, costoEnvio: costoEnvio(), formaPago });
  if (formaPago) $('pago-nota').textContent = notaPago(formaPago, tipoEntrega, usaPrecioTarjeta(carrito, formaPago)); // la aclaración de Efectivo depende de la entrega
  actualizarBotonPedir();
}

function renderCarrito() {
  const body = $('carrito-body');
  if (!carrito.length) {
    body.innerHTML = `<div class="carrito-vacio">Todavía no agregaste nada.<br>Elegí un producto para empezar.</div>`;
  } else {
    body.innerHTML = carrito.map((c, i) => `<div class="carrito-item">
      <div class="carrito-item-foto">${c.foto ? `<img src="${esc(fotoCloudinary(c.foto, 'carrito'))}" alt="" loading="lazy">` : ''}</div>
      <div class="carrito-item-info"><b>${esc(c.nombre)}</b>Talle ${esc(c.talle)} · $${fmt(precioUnitario(c, carrito, formaPago))} c/u</div>
      <div class="carrito-item-ctrl">
        <button class="qty-btn" aria-label="Restar uno"${c.cantidad <= 1 ? ' disabled' : ''} onclick="cambiarCantidad(${i},-1)">−</button>
        <span>${c.cantidad}</span>
        <button class="qty-btn" aria-label="Sumar uno" onclick="cambiarCantidad(${i},1)">+</button>
        <button type="button" class="carrito-item-quitar" aria-label="Eliminar" title="Eliminar" onclick="quitarDelCarrito(${i})"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>
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

  const msg = armarMensaje({
    marca: datosNegocio.nombreMarca,
    nombre: clienteNombre,
    items: carrito,
    tipoEntrega,
    envio: envioElegido(),
    costoEnvio: costoEnvio(),
    correo: { localidad: correoLocalidad, provincia: correoProvincia, cp: correoCP },
    formaPago,
    formaPagoLabel: FORMAS_PAGO[formaPago],
  });

  // analytics.js: solo tipos y valores (forma de pago, tipo de entrega, productos); nada del cliente ni del mensaje
  document.dispatchEvent(new CustomEvent('pedido-iniciado', { detail: { items: carrito, formaPago, tipoEntrega, costoEnvio: costoEnvio() } }));
  window.open(`https://wa.me/${datosNegocio.whatsappNumero}?text=${encodeURIComponent(msg)}`, '_blank');
};

actualizarContador();
aplicarDatosNegocio();
