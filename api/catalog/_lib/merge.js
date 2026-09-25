// Pure, dependency-free logic: joining products (POS) with catalog_metadata,
// shaping the public response, filtering and sorting. Deliberately an
// in-memory join rather than a PostgREST embedded query (?select=*,catalog_metadata(*))
// because catalog_metadata does not exist in production yet and its
// relationship cannot be verified against the real PostgREST schema
// cache in this phase. An in-memory join is simpler to reason about,
// trivial to unit test, and negligible in cost at this catalog's volume.
// Embedding can be adopted later as an optimization once the schema is
// live and confirmed.

function joinCatalog(products, metadataRows) {
  const metaByProductId = new Map(metadataRows.map((m) => [String(m.product_id), m]));
  return products
    .map((product) => ({ product, metadata: metaByProductId.get(String(product.id)) }))
    .filter((row) => Boolean(row.metadata)); // metadataRows is expected to already be published=true only
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

function shapeProduct(product, metadata, resolveCategoryGroup) {
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
    editorialCategory: metadata.category ?? null,
    subcategory: metadata.subcategory ?? null,
    image: metadata.image ?? null,
    images: Array.isArray(metadata.images) ? metadata.images : [],
    shortDescription: metadata.short_description ?? null,
    description: metadata.description ?? null,
    benefits: Array.isArray(metadata.benefits) ? metadata.benefits : [],
    ingredients: metadata.ingredients ?? null,
    usage: metadata.usage ?? null,
    presentation: metadata.presentation ?? null,
    brand: metadata.brand ?? null,
    badge: metadata.badge ?? null,
    featured: Boolean(metadata.featured),
    editorialOrder:
      metadata.editorial_order === null || metadata.editorial_order === undefined
        ? null
        : Number(metadata.editorial_order),
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
