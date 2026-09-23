// Pure serialization between the catalog's filter state and the URL
// query string. Kept separate from app.js so it's testable without a
// DOM (URLSearchParams is available in plain Node). See
// docs/fase8-navigation.md, "URL / estado".

export function readStateFromSearch(search) {
  const params = new URLSearchParams(search || "");
  return {
    group: params.get("group") || "Todos",
    category: params.get("category") || "Todos",
    subcategory: params.get("subcategory") || "Todos",
    search: params.get("q") || "",
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
  const qs = params.toString();
  return `${pathname}${qs ? "?" + qs : ""}#catalogo`;
}
