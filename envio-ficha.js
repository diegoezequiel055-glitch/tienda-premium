import { datosNegocio } from './datos-negocio.js';
import { montarBuscadorLocalidades } from './buscador-localidades.js';
import { abrirCapaLocalidades } from './capa-localidades.js';

// ══════════════════════════════════════════
// "Calcular envío" en la ficha del producto. Usa el mismo estado y la misma
// tabla de costos (envios_publico) que el carrito, a través de app.js:
//   window.getEntrega()            → { tipoEntrega, envioId, envios }
//   window.setEntregaDesdeFicha()  → guarda la elección y precarga el carrito
// Escucha 'detalle-pintado' (ficha abierta) y 'entrega-cambiada' (el carrito o
// la tabla de envíos cambió: el carrito manda).
// ══════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

const OPCIONES = [
  ['retiro', 'Retiro en showroom'],
  ['motomensajeria', 'Motomensajería (CABA/GBA)'],
  ['correo', 'Otra provincia (Correo Argentino)'],
];

let abierto = false;
let productoId = null;
let conStock = false;
let buscador = null; // instancia del buscador de localidades montada en la ficha

function detalleTexto(e) {
  if (e.tipoEntrega === 'retiro') {
    const d = datosNegocio;
    return `<p class="envio-res"><b>Retiro en showroom: gratis</b></p>
      <p class="envio-nota">${esc(d.showroomTexto)}</p>`;
  }
  if (e.tipoEntrega === 'motomensajeria') {
    const sel = e.envios.find((x) => x.id === e.envioId);
    const select = '<div id="ficha-envio-buscador"></div>'; // buscador de localidades (buscador-localidades.js), el mismo del carrito
    if (!sel) return select;
    return select + `<p class="envio-res"><b>Motomensajería a ${esc(sel.localidad)}: ${sel.estimado ? '≈' : ''}$${fmt(sel.precio)}</b> · Pedí hoy, te llega mañana (lunes a viernes)</p>`
      + (sel.estimado ? '<p class="envio-nota">Precio estimado — tarifa por horario, se confirma por WhatsApp.</p>' : '');
  }
  if (e.tipoEntrega === 'correo') {
    return '<p class="envio-res">Envío por Correo Argentino a todo el país. Te cotizamos el envío por WhatsApp.</p>';
  }
  return '';
}

function render() {
  const cont = $('detalle-envio'); if (!cont) return;
  if (!conStock) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
  cont.style.display = '';
  const e = window.getEntrega();
  cont.innerHTML = `
    <button class="envio-toggle" onclick="fichaEnvioToggle()" aria-expanded="${abierto}">
      <span>Calcular envío</span><span class="envio-flecha">${abierto ? '▴' : '▾'}</span>
    </button>
    <div class="envio-panel" style="display:${abierto ? 'block' : 'none'}">
      <div class="envio-opciones">
        ${OPCIONES.map(([k, l]) => `<button class="envio-op${e.tipoEntrega === k ? ' active' : ''}" onclick="fichaEnvioTipo('${k}')">${l}</button>`).join('')}
      </div>
      ${detalleTexto(e)}
    </div>`;
  const caja = $('ficha-envio-buscador');
  buscador = caja ? montarBuscadorLocalidades(caja, {
    envios: e.envios,
    seleccionId: e.envioId,
    alElegir: (id) => window.fichaEnvioLocalidad(id), // misma vía de siempre: guarda la elección y precarga el carrito
    capa: abrirCapaLocalidades, // en iPhone/iPad la búsqueda se hace en una capa a pantalla completa (ver capa-localidades.js)
  }) : null;
}

window.fichaEnvioToggle = function () { abierto = !abierto; render(); };
window.fichaEnvioTipo = function (t) {
  const e = window.getEntrega();
  window.setEntregaDesdeFicha(t, t === 'motomensajeria' ? e.envioId : null);
  render();
};
window.fichaEnvioLocalidad = function (id) {
  window.setEntregaDesdeFicha('motomensajeria', id || null);
  render();
};

document.addEventListener('detalle-pintado', (ev) => {
  const p = ev.detail;
  if (p.id !== productoId) { productoId = p.id; abierto = false; } // ficha de otro producto: arranca plegada
  conStock = (p.talles || []).length > 0;
  render();
});
document.addEventListener('entrega-cambiada', () => {
  if (!productoId) return;
  // Si se está escribiendo en el buscador, solo se refresca su lista (no se pierde lo escrito).
  if (buscador && document.querySelector('#ficha-envio-buscador .loc-input:not([readonly])')) buscador.actualizar(window.getEntrega().envios);
  else render();
});
