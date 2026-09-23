// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-catalog-handlers.js
//
// Invokes the actual exported Vercel handler functions with mock
// req/res objects (mirroring what @vercel/node provides: req.method,
// req.query, req.headers, res.status().json(), res.setHeader(), res.end()).
// global.fetch is mocked so nothing here ever touches the network or
// real Supabase credentials.

const assert = require("assert/strict");

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
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
      this.ended = true;
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

async function withEnvCleared(fn) {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await fn();
  } finally {
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
}

async function main() {
  const productsHandler = require("../api/catalog/products");
  const categoriesHandler = require("../api/catalog/categories");

  for (const [label, handler] of [
    ["products", productsHandler],
    ["categories", categoriesHandler],
  ]) {
    console.log(`/api/catalog/${label}`);

    await test("OPTIONS returns 204 without touching env/Supabase", async () => {
      const req = { method: "OPTIONS", headers: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 204);
      assert.equal(res.ended, true);
    });

    await test("POST is rejected with 405 and an Allow header", async () => {
      const req = { method: "POST", headers: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 405);
      assert.ok(res.headers.Allow.includes("GET"));
    });

    await test("GET with missing env vars returns a safe 500 (no secrets, no stack trace)", async () => {
      await withEnvCleared(async () => {
        const req = { method: "GET", headers: {}, query: {} };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 500);
        assert.equal(typeof res.body.error, "string");
        assert.equal(JSON.stringify(res.body).toLowerCase().includes("supabase_service_role_key"), false);
      });
    });

    await test("CORS header is applied even on the error path", async () => {
      await withEnvCleared(async () => {
        const req = { method: "GET", headers: { origin: "http://localhost:5500" }, query: {} };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:5500");
      });
    });

    await test("GET with env set but catalog_metadata missing (42P01) returns 503, not a crash", async () => {
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes("/products")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 1, name: "X", price: 100, stock: 1, category: "Skincare" }]) };
        }
        return { ok: false, status: 404, text: async () => JSON.stringify({ code: "42P01", message: "relation catalog_metadata does not exist" }) };
      };
      try {
        const req = { method: "GET", headers: {}, query: {} };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 503);
        assert.equal(typeof res.body.error, "string");
      } finally {
        global.fetch = originalFetch;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    await test("GET with a full mocked dataset returns only published products, shaped and cached", async () => {
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes("/rest/v1/products")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify([
                { id: 1, name: "Daily Glow Cleanser", price: 58900, stock: 5, category: "Skincare", cost_base: 999 },
                { id: 2, name: "Unpublished Thing", price: 1000, stock: 3, category: "Otro", cost_base: 1 },
              ]),
          };
        }
        if (url.includes("/rest/v1/catalog_metadata")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify([
                {
                  product_id: 1,
                  subcategory: "Limpieza",
                  image: "assets/products/cleanser.svg",
                  images: [],
                  short_description: "Limpieza suave",
                  description: "d",
                  benefits: ["b"],
                  ingredients: null,
                  usage: "u",
                  presentation: "150 ml",
                  brand: null,
                  badge: null,
                  featured: true,
                  editorial_order: 1,
                  published: true,
                },
                // product id 2 has NO metadata row -> must not appear
              ]),
          };
        }
        throw new Error("unexpected URL in test: " + url);
      };
      try {
        const req = { method: "GET", headers: {}, query: {} };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        if (label === "products") {
          assert.equal(res.body.products.length, 1);
          assert.equal(res.body.products[0].id, 1);
          assert.equal(JSON.stringify(res.body).includes("cost_base"), false);
          assert.equal(JSON.stringify(res.body).includes('"stock"'), false);
        } else {
          assert.equal(res.body.categories.length, 1);
          assert.equal(res.body.categories[0].group, "Skincare");
        }
        assert.ok(res.headers["Cache-Control"].includes("max-age"));
      } finally {
        global.fetch = originalFetch;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
