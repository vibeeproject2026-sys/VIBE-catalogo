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

export function getGroups(products) {
  return [...new Set(products.map(groupOf))].sort(collator);
}

export function getCategoriesInGroup(products, group) {
  const scoped = group && group !== "Todos" ? products.filter((p) => groupOf(p) === group) : products;
  return [...new Set(scoped.map((p) => p.category))].sort(collator);
}

export function getSubcategories(products, group, category) {
  let scoped = products;
  if (group && group !== "Todos") scoped = scoped.filter((p) => groupOf(p) === group);
  if (category && category !== "Todos") scoped = scoped.filter((p) => p.category === category);
  return [...new Set(scoped.map((p) => p.subcategory).filter(Boolean))].sort(collator);
}

export function filterProducts(products, { group, category, subcategory, search } = {}) {
  const q = (search || "").toLowerCase().trim();
  return products.filter((p) => {
    if (group && group !== "Todos" && groupOf(p) !== group) return false;
    if (category && category !== "Todos" && p.category !== category) return false;
    if (subcategory && subcategory !== "Todos" && p.subcategory !== subcategory) return false;
    if (q) {
      const haystack = [p.name, p.category, p.subcategory, p.shortDescription].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// A discreet editorial path for the product detail view, e.g.
// "Maquillaje / Labiales" — collapses a segment that repeats the one
// before it (demo products today have categoryGroup === category, so
// showing both would just read "Maquillaje / Maquillaje / Labiales").
export function breadcrumbLabel(p) {
  const parts = [];
  const group = groupOf(p);
  if (group) parts.push(group);
  if (p.category && p.category !== group) parts.push(p.category);
  if (p.subcategory) parts.push(p.subcategory);
  return parts.join(" / ");
}
