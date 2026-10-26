// Runs with plain Node, no network, no real credentials:
//   node scripts/test-orders-handlers.js
//
// Invokes the actual exported handler functions with mock req/res and a
// mocked global.fetch — same pattern as test-admin-handlers.js/
// test-hero-handlers.js. No real Supabase call is ever made.

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

const VALID_CUSTOMER = { name: "Ana Cliente", phone: "3001234567", email: "ana@example.com", city: "Bogotá", address: "Calle 123" };

function mockRealProduct({ id = 1, price = 15000, stock = 5, promoActive = false, promoPrice = null } = {}) {
  return {
    id,
    name: "Rubor líquido",
    price,
    stock,
    category: "Rostro",
    promo_active: promoActive,
    promo_price: promoPrice,
    promo_start: null,
    promo_end: null,
    promo_text: null,
  };
}

// Fase 43 — /api/orders/create ahora también consulta catalog_metadata
// (product_id,published) para exigir published = true. Este mock responde
// esa consulta respetando los filtros product_id=in.(...) y
// published=eq.true; por defecto todos los ids pedidos están publicados,
// para que los tests existentes conserven su intención original.
// `rows` permite fijar exactamente qué filas existen.
function metadataMock(url, rows = null) {
  const u = new URL(String(url));
  if (!u.pathname.endsWith("/catalog_metadata")) return null;
  const inMatch = (u.searchParams.get("product_id") || "").match(/^in\.\((.*)\)$/);
  const requested = inMatch ? inMatch[1].split(",") : [];
  let result = rows ? rows.filter((r) => requested.includes(String(r.product_id))) : requested.map((id) => ({ product_id: Number(id), published: true }));
  if (u.searchParams.get("published") === "eq.true") result = result.filter((r) => r.published === true);
  return { ok: true, status: 200, text: async () => JSON.stringify(result) };
}

