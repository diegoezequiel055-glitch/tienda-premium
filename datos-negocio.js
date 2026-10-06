// ══════════════════════════════════════════
// DATOS DEL NEGOCIO — un solo lugar para cambiar showroom, contacto, redes y
// datos legales. Lo que quede vacío ('') simplemente no se muestra en el sitio.
// ══════════════════════════════════════════

export const datosNegocio = {
  // Nombre de marca — se usa en el header, el título de cada página, el
  // footer y los mensajes de WhatsApp. Cambialo acá, no a mano en cada archivo.
  // (Excepción inevitable: la meta description y las etiquetas og:* de cada
  // página quedan fijas en el HTML, porque los robots de WhatsApp/Facebook que
  // arman la vista previa al compartir un link no ejecutan JavaScript — si
  // volvés a cambiar el nombre, esas pocas líneas hay que tocarlas a mano.)
  nombreMarca: 'TIENDAPREMIUM.OK',

  // Identidad del vendedor (para el footer legal / términos)
  nombreVendedor: 'Diego Ezequiel Zapata',
  condicionFiscal: 'Monotributista',
  cuit: '20-46183728-0', // se muestra en el footer y en términos solo cuando tenga valor

  // Showroom
  showroomDireccion: 'Diagonal 152 (Belgrano) 5453, Loma Hermosa, San Martín',
  showroomHorarios: 'Lunes a viernes con cita previa, sábados de 15 a 20 hs',
  showroomMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Diagonal 152 (Belgrano) 5453, Loma Hermosa, San Martín'),

  // Contacto
  whatsappNumero: '5491156253612', // con código de país y área, sin + ni espacios
  email: 'indpremium55@gmail.com',
  instagram: 'https://www.instagram.com/tiendapremium.ok',
  tiktok: 'https://www.tiktok.com/@tiendapremium.ok',

  // Mayorista: botón que abre el canal de WhatsApp. Mientras esté vacío, el botón no se muestra.
  canalMayoristaWhatsApp: 'https://whatsapp.com/channel/0029VbEBUxK6RGJ9kyCEqK0d',
};
