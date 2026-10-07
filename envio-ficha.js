import { datosNegocio } from './datos-negocio.js';

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

function detalleTexto(e) {
  if (e.tipoEntrega === 'retiro') {
    const d = datosNegocio;
    return `<p class="envio-res"><b>Retiro en showroom: gratis</b></p>
      <p class="envio-nota">${esc(d.showroomDireccion)}${d.showroomHorarios ? ' · ' + esc(d.showroomHorarios) : ''}</p>`;
  }
  if (e.tipoEntrega === 'motomensajeria') {
    const ordenadas = [...e.envios].sort((a, b) => a.localidad.localeCompare(b.localidad, 'es'));
    const sel = e.envios.find((x) => x.id === e.envioId);
    const select = `<select id="ficha-envio-select" onchange="fichaEnvioLocalidad(this.value)">
        <option value="">Elegí tu localidad...</option>
        ${ordenadas.map((x) => `<option value="${esc(x.id)}"${x.id === e.envioId ? ' selected' : ''}>${esc(x.localidad)} — ${x.estimado ? '≈' : ''}$${fmt(x.precio)}</option>`).join('')}
      </select>`;
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
document.addEventListener('entrega-cambiada', () => { if (productoId) render(); });
