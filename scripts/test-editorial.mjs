// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-editorial.mjs
//
// js/editorial.js imports findProduct from js/taxonomy.js — se inlinea
// esa dependencia igual que hacen otros scripts de este proyecto con
// módulos que importan hermanos (ver scripts/test-cart-integration.mjs),
// reescribiendo el import a una ruta relativa dentro de un directorio
// temporal para que la resolución de módulos de Node funcione con
// data:/file: URLs mixtos.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-editorial-test-"));
fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ type: "module" }));
fs.copyFileSync(path.join(repoRoot, "js", "taxonomy.js"), path.join(tmpDir, "taxonomy.js"));
fs.copyFileSync(path.join(repoRoot, "js", "editorial.js"), path.join(tmpDir, "editorial.js"));

const {
  getPublishedArticles,
  getArticleBySlug,
  getCategoriesWithContent,
  getArticlesByCategory,
  resolveRelatedProducts,
  breadcrumbForArticle,
} = await import(pathToFileURL(path.join(tmpDir, "editorial.js")).href);

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

// Fixtures de prueba — nunca contenido real ni contenido de producción,
// solo para validar que la lógica pura se comporta correctamente ante
// distintos estados (Fase 30, sección 19: la arquitectura se valida con
// tests, no inventando contenido en producción).
const fixture = [
  { id: 1, slug: "ritual-skincare-basico", title: "Tu ritual de skincare, sin complicarte", excerpt: "Tres pasos reales para empezar.", category: "Skincare", image: "img1.jpg", published: true, date: "2026-01-10", tags: ["skincare", "rutina"], relatedProducts: [56], content: ["Párrafo uno.", "Párrafo dos."] },
  { id: 2, slug: "tendencias-labiales-2026", title: "Lo que se viene en labiales", excerpt: "Colores y texturas del momento.", category: "Maquillaje", image: null, published: true, date: "2026-02-05", tags: ["maquillaje"], relatedProducts: [], content: ["Contenido."] },
  { id: 3, slug: "borrador-sin-publicar", title: "Todavía en edición", excerpt: "No debería verse.", category: "Tips", image: "img3.jpg", published: false, date: "2026-03-01", tags: [], relatedProducts: [], content: [] },
  { id: 4, slug: "sin-fecha", title: "Artículo sin fecha asignada", excerpt: "Sin fecha real.", category: "Skincare", image: null, published: true, date: null, tags: [], relatedProducts: [], content: ["Texto."] },
];

const productsFixture = [
  { id: 56, name: "Makeup Brush Set", available: true },
  { id: 99, name: "Producto agotado", available: false },
];

console.log("getPublishedArticles (Fase 30 — TEST 1/2/14: published + orden)");
test("un artículo published=true aparece", () => {
  const r = getPublishedArticles(fixture);
  assert.ok(r.some((a) => a.slug === "ritual-skincare-basico"));
});
test("un artículo published=false nunca aparece", () => {
  const r = getPublishedArticles(fixture);
  assert.ok(!r.some((a) => a.slug === "borrador-sin-publicar"));
});
test("sin ningún artículo publicado, arreglo vacío (nunca contenido inventado)", () => {
  assert.deepEqual(getPublishedArticles([]), []);
  assert.deepEqual(getPublishedArticles([fixture[2]]), []); // el único es unpublished
});
test("varios artículos se ordenan por fecha descendente; sin fecha, al final", () => {
  const r = getPublishedArticles(fixture);
  assert.deepEqual(r.map((a) => a.slug), ["tendencias-labiales-2026", "ritual-skincare-basico", "sin-fecha"]);
});

console.log("getArticleBySlug (Fase 30 — TEST 7/8/9: slug, inexistente, unpublished)");
test("encuentra un artículo publicado por su slug exacto", () => {
  assert.equal(getArticleBySlug(fixture, "ritual-skincare-basico").title, "Tu ritual de skincare, sin complicarte");
});
test("un slug inexistente devuelve null, nunca lanza ni inventa un artículo", () => {
  assert.equal(getArticleBySlug(fixture, "no-existe"), null);
});
test("un artículo unpublished nunca se expone por su slug, aunque el slug sea correcto", () => {
  assert.equal(getArticleBySlug(fixture, "borrador-sin-publicar"), null);
});

console.log("getCategoriesWithContent (Fase 30 — TEST 5: categoría sin contenido no aparece)");
test("solo aparecen categorías con al menos un artículo publicado", () => {
  const r = getCategoriesWithContent(fixture);
  assert.deepEqual(r.sort(), ["Maquillaje", "Skincare"]);
  assert.ok(!r.includes("Tips")); // "Tips" solo tiene el borrador unpublished
});
test("sin ningún artículo publicado, ninguna categoría aparece", () => {
  assert.deepEqual(getCategoriesWithContent([fixture[2]]), []);
});
test("getArticlesByCategory solo devuelve publicados de esa categoría", () => {
  const r = getArticlesByCategory(fixture, "Skincare");
  assert.deepEqual(r.map((a) => a.slug).sort(), ["ritual-skincare-basico", "sin-fecha"]);
});

