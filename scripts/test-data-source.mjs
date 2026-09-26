// Runs with plain Node, no test framework, no build step, no network:
//   node scripts/test-data-source.mjs
//
// js/data-source.js and js/products.js are real browser ES modules
// (import/export), and this repo has no package.json declaring
// "type":"module", so Node would treat a plain `.js` file as CommonJS
// and fail to parse `export`. To run the REAL, unmodified source under
// plain Node, this script copies the two files byte-for-byte into an
// isolated OS temp directory that carries its own throwaway
// package.json ({"type":"module"}) — this affects nothing in the actual
// repo (no package.json is added here), it only tells Node how to
// interpret the temporary copies while this script runs. The temp
// directory is removed at the end.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-data-source-test-"));
fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ type: "module" }));
fs.copyFileSync(path.join(repoRoot, "js", "products.js"), path.join(tmpDir, "products.js"));
// Fase 34: data-source.js ahora importa taxonomy.js (EDITORIAL_STRING_FIELDS/EDITORIAL_ARRAY_FIELDS).
fs.copyFileSync(path.join(repoRoot, "js", "taxonomy.js"), path.join(tmpDir, "taxonomy.js"));
fs.copyFileSync(path.join(repoRoot, "js", "data-source.js"), path.join(tmpDir, "data-source.js"));

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

