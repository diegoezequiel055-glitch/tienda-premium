// ══════════════════════════════════════════
// DATOS DEL NEGOCIO — un solo lugar para cambiar showroom, contacto, redes y
// datos legales. Lo que quede vacío ('') simplemente no se muestra en el sitio.
// ══════════════════════════════════════════

export const datosNegocio = {
  // Identidad del vendedor (para el footer legal / términos)
  nombreVendedor: 'Diego Ezequiel Zapata',
  condicionFiscal: 'Monotributista',
  cuit: '', // se muestra en el footer y en términos solo cuando tenga valor

  // Showroom
  showroomDireccion: 'Diagonal 152 (Belgrano) 5453, Loma Hermosa, San Martín',
  showroomHorarios: '', // ej: "Lun a vie 10 a 18 hs, sáb 10 a 13 hs"
  showroomMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Diagonal 152 (Belgrano) 5453, Loma Hermosa, San Martín'),

  // Contacto
  whatsappNumero: '5491156253612', // con código de país y área, sin + ni espacios
  email: 'indpremium55@gmail.com',
  instagram: 'https://www.instagram.com/tiendapremium.ok',
  tiktok: 'https://www.tiktok.com/@tiendapremium.ok',

  // Mayorista: botón que abre el canal de WhatsApp. Mientras esté vacío, el botón no se muestra.
  canalMayoristaWhatsApp: '',
};
