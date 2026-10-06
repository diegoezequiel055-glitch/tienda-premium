import { datosNegocio } from './datos-negocio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const modoArrepentimiento = params.get('arrepentimiento') === '1';

// ── columna izquierda: datos de contacto, todos desde datos-negocio ──
$('contacto-whatsapp').href = `https://wa.me/${datosNegocio.whatsappNumero}`;
$('contacto-whatsapp').textContent = datosNegocio.whatsappNumero;
$('contacto-email').href = `mailto:${datosNegocio.email}`;
$('contacto-email').textContent = datosNegocio.email;
$('contacto-direccion').textContent = datosNegocio.showroomDireccion;
$('contacto-maps').href = datosNegocio.showroomMapsUrl;

if (datosNegocio.showroomHorarios) {
  $('contacto-horarios-item').style.display = '';
  $('contacto-horarios').textContent = datosNegocio.showroomHorarios;
}
if (datosNegocio.instagram) {
  $('contacto-instagram-item').style.display = '';
  $('contacto-instagram').href = datosNegocio.instagram;
}

// ── modo arrepentimiento (?arrepentimiento=1): banner + campos extra obligatorios ──
if (modoArrepentimiento) {
  $('arrep-banner').style.display = '';
  $('contacto-titulo').textContent = 'Botón de arrepentimiento';
  $('f-producto-wrap').style.display = '';
  $('f-fecha-wrap').style.display = '';
  $('f-producto').required = true;
  $('f-fecha').required = true;
}

// ── envío del formulario: arma el mensaje y abre WhatsApp, sin backend ──
$('contacto-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const nombre = $('f-nombre').value.trim();
  const telefono = $('f-telefono').value.trim();
  const email = $('f-email').value.trim();
  const mensaje = $('f-mensaje').value.trim();
  if (!nombre || !telefono) return;
  if (modoArrepentimiento && (!$('f-producto').value.trim() || !$('f-fecha').value)) return;

  const lineas = [`${modoArrepentimiento ? 'ARREPENTIMIENTO' : 'CONSULTA'} — ${datosNegocio.nombreMarca}`, `Nombre: ${nombre}`, `Teléfono: ${telefono}`];
  if (email) lineas.push(`Email: ${email}`);
  if (modoArrepentimiento) {
    lineas.push(`Producto: ${$('f-producto').value.trim()}`);
    lineas.push(`Fecha de compra/recepción: ${$('f-fecha').value}`);
  }
  if (mensaje) lineas.push(`Mensaje: ${mensaje}`);

  const texto = lineas.join('\n');
  window.open(`https://wa.me/${datosNegocio.whatsappNumero}?text=${encodeURIComponent(texto)}`, '_blank');
  $('contacto-estado').style.display = '';
});
