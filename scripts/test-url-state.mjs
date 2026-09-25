// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-url-state.mjs
//
// js/url-state.js has zero imports, loaded via a data: URL.

import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../js/url-state.js", import.meta.url), "utf8");
const { readStateFromSearch, buildUrl } = await import("data:text/javascript," + encodeURIComponent(src));

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

const DEFAULTS = { group: "Todos", category: "Todos", subcategory: "Todos", search: "", available: false, promo: false, featuredOnly: false, newOnly: false, sort: "relevance" };

console.log("readStateFromSearch (simula un refresh / link compartido)");
test("querystring vacío -> todo en su default", () => {
  assert.deepEqual(readStateFromSearch(""), DEFAULTS);
});
test("lee los 4 parámetros clásicos de un link compartido", () => {
  const r = readStateFromSearch("?group=Maquillaje&category=Labios&subcategory=Gloss&q=brillo");
  assert.deepEqual(r, { ...DEFAULTS, group: "Maquillaje", category: "Labios", subcategory: "Gloss", search: "brillo" });
});
test("parámetros parciales no rompen — el resto cae a su default", () => {
  const r = readStateFromSearch("?group=Skincare");
  assert.deepEqual(r, { ...DEFAULTS, group: "Skincare" });
});

console.log("readStateFromSearch — filtros y orden de Fase 27");
test("lee available/promo/featured/new como booleanos reales", () => {
  const r = readStateFromSearch("?available=true&promo=true&featured=true&new=true");
  assert.deepEqual(r, { ...DEFAULTS, available: true, promo: true, featuredOnly: true, newOnly: true });
});
test("cualquier valor que no sea exactamente 'true' se trata como false (nunca truthy accidental)", () => {
  const r = readStateFromSearch("?available=1&promo=yes");
  assert.equal(r.available, false);
  assert.equal(r.promo, false);
});
test("lee sort cuando está presente", () => {
  assert.equal(readStateFromSearch("?sort=price-asc").sort, "price-asc");
});

console.log("buildUrl");
test("sin selección activa, la URL solo lleva el hash del catálogo", () => {
  const url = buildUrl("/", DEFAULTS);
  assert.equal(url, "/#catalogo");
});
test("con selección completa, produce una URL reconstruible", () => {
  const state = { ...DEFAULTS, group: "Maquillaje", category: "Labios", subcategory: "Gloss", search: "brillo" };
  const url = buildUrl("/", state);
  assert.equal(url, "/?group=Maquillaje&category=Labios&subcategory=Gloss&q=brillo#catalogo");
});
test("solo agrega available/promo/featured/new/sort a la URL cuando están activos", () => {
  const url = buildUrl("/", { ...DEFAULTS, available: true, promo: true, featuredOnly: true, newOnly: true, sort: "price-desc" });
  assert.equal(url, "/?available=true&promo=true&featured=true&new=true&sort=price-desc#catalogo");
});
test("sort='relevance' (el default) no ensucia la URL", () => {
  const url = buildUrl("/", { ...DEFAULTS, sort: "relevance" });
  assert.equal(url, "/#catalogo");
});

console.log("round-trip (lo que pasa en un refresh real)");
test("buildUrl -> readStateFromSearch reproduce el mismo estado de filtros clásicos", () => {
  const original = { ...DEFAULTS, group: "Skincare", subcategory: "Hidratación", search: "mist" };
  const url = buildUrl("/index.html", original);
  const queryPart = url.split("#")[0].split("?")[1] || "";
  const roundTripped = readStateFromSearch("?" + queryPart);
  assert.deepEqual(roundTripped, original);
});
test("round-trip también con los filtros/orden nuevos de Fase 27 combinados", () => {
  const original = { ...DEFAULTS, group: "Maquillaje", available: true, promo: true, sort: "editorial" };
  const url = buildUrl("/", original);
  const queryPart = url.split("#")[0].split("?")[1] || "";
  const roundTripped = readStateFromSearch("?" + queryPart);
  assert.deepEqual(roundTripped, original);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