async function main() {
  const mod = await import(pathToFileURL(path.join(tmpDir, "data-source.js")).href);
  const { getProducts, getCategories, __internal } = mod;

  console.log("contrato público");
  await test("data-source exporta exactamente getProducts/getCategories como funciones públicas", () => {
    assert.equal(typeof getProducts, "function");
    assert.equal(typeof getCategories, "function");
  });

  console.log("TEST 1 — fuente configurada para producción");
  await test("CONFIGURED_MODE por defecto es 'api', no 'demo' (Fase 24)", () => {
    // getMode() refleja el valor real de CONFIGURED_MODE tal como quedó
    // definido en el archivo fuente, antes de que cualquier test lo
    // cambie con setMode() — se verifica aquí, primero, antes de que el
    // resto de la suite empiece a llamar setMode("demo")/setMode("api").
    assert.equal(__internal.getMode(), "api");
  });

  console.log("modo demo (real, sin red)");
  await test("getProducts() en modo demo devuelve los 6 productos demo normalizados", async () => {
    __internal.setMode("demo");
    const products = await getProducts();
    assert.equal(products.length, 6);
    assert.equal(products.every((p) => p.available === true), true);
    assert.equal(products.every((p) => Array.isArray(p.variants) && p.variants.length > 0), true);
  });
  await test("getCategories() en modo demo devuelve la lista con 'Todos' al inicio", async () => {
    __internal.setMode("demo");
    const cats = await getCategories();
    assert.equal(cats[0], "Todos");
    assert.ok(cats.includes("Skincare"));
  });
  await test("getProducts()+getCategories() en modo demo resuelven juntos sin error (lo que app.js hace al iniciar)", async () => {
    __internal.setMode("demo");
    const [products, categories] = await Promise.all([getProducts(), getCategories()]);
    assert.ok(products.length > 0);
    assert.ok(categories.length > 0);
  });

  console.log("transformación de shape API -> shape que espera app.js");
  await test("normalizeApiProduct produce el shape completo esperado por productCard/openProduct", () => {
    const raw = {
      id: 42,
      name: "Real Product",
      category: "Skincare",
      categoryGroup: "Skincare",
      subcategory: "Limpieza",
      price: 50000,
      available: true,
      shortDescription: "sd",
      description: "d",
      benefits: ["b1"],
      ingredients: null,
      usage: "u",
      presentation: "100 ml",
      image: "https://example.com/a.jpg",
      images: ["https://example.com/b.jpg"],
      badge: "Nuevo",
      featured: true,
      // deliberately absent: variants (API never sends this)
    };
    const shaped = __internal.normalizeApiProduct(raw);
    assert.equal(shaped.id, 42);
    assert.equal(shaped.price, 50000);
    assert.equal(shaped.subcategory, "Limpieza");
    assert.equal(Array.isArray(shaped.variants), true);
    assert.equal(shaped.variants.length, 1);
    assert.equal(shaped.variants[0].price, 50000);
  });

  console.log("TEST 5 — editorialCategory/editorialOrder llegan hasta la capa de presentación");
  await test("normalizeApiProduct conserva editorialCategory tal cual la envía la API (nunca la inventa)", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 1, editorialCategory: "Rostro" });
    assert.equal(shaped.editorialCategory, "Rostro");
  });
  await test("un producto sin editorialCategory todavía (sin curaduría) llega como null, nunca inventada", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 1 });
    assert.equal(shaped.editorialCategory, null);
  });
  await test("normalizeApiProduct conserva editorialOrder tal cual", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 1, editorialOrder: 3 });
    assert.equal(shaped.editorialOrder, 3);
  });
  await test("productos demo también exponen editorialCategory=null (nunca inventan curaduría real)", () => {
    __internal.setMode("demo");
    const demo = __internal.getDemoProducts();
    assert.ok(demo.every((p) => p.editorialCategory === null));
  });

  console.log("Fase 26 — promoActive/promoPrice/promoText llegan tal cual desde la API (ya resueltos server-side)");
  await test("normalizeApiProduct conserva promoActive/promoPrice/promoText cuando la API los envía", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 100, promoActive: true, promoPrice: 80, promoText: "-20%" });
    assert.equal(shaped.promoActive, true);
    assert.equal(shaped.promoPrice, 80);
    assert.equal(shaped.promoText, "-20%");
  });
  await test("un producto sin promoción real llega con promoActive=false y promoPrice/promoText null", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 100 });
    assert.equal(shaped.promoActive, false);
    assert.equal(shaped.promoPrice, null);
    assert.equal(shaped.promoText, null);
  });
  await test("productos demo nunca tienen una promoción real (no hay POS detrás)", () => {
    __internal.setMode("demo");
    const demo = __internal.getDemoProducts();
    assert.ok(demo.every((p) => p.promoActive === false && p.promoPrice === null));
  });

  console.log("TEST 7 — un producto sin metadata editorial completa no se presenta como si la tuviera");
  await test("campos editoriales ausentes llegan vacíos/null, nunca con un valor inventado", () => {
    const shaped = __internal.normalizeApiProduct({ id: 5, name: "Sin ficha completa", price: 1000 });
    assert.equal(shaped.shortDescription, "");
    assert.equal(shaped.description, "");
    assert.deepEqual(shaped.benefits, []);
    assert.equal(shaped.ingredients, null);
    assert.equal(shaped.badge, null);
    assert.equal(shaped.subcategory, null);
    assert.equal(shaped.editorialCategory, null);
    assert.equal(shaped.featured, false);
  });

  console.log("ausencia de variants no rompe el producto");
  await test("un producto sin variants[] recibe una variante sintetizada usable por app.js", () => {
    const shaped = __internal.normalizeApiProduct({ id: 1, name: "X", price: 1000, presentation: "1 unidad" });
    assert.equal(shaped.variants.length, 1);
    assert.equal(shaped.variants[0].id, "default");
    assert.equal(shaped.variants[0].name, "1 unidad");
    assert.equal(shaped.variants[0].price, 1000);
  });
  await test("un producto demo con variants reales conserva sus variantes intactas (ej. 3 tonos de labial)", () => {
    __internal.setMode("demo");
    const demo = __internal.getDemoProducts();
    const lip = demo.find((p) => p.id === "lip");
    assert.equal(lip.variants.length, 3);
    assert.equal(lip.variants.some((v) => v.id === "berry"), true);
  });

  console.log("available=false no rompe el producto");
  await test("available=false se preserva tal cual (la UI decide qué mostrar, no data-source)", () => {
    const shaped = __internal.normalizeApiProduct({ id: 2, name: "Agotado", price: 1000, available: false });
    assert.equal(shaped.available, false);
    assert.equal(shaped.variants.length, 1); // sigue teniendo variante utilizable
  });
  await test("un producto sin el campo 'available' en absoluto se trata como disponible (available !== false)", () => {
    const shaped = __internal.normalizeApiProduct({ id: 3, name: "Sin dato", price: 1000 });
    assert.equal(shaped.available, true);
  });

  console.log("modo API con fetch mockeado (sin red real)");
  await test("getProductsFromApi transforma la respuesta real de /api/catalog/products", async () => {
    const fetchImpl = async (url) => {
      assert.ok(url.includes("/api/catalog/products"));
      return {
        ok: true,
        json: async () => ({
          products: [{ id: 1, name: "A", price: 100, available: true, category: "Skincare" }],
        }),
      };
    };
    const products = await __internal.getProductsFromApi(fetchImpl);
    assert.equal(products.length, 1);
    assert.equal(products[0].name, "A");
  });
  await test("getCategoriesFromApi aplana la estructura de grupos a una lista simple con 'Todos'", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        categories: [
          { group: "Skincare", count: 2, categories: [{ category: "Skincare", subcategories: ["Limpieza"] }] },
        ],
      }),
    });
    const cats = await __internal.getCategoriesFromApi(fetchImpl);
    assert.deepEqual(cats, ["Todos", "Skincare"]);
  });

  console.log("TEST 8 — el fallback a demo solo ocurre por una falla real, y nunca queda oculto");
  await test("getProducts() cae a demo si la API responde con error, y lo reporta como error (no warn) — una falla de producción no debe pasar desapercibida", async () => {
    __internal.setMode("api");
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    let errored = false;
    console.error = (...args) => {
      errored = true;
      originalError.call(console, ...args);
    };
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: "no disponible" }) });
    try {
      const products = await getProducts();
      assert.equal(products.length, 6); // volvió a los datos demo — la Home no se cae
      assert.equal(errored, true); // pero la falla real quedó registrada con severidad de error, no oculta
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
      __internal.setMode("demo");
    }
  });
  await test("getCategories() cae a demo si fetch lanza una excepción de red", async () => {
    __internal.setMode("api");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    try {
      const cats = await getCategories();
      assert.equal(cats[0], "Todos");
    } finally {
      globalThis.fetch = originalFetch;
      __internal.setMode("demo");
    }
  });
  console.log("TEST 2 — si la API responde correctamente, no se usa demo");
  await test("modo API exitoso NO cae a demo (confirma que el fallback solo ocurre cuando corresponde)", async () => {
    __internal.setMode("api");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      url.includes("/products")
        ? { ok: true, json: async () => ({ products: [{ id: 99, name: "Real", price: 1, available: true }] }) }
        : { ok: true, json: async () => ({ categories: [] }) };
    try {
      const products = await getProducts();
      assert.equal(products.length, 1);
      assert.equal(products[0].id, 99);
    } finally {
      globalThis.fetch = originalFetch;
      __internal.setMode("demo");
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal error running tests:", e);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
