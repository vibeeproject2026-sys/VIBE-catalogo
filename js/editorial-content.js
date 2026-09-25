// Fase 30 — fuente de contenido editorial de VIBE (Discover).
//
// Completamente independiente de products/catalog_metadata (ver
// docs de la Fase 30, sección 3): los productos siguen viniendo
// únicamente de Supabase vía js/data-source.js. Este archivo nunca los
// toca, nunca los reemplaza, y nada de products escribe aquí.
//
// Este es el único archivo que el equipo editorial de VIBE necesita
// tocar para publicar contenido real — sin backend, sin CMS, sin
// migración. Cada artículo:
//
//   id:              string|number — único
//   slug:            string — único, usado en la URL (?article=<slug>)
//   title:           string
//   excerpt:         string
//   category:        string (ej. "Skincare", "Maquillaje", "Tips")
//   image:           string | null — URL real, nunca un placeholder externo
//   published:       boolean — false = borrador, nunca visible públicamente
//   date:            string (ISO) | null — nunca inventada
//   tags:            string[] — preparado para búsqueda futura (sin UI todavía)
//   relatedProducts: (string|number)[] — ids reales de productos VIBE,
//                    asignados a mano por el equipo editorial (nunca automático)
//   content:         string[] — párrafos del cuerpo del artículo
//
// Vacío a propósito: la auditoría de la Fase 30 confirmó que todavía no
// existe contenido editorial real en el repositorio. No se inventa
// ningún artículo, autor, fecha ni imagen solo para "demostrar" que
// Discover funciona — la arquitectura se valida con tests y con los
// estados vacíos reales que ve cualquier visitante hoy.
export const articles = [];
