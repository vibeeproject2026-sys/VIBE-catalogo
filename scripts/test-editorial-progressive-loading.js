// Runs with plain Node, no network, no real credentials:
//   node scripts/test-editorial-progressive-loading.js
//
// Fase 23 — carga editorial manual progresiva: verifica específicamente
// que PATCHes parciales sucesivos SE ACUMULAN en vez de pisarse entre sí
// (guardar categoría hoy, agregar descripción mañana, sin perder la
// categoría), y que `published` controla correctamente la visibilidad en
// la API pública. Complementa, sin duplicar, los tests ya existentes de
// Fase 21/22A/22B (imágenes, whitelist, auth).
//
// El mock de fetch mantiene una fila en memoria y aplica upsert real
// (solo escribe las claves presentes en el body, igual que PostgREST con
// Prefer: resolution=merge-duplicates) — así el comportamiento de
// acumulación se prueba de verdad, no se asume.

const assert = require("assert/strict");

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    setHeader() {},
    json(p) {
      this.body = p;
      return this;
    },
  };
}

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

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const k of Object.keys(vars)) {
    if (vars[k] === undefined) delete process.env[k];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  })();
}

const BASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
  ADMIN_API_TOKEN: "admin-test-token",
};
const AUTH = { authorization: "Bearer admin-test-token" };

// Simula una tabla catalog_metadata en memoria, con upsert real
// (merge-duplicates: solo las claves presentes en el body se escriben,
// el resto de la fila se conserva) y products fijo. También responde a
// GET de catalog_metadata para que /api/catalog/products pueda leer.
function makeStatefulSupabase({ products, initialMetadata = {} }) {
  const metadataByProduct = new Map(Object.entries(initialMetadata).map(([k, v]) => [Number(k), v]));

  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.includes("/rest/v1/products")) {
      const m = url.match(/id=eq\.(\d+)/);
      const rows = m ? products.filter((p) => p.id === Number(m[1])) : products;
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    if (url.includes("/rest/v1/catalog_metadata")) {
      if (method === "GET") {
        const m = url.match(/product_id=eq\.(\d+)/);
        if (m) {
          const row = metadataByProduct.get(Number(m[1]));
          return { ok: true, status: 200, text: async () => JSON.stringify(row ? [row] : []) };
        }
        // sin filtro: usado por /api/catalog/products (solo published=true, aplicado igual)
        const wantsPublishedOnly = url.includes("published=eq.true");
        const rows = [...metadataByProduct.values()].filter((r) => !wantsPublishedOnly || r.published === true);
        return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
      }
      // POST upsert: merge-duplicates — solo se escriben las claves del body
      const body = JSON.parse(opts.body);
      const pid = body.product_id;
      const existing = metadataByProduct.get(pid) || { product_id: pid };
      const merged = { ...existing, ...body };
      metadataByProduct.set(pid, merged);
      return { ok: true, status: 200, text: async () => JSON.stringify([merged]) };
    }
    throw new Error("URL inesperada en el mock: " + url);
  };

  return { fetchImpl, metadataByProduct };
}

