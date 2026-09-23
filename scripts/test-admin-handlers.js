// Runs with plain Node, no network, no real credentials:
//   node scripts/test-admin-handlers.js
//
// Invokes the actual exported admin handler functions with mock
// req/res and a mocked global.fetch — same pattern as
// test-catalog-handlers.js. No real Supabase call is ever made.

const assert = require("assert/strict");

function mockRes() {
  const res = {
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
  return res;
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

async function main() {
  const productsHandler = require("../api/admin/products");
  const catalogMetadataHandler = require("../api/admin/catalog-metadata");

  const BASE_ENV = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
    ADMIN_API_TOKEN: "admin-test-token",
  };

  console.log("/api/admin/products");

  await test("sin ADMIN_API_TOKEN configurado, deniega con 503 (fail-closed)", async () => {
    await withEnv({ ...BASE_ENV, ADMIN_API_TOKEN: undefined }, async () => {
      const req = { method: "GET", headers: {}, query: {} };
      const res = mockRes();
      await productsHandler(req, res);
      assert.equal(res.statusCode, 503);
    });
  });

  await test("sin Authorization, deniega con 401 antes de tocar Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        throw new Error("no debería llamarse");
      };
      try {
        const req = { method: "GET", headers: {}, query: {} };
        const res = mockRes();
        await productsHandler(req, res);
        assert.equal(res.statusCode, 401);
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "POST", headers: {}, query: {} };
      const res = mockRes();
      await productsHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  await test("con token correcto, devuelve el listado sin cost_base/cost_pack/min_stock, con stock+available", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes("/products")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify([
                { id: 1, name: "A", price: 1000, stock: 5, category: "Otro", cost_base: 999 },
                { id: 2, name: "B", price: 2000, stock: 0, category: "Otro" },
              ]),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([{ product_id: 1, image: "x.svg", published: true, featured: true, subcategory: null, badge: null }]),
        };
      };
      try {
        const req = { method: "GET", headers: { authorization: "Bearer admin-test-token" }, query: {} };
        const res = mockRes();
        await productsHandler(req, res);
        assert.equal(res.statusCode, 200);
        const items = res.body.products;
        assert.equal(items.length, 2);
        assert.equal(JSON.stringify(items).includes("cost_base"), false);
        const p1 = items.find((i) => i.id === 1);
        const p2 = items.find((i) => i.id === 2);
        assert.equal(p1.hasMetadata, true);
        assert.equal(p1.available, true);
        assert.equal(p1.stock, 5);
        assert.equal(p2.hasMetadata, false);
        assert.equal(p2.available, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\n/api/admin/catalog-metadata");

  await test("PATCH sin Authorization, deniega con 401", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "PATCH", headers: {}, query: {}, body: { product_id: 56, published: true } };
      const res = mockRes();
      await catalogMetadataHandler(req, res);
      assert.equal(res.statusCode, 401);
    });
  });

  await test("PATCH sin product_id válido -> 400, nunca llega a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      let called = false;
      global.fetch = async () => {
        called = true;
        throw new Error("no debería llamarse");
      };
      try {
        const req = {
          method: "PATCH",
          headers: { authorization: "Bearer admin-test-token" },
          query: {},
          body: { published: true },
        };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(called, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH con campos operativos en el body -> el payload enviado a Supabase solo contiene product_id real + campos editoriales", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      let capturedBody = null;
      let capturedMethod = null;
      global.fetch = async (url, opts) => {
        capturedMethod = opts.method;
        capturedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, text: async () => JSON.stringify([{ product_id: 56, published: true }]) };
      };
      try {
        const req = {
          method: "PATCH",
          headers: { authorization: "Bearer admin-test-token" },
          query: {},
          body: {
            product_id: 56,
            name: "Nombre falso", // operativo, debe ignorarse
            price: 1, // operativo, debe ignorarse
            stock: 999, // operativo, debe ignorarse
            category: "Otro", // operativo, debe ignorarse
            cost_base: 5, // prohibido, debe ignorarse
            badge: "NUEVO", // editorial, debe conservarse
            published: true, // editorial, debe conservarse
          },
        };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(capturedMethod, "POST"); // upsert vía Prefer: resolution=merge-duplicates
        assert.equal(capturedBody.product_id, 56);
        assert.equal(capturedBody.badge, "NUEVO");
        assert.equal(capturedBody.published, true);
        for (const forbidden of ["name", "price", "stock", "category", "cost_base"]) {
          assert.ok(!(forbidden in capturedBody), `campo prohibido llegó a Supabase: ${forbidden}`);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH cuyo product_id no existe en products (FK violation 23503) -> 400 claro, no 500/502 crudo", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ code: "23503", message: "foreign key violation" }),
      });
      try {
        const req = {
          method: "PATCH",
          headers: { authorization: "Bearer admin-test-token" },
          query: {},
          body: { product_id: 999999, published: false },
        };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 400);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("GET de detalle requiere product_id numérico válido en query", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "GET", headers: { authorization: "Bearer admin-test-token" }, query: {} };
      const res = mockRes();
      await catalogMetadataHandler(req, res);
      assert.equal(res.statusCode, 400);
    });
  });

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "DELETE", headers: { authorization: "Bearer admin-test-token" }, query: {} };
      const res = mockRes();
      await catalogMetadataHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
