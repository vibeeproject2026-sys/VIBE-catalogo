// Runs with plain Node, no network, no real credentials:
//   node scripts/test-admin-images-handlers.js
//
// Invokes the real exported api/admin/product-images.js handler with a
// mock req/res and a mocked global.fetch — same pattern as
// test-admin-handlers.js. No real Supabase/Storage call is ever made.

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

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makePng(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const VALID_MAIN_PNG_B64 = makePng(1200, 1500).toString("base64");
const TOO_SMALL_PNG_B64 = makePng(10, 10).toString("base64");

const BASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
  ADMIN_API_TOKEN: "admin-test-token",
};
const AUTH_HEADER = { authorization: "Bearer admin-test-token" };

// Builds a fetch mock that:
//  - answers GET /rest/v1/products (existence check)
//  - answers GET /rest/v1/catalog_metadata (current image/images)
//  - answers POST /rest/v1/catalog_metadata (upsert) and records the body
//  - answers POST/DELETE /storage/v1/object/... and records calls
function mockFetch({ productExists = true, existingImage = null, existingImages = [] } = {}) {
  const calls = { productsMethods: [], metadataWrites: [], storageUploads: [], storageDeletes: [] };
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (url.includes("/rest/v1/products")) {
      calls.productsMethods.push(method);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(productExists ? [{ id: 56 }] : []),
      };
    }
    if (url.includes("/rest/v1/catalog_metadata")) {
      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(productExists ? [{ product_id: 56, image: existingImage, images: existingImages }] : []),
        };
      }
      // POST upsert
      const body = JSON.parse(opts.body);
      calls.metadataWrites.push(body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ product_id: body.product_id, image: body.image ?? existingImage, images: body.images ?? existingImages }]),
      };
    }
    if (url.includes("/storage/v1/object/")) {
      if (method === "DELETE") {
        calls.storageDeletes.push(url);
        return { ok: true, status: 200, text: async () => "" };
      }
      calls.storageUploads.push({ url, contentType: opts.headers && opts.headers["Content-Type"], bodyLength: opts.body ? opts.body.length : 0 });
      return { ok: true, status: 200, text: async () => "" };
    }
    throw new Error("URL inesperada en el mock: " + url);
  };
  return { fetchImpl, calls };
}

