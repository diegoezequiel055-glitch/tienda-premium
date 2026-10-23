// Une los CSS de la portada en UN solo archivo (tienda.css) para que el celular haga 1 pedido en vez de 13.
// Uso:  node build-css.mjs          → escribe tienda.css
//       node build-css.mjs --check  → solo verifica que tienda.css esté al día (lo usa test-css.mjs)
// Los archivos de origen (style.css, promo-bar.css, ...) se siguen editando por módulo; después de tocar
// cualquiera hay que volver a correr este script. El orden es el mismo que tenía index.html (importa: la cascada).
// Solo index.html carga tienda.css; las otras 4 páginas usan style.css + promo-bar.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ORIGEN = ['style.css', 'promo-bar.css', 'hero-rotativo.css', 'header-menu.css', 'envio-ficha.css', 'compartir.css', 'seleccion-talle.css', 'visor-imagen.css', 'relacionados.css', 'precios.css', 'ofertas.css', 'deshacer-eliminar.css', 'esqueletos.css', 'paginacion.css', 'buscador-localidades.css', 'capa-localidades.css', 'menu-desplegable.css', 'mantenimiento.css'];
const aqui = dirname(fileURLToPath(import.meta.url));
const norm = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';

export function armar() {
  return '/* GENERADO por build-css.mjs — no editar a mano: editá el CSS de cada módulo y corré `node build-css.mjs`. */\n' +
    ORIGEN.map((f) => `\n/* ── ${f} ── */\n` + norm(readFileSync(join(aqui, f), 'utf8'))).join('');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const salida = join(aqui, 'tienda.css');
  if (process.argv.includes('--check')) {
    let actual = ''; try { actual = readFileSync(salida, 'utf8').replace(/\r\n/g, '\n'); } catch {}
    if (actual !== armar()) { console.error('tienda.css está desactualizado: corré `node build-css.mjs`'); process.exit(1); }
    console.log('tienda.css al día');
  } else {
    writeFileSync(salida, armar());
    console.log('tienda.css escrito (' + ORIGEN.length + ' archivos)');
  }
}
