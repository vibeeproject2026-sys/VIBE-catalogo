// Pure, dependency-free logic: joining products (POS) with catalog_metadata,
// shaping the public response, filtering and sorting. Deliberately an
// in-memory join rather than a PostgREST embedded query (?select=*,catalog_metadata(*))
// because catalog_metadata does not exist in production yet and its
// relationship cannot be verified against the real PostgREST schema
// cache in this phase. An in-memory join is simpler to reason about,
// trivial to unit test, and negligible in cost at this catalog's volume.
// Embedding can be adopted later as an optimization once the schema is
// live and confirmed.

const { parseDetails } = require("../../_lib/editorialDetails");

// Fase 43 — INNER JOIN sobre published = true (reemplaza el LEFT JOIN de
// Fase 31, que exponía públicamente todo producto del POS aunque el
// Admin mostrara "Publicado: No"). La publicación depende SOLO de la
// decisión editorial: un producto sin fila de metadata, o con una fila
// published !== true, no sale en la API pública — y como el frontend
// (búsqueda, categorías, ofertas, destacados, PDP por URL directa) solo
// conoce lo que esta API devuelve, tampoco existe para él. Las consultas
// ya filtran published=eq.true; se vuelve a comprobar aquí a propósito
// para que la regla no dependa de que cada llamador recuerde el filtro.
// Disponibilidad (stock) sigue siendo independiente: un producto
// publicado y agotado se devuelve con available: false, como antes.
function joinCatalog(products, metadataRows) {
  const metaByProductId = new Map(
    metadataRows.filter((m) => m && m.published === true).map((m) => [String(m.product_id), m])
  );
  return products
    .filter((product) => metaByProductId.has(String(product.id)))
    .map((product) => ({ product, metadata: metaByProductId.get(String(product.id)) }));
}

// Fase 26 — resuelve la promoción del producto server-side: promo_active
// por sí solo no basta, también debe estar dentro de la ventana de fecha
// si promo_start/promo_end están definidos. Las fechas crudas nunca
// salen de esta función — el cliente solo recibe el booleano ya
// resuelto, igual que `available` ya resuelve `stock` a un booleano sin
// exponer el número.
function resolvePromoActive(product, now = new Date()) {
  if (!product.promo_active) return false;
  if (product.promo_start && now < new Date(product.promo_start)) return false;
  if (product.promo_end && now > new Date(product.promo_end)) return false;
  return true;
}

// Fase 31 — name/price/available (derivado de stock) vienen siempre de
// `product` (POS), nunca de metadata, y nunca se duplican en
// catalog_metadata (ver migración 0001, comentario de la tabla). Todo lo
// demás es editorial: un campo puntual no llenado cae a su valor
// "ausente" (null, [] o false) y el frontend ya sabe ocultarlo con
// elegancia. Desde Fase 43 joinCatalog solo entrega productos con fila
// publicada; shapeProduct sigue tolerando metadata null por robustez.
function shapeProduct(product, metadata, resolveCategoryGroup) {
  const m = metadata || {};
  // Fase 34 — additional_info (columna text existente) guarda un JSON
  // con los ~40 campos editoriales granulares de la ficha VIBE (ver
  // api/_lib/editorialDetails.js). parseDetails nunca confía en el
  // contenido crudo: un valor corrupto, ausente, o heredado de antes de
  // esta fase (texto libre no-JSON) se degrada a "todo vacío", nunca
  // rompe la respuesta ni filtra nada fuera de la whitelist. Se aplanan
  // como campos de primer nivel, igual que shortDescription/ingredients.
  const details = parseDetails(m.additional_info);
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    available: Number(product.stock) > 0,
    promoActive: resolvePromoActive(product),
    promoPrice: product.promo_price === null || product.promo_price === undefined ? null : Number(product.promo_price),
    promoText: product.promo_text ?? null,
    category: product.category,
    categoryGroup: resolveCategoryGroup(product.category),
    // Manually assigned by the admin (Fase 22B) — distinct from
    // `category` (POS) and `categoryGroup` (static fallback derived from
    // POS category). Additive field: null until an admin sets it, never
    // inferred or defaulted from the other two.
    editorialCategory: m.category ?? null,
    subcategory: m.subcategory ?? null,
    image: m.image ?? null,
    images: Array.isArray(m.images) ? m.images : [],
    shortDescription: m.short_description ?? null,
    description: m.description ?? null,
    benefits: Array.isArray(m.benefits) ? m.benefits : [],
    ingredients: m.ingredients ?? null,
    usage: m.usage ?? null,
    presentation: m.presentation ?? null,
    brand: m.brand ?? null,
    badge: m.badge ?? null,
    // Fase 36 — antes solo se whitelisteaba para Admin; el público nunca
    // lo recibía, así que la búsqueda del sitio no podía usarlo aunque
    // existiera cargado.
    searchKeywords: Array.isArray(m.search_keywords) ? m.search_keywords : [],
    featured: Boolean(m.featured),
    editorialOrder: m.editorial_order === null || m.editorial_order === undefined ? null : Number(m.editorial_order),
    ...details,
  };
}

function sortCatalog(items) {
  return [...items].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const ao = a.editorialOrder;
    const bo = b.editorialOrder;
    if (ao !== null && bo !== null && ao !== bo) return ao - bo;
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    return a.name.localeCompare(b.name, "es");
  });
}

function applyFilters(items, { category, subcategory, featured, search } = {}) {
  return items.filter((item) => {
    if (category && item.category !== category) return false;
    if (subcategory && item.subcategory !== subcategory) return false;
    if (featured === true && item.featured !== true) return false;
    if (search) {
      const q = search.toLowerCase();
      // Fase 36 — misma ampliación que el buscador del sitio (js/taxonomy.js):
      // brand y searchKeywords ya viajan en el producto pero no se buscaban.
      const haystack = [item.name, item.shortDescription, item.category, item.subcategory, item.brand, ...(item.searchKeywords || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

module.exports = { joinCatalog, shapeProduct, sortCatalog, applyFilters };
