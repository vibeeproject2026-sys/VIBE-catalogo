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
  const qs = params.toString();
  return `${pathname}${qs ? "?" + qs : ""}#catalogo`;
}
