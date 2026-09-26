// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-catalog-lib.js
//
// Exercises the pure logic in api/catalog/_lib against fabricated
// in-memory fixtures only. Nothing here touches Supabase or any real
// data.

const assert = require("assert/strict");
const { joinCatalog, shapeProduct, sortCatalog, applyFilters } = require("../api/catalog/_lib/merge");
const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");
const { pgrestSelect } = require("../api/catalog/_lib/supabaseRead");
const { getEnv } = require("../api/catalog/_lib/env");
const { applyCors, DEFAULT_DEV_ORIGINS } = require("../api/catalog/_lib/cors");
const { ALL_FIELDS: EDITORIAL_DETAIL_FIELDS } = require("../api/_lib/editorialDetails");

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
  console.log("resolveCategoryGroup");
  await test("known POS category maps to its group", () => {
    assert.equal(resolveCategoryGroup("Labios"), "Maquillaje");
    assert.equal(resolveCategoryGroup("Skincare"), "Skincare");
  });
  await test("unknown category falls back to Otros, never disappears", () => {
    assert.equal(resolveCategoryGroup("CategoriaQueNoExiste"), "Otros");
  });

  console.log("joinCatalog (Fase 31 — LEFT JOIN: todo producto del POS se incluye)");
  await test("incluye TODOS los productos, tengan o no una fila de metadata", () => {
    const products = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const metadata = [{ product_id: 1 }, { product_id: 3 }];
    const joined = joinCatalog(products, metadata);
    assert.deepEqual(joined.map((r) => r.product.id), [1, 2, 3]);
  });
  await test("un producto sin fila de metadata queda con metadata: null (nunca undefined, nunca se cae del join)", () => {
    const joined = joinCatalog([{ id: 5 }], []);
    assert.equal(joined.length, 1);
    assert.equal(joined[0].metadata, null);
  });

  console.log("shapeProduct");
  const sampleProduct = {
    id: 7,
    name: "Daily Glow Cleanser",
    price: "58900",
    stock: 5,
    category: "Skincare",
    promo_active: false,
    promo_price: null,
    promo_start: null,
    promo_end: null,
    promo_text: null,
  };
  const sampleMetadata = {
    product_id: 7,
    subcategory: "Limpieza",
    image: "assets/products/cleanser.svg",
    images: ["a.svg", "b.svg"],
    short_description: "Limpieza suave",
    description: "Descripcion larga",
    benefits: ["Limpieza diaria"],
    ingredients: null,
    usage: "Aplicar sobre piel humeda",
    presentation: "150 ml",
    brand: null,
    badge: "Nuevo",
    featured: true,
    editorial_order: 2,
    // intentionally include fields that must NEVER leak into the response
    cost_base: 12345,
    cost_pack: 999,
    published: true,
  };

  await test("output never contains internal/operational fields", () => {
    const shaped = shapeProduct(sampleProduct, sampleMetadata, resolveCategoryGroup);
    const keys = Object.keys(shaped);
    for (const forbidden of ["stock", "min_stock", "cost_base", "cost_pack", "sales", "published", "promo_start", "promo_end", "promo_active"]) {
      assert.ok(!keys.includes(forbidden), `leaked forbidden field: ${forbidden}`);
    }
    assert.deepEqual(
      keys.sort(),
      [
        "available",
        "badge",
        "benefits",
        "brand",
        "category",
        "categoryGroup",
        "description",
        "editorialCategory",
        "editorialOrder",
        "featured",
        "id",
        "image",
        "images",
        "ingredients",
        "name",
        "presentation",
        "price",
        "promoActive",
        "promoPrice",
        "promoText",
        "shortDescription",
        "subcategory",
        "usage",
        // Fase 34 — los ~40 campos editoriales granulares (tono, acabado,
        // cruelty-free, etc.) se aplanan aquí también, uno por uno: se
        // reutiliza la misma whitelist de api/_lib/editorialDetails.js en
        // vez de escribir los 40 nombres a mano (y quedar desincronizado
        // si se agrega uno nuevo ahí).
        ...EDITORIAL_DETAIL_FIELDS,
      ].sort()
    );
  });

  console.log("shapeProduct — promociones (Fase 26)");
  await test("promo_active=true sin fechas -> promoActive true, precio y texto expuestos", () => {
    const shaped = shapeProduct(
      { ...sampleProduct, promo_active: true, promo_price: 45000, promo_text: "-20%" },
      sampleMetadata,
      resolveCategoryGroup
    );
    assert.equal(shaped.promoActive, true);
    assert.equal(shaped.promoPrice, 45000);
    assert.equal(shaped.promoText, "-20%");
  });
  await test("promo_active=true pero fuera de la ventana de fechas -> promoActive false (nunca se expone la fecha cruda)", () => {
    const shaped = shapeProduct(
      { ...sampleProduct, promo_active: true, promo_price: 45000, promo_start: "2099-01-01", promo_end: "2099-01-31" },
      sampleMetadata,
      resolveCategoryGroup
    );
    assert.equal(shaped.promoActive, false);
    assert.equal("promo_start" in shaped, false);
    assert.equal("promo_end" in shaped, false);
  });
  await test("promo_active=true dentro de la ventana de fechas -> promoActive true", () => {
    const shaped = shapeProduct(
      { ...sampleProduct, promo_active: true, promo_price: 45000, promo_start: "2000-01-01", promo_end: "2099-01-01" },
      sampleMetadata,
      resolveCategoryGroup
    );
    assert.equal(shaped.promoActive, true);
  });
  await test("promo_active=false -> promoActive siempre false, sin importar promo_price", () => {
    const shaped = shapeProduct({ ...sampleProduct, promo_active: false, promo_price: 45000 }, sampleMetadata, resolveCategoryGroup);
    assert.equal(shaped.promoActive, false);
  });

  await test("available is derived from stock, never a raw stock number", () => {
    const inStock = shapeProduct({ ...sampleProduct, stock: 5 }, sampleMetadata, resolveCategoryGroup);
    const outOfStock = shapeProduct({ ...sampleProduct, stock: 0 }, sampleMetadata, resolveCategoryGroup);
    assert.equal(inStock.available, true);
    assert.equal(outOfStock.available, false);
    assert.equal(JSON.stringify(inStock).includes('"stock"'), false);
  });

  await test("price always comes from the product (POS), not from metadata", () => {
    const metadataWithNoPrice = { ...sampleMetadata };
    delete metadataWithNoPrice.price; // metadata never has a price field to begin with
    const shaped = shapeProduct(sampleProduct, metadataWithNoPrice, resolveCategoryGroup);
    assert.equal(shaped.price, 58900);
  });

  console.log("shapeProduct — Fase 31 (metadata null: producto solo-POS)");
  await test("con metadata null, el producto se arma igual (nombre/precio/disponibilidad del POS), sin lanzar", () => {
    const shaped = shapeProduct(sampleProduct, null, resolveCategoryGroup);
    assert.equal(shaped.name, "Daily Glow Cleanser");
    assert.equal(shaped.price, 58900);
    assert.equal(shaped.available, true);
    assert.equal(shaped.category, "Skincare");
    assert.equal(shaped.categoryGroup, "Skincare");
  });
  await test("con metadata null, todos los campos editoriales caen a su valor 'ausente' (null/[]/false), nunca undefined ni inventado", () => {
    const shaped = shapeProduct(sampleProduct, null, resolveCategoryGroup);
    assert.deepEqual(
      {
        editorialCategory: shaped.editorialCategory,
        subcategory: shaped.subcategory,
        image: shaped.image,
        images: shaped.images,
        shortDescription: shaped.shortDescription,
        description: shaped.description,
        benefits: shaped.benefits,
        ingredients: shaped.ingredients,
        usage: shaped.usage,
        presentation: shaped.presentation,
        brand: shaped.brand,
        badge: shaped.badge,
        featured: shaped.featured,
        editorialOrder: shaped.editorialOrder,
      },
      {
        editorialCategory: null,
        subcategory: null,
        image: null,
        images: [],
        shortDescription: null,
        description: null,
        benefits: [],
        ingredients: null,
        usage: null,
        presentation: null,
        brand: null,
        badge: null,
        featured: false,
        editorialOrder: null,
      }
    );
  });
  await test("promociones del POS siguen funcionando aunque el producto no tenga ninguna ficha editorial", () => {
    const shaped = shapeProduct({ ...sampleProduct, promo_active: true, promo_price: 45000, promo_text: "-20%" }, null, resolveCategoryGroup);
    assert.equal(shaped.promoActive, true);
    assert.equal(shaped.promoPrice, 45000);
  });
  await test("metadata con una fila real produce exactamente el mismo resultado de siempre (sin regresión)", () => {
    const withMeta = shapeProduct(sampleProduct, sampleMetadata, resolveCategoryGroup);
    assert.equal(withMeta.image, "assets/products/cleanser.svg");
    assert.equal(withMeta.featured, true);
    assert.equal(withMeta.badge, "Nuevo");
  });

  console.log("sortCatalog");
  await test("featured items sort before non-featured", () => {
    const items = [
      { name: "B", featured: false, editorialOrder: null },
      { name: "A", featured: true, editorialOrder: null },
    ];
    const sorted = sortCatalog(items);
    assert.equal(sorted[0].name, "A");
  });
  await test("editorial_order ascending, nulls last, then alphabetical fallback", () => {
    const items = [
      { name: "Z", featured: true, editorialOrder: null },
      { name: "M", featured: true, editorialOrder: 2 },
      { name: "A", featured: true, editorialOrder: 1 },
      { name: "B", featured: true, editorialOrder: null },
    ];
    const sorted = sortCatalog(items).map((i) => i.name);
    assert.deepEqual(sorted, ["A", "M", "B", "Z"]);
  });

  console.log("applyFilters");
  const filterFixture = [
    { name: "Cleanser", category: "Skincare", subcategory: "Limpieza", featured: true, shortDescription: "glow" },
    { name: "Lipstick", category: "Maquillaje", subcategory: "Labios", featured: false, shortDescription: "color" },
  ];
  await test("filters by category", () => {
    const r = applyFilters(filterFixture, { category: "Skincare" });
    assert.equal(r.length, 1);
    assert.equal(r[0].name, "Cleanser");
  });
  await test("filters by featured", () => {
    const r = applyFilters(filterFixture, { featured: true });
    assert.equal(r.length, 1);
    assert.equal(r[0].name, "Cleanser");
  });
  await test("filters by search across name/description", () => {
    const r = applyFilters(filterFixture, { search: "color" });
    assert.equal(r.length, 1);
    assert.equal(r[0].name, "Lipstick");
  });

  console.log("pgrestSelect (mocked fetch, no network)");
  await test("rejects a table name outside the whitelist before ever calling fetch", async () => {
    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      throw new Error("should never be called");
    };
    await assert.rejects(
      () => pgrestSelect({ table: "sales", columns: "id", env: { url: "https://x", serviceRoleKey: "k" }, fetchImpl }),
      (err) => err.code === "TABLE_NOT_ALLOWED"
    );
    assert.equal(fetchCalled, false);
  });

  await test("maps Postgres 42P01 to TABLE_MISSING", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: "42P01", message: "relation does not exist" }),
    });
    await assert.rejects(
      () =>
        pgrestSelect({
          table: "catalog_metadata",
          columns: "product_id",
          env: { url: "https://x", serviceRoleKey: "k" },
          fetchImpl,
        }),
      (err) => err.code === "TABLE_MISSING"
    );
  });

  await test("returns the parsed array on success and sends the service role key", async () => {
    const fetchImpl = async (url, opts) => {
      assert.ok(url.includes("/rest/v1/products"));
      assert.equal(opts.headers.apikey, "k");
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 1 }]) };
    };
    const rows = await pgrestSelect({
      table: "products",
      columns: "id",
      env: { url: "https://x", serviceRoleKey: "k" },
      fetchImpl,
    });
    assert.deepEqual(rows, [{ id: 1 }]);
  });

  console.log("getEnv (real current environment, no mocking)");
  await test("throws ENV_MISSING when SUPABASE_* vars are not set (this is the real current state)", () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      assert.throws(() => getEnv(), (err) => err.code === "ENV_MISSING");
    } finally {
      if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
      if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });

  console.log("applyCors");
  await test("sets the header for an allowed dev origin", () => {
    const headers = {};
    const req = { headers: { origin: DEFAULT_DEV_ORIGINS[0] } };
    const res = { setHeader: (k, v) => (headers[k] = v) };
    applyCors(req, res);
    assert.equal(headers["Access-Control-Allow-Origin"], DEFAULT_DEV_ORIGINS[0]);
  });
  await test("does not set the header for a random disallowed origin", () => {
    const headers = {};
    const req = { headers: { origin: "https://evil.example.com" } };
    const res = { setHeader: (k, v) => (headers[k] = v) };
    applyCors(req, res);
    assert.equal(headers["Access-Control-Allow-Origin"], undefined);
  });
  await test("allows a Vercel preview origin", () => {
    const headers = {};
    const req = { headers: { origin: "https://vibe-catalog-abc123.vercel.app" } };
    const res = { setHeader: (k, v) => (headers[k] = v) };
    applyCors(req, res);
    assert.equal(headers["Access-Control-Allow-Origin"], "https://vibe-catalog-abc123.vercel.app");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
