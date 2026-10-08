// ══════════════════════════════════════════
// FOTOS CLOUDINARY — achica las fotos con transformaciones por URL (no se
// vuelve a subir nada, la original queda intacta en Cloudinary).
// Uso: fotoCloudinary(url, 'tarjeta')  →  .../upload/f_auto,q_auto:eco,c_limit,w_400/v123/abc.jpg
// Pocos tamaños fijos, siempre los mismos, para no gastar cuota de Cloudinary.
// Si la URL no es de Cloudinary o ya trae una transformación, se devuelve igual.
// ══════════════════════════════════════════

export const TAMANOS_FOTO = {
  carrito: { w: 160, q: 'eco' },   // miniatura del carrito y de la ficha (48-52 px en pantalla)
  tarjeta: { w: 400, q: 'eco' },   // tarjetas de la grilla y tira del inicio (~178 px, ×2 para pantallas retina)
  ficha: { w: 900, q: 'good' },    // foto grande de la ficha (más calidad: el cliente mira el detalle)
};

const PREFIJOS_TRANSFORMACION = /^(?:w|h|c|f|q|e|t|ar|g|x|y|r|a|b|l|o|dpr|fl|co|bo|d|dn|so|eo|vc|ac)_/;

export function fotoCloudinary(url, tamano) {
  const t = TAMANOS_FOTO[tamano];
  if (!url || !t || typeof url !== 'string') return url;
  const marca = '/image/upload/';
  const i = url.indexOf(marca);
  if (i === -1 || !/^https?:\/\/res\.cloudinary\.com\//.test(url)) return url;
  const resto = url.slice(i + marca.length);
  const primero = resto.split('/')[0];
  // Ya tiene transformación (ej. "w_300,c_fill" o "f_auto"): no se toca.
  if (primero.includes(',') || PREFIJOS_TRANSFORMACION.test(primero)) return url;
  return url.slice(0, i + marca.length) + `f_auto,q_auto:${t.q},c_limit,w_${t.w}/` + resto;
}
