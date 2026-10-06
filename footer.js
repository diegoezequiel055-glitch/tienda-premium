import { datosNegocio } from './datos-negocio.js';

// ══════════════════════════════════════════
// FOOTER COMPARTIDO — un solo componente para que se vea igual en todas las
// páginas. Cada página solo necesita <div id="pie-root"></div> y
// <script type="module" src="footer.js"></script>.
// ══════════════════════════════════════════

const NAV_AYUDA = [
  { label: 'Inicio', href: 'index.html' },
  { label: 'Productos', href: 'index.html#grid' },
  { label: 'Contacto', href: 'contacto.html' },
  { label: 'Cambios y devoluciones', href: 'cambios-y-devoluciones.html' },
  { label: 'Cómo comprar', href: 'como-comprar.html' },
  { label: 'Términos y condiciones', href: 'terminos-y-condiciones.html' },
];

const ICON_INSTAGRAM = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>';
const ICON_TIKTOK = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2h-3.2v13.9a3 3 0 1 1-2.5-3v-3.3a6.3 6.3 0 1 0 5.7 6.3V8.6a7.7 7.7 0 0 0 4.4 1.4V6.8A4.4 4.4 0 0 1 16.6 2Z"/></svg>';

function renderFooter() {
  const root = document.getElementById('pie-root');
  if (!root) return;

  const redes = [
    datosNegocio.instagram ? `<a href="${datosNegocio.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${ICON_INSTAGRAM}</a>` : '',
    datosNegocio.tiktok ? `<a href="${datosNegocio.tiktok}" target="_blank" rel="noopener" aria-label="TikTok">${ICON_TIKTOK}</a>` : '',
  ].join('');

  root.innerHTML = `
    <footer class="pie">
      <div class="pie-grid">
        <div class="pie-col pie-col-marca">
          <span class="pie-logo">${datosNegocio.nombreMarca}</span>
          ${redes ? `<div class="pie-redes">${redes}</div>` : ''}
          <p class="pie-desc">Camisetas, conjuntos y ropa urbana. Showroom en Loma Hermosa y envíos a todo el país.</p>
        </div>
        <div class="pie-col">
          <b>Ayuda</b>
          <ul class="pie-nav">${NAV_AYUDA.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}${datosNegocio.canalMayoristaWhatsApp ? `<li><a href="${datosNegocio.canalMayoristaWhatsApp}" target="_blank" rel="noopener">Mayorista</a></li>` : ''}</ul>
        </div>
        <div class="pie-col">
          <b>Medios de pago</b>
          <p>Efectivo · Transferencia · Tarjeta</p>
        </div>
        <div class="pie-col">
          <b>Medios de envío</b>
          <p>Motomensajería CABA/GBA · Correo Argentino · Retiro en showroom</p>
        </div>
      </div>
      <div class="pie-legal-row">
        <a href="${datosNegocio.linkDefensaConsumidor}" target="_blank" rel="noopener noreferrer">Defensa de las y los Consumidores. Para reclamos ingresá acá</a>
        <span class="pie-sep">/</span>
        <a href="contacto.html?arrepentimiento=1">Botón de arrepentimiento</a>
      </div>
      <p class="pie-copy">© 2026 ${datosNegocio.nombreMarca}.${datosNegocio.cuit ? ` CUIT: ${datosNegocio.cuit}.` : ''} Todos los derechos reservados.</p>
    </footer>`;
}

renderFooter();
