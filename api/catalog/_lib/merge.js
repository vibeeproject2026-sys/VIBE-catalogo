// Pure, dependency-free logic: joining products (POS) with catalog_metadata,
// shaping the public response, filtering and sorting. Deliberately an
// in-memory join rather than a PostgREST embedded query (?select=*,catalog_metadata(*))
// because catalog_metadata does not exist in production yet and its
// relationship cannot be verified against the real PostgREST schema
// cache in this phase. An in-memory join is simpler to reason about,
// trivial to unit test, and negligible in cost at this catalog's volume.
// Embedding can be adopted later as an optimization once the schema is
// live and confirmed.

// Fase 31 — LEFT JOIN: todo producto del POS se incluye, tenga o no una
// fila editorial publicada. metadata queda null cuando no existe (o
// cuando existe pero published !== true — metadataRows ya viene filtrada
// a published=true, así que ambos casos llegan aquí como "sin fila" y
// shapeProduct() los trata exactamente igual: el producto se muestra con
// los datos del POS solamente, nunca se cae del catálogo por falta de
// curaduría editorial).
function joinCatalog(products, metadataRows) {
  const metaByProductId = new Map(metadataRows.map((m) => [String(m.product_id), m]));
  return products.map((product) => ({ product, metadata: metaByProductId.get(String(product.id)) || null }));
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
// demás es editorial y estrictamente opcional: cuando metadata es null
// (producto sin ficha, o con una fila aún no publicada — join Catalog ya
// unifica ambos casos), cada campo cae a su valor "ausente" (null, []
// o false) exactamente igual que cuando la fila existe pero un campo
// puntual no fue llenado. El frontend ya sabe ocultar con elegancia
// cualquier campo así.
function shapeProduct(product, metadata, resolveCategoryGroup) {
  const m = metadata || {};
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
    featured: Boolean(m.featured),
    editorialOrder: m.editorial_order === null || m.editorial_order === undefined ? null : Number(m.editorial_order),
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
      const haystack = [item.name, item.shortDescription, item.category, item.subcategory]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

module.exports = { joinCatalog, shapeProduct, sortCatalog, applyFilters };
