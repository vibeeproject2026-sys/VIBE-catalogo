// Runs with plain Node, no network, no real credentials:
//   node scripts/test-product-sheet.mjs
//
// Ficha completa de producto (caso Acne Patch): la información que entrega
// la API pública (descripción, imágenes, presentaciones con precio propio)
// llega intacta a lo que usa la ficha (js/data-source.js), con los precios
// correctos por presentación (js/variants.js), se encuentra en la búsqueda
// con o sin tildes (js/taxonomy.js), y la API del catálogo no se queda
// minutos atrás de lo guardado en Admin (Cache-Control corto).

import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-sheet-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["products.js", "taxonomy.js", "data-source.js", "variants.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));
const ds = await import(pathToFileURL(path.join(tmp, "data-source.js")).href);
const V = await import(pathToFileURL(path.join(tmp, "variants.js")).href);
const T = await import(pathToFileURL(path.join(tmp, "taxonomy.js")).href);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

// Misma forma que entrega GET /api/catalog/products para Acne Patch.
const ACNE_API = {
  id: 175, name: "Acné Patch", price: 15000, available: true, promoActive: false, promoPrice: null, promoText: null,
  category: "Skincare", categoryGroup: "Skincare", editorialCategory: "Tratamiento", subcategory: "Mascarillas",
  image: "https://example.supabase.co/storage/v1/object/public/product-images/products/175/main.png",
  images: ["https://example.supabase.co/p/175/01.webp", "https://example.supabase.co/p/175/02.webp", "https://example.supabase.co/p/175/03.webp"],
  description: "Un granito apareció justo cuando menos lo necesitabas.", brand: "SADOER", commercialName: "Acné Patch.", productType: "Purifying Acne Patch",
  shades: [],
  presentations: [
    { id: "p-40", name: "40 colores", active: true, order: 0, price: 13000 },
    { id: "p-36", name: "36 te verde", active: true, order: 1, price: 18000 },
    { id: "p-cat", name: "72 Cat", active: true, order: 2 },
    { id: "p-ele", name: "72 Elephant", active: true, order: 3 },
  ],
  imageSrcset: null, srcsetByUrl: {},
};
const normalize = (raw) => ds.__internal.normalizeApiProduct(raw);

await test("la ficha recibe toda la información de la API: nombre, descripción, tipo, marca, imágenes y presentaciones", () => {
  const p = normalize(ACNE_API);
  assert.equal(p.name, "Acné Patch");
  assert.equal(p.description, ACNE_API.description);
  assert.equal(p.productType, "Purifying Acne Patch");
  assert.equal(p.brand, "SADOER");
  assert.equal(p.image, ACNE_API.image);
  assert.deepEqual(p.images.slice(-3), ACNE_API.images);
  assert.deepEqual(p.presentations.map((o) => [o.id, o.name, o.active, o.price ?? null]), [["p-40", "40 colores", true, 13000], ["p-36", "36 te verde", true, 18000], ["p-cat", "72 Cat", true, null], ["p-ele", "72 Elephant", true, null]]);
});
await test("precio por presentación: propio cuando existe, general (15.000) cuando no; «Desde» 13.000", () => {
  const p = normalize(ACNE_API);
  assert.deepEqual(["p-40", "p-36", "p-cat", "p-ele"].map((id) => V.resolveVariant(p, null, id).price), [13000, 18000, 15000, 15000]);
  assert.deepEqual(V.priceRange(p), { min: 13000, max: 18000 });
  assert.equal(V.resolveVariant(p, null, null), null, "sin elegir presentación no se puede comprar");
});
await test("con promoción del POS (−10 %) se aplica una sola vez sobre la base de cada presentación", () => {
  const p = normalize({ ...ACNE_API, promoActive: true, promoPrice: 13500 });
  assert.deepEqual(["p-40", "p-36", "p-cat"].map((id) => [V.resolveVariant(p, null, id).price, V.resolveVariant(p, null, id).originalPrice]), [[11700, 13000], [16200, 18000], [13500, 15000]]);
});
await test("búsqueda sin distinguir tildes ni mayúsculas: «acne», «ACNE», «acné patch», marca", () => {
  const list = [normalize(ACNE_API), normalize({ ...ACNE_API, id: 1, name: "Rubor", commercialName: null, description: null, brand: "VIBE", subcategory: "Rubor" })];
  for (const q of ["acne", "ACNE", "acné patch", "Acne Patch", "sadoer"]) assert.deepEqual(T.filterProducts(list, { search: q }).map((p) => p.id), [175], q);
  // Al revés: un nombre sin tilde se encuentra buscando con tilde.
  assert.deepEqual(T.filterProducts([normalize({ ...ACNE_API, name: "Acne Patch" })], { search: "acné" }).map((p) => p.id), [175]);
  assert.deepEqual(T.filterProducts(list, { search: "xyz" }), []);
});
await test("la API del catálogo no se queda minutos atrás de lo guardado en Admin (CDN 30 s, navegador 15 s)", () => {
  const src = fs.readFileSync(path.join(root, "api/catalog/products.js"), "utf8");
  assert.match(src, /res\.setHeader\("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60"\);\s*return sendJson\(res, 200, \{ products: items \}\);/);
  assert.doesNotMatch(src, /s-maxage=300, stale-while-revalidate=600/);
});
await test("la ficha muestra descripción, presentaciones con precio y tipo de producto (código de la ficha)", () => {
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(app, /p\.commercialName \? `<p class="pdp-commercial-name">/);
  assert.match(app, /<div id="pdpPriceArea" aria-live="polite">\$\{pdpPriceAreaHtml\(p\)\}<\/div>/);
  assert.match(app, /optionShownPrice\(opt\) != null \? `<span class="option-price">/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
