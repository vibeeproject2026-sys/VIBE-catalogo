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

// Fase 27 — se agregan available/promo/featuredOnly/newOnly/brand, todos
// campos reales ya presentes en el shape del producto (ninguno inventado
// aquí). Cada uno es estrictamente opuesto por defecto (ausente/false no
// filtra nada) — mismo comportamiento de siempre para cualquier llamada
// que no los use.
export function filterProducts(products, { group, category, subcategory, search, available, promo, featuredOnly, newOnly, brand } = {}) {
  const q = (search || "").toLowerCase().trim();
  return products.filter((p) => {
    if (group && group !== "Todos" && groupOf(p) !== group) return false;
    if (category && category !== "Todos" && categoryOf(p) !== category) return false;
    if (subcategory && subcategory !== "Todos" && p.subcategory !== subcategory) return false;
    if (available === true && p.available === false) return false;
    if (promo === true && p.promoActive !== true) return false;
    if (featuredOnly === true && p.featured !== true) return false;
    if (newOnly === true && p.badge !== "Nuevo") return false;
    if (brand && p.brand !== brand) return false;
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

// Fase 27 — breadcrumb de la PLP (a partir del estado de navegación
// actual, no de un producto individual). Misma prioridad que en
// breadcrumbLabel: categoría editorial antes que categoría POS, y nunca
// se inventa un nombre — solo refleja lo que el propio estado ya trae.
export function breadcrumbForState({ group, category, subcategory } = {}) {
  const parts = ["Inicio"];
  if (group && group !== "Todos") parts.push(group);
  if (category && category !== "Todos") parts.push(category);
  if (subcategory && subcategory !== "Todos") parts.push(subcategory);
  return parts;
}

// Fase 27 — precio real que pagaría la clienta: el promocional cuando
// aplica (ya resuelto server-side), si no el de lista. Nunca calcula un
// descuento por su cuenta.
function effectivePrice(p) {
  return p.promoActive === true && p.promoPrice != null ? p.promoPrice : p.price;
}

// Fase 27 — Ordenamiento. Cada opción tiene una fuente real y documentada
// (ver docs de la fase): "relevance" conserva el orden ya entregado
// (server/API), "price-*" usa el precio efectivo, "new" prioriza
// badge==="Nuevo" (mismo criterio que selectNew, nunca fechas), y
// "editorial" es editorial_order puro. No existe una opción de "más
// vendidos" ni "más popular" porque no hay ninguna métrica real detrás.
export function sortProducts(products, sortKey) {
  const list = [...products];
  switch (sortKey) {
    case "price-asc":
      return list.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    case "price-desc":
      return list.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    case "new":
      return list.sort((a, b) => {
        const an = a.badge === "Nuevo";
        const bn = b.badge === "Nuevo";
        if (an !== bn) return an ? -1 : 1;
        return byEditorialOrderThenName(a, b);
      });
    case "editorial":
      return list.sort(byEditorialOrderThenName);
    default:
      return list; // "relevance" — se conserva el orden ya entregado, sin re-ordenar
  }
}

// Fase 27 — copy de estado vacío, distinto según la causa real (nunca un
// único mensaje genérico para todo): búsqueda sin resultados, filtros sin
// resultados, o simplemente una categoría todavía sin curar.
export function emptyStateCopy(state = {}) {
  if (state.search) return `No encontramos productos para "${state.search}". Intenta con otra palabra.`;
  if (state.available || state.promo || state.featuredOnly || state.newOnly || state.brand) {
    return "No hay productos que coincidan con estos filtros. Prueba ajustándolos.";
  }
  return "Estamos preparando algo especial para ti.";
}

// Fase 27 — chips de filtros activos, para que el estado sea siempre
// visible y removible individualmente. Pura lógica de presentación, sin
// tocar el DOM — app.js solo renderiza lo que esto devuelve.
export function activeFilterChips(state = {}) {
  const chips = [];
  if (state.group && state.group !== "Todos") chips.push({ key: "group", label: state.group });
  if (state.category && state.category !== "Todos") chips.push({ key: "category", label: state.category });
  if (state.subcategory && state.subcategory !== "Todos") chips.push({ key: "subcategory", label: state.subcategory });
  if (state.available) chips.push({ key: "available", label: "Disponibles" });
  if (state.promo) chips.push({ key: "promo", label: "Promoción" });
  if (state.featuredOnly) chips.push({ key: "featuredOnly", label: "Destacados" });
  if (state.newOnly) chips.push({ key: "newOnly", label: "Novedades" });
  if (state.brand) chips.push({ key: "brand", label: state.brand });
  if (state.search) chips.push({ key: "search", label: `"${state.search}"` });
  return chips;
}
