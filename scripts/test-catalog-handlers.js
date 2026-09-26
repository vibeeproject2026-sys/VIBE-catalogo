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

    await test("GET with a full mocked dataset returns every POS product, shaped and cached (Fase 31: editorial metadata is optional)", async () => {
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
                { id: 2, name: "Sin ficha editorial todavia", price: 1000, stock: 3, category: "Otro", cost_base: 1 },
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
                // product id 2 has NO metadata row -> must still appear
                // (Fase 31), only with name/price/stock-derived availability.
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
          assert.equal(res.body.products.length, 2);
          const withMeta = res.body.products.find((p) => p.id === 1);
          const withoutMeta = res.body.products.find((p) => p.id === 2);
          assert.equal(withMeta.image, "assets/products/cleanser.svg");
          assert.equal(withoutMeta.name, "Sin ficha editorial todavia");
          assert.equal(withoutMeta.price, 1000);
          assert.equal(withoutMeta.available, true); // stock: 3
          assert.equal(withoutMeta.image, null);
          assert.deepEqual(withoutMeta.benefits, []);
          assert.equal(JSON.stringify(res.body).includes("cost_base"), false);
          assert.equal(JSON.stringify(res.body).includes('"stock"'), false);
        } else {
          // Ambos productos aportan a la navegación ahora, no solo el curado.
          assert.equal(res.body.categories.length, 2);
          const groups = res.body.categories.map((g) => g.group).sort();
          assert.deepEqual(groups, ["Otros", "Skincare"]);
        }
        assert.ok(res.headers["Cache-Control"].includes("max-age"));
      } finally {
        global.fetch = originalFetch;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    if (label === "products") {
      // Fase 35 — regresión end-to-end: un producto con additional_info
      // lleno y published:true debe llegar COMPLETO a la API pública
      // (esto es lo que realmente rompió en el caso real del producto
      // 122 — no por un bug de código, sino porque la fila tenía
      // published:false. Este test cubre el camino de código; el caso
      // real está documentado en docs/fase35-... y en el reporte de la
      // fase).
      await test("producto con additional_info lleno y published:true expone todos sus campos editoriales", async () => {
        process.env.SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
          if (url.includes("/rest/v1/products")) {
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify([{ id: 122, name: "Rubor líquido", price: 20800, stock: 2, category: "Rostro" }]),
            };
          }
          if (url.includes("/rest/v1/catalog_metadata")) {
            return {
              ok: true,
              status: 200,
              text: async () =>
                JSON.stringify([
                  {
                    product_id: 122,
                    subcategory: "Rubor",
                    image: "https://x/main.png",
                    images: ["https://x/01.png"],
                    short_description: null,
                    description: "d",
                    benefits: ["b"],
                    ingredients: null,
                    usage: null,
                    presentation: null,
                    brand: "Kevin&COCO",
                    badge: null,
                    featured: false,
                    editorial_order: null,
                    published: true,
                    additional_info: JSON.stringify({ commercialName: "Blusher Lotion", sku: "KC240258", netContent: "5 gr" }),
                  },
                ]),
            };
          }
          throw new Error("unexpected URL in test: " + url);
        };
        try {
          const req = { method: "GET", headers: {}, query: {} };
          const res = mockRes();
          await handler(req, res);
          const p = res.body.products.find((x) => x.id === 122);
          assert.equal(p.brand, "Kevin&COCO");
          assert.equal(p.image, "https://x/main.png");
          assert.equal(p.commercialName, "Blusher Lotion");
          assert.equal(p.sku, "KC240258");
          assert.equal(p.netContent, "5 gr");
        } finally {
          global.fetch = originalFetch;
          delete process.env.SUPABASE_URL;
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
      });

      // Fase 35 — comportamiento esperado (NO es un bug): una fila con
      // published:false, aunque tenga contenido real completo, se trata
      // exactamente igual que "sin ficha" — el producto sigue apareciendo
      // (Fase 31) pero solo con los datos del POS.
      await test("producto con ficha completa pero published:false se muestra SOLO con datos del POS (comportamiento esperado)", async () => {
        process.env.SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
          if (url.includes("/rest/v1/products")) {
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify([{ id: 122, name: "Rubor líquido", price: 20800, stock: 2, category: "Rostro" }]),
            };
          }
          if (url.includes("/rest/v1/catalog_metadata")) {
            // El backend ya filtra published=eq.true en la consulta —
            // una fila published:false nunca llega en la respuesta real.
            return { ok: true, status: 200, text: async () => JSON.stringify([]) };
          }
          throw new Error("unexpected URL in test: " + url);
        };
        try {
          const req = { method: "GET", headers: {}, query: {} };
          const res = mockRes();
          await handler(req, res);
          const p = res.body.products.find((x) => x.id === 122);
          assert.equal(p.name, "Rubor líquido");
          assert.equal(p.brand, null);
          assert.equal(p.commercialName, null);
          assert.equal(p.image, null);
        } finally {
          global.fetch = originalFetch;
          delete process.env.SUPABASE_URL;
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
      });
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
