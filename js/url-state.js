// Pure serialization between the catalog's filter state and the URL
// query string. Kept separate from app.js so it's testable without a
// DOM (URLSearchParams is available in plain Node). See
// docs/fase8-navigation.md, "URL / estado".

// Fase 27 — se agregan available/promo/featured/new/sort, extendiendo el
// mismo mecanismo de query params ya existente (no se introduce un
// router de rutas reales tipo /maquillaje: ver docs/fase27-plp.md para
// la justificación — la arquitectura actual de una sola página con
// query params ya es refresh-safe/compartible/reproducible, y añadir
// rutas reales requeriría reescribir el hosting estático con rewrites de
// Vercel, un cambio de infraestructura no evaluado en esta fase).
export function readStateFromSearch(search) {
  const params = new URLSearchParams(search || "");
  return {
    group: params.get("group") || "Todos",
    category: params.get("category") || "Todos",
    subcategory: params.get("subcategory") || "Todos",
    search: params.get("q") || "",
    available: params.get("available") === "true",
    promo: params.get("promo") === "true",
    featuredOnly: params.get("featured") === "true",
    newOnly: params.get("new") === "true",
    sort: params.get("sort") || "relevance",
    // Fase 28 — PDP: id del producto abierto, si lo hay. Siempre string
    // (o null) porque viene de un query param — ver findProduct() en
    // taxonomy.js para la comparación robusta contra ids numéricos reales.
    product: params.get("product") || null,
  };
}

// replaceState-friendly URL: includes #catalogo so a freshly opened
// shared link both pre-filters the catalog and scrolls to it.
export function buildUrl(pathname, state) {
  const params = new URLSearchParams();
  if (state.group && state.group !== "Todos") params.set("group", state.group);
  if (state.category && state.category !== "Todos") params.set("category", state.category);
  if (state.subcategory && state.subcategory !== "Todos") params.set("subcategory", state.subcategory);
  if (state.search) params.set("q", state.search);
  if (state.available) params.set("available", "true");
  if (state.promo) params.set("promo", "true");
  if (state.featuredOnly) params.set("featured", "true");
  if (state.newOnly) params.set("new", "true");
  if (state.sort && state.sort !== "relevance") params.set("sort", state.sort);
  // state.product puede llegar como id (string/number, uso de la Fase 28
  // en app.js) o como el objeto producto completo (uso legado de
  // state.product en el resto de la app) — se normaliza aquí para que
  // buildUrl nunca dependa de cuál de los dos le llegó.
  const productId = state.product && typeof state.product === "object" ? state.product.id : state.product;
  if (productId) params.set("product", productId);
  const qs = params.toString();
  return `${pathname}${qs ? "?" + qs : ""}#catalogo`;
}
