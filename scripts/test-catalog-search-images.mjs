// Runs with plain Node, no network, no real credentials:
//   node scripts/test-catalog-search-images.mjs
//
// 1. Palabras clave de Admin → catalog_metadata.search_keywords → API
//    (api/catalog/_lib/merge.js) → navegador (js/data-source.js) → búsqueda
//    (js/taxonomy.js), sin tildes, mayúsculas ni espacios de más.
// 2. Regla de tamaño de la optimización automática de imágenes del Admin
//    (función real extraída de admin/admin.js).
// 3. Cuadrícula del catálogo: 10 por página llenan filas completas.

import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-search-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["products.js", "taxonomy.js", "data-source.js", "variants.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));
const ds = await import(pathToFileURL(path.join(tmp, "data-source.js")).href);
const T = await import(pathToFileURL(path.join(tmp, "taxonomy.js")).href);
const merge = require("../api/catalog/_lib/merge");
const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");

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

// Fila del POS + ficha tal como las guarda el Admin (palabras de ejemplo de
// la propietaria; datos de prueba, no de producción).
const POS = { id: 175, name: "Acné Patch", price: 15000, stock: 5, category: "Skincare", promo_active: false };
const META = { product_id: 175, published: true, brand: "SADOER", category: "Skincare", subcategory: "Mascarillas", search_keywords: ["acne", "parches", "granitos", "imperfecciones", "skincare", "cuidado facial"] };
const toBrowser = (pos, meta) => ds.__internal.normalizeApiProduct(merge.shapeProduct(pos, meta, resolveCategoryGroup));

console.log("Palabras clave");
await test("Admin → API → navegador: las palabras clave llegan intactas (antes el navegador las descartaba)", () => {
  const api = merge.shapeProduct(POS, META, resolveCategoryGroup);
  assert.deepEqual(api.searchKeywords, META.search_keywords);
  const p = toBrowser(POS, META);
  assert.deepEqual(p.searchKeywords, META.search_keywords);
  // Solo textos con contenido; espacios recortados.
  assert.deepEqual(ds.__internal.normalizeApiProduct({ ...api, searchKeywords: [" acne ", "", null, 7, "  "] }).searchKeywords, ["acne"]);
  assert.deepEqual(ds.__internal.normalizeApiProduct({ ...api, searchKeywords: undefined }).searchKeywords, []);
});
await test("buscar por nombre, sin tilde y por cada palabra clave encuentra el producto (una sola vez)", () => {
  const other = toBrowser({ ...POS, id: 2, name: "Labial Mate" }, { ...META, product_id: 2, brand: "VIBE", subcategory: "Labial", search_keywords: ["labios"] });
  const list = [toBrowser(POS, META), other];
  for (const q of ["Acné Patch", "acne patch", "acne", "acné", "ACNÉ", "parches", "granitos", "imperfecciones", "Cuidado   Facial", " cuidado facial ", "sadoer"]) {
    assert.deepEqual(T.filterProducts(list, { search: q }).map((p) => p.id), [175], q);
  }
  assert.deepEqual(T.filterProducts(list, { search: "labios" }).map((p) => p.id), [2]);
  assert.deepEqual(T.filterProducts(list, { search: "inexistente" }), []);
});
await test("cambiar las palabras clave en Admin cambia lo que se encuentra", () => {
  const before = [toBrowser(POS, META)];
  const after = [toBrowser(POS, { ...META, search_keywords: ["hidrocoloide"] })];
  assert.equal(T.filterProducts(before, { search: "granitos" }).length, 1);
  assert.equal(T.filterProducts(after, { search: "granitos" }).length, 0);
  assert.equal(T.filterProducts(after, { search: "hidrocoloide" }).length, 1);
});
await test("las palabras clave no se muestran en la tienda (solo sirven para buscar)", () => {
  for (const f of ["js/app.js", "index.html"]) assert.doesNotMatch(fs.readFileSync(path.join(root, f), "utf8"), /searchKeywords|search_keywords/, f);
});

console.log("Optimización automática (regla de tamaño)");
const adminSrc = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
const scaleSrc = adminSrc.match(/function optimizeScale\(w, h, p\) \{[\s\S]*?\n\}/);
const profilesSrc = adminSrc.match(/const IMAGE_PROFILES = (\{[\s\S]*?\n\});/);
const optimizeScale = new Function(`${scaleSrc[0]}; return optimizeScale;`)();
const PROFILES = new Function(`return ${profilesSrc[1]};`)();
const dims = (w, h, key) => { const s = optimizeScale(w, h, PROFILES[key]); return [Math.round(w * s), Math.round(h * s)]; };
await test("producto: reduce manteniendo la proporción, nunca agranda ni recorta", () => {
  assert.deepEqual(dims(4000, 5000, "product:main"), [1200, 1500]);
  assert.deepEqual(dims(3024, 4032, "product:main"), [1125, 1500]);
  assert.deepEqual(dims(1122, 1402, "product:main"), [1122, 1402]); // ya cabe: solo se recodifica
  assert.deepEqual(dims(3000, 3000, "product:secondary"), [1200, 1200]);
  assert.deepEqual(dims(500, 500, "product:secondary"), [500, 500]); // pequeña: no se agranda
});
await test("nunca baja de los mínimos que valida el servidor (si no, el upload se rechazaría)", () => {
  // Principal muy apaisada: caber en 1200 de ancho la dejaría con 400 de alto (< 1000).
  const [w, h] = dims(3000, 1000, "product:main");
  assert.ok(w >= 800 && h >= 1000 && Math.abs(w / h - 3) < 0.01, `${w}x${h}`);
});
await test("carrusel: banner panorámico conserva su proporción (no se cuadra)", () => {
  assert.deepEqual(dims(5000, 2500, "hero:desktop"), [2400, 1200]);
  assert.deepEqual(dims(1920, 1080, "hero:desktop"), [1920, 1080]);
  assert.deepEqual(dims(2160, 2700, "hero:mobile"), [1200, 1500]);
});
await test("la subida de producto y de carrusel pasa siempre por la optimización; si falla, no se sube", () => {
  assert.match(adminSrc, /async function uploadProductImage\(productId, originalFile, slot, statusEl\) \{\s*const prepared = await prepareImageForUpload\(/);
  assert.match(adminSrc, /async function uploadHeroImage\(slideId, originalFile, slot, statusEl\) \{\s*const prepared = await prepareImageForUpload\(/);
  assert.match(adminSrc, /createImageBitmap\(file, \{ imageOrientation: "from-image" \}\)/);
  assert.match(adminSrc, /canvasToBlob\(canvas, "image\/webp", WEBP_QUALITY\)/);
  assert.match(adminSrc, /No se guardó la imagen\. Motivo: no se pudo optimizar el archivo/);
});

console.log("Cuadrícula");
await test("escritorio: 5 columnas y 20 por página (4 filas completas); ≤ 900 px, 2 columnas y 10 por página", () => {
  const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  // Las vitrinas (Novedades, Más elegidos) comparten la misma cuadrícula de 5 columnas.
  assert.match(css, /@media\(min-width:901px\)\{#productGrid,\.showcase-grid\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:900px\)\{\s*\.grid\{grid-template-columns:repeat\(2,1fr\)\}/);
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  // Escritorio 20 por página (4 filas de 5); tablet y móvil 10 (5 filas de 2), mismo corte de 900 px.
  assert.ok(app.includes('window.matchMedia("(min-width: 901px)")'), "corte de escritorio a 901 px");
  assert.ok(app.includes("const pageSize = () => (DESKTOP_GRID && DESKTOP_GRID.matches ? 20 : 10);"), "20 por página en escritorio, 10 en tablet y móvil");
  assert.equal(20 % 5, 0);
  assert.equal(10 % 2, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
