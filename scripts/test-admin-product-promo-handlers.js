// Runs with plain Node, no network, no real credentials:
//   node scripts/test-admin-product-promo-handlers.js
//
// Invokes the actual exported handler with mock req/res and a mocked
// global.fetch — same pattern as test-admin-handlers.js.

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

const BASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
  ADMIN_API_TOKEN: "admin-test-token",
};
const AUTH = { authorization: "Bearer admin-test-token" };

function mockRealProduct({ id = 96, price = 20800, promoActive = false, promoPrice = null, cost_base = 9999, stock = 5 } = {}) {
  return { id, name: "Rubor líquido", price, stock, cost_base, promo_active: promoActive, promo_price: promoPrice, promo_start: null, promo_end: null, promo_text: promoActive ? "-20%" : null };
}

async function main() {
  delete require.cache[require.resolve("../api/admin/product-promo")];
  const handler = require("../api/admin/product-promo");

  console.log("/api/admin/product-promo");

  await test("sin Authorization -> 401 antes de tocar Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = { method: "GET", headers: {}, query: { product_id: "96" } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 401);
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "DELETE", headers: AUTH, query: {} };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  await test("GET sin promoción -> promoActive:false, discountPercent:null, sin cost_base/stock en la respuesta", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct()]) });
      try {
        const req = { method: "GET", headers: AUTH, query: { product_id: "96" } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.promoActive, false);
        assert.equal(res.body.discountPercent, null);
        assert.ok(!("cost_base" in res.body) && !("stock" in res.body));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("GET con promoción activa -> discountPercent calculado correctamente (20800 -> 16640 = 20%)", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ promoActive: true, promoPrice: 16640 })]) });
      try {
        const req = { method: "GET", headers: AUTH, query: { product_id: "96" } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.promoActive, true);
        assert.equal(res.body.discountPercent, 20);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH promo_price >= price -> 400, nunca llega a escribir", async () => {
    await withEnv(BASE_ENV, async () => {
      let patchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        if (opts && opts.method === "PATCH") patchCalled = true;
        return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 20800 })]) };
      };
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 96, promo_active: true, promo_price: 20800 } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.fields.promo_price);
        assert.equal(patchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH promo_price > price -> 400 (mismo caso, valor mayor)", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 20800 })]) });
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 96, promo_active: true, promo_price: 25000 } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.fields.promo_price);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH activar promoción sin promo_price -> 400 (no tiene sentido activa sin precio)", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 20800 })]) });
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 96, promo_active: true } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.fields.promo_price);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH sin product_id -> 400, nunca llega a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = { method: "PATCH", headers: AUTH, body: { promo_active: true, promo_price: 100 } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH válido (20% off) -> 200, discountPercent:20, respuesta nunca incluye cost_base/stock/name", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        if (opts && opts.method === "PATCH") {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 96, price: 20800, promo_active: true, promo_price: 16640, promo_start: null, promo_end: null, promo_text: "-20%" }]) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 20800 })]) };
      };
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 96, promo_active: true, promo_price: 16640, promo_text: "-20%" } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.discountPercent, 20);
        const serialized = JSON.stringify(res.body);
        for (const forbidden of ["cost_base", "cost_pack", "min_stock", "\"stock\"", "\"name\""]) {
          assert.ok(!serialized.includes(forbidden), `la respuesta contiene "${forbidden}"`);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH desactivar promoción (promo_active:false, sin tocar promo_price) -> 200, permitido sin exigir precio", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        if (opts && opts.method === "PATCH") {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 96, price: 20800, promo_active: false, promo_price: 16640, promo_start: null, promo_end: null, promo_text: null }]) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 20800, promoActive: true, promoPrice: 16640 })]) };
      };
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 96, promo_active: false } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.promoActive, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("PATCH producto inexistente -> 404", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => "[]" });
      try {
        const req = { method: "PATCH", headers: AUTH, body: { product_id: 9999, promo_active: false } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 404);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
