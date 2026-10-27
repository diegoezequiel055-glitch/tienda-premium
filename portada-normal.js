// ══════════════════════════════════════════
// ¿ESTAMOS EN LA PORTADA NORMAL? — sin categoría ni búsqueda por texto activas (la ficha es una capa que tapa todo y no cuenta).
// Las secciones del final de la portada (Videos de TikTok, ...) se muestran solo ahí. app.js publica window.__categoriaActual y
// window.__buscando y avisa con los eventos 'categoria-cambiada' y 'busqueda-cambiada'; este módulo los junta en un solo lugar.
// Uso: enPortadaNormal() → boolean;  alCambiarPortada(fn) → fn(boolean) cada vez que cambia (y una vez al registrarse).
// ══════════════════════════════════════════
let categoria = (typeof window !== 'undefined' && window.__categoriaActual) || '';
let buscando = typeof window !== 'undefined' && window.__buscando === true;
const oyentes = [];

export const enPortadaNormal = () => categoria === '' && !buscando;
const avisar = () => { const v = enPortadaNormal(); oyentes.forEach((f) => f(v)); };

if (typeof document !== 'undefined') {
  document.addEventListener('categoria-cambiada', (e) => { categoria = e.detail || ''; avisar(); });
  document.addEventListener('busqueda-cambiada', (e) => { buscando = e.detail === true; avisar(); });
}
export function alCambiarPortada(fn) { oyentes.push(fn); fn(enPortadaNormal()); }