async function main() {
  delete require.cache[require.resolve("../api/orders/create")];
  const createHandler = require("../api/orders/create");
  const adminOrdersHandler = require("../api/admin/orders");

  console.log("/api/orders/create");

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "GET", headers: {}, body: {} };
      const res = mockRes();
      await createHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  await test("sin contactConsent -> 400, nunca llega a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = {
          method: "POST",
          headers: {},
          body: { customer: VALID_CUSTOMER, contactConsent: false, items: [{ productId: 1, quantity: 1 }] },
        };
        const res = mockRes();
        await createHandler(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.fields.contactConsent);
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("producto no disponible (stock 0) -> 409, el pedido no se registra", async () => {
    await withEnv(BASE_ENV, async () => {
      let insertCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        const meta = metadataMock(url);
        if (meta) return meta;
        if (String(url).includes("/rest/v1/products")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ stock: 0 })]) };
        }
        if (opts && opts.method === "POST") insertCalled = true;
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = {
          method: "POST",
          headers: {},
          body: { customer: VALID_CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 1 }] },
        };
        const res = mockRes();
        await createHandler(req, res);
        assert.equal(res.statusCode, 409);
        assert.deepEqual(res.body.unavailableProductIds, [1]);
        assert.equal(insertCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("producto inexistente (id no encontrado) -> 409, tratado igual que no disponible", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        const meta = metadataMock(url);
        if (meta) return meta;
        if (String(url).includes("/rest/v1/products")) return { ok: true, status: 200, text: async () => "[]" };
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = {
          method: "POST",
          headers: {},
          body: { customer: VALID_CUSTOMER, contactConsent: true, items: [{ productId: 999, quantity: 1 }] },
        };
        const res = mockRes();
        await createHandler(req, res);
        assert.equal(res.statusCode, 409);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("el precio persistido/respondido es el del servidor, aunque el cliente mande otro distinto", async () => {
    await withEnv(BASE_ENV, async () => {
      let insertedBody = null;
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        const meta = metadataMock(url);
        if (meta) return meta;
        const u = String(url);
        if (u.includes("/rest/v1/products")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct({ price: 15000 })]) };
        }
        if (u.includes("/rest/v1/orders") && opts.method === "POST") {
          insertedBody = JSON.parse(opts.body);
          return { ok: true, status: 201, text: async () => JSON.stringify({ ...insertedBody, id: 7, created_at: "2026-09-27T00:00:00Z" }) };
        }
        // PATCH de markOrderNotifications
        return { ok: true, status: 204, text: async () => "" };
      };
      try {
        const req = {
          method: "POST",
          headers: {},
          body: {
            customer: VALID_CUSTOMER,
            contactConsent: true,
            // El cliente intenta mandar un precio manipulado (100 en vez
            // de los 15000 reales) — nunca debe llegar a persistirse así.
            items: [{ productId: 1, quantity: 2, price: 100, variantName: "Único" }],
          },
        };
        const res = mockRes();
        await createHandler(req, res);
        assert.equal(res.statusCode, 201);
        assert.equal(insertedBody.items[0].price, 15000);
        assert.equal(insertedBody.items[0].lineSubtotal, 30000);
        assert.equal(insertedBody.total, 30000);
        assert.equal(res.body.total, 30000);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("respuesta exitosa nunca incluye costos/stock internos ni la service-role key", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url, opts) => {
        const meta = metadataMock(url);
        if (meta) return meta;
        const u = String(url);
        if (u.includes("/rest/v1/products")) return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct()]) };
        if (u.includes("/rest/v1/orders") && opts.method === "POST") {
          const body = JSON.parse(opts.body);
          return { ok: true, status: 201, text: async () => JSON.stringify({ ...body, id: 8, created_at: "2026-09-27T00:00:00Z" }) };
        }
        return { ok: true, status: 204, text: async () => "" };
      };
      try {
        const req = {
          method: "POST",
          headers: {},
          body: { customer: VALID_CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 1 }] },
        };
        const res = mockRes();
        await createHandler(req, res);
        const serialized = JSON.stringify(res.body);
        assert.equal(res.statusCode, 201);
        for (const forbidden of ["cost_base", "cost_pack", "min_stock", "service-role-test-not-real"]) {
          assert.ok(!serialized.includes(forbidden), `la respuesta contiene "${forbidden}"`);
        }
        // Teléfono enmascarado, nunca el completo, en la respuesta al cliente.
        assert.ok(!serialized.includes(VALID_CUSTOMER.phone));
        assert.ok(res.body.customerPhoneLast4.endsWith("4567"));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("con RESEND_API_KEY/EMAIL_FROM_ADDRESS/ORDERS_NOTIFICATION_EMAIL configuradas, se intentan los dos correos (cliente e interno) con destinatarios distintos, y el pedido responde 201 con emailSent:true", async () => {
    await withEnv(
      { ...BASE_ENV, RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE Beauty <pedidos@vibebeautycol.com>", ORDERS_NOTIFICATION_EMAIL: "ana.vibe@example.com" },
      async () => {
        const resendRecipients = [];
        const originalFetch = global.fetch;
        global.fetch = async (url, opts) => {
        const meta = metadataMock(url);
        if (meta) return meta;
          const u = String(url);
          if (u.includes("/rest/v1/products")) return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct()]) };
          if (u.includes("/rest/v1/orders") && opts.method === "POST") {
            const body = JSON.parse(opts.body);
            return { ok: true, status: 201, text: async () => JSON.stringify({ ...body, id: 9, created_at: "2026-09-27T00:00:00Z" }) };
          }
          if (u.includes("api.resend.com")) {
            resendRecipients.push(JSON.parse(opts.body).to);
            return { ok: true, status: 200, text: async () => "{}" };
          }
          return { ok: true, status: 204, text: async () => "" };
        };
        try {
          const req = {
            method: "POST",
            headers: {},
            body: { customer: VALID_CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 1 }] },
          };
          const res = mockRes();
          await createHandler(req, res);
          assert.equal(res.statusCode, 201);
          assert.equal(res.body.emailSent, true);
          assert.equal(resendRecipients.length, 2, "deberían intentarse exactamente 2 envíos a Resend (cliente + interno)");
          assert.ok(resendRecipients.includes(VALID_CUSTOMER.email), "el cliente debe recibir su propio correo");
          assert.ok(resendRecipients.includes("ana.vibe@example.com"), "VIBE debe recibir el aviso interno en ORDERS_NOTIFICATION_EMAIL");
        } finally {
          global.fetch = originalFetch;
        }
      }
    );
  });

  await test("si Resend falla, el pedido sigue registrándose (201) y email_sent queda false — el checkout nunca se rompe por el email (items 15/16/17)", async () => {
    await withEnv(
      { ...BASE_ENV, RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE Beauty <pedidos@vibebeautycol.com>", ORDERS_NOTIFICATION_EMAIL: "ana.vibe@example.com" },
      async () => {
        let markPatchBody = null;
        const originalFetch = global.fetch;
        global.fetch = async (url, opts) => {
        const meta = metadataMock(url);
        if (meta) return meta;
          const u = String(url);
          if (u.includes("/rest/v1/products")) return { ok: true, status: 200, text: async () => JSON.stringify([mockRealProduct()]) };
          if (u.includes("/rest/v1/orders") && opts.method === "POST") {
            const body = JSON.parse(opts.body);
            return { ok: true, status: 201, text: async () => JSON.stringify({ ...body, id: 10, created_at: "2026-09-27T00:00:00Z" }) };
          }
          if (u.includes("api.resend.com")) {
            return { ok: false, status: 403, text: async () => JSON.stringify({ message: "domain not verified" }) };
          }
          if (u.includes("/rest/v1/orders") && opts.method === "PATCH") {
            markPatchBody = JSON.parse(opts.body);
            return { ok: true, status: 204, text: async () => "" };
          }
          return { ok: true, status: 204, text: async () => "" };
        };
        try {
          const req = {
            method: "POST",
            headers: {},
            body: { customer: VALID_CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 1 }] },
          };
          const res = mockRes();
          await createHandler(req, res);
          assert.equal(res.statusCode, 201, "el pedido debe seguir registrándose aunque Resend falle");
          assert.equal(res.body.emailSent, false);
          assert.equal(markPatchBody.email_sent, false);
        } finally {
          global.fetch = originalFetch;
        }
      }
    );
  });

  console.log("\n/api/orders/create — Fase 43: solo productos publicados");

  // Simula Supabase para un pedido: `products` (POS) y `metaRows`
  // (catalog_metadata). `honorPublishedFilter: false` simula una consulta
  // que perdió el filtro published=eq.true (defensa en profundidad).
  async function runOrder({ products, metaRows, items, honorPublishedFilter = true }) {
    const calls = { inserted: null, supabase: 0 };
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      calls.supabase++;
      const u = new URL(String(url));
      if (u.pathname.endsWith("/catalog_metadata")) {
        if (!honorPublishedFilter) u.searchParams.delete("published");
        return metadataMock(u.toString(), metaRows);
      }
      if (u.pathname.endsWith("/products")) {
        const inMatch = (u.searchParams.get("id") || "").match(/^in\.\((.*)\)$/);
        const requested = inMatch ? inMatch[1].split(",") : [];
        return { ok: true, status: 200, text: async () => JSON.stringify(products.filter((p) => requested.includes(String(p.id)))) };
      }
      if (u.pathname.endsWith("/orders") && opts && opts.method === "POST") {
        calls.inserted = JSON.parse(opts.body);
        return { ok: true, status: 201, text: async () => JSON.stringify({ ...calls.inserted, id: 99, created_at: "2026-10-26T00:00:00Z" }) };
      }
      return { ok: true, status: 204, text: async () => "" };
    };
    try {
      const res = mockRes();
      await createHandler({ method: "POST", headers: {}, body: { customer: VALID_CUSTOMER, contactConsent: true, items } }, res);
      return { res, ...calls };
    } finally {
      global.fetch = originalFetch;
    }
  }

  const PRODUCTS = [
    mockRealProduct({ id: 10, price: 20000, stock: 5 }),
    mockRealProduct({ id: 11, price: 30000, stock: 5, promoActive: true, promoPrice: 24000 }),
    mockRealProduct({ id: 20, price: 15000, stock: 5 }),
    mockRealProduct({ id: 30, price: 9000, stock: 5 }),
    mockRealProduct({ id: 40, price: 18000, stock: 0 }),
  ];
  const META = [
    { product_id: 10, published: true },
    { product_id: 11, published: true },
    { product_id: 20, published: false },
    { product_id: 40, published: true },
    // 30: sin fila de metadata
  ];

  await test("producto publicado y disponible -> 201, se registra con el precio del servidor", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 10, quantity: 2, price: 1 }] });
      assert.equal(res.statusCode, 201);
      assert.equal(inserted.items[0].price, 20000);
      assert.equal(inserted.total, 40000);
    });
  });

  await test("varios productos publicados (uno con promo) -> 201, total con precio efectivo del servidor", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({
        products: PRODUCTS,
        metaRows: META,
        items: [{ productId: 10, quantity: 1 }, { productId: 11, quantity: 2 }],
      });
      assert.equal(res.statusCode, 201);
      assert.equal(inserted.items[1].price, 24000);
      assert.equal(inserted.total, 20000 + 48000);
    });
  });

  await test("producto con published:false -> 409, el pedido no se registra", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 20, quantity: 1 }] });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.unavailableProductIds, [20]);
      assert.equal(inserted, null);
    });
  });

  await test("producto sin metadata editorial -> 409, el pedido no se registra", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 30, quantity: 1 }] });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.unavailableProductIds, [30]);
      assert.equal(inserted, null);
    });
  });

  await test("mezcla publicado + no publicado -> 409 rechaza el pedido entero, solo señala el no publicado", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({
        products: PRODUCTS,
        metaRows: META,
        items: [{ productId: 10, quantity: 1 }, { productId: 20, quantity: 1 }],
      });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.unavailableProductIds, [20]);
      assert.equal(inserted, null);
    });
  });

  await test("mezcla publicado + sin metadata + publicado agotado + inexistente -> 409 con todos los inválidos", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({
        products: PRODUCTS,
        metaRows: META,
        items: [
          { productId: 10, quantity: 1 },
          { productId: 30, quantity: 1 },
          { productId: 40, quantity: 1 },
          { productId: 777, quantity: 1 },
        ],
      });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.unavailableProductIds, [30, 40, 777]);
      assert.equal(inserted, null);
    });
  });

  await test("publicado pero agotado -> 409 (la validación de stock se conserva)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 40, quantity: 1 }] });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.unavailableProductIds, [40]);
      assert.equal(inserted, null);
    });
  });

  await test("no publicado responde igual que agotado/inexistente (no revela que el producto existe)", async () => {
    await withEnv(BASE_ENV, async () => {
      const unpub = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 20, quantity: 1 }] });
      const missing = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 777, quantity: 1 }] });
      assert.equal(unpub.res.body.error, missing.res.body.error);
      assert.deepEqual(Object.keys(unpub.res.body).sort(), Object.keys(missing.res.body).sort());
    });
  });

  await test("defensa en profundidad: si la consulta devolviera una fila published:false, igual se rechaza", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, inserted } = await runOrder({
        products: PRODUCTS,
        metaRows: META,
        items: [{ productId: 20, quantity: 1 }],
        honorPublishedFilter: false,
      });
      assert.equal(res.statusCode, 409);
      assert.equal(inserted, null);
    });
  });

  await test("cantidad inválida -> 400 antes de consultar Supabase (validación de payload se conserva)", async () => {
    await withEnv(BASE_ENV, async () => {
      for (const quantity of [0, -1, 1.5, "2"]) {
        const { res, supabase } = await runOrder({ products: PRODUCTS, metaRows: META, items: [{ productId: 10, quantity }] });
        assert.equal(res.statusCode, 400, "quantity " + JSON.stringify(quantity));
        assert.equal(supabase, 0);
      }
    });
  });

  console.log("\n/api/admin/orders");

  await test("sin Authorization, deniega con 401 antes de tocar Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, text: async () => "[]" };
      };
      try {
        const req = { method: "GET", headers: {}, query: {} };
        const res = mockRes();
        await adminOrdersHandler(req, res);
        assert.equal(res.statusCode, 401);
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("con token correcto, devuelve el listado de pedidos", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 1, customer_name: "Ana", total: 30000, status: "received", email_sent: false, whatsapp_notified: false }]),
      });
      try {
        const req = { method: "GET", headers: { authorization: "Bearer admin-test-token" }, query: {} };
        const res = mockRes();
        await adminOrdersHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.orders.length, 1);
        assert.equal(res.body.orders[0].customer_name, "Ana");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "POST", headers: {}, query: {} };
      const res = mockRes();
      await adminOrdersHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