async function main() {
  const handler = require("../api/admin/product-images");

  console.log("autorización");

  await test("sin ADMIN_API_TOKEN configurado -> 503 (fail-closed)", async () => {
    await withEnv({ ...BASE_ENV, ADMIN_API_TOKEN: undefined }, async () => {
      const req = { method: "POST", headers: {}, body: {} };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 503);
    });
  });

  await test("sin Authorization -> 401, nunca llega a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new Error("no debería llamarse");
      };
      try {
        const req = { method: "POST", headers: {}, body: { product_id: 56 } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 401);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("token incorrecto -> 401", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "POST", headers: { authorization: "Bearer equivocado" }, body: { product_id: 56 } };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 401);
    });
  });

  await test("método no permitido -> 405", async () => {
    await withEnv(BASE_ENV, async () => {
      const req = { method: "PUT", headers: AUTH_HEADER, body: {} };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  console.log("\nproducto inexistente");

  await test("product_id que no existe en products -> 400, sin tocar Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: false });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 999999, slot: "main", contentType: "image/png", dataBase64: VALID_MAIN_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(calls.storageUploads.length, 0);
        assert.equal(calls.metadataWrites.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nsubida de imagen principal");

  await test("POST slot=main con imagen válida -> 200, sube a Storage y actualiza catalog_metadata.image", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: null, existingImages: [] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "image/png", dataBase64: VALID_MAIN_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(calls.storageUploads.length, 1);
        assert.ok(calls.storageUploads[0].url.includes("products/56/main.png"));
        assert.equal(calls.metadataWrites.length, 1);
        assert.equal(calls.metadataWrites[0].product_id, 56);
        assert.ok(String(calls.metadataWrites[0].image).includes("products/56/main.png"));
        assert.equal("images" in calls.metadataWrites[0], false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("reemplazo de imagen principal: borra la anterior (propia) de forma best-effort, tras actualizar la metadata", async () => {
    await withEnv(BASE_ENV, async () => {
      const previousUrl = "https://example.supabase.co/storage/v1/object/public/product-images/products/56/main.jpg";
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: previousUrl, existingImages: [] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "image/png", dataBase64: VALID_MAIN_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        await flush();
        assert.equal(res.statusCode, 200);
        // referencia actualizada primero (ya se ve en metadataWrites), y el
        // archivo anterior (distinto, .jpg vs .png) se intenta limpiar:
        assert.equal(calls.storageDeletes.length, 1);
        assert.ok(calls.storageDeletes[0].includes("products/56/main.jpg"));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("producto 56 legacy: imagen previa assets/products/brush.svg NUNCA se intenta borrar de Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: "assets/products/brush.svg", existingImages: [] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "image/png", dataBase64: makePng(1200, 1500).toString("base64") },
        };
        const res = mockRes();
        await handler(req, res);
        await flush();
        assert.equal(res.statusCode, 200);
        assert.equal(calls.storageDeletes.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("imagen inválida (bajo el mínimo) -> 422, nunca sube a Storage ni escribe metadata", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "image/png", dataBase64: TOO_SMALL_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 422);
        assert.ok(Array.isArray(res.body.details) && res.body.details.length > 0);
        assert.equal(calls.storageUploads.length, 0);
        assert.equal(calls.metadataWrites.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("tipo de archivo no permitido -> 422, rechazado antes de decodificar nada hacia Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "application/pdf", dataBase64: VALID_MAIN_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 422);
        assert.equal(calls.storageUploads.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\nsubida de imagen secundaria");

  await test("POST slot=secondary agrega a images[] preservando las existentes, sin colisionar numeración", async () => {
    await withEnv(BASE_ENV, async () => {
      const existing = ["https://example.supabase.co/storage/v1/object/public/product-images/products/56/01.webp"];
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: null, existingImages: existing });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "secondary", contentType: "image/png", dataBase64: makePng(450, 450).toString("base64") },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        assert.ok(calls.storageUploads[0].url.includes("products/56/02.png"));
        assert.equal(calls.metadataWrites[0].images.length, 2);
        assert.deepEqual(calls.metadataWrites[0].images[0], existing[0]);
        assert.equal("image" in calls.metadataWrites[0], false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\neliminación de imagen secundaria");

  await test("DELETE de una secundaria existente: actualiza metadata primero y luego intenta borrar el archivo", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = "https://example.supabase.co/storage/v1/object/public/product-images/products/56/01.webp";
      const keep = "https://example.supabase.co/storage/v1/object/public/product-images/products/56/02.webp";
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: null, existingImages: [target, keep] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = { method: "DELETE", headers: AUTH_HEADER, body: { product_id: 56, path: target } };
        const res = mockRes();
        await handler(req, res);
        await flush();
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.images, [keep]);
        assert.deepEqual(calls.metadataWrites[0].images, [keep]);
        assert.equal(calls.storageDeletes.length, 1);
        assert.ok(calls.storageDeletes[0].includes("products/56/01.webp"));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("DELETE de una URL no registrada en images[] -> 404, sin escribir metadata ni tocar Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true, existingImage: null, existingImages: ["https://example.supabase.co/storage/v1/object/public/product-images/products/56/01.webp"] });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = { method: "DELETE", headers: AUTH_HEADER, body: { product_id: 56, path: "https://example.supabase.co/storage/v1/object/public/product-images/products/56/99.webp" } };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 404);
        assert.equal(calls.metadataWrites.length, 0);
        assert.equal(calls.storageDeletes.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\ncampos POS y seguridad");

  await test("campos POS en el body (name/price/stock/category/cost_base) se ignoran por completo", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: {
            product_id: 56,
            slot: "main",
            contentType: "image/png",
            dataBase64: VALID_MAIN_PNG_B64,
            name: "Nombre falso",
            price: 1,
            stock: 999,
            category: "Otro",
            cost_base: 5,
          },
        };
        const res = mockRes();
        await handler(req, res);
        assert.equal(res.statusCode, 200);
        for (const forbidden of ["name", "price", "stock", "category", "cost_base"]) {
          assert.equal(forbidden in calls.metadataWrites[0], false, `campo prohibido llegó a catalog_metadata: ${forbidden}`);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("nunca se escribe en /rest/v1/products (solo se lee, método GET)", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({ productExists: true });
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "POST",
          headers: AUTH_HEADER,
          body: { product_id: 56, slot: "main", contentType: "image/png", dataBase64: VALID_MAIN_PNG_B64 },
        };
        const res = mockRes();
        await handler(req, res);
        assert.ok(calls.productsMethods.length > 0);
        assert.ok(calls.productsMethods.every((m) => m === "GET"), "products solo debe leerse, nunca escribirse");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
