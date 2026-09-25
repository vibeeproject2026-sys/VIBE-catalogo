// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-taxonomy.mjs
//
// js/taxonomy.js has zero imports, so it can be loaded directly via a
// data: URL — no temp-directory trick needed (unlike data-source.js/
// cart.js, which import sibling files).

import assert from "node:assert/strict";

const src = (await import("node:fs")).readFileSync(
  new URL("../js/taxonomy.js", import.meta.url),
  "utf8"
);
const { getGroups, getCategoriesInGroup, getSubcategories, filterProducts, breadcrumbLabel, selectFeatured, selectNew, selectPromotions } =
  await import("data:text/javascript," + encodeURIComponent(src));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

// Fixture shaped exactly like data-source.js's normalized demo products
// after the Fase 8 subcategory assignment: categoryGroup === category
// for every demo product (see docs/fase8-navigation.md).
const demoLike = [
  { id: "cleanser", name: "Daily Glow Cleanser", categoryGroup: "Skincare", category: "Skincare", subcategory: "Limpieza", shortDescription: "Limpieza suave" },
  { id: "serum", name: "Radiance Serum", categoryGroup: "Skincare", category: "Skincare", subcategory: "Tratamientos", shortDescription: "Serum luminoso" },
  { id: "mask", name: "Reset Face Mask", categoryGroup: "Skincare", category: "Skincare", subcategory: "Tratamientos", shortDescription: "Mascarilla" },
  { id: "mist", name: "Hydra Mist", categoryGroup: "Skincare", category: "Skincare", subcategory: "Hidratación", shortDescription: "Bruma" },
  { id: "lip", name: "Soft Vibe Lip", categoryGroup: "Maquillaje", category: "Maquillaje", subcategory: "Labiales", shortDescription: "Color para labios" },
  { id: "brush", name: "Essential Brush", categoryGroup: "Accesorios", category: "Accesorios", subcategory: "Brochas", shortDescription: "Brocha" },
];

// Fixture with a genuine 3-level split (what a real API product would
// look like once catalog_metadata + real POS categories exist).
const apiLike = [
  { id: 1, name: "Gloss VIBE", categoryGroup: "Maquillaje", category: "Labios", subcategory: "Gloss", shortDescription: "Brillo labial" },
  { id: 2, name: "Labial Mate", categoryGroup: "Maquillaje", category: "Labios", subcategory: "Labiales", shortDescription: "Mate duradero" },
  { id: 3, name: "Base VIBE", categoryGroup: "Maquillaje", category: "Rostro", subcategory: "Bases", shortDescription: "Cobertura media" },
];

console.log("getGroups");
test("deriva los 3 grupos demo, ordenados, sin duplicados", () => {
  assert.deepEqual(getGroups(demoLike), ["Accesorios", "Maquillaje", "Skincare"]);
});

console.log("getCategoriesInGroup");
test("con 'Todos' devuelve todas las categorías presentes", () => {
  assert.deepEqual(getCategoriesInGroup(demoLike, "Todos"), ["Accesorios", "Maquillaje", "Skincare"]);
});
test("con un grupo demo (category===group) devuelve una sola categoría", () => {
  assert.deepEqual(getCategoriesInGroup(demoLike, "Skincare"), ["Skincare"]);
});
test("con datos tipo API, un grupo real agrupa varias categorías distintas", () => {
  assert.deepEqual(getCategoriesInGroup(apiLike, "Maquillaje"), ["Labios", "Rostro"]);
});

console.log("getSubcategories");
test("subcategorías de Skincare (3 productos, 3 subcategorías reales)", () => {
  assert.deepEqual(getSubcategories(demoLike, "Skincare", "Todos"), ["Hidratación", "Limpieza", "Tratamientos"]);
});
test("subcategorías de un grupo de un solo producto (Maquillaje demo)", () => {
  assert.deepEqual(getSubcategories(demoLike, "Maquillaje", "Todos"), ["Labiales"]);
});
test("subcategorías filtradas también por categoría (caso API real)", () => {
  assert.deepEqual(getSubcategories(apiLike, "Maquillaje", "Labios"), ["Gloss", "Labiales"]);
  assert.deepEqual(getSubcategories(apiLike, "Maquillaje", "Rostro"), ["Bases"]);
});

