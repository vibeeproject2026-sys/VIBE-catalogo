// Pure, DOM-free logic for deriving the catalog's navigable structure
// (group -> category -> subcategory) directly from whatever product
// list data-source.js handed back — works identically for demo and API
// products because both are normalized to carry categoryGroup/category/
// subcategory (see js/data-source.js). No separate categories fetch is
// needed for this: the product list is always the single source the
// navigation is built from, so it can never disagree with what's
// actually on screen. See docs/fase8-navigation.md.

const collator = (a, b) => a.localeCompare(b, "es");

function groupOf(p) {
  return p.categoryGroup || p.category;
}

// Nivel 2 de la taxonomía (Fase 20/22B): prefiere la categoría editorial
// VIBE (catalog_metadata.category, asignada manualmente por Ana desde
// /admin) sobre la categoría operativa del POS. Nunca reclasifica nada
// automáticamente: si un producto todavía no tiene editorialCategory
// asignada, sigue usando su categoría del POS exactamente como antes —
// esto solo empieza a tener efecto producto por producto, a medida que
// Ana los va curando.
function categoryOf(p) {
  return p.editorialCategory || p.category;
}

export function getGroups(products) {
  return [...new Set(products.map(groupOf))].sort(collator);
}

export function getCategoriesInGroup(products, group) {
  const scoped = group && group !== "Todos" ? products.filter((p) => groupOf(p) === group) : products;
  return [...new Set(scoped.map(categoryOf))].sort(collator);
}

export function getSubcategories(products, group, category) {
  let scoped = products;
  if (group && group !== "Todos") scoped = scoped.filter((p) => groupOf(p) === group);
  if (category && category !== "Todos") scoped = scoped.filter((p) => categoryOf(p) === category);
  return [...new Set(scoped.map((p) => p.subcategory).filter(Boolean))].sort(collator);
}

export function filterProducts(products, { group, category, subcategory, search } = {}) {
  const q = (search || "").toLowerCase().trim();
  return products.filter((p) => {
    if (group && group !== "Todos" && groupOf(p) !== group) return false;
    if (category && category !== "Todos" && categoryOf(p) !== category) return false;
    if (subcategory && subcategory !== "Todos" && p.subcategory !== subcategory) return false;
    if (q) {
      const haystack = [p.name, categoryOf(p), p.subcategory, p.shortDescription].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Fase 24: selección real de "Destacados" — únicamente productos con
// featured === true (nunca los primeros N del listado). Dentro de los
// destacados, respeta editorial_order (ascendente, los que no tienen
// orden asignado van al final), igual que ya hace el orden por defecto
// de la API pública (api/catalog/_lib/merge.js). No asigna featured a
// nadie ni inventa un orden — si no hay ningún producto featured, la
// lista simplemente queda vacía.
function byEditorialOrderThenName(a, b) {
  const ao = a.editorialOrder ?? null;
  const bo = b.editorialOrder ?? null;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return a.name.localeCompare(b.name, "es");
}

// Las tres secciones de merchandising curado (Destacados/Novedades/
// Promociones) además exigen disponibilidad real (available !== false)
// — a diferencia del catálogo completo, que sí muestra productos
// agotados con su badge. Una vitrina curada que invita a comprar ahora
// no debe destacar algo que no se puede comprar.
function isAvailable(p) {
  return p.available !== false;
}

export function selectFeatured(products) {
  return products.filter((p) => p.featured === true && isAvailable(p)).sort(byEditorialOrderThenName);
}

// Fase 26 — "Novedades": el ÚNICO criterio es el badge editorial exacto
// "Nuevo", asignado manualmente por Ana desde /admin. Deliberadamente NO
// usa created_at, id, orden del POS ni ninguna fecha — una fila reciente
// en la base de datos no significa "recién llegado a la tienda" (pudo
// existir en el POS hace meses y curarse editorialmente hoy). Si no hay
// ningún producto con ese badge, la lista queda vacía — nunca se inventa
// una novedad.
export function selectNew(products) {
  return products.filter((p) => p.badge === "Nuevo" && isAvailable(p)).sort(byEditorialOrderThenName);
}

// Fase 26 — "Promociones": único criterio, promoActive === true, ya
// resuelto server-side (incluye la ventana de fechas, ver
// api/catalog/_lib/merge.js) — esta función nunca vuelve a evaluar
// fechas ni ningún otro campo.
export function selectPromotions(products) {
  return products.filter((p) => p.promoActive === true && isAvailable(p)).sort(byEditorialOrderThenName);
}

// A discreet editorial path for the product detail view, e.g.
// "Maquillaje / Labiales" — collapses a segment that repeats the one
// before it (demo products today have categoryGroup === category, so
// showing both would just read "Maquillaje / Maquillaje / Labiales").
export function breadcrumbLabel(p) {
  const parts = [];
  const group = groupOf(p);
  const category = categoryOf(p);
  if (group) parts.push(group);
  if (category && category !== group) parts.push(category);
  if (p.subcategory) parts.push(p.subcategory);
  return parts.join(" / ");
}