console.log("article card / datos reales (Fase 30 — TEST 6/13: nunca transforma ni inventa)");
test("los campos de un artículo llegan intactos, tal cual el contenido real (sin transformación)", () => {
  const r = getArticleBySlug(fixture, "ritual-skincare-basico");
  assert.equal(r.title, fixture[0].title);
  assert.equal(r.excerpt, fixture[0].excerpt);
  assert.equal(r.image, fixture[0].image);
});
test("un artículo sin imagen (image: null) se procesa sin errores — el layout lo maneja, no esta lógica", () => {
  const r = getArticleBySlug(fixture, "tendencias-labiales-2026");
  assert.equal(r.image, null);
});

console.log("resolveRelatedProducts (Fase 30 — TEST 10/11/12: relación editorial -> producto, nunca automática)");
test("solo resuelve productos disponibles/existentes, en el orden editorial dado", () => {
  const article = { relatedProducts: [56] };
  const r = resolveRelatedProducts(article, productsFixture);
  assert.deepEqual(r.map((p) => p.id), [56]);
});
test("un id de producto no disponible queda excluido, sin avisar ni sustituir", () => {
  const article = { relatedProducts: [99] };
  assert.deepEqual(resolveRelatedProducts(article, productsFixture), []);
});
test("un id que no existe en el catálogo simplemente no aparece", () => {
  const article = { relatedProducts: [999999] };
  assert.deepEqual(resolveRelatedProducts(article, productsFixture), []);
});
test("relatedProducts vacío nunca se rellena automáticamente con otros productos", () => {
  const article = { relatedProducts: [] };
  assert.deepEqual(resolveRelatedProducts(article, productsFixture), []);
});
test("sin relatedProducts en el artículo (campo ausente), arreglo vacío — nunca lanza", () => {
  assert.deepEqual(resolveRelatedProducts({}, productsFixture), []);
});
test("preserva el orden editorial explícito, no reordena por su cuenta", () => {
  const manyProducts = [
    { id: 1, name: "Uno", available: true },
    { id: 2, name: "Dos", available: true },
    { id: 3, name: "Tres", available: true },
  ];
  const article = { relatedProducts: [3, 1, 2] };
  const r = resolveRelatedProducts(article, manyProducts);
  assert.deepEqual(r.map((p) => p.id), [3, 1, 2]);
});

console.log("breadcrumbForArticle (Fase 30)");
test("incluye Inicio / Discover / categoría / título, sin inventar niveles", () => {
  assert.deepEqual(breadcrumbForArticle(fixture[0]), ["Inicio", "Discover", "Skincare", "Tu ritual de skincare, sin complicarte"]);
});
test("sin categoría asignada, se degrada con elegancia (sin ese nivel)", () => {
  assert.deepEqual(breadcrumbForArticle({ title: "Sin categoría", category: null }), ["Inicio", "Discover", "Sin categoría"]);
});

console.log("separación editorial / products (Fase 30 — TEST 15: nunca se mezclan)");
test("editorial.js no importa nada de data-source.js, cart.js ni de la API de catálogo — solo findProduct (lectura pura) de taxonomy.js", () => {
  const src = fs.readFileSync(path.join(repoRoot, "js", "editorial.js"), "utf8");
  const forbidden = ["data-source.js", "cart.js", "catalog_metadata", "supabase", "/api/catalog"];
  forbidden.forEach((w) => assert.ok(!src.toLowerCase().includes(w.toLowerCase()), `editorial.js no debería referenciar "${w}"`));
});
test("editorial-content.js no tiene ningún import (es una fuente de datos plana, sin acoplarse a products/catalog_metadata)", () => {
  const src = fs.readFileSync(path.join(repoRoot, "js", "editorial-content.js"), "utf8");
  assert.ok(!/^\s*import /m.test(src), "editorial-content.js no debería importar ningún módulo");
});

console.log("ningún dato demo en producción (Fase 30 — TEST 16)");
test("la fuente real de contenido (editorial-content.js) está vacía hoy — no hay artículos inventados en producción", () => {
  const src = fs.readFileSync(path.join(repoRoot, "js", "editorial-content.js"), "utf8");
  assert.match(src, /export const articles = \[\];/, "editorial-content.js debe exportar un arreglo vacío mientras no exista contenido editorial real");
});

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(tmpDir, { recursive: true, force: true });
if (failed > 0) process.exit(1);
