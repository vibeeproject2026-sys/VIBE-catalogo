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
const { getGroups, getCategoriesInGroup, getSubcategories, filterProducts, breadcrumbLabel } = await import(
  "data:text/javascript," + encodeURIComponent(src)
);

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
