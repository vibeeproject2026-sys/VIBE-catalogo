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

console.log("readStateFromSearch (simula un refresh / link compartido)");
test("querystring vacío -> todo en 'Todos', búsqueda vacía", () => {
  assert.deepEqual(readStateFromSearch(""), { group: "Todos", category: "Todos", subcategory: "Todos", search: "" });
});
test("lee los 4 parámetros de un link compartido completo", () => {
  const r = readStateFromSearch("?group=Maquillaje&category=Labios&subcategory=Gloss&q=brillo");
  assert.deepEqual(r, { group: "Maquillaje", category: "Labios", subcategory: "Gloss", search: "brillo" });
});
test("parámetros parciales no rompen — el resto cae a su default", () => {
  const r = readStateFromSearch("?group=Skincare");
  assert.deepEqual(r, { group: "Skincare", category: "Todos", subcategory: "Todos", search: "" });
});

console.log("buildUrl");
test("sin selección activa, la URL solo lleva el hash del catálogo", () => {
  const url = buildUrl("/", { group: "Todos", category: "Todos", subcategory: "Todos", search: "" });
  assert.equal(url, "/#catalogo");
});
test("con selección completa, produce una URL reconstruible", () => {
  const state = { group: "Maquillaje", category: "Labios", subcategory: "Gloss", search: "brillo" };
  const url = buildUrl("/", state);
  assert.equal(url, "/?group=Maquillaje&category=Labios&subcategory=Gloss&q=brillo#catalogo");
});

console.log("round-trip (lo que pasa en un refresh real)");
test("buildUrl -> readStateFromSearch reproduce el mismo estado de filtros", () => {
  const original = { group: "Skincare", category: "Todos", subcategory: "Hidratación", search: "mist" };
  const url = buildUrl("/index.html", original);
  const queryPart = url.split("#")[0].split("?")[1] || "";
  const roundTripped = readStateFromSearch("?" + queryPart);
  assert.deepEqual(roundTripped, original);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