async function main() {
  const catalogMetadataHandler = require("../api/admin/catalog-metadata");
  const catalogProductsHandler = require("../api/catalog/products");

  console.log("acumulación de PATCHes parciales (no se pisan entre sí)");

  await test("ficha parcialmente completa: guardar solo categoría, el resto queda vacío", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = makeStatefulSupabase({ products: [{ id: 63, name: "VIBE Glow Drops", price: 16000, stock: 4, category: "Rostro" }] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 63, category: "Rostro" } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);

        const getReq = { method: "GET", headers: AUTH, query: { product_id: "63" } };
        const getRes = mockRes();
        await catalogMetadataHandler(getReq, getRes);
        assert.equal(getRes.body.metadata.category, "Rostro");
        // Nada más se envió en este PATCH: el resto de la fila sigue sin
        // existir en Supabase (no se inventó ningún valor para otros campos).
        assert.equal("short_description" in getRes.body.metadata, false);
        assert.equal("published" in getRes.body.metadata, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("guardar solo descripción DESPUÉS no borra la categoría guardada antes", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = makeStatefulSupabase({
        products: [{ id: 63, name: "VIBE Glow Drops", price: 16000, stock: 4, category: "Rostro" }],
        initialMetadata: { 63: { product_id: 63, category: "Rostro", published: false } },
      });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 63, short_description: "Gotas iluminadoras VIBE." } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.metadata.category, "Rostro"); // preservada, no fue parte de este PATCH
        assert.equal(res.body.metadata.short_description, "Gotas iluminadoras VIBE.");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("tres PATCHes independientes (category, luego benefits, luego badge) se acumulan todos en la misma fila", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = makeStatefulSupabase({ products: [{ id: 63, name: "VIBE Glow Drops", price: 16000, stock: 4, category: "Rostro" }] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        await catalogMetadataHandler({ method: "PATCH", headers: AUTH, query: {}, body: { product_id: 63, category: "Rostro" } }, mockRes());
        await catalogMetadataHandler({ method: "PATCH", headers: AUTH, query: {}, body: { product_id: 63, benefits: ["Ilumina", "Hidrata"] } }, mockRes());
        const res3 = mockRes();
        await catalogMetadataHandler({ method: "PATCH", headers: AUTH, query: {}, body: { product_id: 63, badge: "NUEVO" } }, mockRes());

        const getRes = mockRes();
        await catalogMetadataHandler({ method: "GET", headers: AUTH, query: { product_id: "63" } }, getRes);
        assert.equal(getRes.body.metadata.category, "Rostro");
        assert.deepEqual(getRes.body.metadata.benefits, ["Ilumina", "Hidrata"]);
        assert.equal(getRes.body.metadata.badge, "NUEVO");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\npublicación controla la ficha editorial, no la existencia del producto (Fase 31)");

  await test("published=false -> el producto SÍ aparece (nombre/precio/stock del POS), pero sin su ficha editorial en borrador", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = makeStatefulSupabase({
        products: [{ id: 63, name: "VIBE Glow Drops", price: 16000, stock: 4, category: "Rostro" }],
        initialMetadata: { 63: { product_id: 63, category: "Rostro", short_description: "x", published: false } },
      });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await catalogProductsHandler({ method: "GET", headers: {}, query: {} }, res);
        const found = (res.body.products || []).find((p) => p.id === 63);
        // Fase 31: un producto nunca se cae del catálogo por no tener (o no
        // tener publicada) su ficha editorial — sigue existiendo con los
        // datos operativos del POS.
        assert.ok(found, "el producto debe seguir apareciendo con sus datos del POS");
        assert.equal(found.name, "VIBE Glow Drops");
        assert.equal(found.price, 16000);
        assert.equal(found.available, true);
        // Pero la ficha editorial en borrador (published: false) nunca se
        // expone públicamente — ni la categoría ni la descripción cargadas.
        assert.equal(found.editorialCategory, null);
        assert.equal(found.shortDescription, null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("published=true -> el producto SÍ aparece, con la ficha acumulada completa", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl } = makeStatefulSupabase({
        products: [{ id: 63, name: "VIBE Glow Drops", price: 16000, stock: 4, category: "Rostro" }],
        initialMetadata: { 63: { product_id: 63, category: "Rostro", short_description: "Gotas iluminadoras VIBE.", published: true } },
      });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await catalogProductsHandler({ method: "GET", headers: {}, query: {} }, res);
        const found = (res.body.products || []).find((p) => p.id === 63);
        assert.ok(found);
        assert.equal(found.editorialCategory, "Rostro");
        assert.equal(found.shortDescription, "Gotas iluminadoras VIBE.");
        assert.equal("stock" in found, false);
        assert.equal("additional_info" in found, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nseguridad (reconfirmación en este flujo)");

  await test("sin token -> 401, sin llegar a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      let called = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        called = true;
        throw new Error("no debería llamarse");
      };
      try {
        const res = mockRes();
        await catalogMetadataHandler({ method: "PATCH", headers: {}, query: {}, body: { product_id: 63, category: "Rostro" } }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(called, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("token incorrecto -> 401", async () => {
    await withEnv(BASE_ENV, async () => {
      const res = mockRes();
      await catalogMetadataHandler({ method: "PATCH", headers: { authorization: "Bearer x" }, query: {}, body: { product_id: 63, category: "Rostro" } }, res);
      assert.equal(res.statusCode, 401);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
