// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-catalog-publication.js
//
// Fase 43 — regla de publicación: solo published = true llega al
// catálogo público. Usa un Supabase simulado CON estado (tablas products
// y catalog_metadata en memoria) que respeta los filtros eq. de PostgREST
// y la semántica merge-duplicates del upsert, para recorrer de punta a
// punta: sincronización del POS (escribe solo `products`), Admin
// (GET listado + PATCH metadata) y API pública (products + categories),
// más el filtrado y la búsqueda de producto del frontend (js/taxonomy.js).

const assert = require("assert/strict");

const catalogProducts = require("../api/catalog/products");
const catalogCategories = require("../api/catalog/categories");
const adminProducts = require("../api/admin/products");
const adminCatalogMetadata = require("../api/admin/catalog-metadata");

const ADMIN_TOKEN = "admin-test-token";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok  - " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL- " + name);
    console.log("        " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n        ") : e));
  }
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

// Supabase en memoria. `honorFilters: false` simula un llamador que
// olvidó (o una consulta que perdió) el filtro published=eq.true, para
// comprobar que joinCatalog sostiene la regla por sí mismo.
function createDb({ honorFilters = true } = {}) {
  const db = { products: [], catalog_metadata: [] };
  const fetchImpl = async (url, options = {}) => {
    // Fase 56 — la validación lee la taxonomía editable (config/taxonomy.json
    // en Storage); en estas pruebas no existe → taxonomía por defecto.
    if (String(url).includes("/storage/v1/object/") && String(url).includes("config/taxonomy.json")) return { ok: false, status: 404, text: async () => "" };
    const u = new URL(url);
    const table = u.pathname.split("/").pop();
    const method = options.method || "GET";
    if (method === "GET") {
      let rows = db[table].map((r) => ({ ...r }));
      if (honorFilters) {
        for (const [key, value] of u.searchParams) {
          if (key === "select" || key === "order") continue;
          const m = value.match(/^eq\.(.*)$/);
          if (m) rows = rows.filter((r) => String(r[key]) === m[1]);
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    if (method === "POST" && table === "catalog_metadata") {
      const payload = JSON.parse(options.body);
      if (!db.products.some((p) => String(p.id) === String(payload.product_id))) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23503" }) };
      }
      let row = db.catalog_metadata.find((r) => String(r.product_id) === String(payload.product_id));
      if (row) {
        Object.assign(row, payload); // merge-duplicates: solo las columnas enviadas
      } else {
        row = { published: false, featured: false, ...payload }; // default false (migración 0001)
        db.catalog_metadata.push(row);
      }
      return { ok: true, status: 201, text: async () => JSON.stringify([{ ...row }]) };
    }
    throw new Error("unexpected request in test: " + method + " " + url);
  };
  return { db, fetchImpl };
}

async function withDb(dbHandle, fn) {
  const originalFetch = global.fetch;
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
  process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  global.fetch = dbHandle.fetchImpl;
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function publicProducts(query = {}) {
  const res = mockRes();
  await catalogProducts({ method: "GET", headers: {}, query }, res);
  assert.equal(res.statusCode, 200);
  return res.body.products;
}
async function publicCategories() {
  const res = mockRes();
  await catalogCategories({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body.categories;
}
async function adminList() {
  const res = mockRes();
  await adminProducts({ method: "GET", headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body.products;
}
async function adminPatch(body) {
  const res = mockRes();
  await adminCatalogMetadata({ method: "PATCH", headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, query: {}, body }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body.metadata;
}
const ids = (list) => list.map((p) => p.id).sort((a, b) => a - b);

// Dataset base: cubre las combinaciones publicado × disponible × con/sin ficha.
function seed(db) {
  db.products.push(
    { id: 1, name: "Serum publicado", price: 50000, stock: 4, category: "Skincare", promo_active: true, promo_price: 40000 },
    { id: 2, name: "Labial no publicado", price: 30000, stock: 6, category: "Labios", promo_active: true, promo_price: 20000 },
    { id: 3, name: "Base no publicada agotada", price: 70000, stock: 0, category: "Rostro" },
    { id: 4, name: "Rubor publicado agotado", price: 25000, stock: 0, category: "Rostro" },
    { id: 5, name: "Brocha sin ficha", price: 15000, stock: 9, category: "Accesorios", promo_active: true, promo_price: 9000 }
  );
  db.catalog_metadata.push(
    { product_id: 1, published: true, featured: true, subcategory: "Sérums", short_description: "Glow", search_keywords: ["glow"], badge: "Nuevo" },
    { product_id: 2, published: false, featured: true, subcategory: "Mate", short_description: "Glow mate", search_keywords: ["glow"], badge: "Nuevo" },
    { product_id: 3, published: false, featured: false, subcategory: "Líquida" },
    { product_id: 4, published: true, featured: false, subcategory: "Rubor", short_description: "Rubor cremoso" }
  );
}

async function main() {
  const taxonomy = await import("../js/taxonomy.js");

  for (const honorFilters of [true, false]) {
    console.log(
      honorFilters
        ? "API pública (Supabase respeta published=eq.true)"
        : "API pública (defensa en profundidad: Supabase devuelve también filas no publicadas)"
    );
    const handle = createDb({ honorFilters });
    seed(handle.db);

    await withDb(handle, async () => {
      const list = await publicProducts();

      await test("1. publicado y disponible: aparece", () => {
        const p = list.find((x) => x.id === 1);
        assert.ok(p);
        assert.equal(p.available, true);
      });
      await test("2. no publicado y disponible: no aparece", () => {
        assert.equal(list.some((x) => x.id === 2), false);
      });
      await test("3. no publicado y agotado: no aparece", () => {
        assert.equal(list.some((x) => x.id === 3), false);
      });
      await test("4. publicado y agotado: aparece como agotado (comportamiento existente)", () => {
        const p = list.find((x) => x.id === 4);
        assert.ok(p);
        assert.equal(p.available, false);
        assert.equal(p.shortDescription, "Rubor cremoso");
      });
      await test("5. sin metadata editorial: no aparece", () => {
        assert.equal(list.some((x) => x.id === 5), false);
      });
      await test("la respuesta contiene exactamente los publicados", () => {
        assert.deepEqual(ids(list), [1, 4]);
      });

      await test("6. URL directa (?product=id) a un no publicado / sin ficha no encuentra el producto", () => {
        for (const id of [2, 3, 5, "2"]) assert.equal(taxonomy.findProduct(list, id), null);
        assert.ok(taxonomy.findProduct(list, "1"));
      });

      await test("7a. búsqueda server-side (?search=glow) excluye no publicados", async () => {
        assert.deepEqual(ids(await publicProducts({ search: "glow" })), [1]);
      });
      await test("7b. categoría server-side (?category=Labios / Accesorios) no expone no publicados", async () => {
        assert.deepEqual(await publicProducts({ category: "Labios" }), []);
        assert.deepEqual(await publicProducts({ category: "Accesorios" }), []);
        assert.deepEqual(ids(await publicProducts({ category: "Rostro" })), [4]);
      });
      await test("7c. destacados server-side (?featured=true) excluye no publicados", async () => {
        assert.deepEqual(ids(await publicProducts({ featured: "true" })), [1]);
      });
      await test("7d. /api/catalog/categories solo cuenta productos publicados", async () => {
        const cats = await publicCategories();
        const posCategories = cats.flatMap((g) => g.categories.map((c) => c.category)).sort();
        assert.deepEqual(posCategories, ["Rostro", "Skincare"]);
        assert.equal(cats.reduce((n, g) => n + g.count, 0), 2);
        const subcats = cats.flatMap((g) => g.categories.flatMap((c) => c.subcategories)).sort();
        assert.deepEqual(subcats, ["Rubor", "Sérums"]);
      });
      await test("7e. filtros del frontend (búsqueda, ofertas, destacados, novedades, categoría) sobre la lista pública", () => {
        assert.deepEqual(ids(taxonomy.filterProducts(list, { search: "glow" })), [1]);
        assert.deepEqual(ids(taxonomy.filterProducts(list, { promo: true })), [1]);
        assert.deepEqual(ids(taxonomy.filterProducts(list, { featuredOnly: true })), [1]);
        assert.deepEqual(ids(taxonomy.filterProducts(list, { newOnly: true })), [1]);
        assert.deepEqual(taxonomy.filterProducts(list, { category: "Labios" }), []);
        assert.deepEqual(taxonomy.filterProducts(list, { category: "Accesorios" }), []);
      });
    });
  }

  console.log("Sincronización del POS, Admin y ciclo despublicar/republicar");
  const handle = createDb();
  seed(handle.db);

  await withDb(handle, async () => {
    await test("8. sincronización del POS (precio/stock/nombre) conserva published y la ficha editorial", async () => {
      const before = JSON.stringify(handle.db.catalog_metadata);
      // El POS solo escribe la tabla products (nunca catalog_metadata).
      Object.assign(handle.db.products.find((p) => p.id === 1), { name: "Serum publicado v2", price: 52000, stock: 0 });
      Object.assign(handle.db.products.find((p) => p.id === 2), { price: 31000, stock: 10 });
      assert.equal(JSON.stringify(handle.db.catalog_metadata), before);

      const list = await publicProducts();
      const p1 = list.find((x) => x.id === 1);
      assert.equal(p1.name, "Serum publicado v2");
      assert.equal(p1.price, 52000);
      assert.equal(p1.available, false); // agotado no lo despublica
      assert.equal(p1.shortDescription, "Glow");
      assert.equal(list.some((x) => x.id === 2), false); // reabastecido no lo publica
    });

    await test("9. producto nuevo del POS: aparece en el Admin como no publicado, no en el catálogo público", async () => {
      handle.db.products.push({ id: 6, name: "Producto nuevo POS", price: 12000, stock: 5, category: "Ojos" });
      const admin = (await adminList()).find((p) => p.id === 6);
      assert.ok(admin);
      assert.equal(admin.published, false);
      assert.equal(admin.hasMetadata, false);
      assert.equal((await publicProducts()).some((x) => x.id === 6), false);
    });

    await test("9b. guardar ficha de un producto nuevo sin marcar Publicado lo deja no publicado (default false)", async () => {
      const saved = await adminPatch({ product_id: 6, short_description: "Delineador" });
      assert.equal(saved.published, false);
      assert.equal((await publicProducts()).some((x) => x.id === 6), false);
    });

    await test("Admin lista todos los productos del POS, publicados o no", async () => {
      assert.deepEqual(ids(await adminList()), [1, 2, 3, 4, 5, 6]);
    });

    await test("10. despublicar y volver a publicar conserva la ficha editorial", async () => {
      const original = { ...handle.db.catalog_metadata.find((r) => r.product_id === 4) };
      // Mismo payload que envía el formulario del Admin: todos los campos
      // con su valor actual, solo cambia `published`.
      const formPayload = {
        product_id: 4,
        subcategory: original.subcategory,
        short_description: original.short_description,
        featured: original.featured,
      };

      await adminPatch({ ...formPayload, published: false });
      assert.equal((await publicProducts()).some((x) => x.id === 4), false);
      const unpublishedRow = handle.db.catalog_metadata.find((r) => r.product_id === 4);
      assert.equal(unpublishedRow.short_description, "Rubor cremoso");
      assert.equal(unpublishedRow.subcategory, "Rubor");
      assert.ok(handle.db.products.some((p) => p.id === 4)); // sigue en el POS

      await adminPatch({ ...formPayload, published: true });
      const p = (await publicProducts()).find((x) => x.id === 4);
      assert.ok(p);
      assert.equal(p.shortDescription, "Rubor cremoso");
      assert.equal(p.subcategory, "Rubor");
      assert.equal(p.available, false); // sigue agotado: disponibilidad independiente
    });

    await test("10b. un PATCH que solo cambia published no borra el resto de la ficha", async () => {
      await adminPatch({ product_id: 1, published: false });
      await adminPatch({ product_id: 1, published: true });
      const p = (await publicProducts()).find((x) => x.id === 1);
      assert.equal(p.shortDescription, "Glow");
      assert.deepEqual(p.searchKeywords, ["glow"]);
      assert.equal(p.featured, true);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
