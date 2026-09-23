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

function shapeProduct(product, metadata, resolveCategoryGroup) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    available: Number(product.stock) > 0,
    category: product.category,
    categoryGroup: resolveCategoryGroup(product.category),
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