console.log("filterProducts — Todos");
test("sin filtros (o 'Todos' en todo) devuelve la lista completa", () => {
  assert.equal(filterProducts(demoLike, { group: "Todos", category: "Todos", subcategory: "Todos", search: "" }).length, 6);
});

console.log("filterProducts — categoría/grupo");
test("filtra por grupo", () => {
  const r = filterProducts(demoLike, { group: "Skincare" });
  assert.equal(r.length, 4);
  assert.ok(r.every((p) => p.categoryGroup === "Skincare"));
});
test("filtra por categoría dentro de un grupo con varias categorías (API-like)", () => {
  const r = filterProducts(apiLike, { group: "Maquillaje", category: "Labios" });
  assert.equal(r.length, 2);
});

console.log("filterProducts — subcategoría");
test("filtra por subcategoría", () => {
  const r = filterProducts(demoLike, { group: "Skincare", subcategory: "Tratamientos" });
  assert.deepEqual(r.map((p) => p.id).sort(), ["mask", "serum"]);
});

console.log("filterProducts — búsqueda");
test("busca por nombre", () => {
  assert.equal(filterProducts(demoLike, { search: "cleanser" }).length, 1);
});
test("busca por subcategoría (no solo nombre/descripción)", () => {
  const r = filterProducts(demoLike, { search: "labiales" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "lip");
});

console.log("filterProducts — combinaciones");
test("búsqueda + categoría combinadas", () => {
  const r = filterProducts(demoLike, { group: "Skincare", search: "bruma" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "mist");
});
test("categoría + subcategoría combinadas (API-like, 3 niveles reales)", () => {
  const r = filterProducts(apiLike, { group: "Maquillaje", category: "Labios", subcategory: "Gloss" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 1);
});
test("combinación sin resultados produce lista vacía (estado vacío), no un error", () => {
  const r = filterProducts(demoLike, { group: "Skincare", subcategory: "Labiales" });
  assert.deepEqual(r, []);
});

console.log("breadcrumbLabel");
test("colapsa el segmento repetido cuando categoryGroup === category (demo)", () => {
  assert.equal(breadcrumbLabel(demoLike[0]), "Skincare / Limpieza");
});
test("muestra los 3 niveles cuando group y category difieren (API real)", () => {
  assert.equal(breadcrumbLabel(apiLike[0]), "Maquillaje / Labios / Gloss");
});
test("se degrada con elegancia si no hay subcategoría", () => {
  assert.equal(breadcrumbLabel({ categoryGroup: "Skincare", category: "Skincare" }), "Skincare");
});

// Fase 24 — fixture mezclando productos curados editorialmente (Mascarilla
// Facial: el POS dice "Labios" pero Ana ya la reclasificó a "Skincare" desde
// /admin) con productos todavía sin curar (mismo POS, sin editorialCategory).
const curatedMix = [
  { id: 89, name: "Mascarilla Facial", categoryGroup: "Maquillaje", category: "Labios", editorialCategory: "Skincare", subcategory: "Mascarillas" },
  { id: 65, name: "VIBE Lover Lips", categoryGroup: "Maquillaje", category: "Labios", editorialCategory: null, subcategory: null },
];

console.log("categoryOf (Fase 24 — editorialCategory)");
test("getCategoriesInGroup prefiere editorialCategory sobre la categoría POS cuando existe", () => {
  assert.deepEqual(getCategoriesInGroup(curatedMix, "Todos").sort(), ["Labios", "Skincare"]);
});
test("un producto sin editorialCategory sigue usando su categoría POS tal cual (no se reclasifica nada)", () => {
  const r = filterProducts(curatedMix, { category: "Labios" });
  assert.deepEqual(r.map((p) => p.id), [65]);
});
test("un producto curado se filtra por su categoría editorial, no por la del POS", () => {
  const r = filterProducts(curatedMix, { category: "Skincare" });
  assert.deepEqual(r.map((p) => p.id), [89]);
});
test("breadcrumbLabel usa la categoría editorial cuando existe", () => {
  assert.equal(breadcrumbLabel(curatedMix[0]), "Maquillaje / Skincare / Mascarillas");
});
test("breadcrumbLabel sigue usando la categoría POS si no hay curaduría editorial todavía", () => {
  assert.equal(breadcrumbLabel(curatedMix[1]), "Maquillaje / Labios");
});

console.log("selectFeatured (Fase 24 — TEST 3: solo featured === true)");
const featuredFixture = [
  { id: 1, name: "A", featured: true, editorialOrder: 2 },
  { id: 2, name: "B", featured: false, editorialOrder: 1 },
  { id: 3, name: "C", featured: true, editorialOrder: 1 },
  { id: 4, name: "D", featured: true, editorialOrder: null },
  { id: 5, name: "E Zeta", featured: true, editorialOrder: null },
];
test("solo incluye productos con featured === true, nunca 'los primeros N'", () => {
  const r = selectFeatured(featuredFixture);
  assert.deepEqual(r.map((p) => p.id).sort(), [1, 3, 4, 5]);
  assert.ok(!r.some((p) => p.id === 2));
});
test("ordena por editorial_order ascendente dentro de los destacados", () => {
  const r = selectFeatured(featuredFixture);
  assert.deepEqual(r.slice(0, 2).map((p) => p.id), [3, 1]); // orden 1, luego orden 2
});
test("los destacados sin editorial_order van al final, ordenados alfabéticamente entre sí", () => {
  const r = selectFeatured(featuredFixture);
  assert.deepEqual(r.slice(2).map((p) => p.id), [4, 5]); // D antes que "E Zeta"
});
test("sin ningún producto featured, devuelve lista vacía (no inventa una selección)", () => {
  assert.deepEqual(selectFeatured([{ id: 1, name: "X", featured: false }]), []);
});
test("un producto featured pero sin disponibilidad NO aparece en Destacados (Fase 26, TEST 8)", () => {
  const r = selectFeatured([
    { id: 1, name: "A", featured: true, available: true },
    { id: 2, name: "B", featured: true, available: false },
  ]);
  assert.deepEqual(r.map((p) => p.id), [1]);
});

console.log("selectNew (Fase 26 — TEST 3/4: solo badge==='Nuevo', nunca fechas)");
test("solo incluye productos con badge exactamente 'Nuevo'", () => {
  const r = selectNew([
    { id: 1, name: "A", badge: "Nuevo", available: true },
    { id: 2, name: "B", badge: "VIBE PICK", available: true },
    { id: 3, name: "C", badge: null, available: true },
  ]);
  assert.deepEqual(r.map((p) => p.id), [1]);
});
test("ignora por completo created_at/fecha — un producto reciente sin el badge no aparece, uno antiguo con el badge sí", () => {
  const r = selectNew([
    { id: 1, name: "Antiguo pero curado hoy", badge: "Nuevo", created_at: "2020-01-01", available: true },
    { id: 2, name: "Reciente sin curar", badge: null, created_at: "2026-09-25", available: true },
  ]);
  assert.deepEqual(r.map((p) => p.id), [1]);
});
test("un producto con badge='Nuevo' pero sin disponibilidad NO aparece en Novedades", () => {
  const r = selectNew([{ id: 1, name: "A", badge: "Nuevo", available: false }]);
  assert.deepEqual(r, []);
});
test("sin ningún producto con badge='Nuevo', lista vacía", () => {
  assert.deepEqual(selectNew([{ id: 1, name: "X", badge: null }]), []);
});

console.log("selectPromotions (Fase 26 — TEST 1/2: solo promoActive===true, ya resuelto server-side)");
test("solo incluye productos con promoActive === true", () => {
  const r = selectPromotions([
    { id: 1, name: "A", promoActive: true, available: true },
    { id: 2, name: "B", promoActive: false, available: true },
  ]);
  assert.deepEqual(r.map((p) => p.id), [1]);
});
test("sin ningún promoActive=true, lista vacía (Promociones no debe mostrarse)", () => {
  assert.deepEqual(selectPromotions([{ id: 1, name: "X", promoActive: false }]), []);
});
test("un producto en promoción pero sin disponibilidad NO aparece en Promociones", () => {
  assert.deepEqual(selectPromotions([{ id: 1, name: "A", promoActive: true, available: false }]), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
