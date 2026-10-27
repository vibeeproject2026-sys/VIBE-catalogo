// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-admin-classification.js
//
// Fase 51 — clasificación en el Admin:
// - publicPlacement / subcategorySuggestions (js/taxonomy.js) reproducen
//   la navegación pública y la taxonomía aprobada en Fase 20.2.
// - Las APIs del Admin exponen categoryGroup (solo lectura) con el mismo
//   mapeo POS → grupo que usa el catálogo público.

const assert = require("assert/strict");

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

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

async function withMockedSupabase(rowsByTable, fn) {
  const originalFetch = global.fetch;
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, admin: process.env.ADMIN_API_TOKEN };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
  process.env.ADMIN_API_TOKEN = "admin-test-token";
  global.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    return { ok: true, status: 200, text: async () => JSON.stringify(rowsByTable[table] || []) };
  };
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = saved.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
    process.env.ADMIN_API_TOKEN = saved.admin;
    for (const [k, v] of Object.entries({ SUPABASE_URL: saved.url, SUPABASE_SERVICE_ROLE_KEY: saved.key, ADMIN_API_TOKEN: saved.admin })) if (v === undefined) delete process.env[k];
  }
}

const AUTH = { authorization: "Bearer admin-test-token" };

async function main() {
  const t = await import("../js/taxonomy.js");

  console.log("Taxonomía para el Admin");
  await test("cada categoría editorial aprobada tiene sus subcategorías sugeridas (y solo esas 7)", () => {
    const approved = t.VIBE_CATEGORY_GROUPS.flatMap((g) => g.categories).sort();
    assert.deepEqual(Object.keys(t.SUBCATEGORIES_BY_CATEGORY).sort(), approved);
    for (const c of approved) assert.ok(t.SUBCATEGORIES_BY_CATEGORY[c].length > 0, c);
  });
  await test("sugerencias filtradas por categoría; sin categoría, todas", () => {
    assert.deepEqual(t.subcategorySuggestions("Labios"), ["Labiales", "Gloss y oils", "Kits de labios"]);
    assert.ok(t.subcategorySuggestions("").includes("Brochas"));
    assert.ok(t.subcategorySuggestions(null).includes("Labiales"));
    assert.equal(t.subcategorySuggestions("").length, Object.values(t.SUBCATEGORIES_BY_CATEGORY).flat().length);
  });
  await test("publicPlacement = navegación pública: la categoría editorial manda", () => {
    assert.deepEqual(t.publicPlacement({ category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Ojos" }), { group: "Maquillaje", category: "Ojos" });
    assert.deepEqual(t.publicPlacement({ category: "Otro", categoryGroup: "Accesorios", editorialCategory: "Herramientas de aplicación" }), { group: "Accesorios", category: "Herramientas de aplicación" });
  });
  await test("publicPlacement sin categoría editorial: grupo del POS, salvo «Otro» (solo «Todos»)", () => {
    assert.deepEqual(t.publicPlacement({ category: "Labios", categoryGroup: "Maquillaje", editorialCategory: null }), { group: "Maquillaje", category: "Labios" });
    assert.equal(t.publicPlacement({ category: "Otro", categoryGroup: "Accesorios", editorialCategory: null }).group, null);
  });
  await test("publicPlacement coincide con filterProducts por grupo (misma regla)", () => {
    const products = [
      { id: 1, name: "a", category: "Otro", categoryGroup: "Accesorios", editorialCategory: null },
      { id: 2, name: "b", category: "Otro", categoryGroup: "Accesorios", editorialCategory: "Herramientas de aplicación" },
      { id: 3, name: "c", category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Limpieza" },
    ];
    for (const group of ["Accesorios", "Maquillaje", "Skincare"]) {
      const viaFilter = t.filterProducts(products, { group }).map((p) => p.id);
      const viaPlacement = products.filter((p) => t.publicPlacement(p).group === group).map((p) => p.id);
      assert.deepEqual(viaPlacement, viaFilter, group);
    }
  });

  console.log("APIs del Admin (solo lectura)");
  const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");
  await test("GET /api/admin/products expone categoryGroup con el mapeo del catálogo público", async () => {
    const handler = require("../api/admin/products");
    await withMockedSupabase({
      products: [
        { id: 1, name: "Labial", price: 1, stock: 2, category: "Labios" },
        { id: 2, name: "Escrespador", price: 1, stock: 2, category: "Otro" },
        { id: 3, name: "Crema", price: 1, stock: 0, category: "Skincare" },
      ],
      catalog_metadata: [{ product_id: 2, category: "Herramientas de aplicación", published: true, featured: false }],
    }, async () => {
      const res = mockRes();
      await handler({ method: "GET", headers: AUTH, query: {} }, res);
      assert.equal(res.statusCode, 200);
      const byId = Object.fromEntries(res.body.products.map((p) => [p.id, p]));
      for (const p of res.body.products) assert.equal(p.categoryGroup, resolveCategoryGroup(p.category));
      assert.equal(byId[1].categoryGroup, "Maquillaje");
      assert.equal(byId[2].categoryGroup, "Accesorios");
      assert.equal(byId[2].editorialCategory, "Herramientas de aplicación");
      // Los datos del POS siguen intactos.
      assert.deepEqual([byId[3].name, byId[3].price, byId[3].stock, byId[3].available], ["Crema", 1, 0, false]);
    });
  });
  await test("GET /api/admin/catalog-metadata devuelve product.categoryGroup sin alterar los campos del POS", async () => {
    const handler = require("../api/admin/catalog-metadata");
    await withMockedSupabase({
      products: [{ id: 7, name: "Kit rainbow", price: 23000, stock: 3, category: "Labios" }],
      catalog_metadata: [],
    }, async () => {
      const res = mockRes();
      await handler({ method: "GET", headers: AUTH, query: { product_id: "7" } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.product, { id: 7, name: "Kit rainbow", price: 23000, stock: 3, category: "Labios", categoryGroup: "Maquillaje" });
      assert.equal(res.body.metadata, null);
    });
  });
  await test("categoryGroup no se acepta como campo editorial de escritura (PATCH lo ignora)", async () => {
    const { pickEditorialFields } = require("../api/admin/_lib/editorialFields");
    assert.equal("categoryGroup" in pickEditorialFields({ categoryGroup: "Skincare", category: "Labios" }), false);
  });

  console.log("Formulario del Admin — sin pérdida de datos al guardar");
  await test("todo <textarea> del formulario de ficha se precarga al abrir (si no, guardar lo borraría)", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
    const created = [...new Set([...src.matchAll(/textareaField\("([a-z_]+)"/g)].map((m) => m[1]))];
    const filled = new Set([...src.matchAll(/textarea\[name=([a-z_]+)\]"\)\.value =/g)].map((m) => m[1]));
    assert.ok(created.length >= 10, "no se encontraron los textareas del formulario");
    const missing = created.filter((n) => !filled.has(n));
    assert.deepEqual(missing, [], "textareas sin precargar: " + missing.join(", "));
  });
  await test("«Modo de uso» (usage) se precarga desde la metadata guardada", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
    assert.match(src, /\$\("textarea\[name=usage\]"\)\.value = m\.usage \|\| "";/);
  });

  console.log("Editor por pestañas (Fase 52)");
  const adminSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
  await test("cada sección de la ficha tiene una pestaña asignada (ninguna queda fuera)", () => {
    const summaries = [...adminSrc.matchAll(/<details class="admin-accordion[^"]*"[^>]*>\s*<summary>([^<]+)<\/summary>/g)].map((m) => m[1].trim());
    const mapBlock = adminSrc.match(/const SECTION_TAB = \{([\s\S]*?)\};/);
    assert.ok(mapBlock, "no se encontró SECTION_TAB");
    const mapped = new Set([...mapBlock[1].matchAll(/"([^"]+)":\s*"[a-z]+"/g)].map((m) => m[1]));
    assert.ok(summaries.length >= 10, "no se encontraron las secciones de la ficha");
    const missing = summaries.filter((t) => !mapped.has(t));
    assert.deepEqual(missing, [], "secciones sin pestaña: " + missing.join(", "));
  });
  await test("las pestañas solo mueven nodos: organizeEditorTabs no elimina ni recrea campos", () => {
    const fn = adminSrc.match(/function organizeEditorTabs\(\) \{([\s\S]*?)\n\}/);
    assert.ok(fn, "no se encontró organizeEditorTabs");
    assert.match(fn[1], /while \(body\.firstChild\) section\.appendChild\(body\.firstChild\)/);
    assert.doesNotMatch(fn[1], /\.remove\(\)|innerHTML\s*=\s*""|removeChild/);
  });
  await test("el panel tiene las 5 áreas aprobadas", () => {
    const html = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "index.html"), "utf8");
    const views = [...html.matchAll(/class="nav-item[^"]*" data-view="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(views, ["home", "products", "taxonomy", "hero", "orders"]);
    for (const v of views) assert.match(html, new RegExp(`data-view-panel="${v}"`));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
