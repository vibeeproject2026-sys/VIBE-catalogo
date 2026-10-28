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
function mockFetch({ productExists = true, existingImage = null, existingImages = [], otherRows = [], slides = [], deleteOk = true, allRowsFail = false } = {}) {
  const calls = { productsMethods: [], metadataWrites: [], storageUploads: [], storageDeletes: [], uploadUpsert: [] };
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
        const own = productExists ? [{ product_id: 56, image: existingImage, images: existingImages }] : [];
        // Fase 56 — lectura de TODAS las fichas (sin filtro por product_id)
        // para comprobar si un archivo es exclusivo antes de borrarlo.
        if (!url.includes("product_id=eq")) {
          if (allRowsFail) return { ok: false, status: 500, text: async () => "{}" };
          const after = calls.metadataWrites.length ? [{ product_id: 56, image: calls.metadataWrites.at(-1).image ?? existingImage, images: calls.metadataWrites.at(-1).images ?? existingImages }] : own;
          return { ok: true, status: 200, text: async () => JSON.stringify([...after, ...otherRows]) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(own) };
      }
      // POST upsert
      const body = JSON.parse(opts.body);
      calls.metadataWrites.push(body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ product_id: body.product_id, image: "image" in body ? body.image : existingImage, images: "images" in body ? body.images : existingImages }]),
      };
    }
    if (url.includes("/storage/v1/object/")) {
      if (method === "DELETE") {
        calls.storageDeletes.push(url);
        return { ok: deleteOk, status: deleteOk ? 200 : 500, text: async () => "" };
      }
      if (method === "GET" && url.includes("hero/slides.json")) {
        const buf = Buffer.from(JSON.stringify(slides));
        return { ok: true, status: 200, arrayBuffer: async () => buf, text: async () => buf.toString() };
      }
      calls.uploadUpsert.push(opts.headers && opts.headers["x-upsert"]);
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
        // Fase 56 — nombre único por subida (main-<versión>.png) y sin
        // sobrescritura: nunca pisa un archivo original anterior.
        assert.match(calls.storageUploads[0].url, /products\/56\/main-[a-z0-9]+\.png$/);
        assert.equal(calls.uploadUpsert[0], "false");
        assert.equal(calls.metadataWrites.length, 1);
        assert.equal(calls.metadataWrites[0].product_id, 56);
        assert.match(String(calls.metadataWrites[0].image), /products\/56\/main-[a-z0-9]+\.png$/);
        assert.equal("images" in calls.metadataWrites[0], false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("Fase 56 — reemplazo de imagen principal: actualiza la referencia y CONSERVA el archivo anterior (no lo borra)", async () => {
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
        assert.notEqual(calls.metadataWrites[0].image, previousUrl);
        assert.equal(calls.storageDeletes.length, 0);
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
        assert.match(calls.storageUploads[0].url, /products\/56\/02-[a-z0-9]+\.png$/);
        assert.equal(calls.uploadUpsert[0], "false");
        assert.equal(calls.metadataWrites[0].images.length, 2);
        assert.deepEqual(calls.metadataWrites[0].images[0], existing[0]);
        assert.equal("image" in calls.metadataWrites[0], false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\neliminación de imagen secundaria");

  await test("Fase 56 — quitar una secundaria: la saca de images[] y CONSERVA el archivo (sin borrado por defecto)", async () => {
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
        assert.deepEqual(Object.keys(calls.metadataWrites[0]).sort(), ["images", "product_id"]);
        assert.equal(calls.storageDeletes.length, 0);
        assert.deepEqual(res.body.file, { deleted: false, reason: "kept" });
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

  console.log("\nFase 56 — quitar imágenes de una ficha");
  const U = (p) => "https://example.supabase.co/storage/v1/object/public/product-images/" + p;
  const del = async (mockOpts, body) => {
    const { fetchImpl, calls } = mockFetch(mockOpts);
    const originalFetch = global.fetch;
    global.fetch = fetchImpl;
    try {
      const res = mockRes();
      await handler({ method: "DELETE", headers: AUTH_HEADER, body }, res);
      await flush();
      return { res, calls };
    } finally {
      global.fetch = originalFetch;
    }
  };

  await test("quitar la principal: image = null (solo ese campo), el archivo se conserva", async () => {
    await withEnv(BASE_ENV, async () => {
      const main = U("products/56/main.png");
      const { res, calls } = await del({ existingImage: main, existingImages: [U("products/56/01.webp")] }, { product_id: 56, slot: "main", path: main });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(calls.metadataWrites, [{ product_id: 56, image: null }]);
      assert.equal(calls.storageDeletes.length, 0);
      assert.equal(res.body.image, null);
      assert.deepEqual(res.body.images, [U("products/56/01.webp")]);
    });
  });

  await test("quitar la principal con una URL que no es la actual -> 404 sin escribir nada", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, calls } = await del({ existingImage: U("products/56/main.png") }, { product_id: 56, slot: "main", path: U("products/56/otra.png") });
      assert.equal(res.statusCode, 404);
      assert.equal(calls.metadataWrites.length, 0);
    });
  });

  await test("producto sin imágenes: quitar devuelve 404 y no toca nada", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, calls } = await del({ existingImage: null, existingImages: [] }, { product_id: 56, slot: "main", path: U("products/56/main.png") });
      assert.equal(res.statusCode, 404);
      assert.equal(calls.metadataWrites.length + calls.storageDeletes.length, 0);
    });
  });

  await test("slot inválido -> 400", async () => {
    await withEnv(BASE_ENV, async () => {
      const { res, calls } = await del({}, { product_id: 56, slot: "todo", path: U("products/56/main.png") });
      assert.equal(res.statusCode, 400);
      assert.equal(calls.metadataWrites.length, 0);
    });
  });

  await test("borrar archivo con confirmación expresa: solo si es exclusivo (ni otra ficha ni slide lo usan)", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res, calls } = await del({ existingImages: [target], otherRows: [{ product_id: 99, image: U("products/99/main.png"), images: [] }], slides: [{ id: "s1", image: U("hero/s1/desktop.png") }] }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.file, { deleted: true });
      assert.equal(calls.storageDeletes.length, 1);
      assert.ok(calls.storageDeletes[0].endsWith("products/56/01.webp"));
    });
  });

  await test("archivo compartido con otra ficha: se quita de esta ficha pero el archivo NO se borra", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res, calls } = await del({ existingImages: [target], otherRows: [{ product_id: 99, image: target, images: [] }] }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.file, { deleted: false, reason: "shared" });
      assert.equal(calls.storageDeletes.length, 0);
    });
  });

  await test("archivo usado también como principal de la misma ficha: no se borra", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res, calls } = await del({ existingImage: target, existingImages: [target] }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.deepEqual(res.body.file, { deleted: false, reason: "shared" });
      assert.equal(calls.storageDeletes.length, 0);
    });
  });

  await test("archivo usado por un slide del Hero: no se borra", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res, calls } = await del({ existingImages: [target], slides: [{ id: "s1", image: target }] }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.deepEqual(res.body.file, { deleted: false, reason: "shared" });
      assert.equal(calls.storageDeletes.length, 0);
    });
  });

  await test("archivo de otro producto o externo: nunca se borra", async () => {
    await withEnv(BASE_ENV, async () => {
      for (const target of [U("products/99/01.webp"), "assets/products/brush.svg"]) {
        const { res, calls } = await del({ existingImages: [target] }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.file, { deleted: false, reason: "not_owned" });
        assert.equal(calls.storageDeletes.length, 0);
      }
    });
  });

  await test("si no se puede verificar el uso del archivo, se conserva", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res, calls } = await del({ existingImages: [target], allRowsFail: true }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.deepEqual(res.body.file, { deleted: false, reason: "unverified" });
      assert.equal(calls.storageDeletes.length, 0);
    });
  });

  await test("si Storage rechaza el borrado, se informa (deleted:false) y la imagen igual queda quitada", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { res } = await del({ existingImages: [target], deleteOk: false }, { product_id: 56, slot: "secondary", path: target, deleteFile: true });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.file, { deleted: false, reason: "delete_failed" });
      assert.deepEqual(res.body.images, []);
    });
  });

  await test("fallo al guardar: 502 y no se toca Storage", async () => {
    await withEnv(BASE_ENV, async () => {
      const target = U("products/56/01.webp");
      const { fetchImpl, calls } = mockFetch({ existingImages: [target] });
      const failing = async (url, opts = {}) => (url.includes("/rest/v1/catalog_metadata") && opts.method === "POST" ? { ok: false, status: 500, text: async () => "{}" } : fetchImpl(url, opts));
      const originalFetch = global.fetch;
      global.fetch = failing;
      try {
        const res = mockRes();
        await handler({ method: "DELETE", headers: AUTH_HEADER, body: { product_id: 56, slot: "secondary", path: target, deleteFile: true } }, res);
        assert.equal(res.statusCode, 502);
        assert.equal(calls.storageDeletes.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("quitar sin token -> 401 sin tocar nada", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetch({});
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const res = mockRes();
        await handler({ method: "DELETE", headers: {}, body: { product_id: 56, slot: "main", path: "x" } }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(calls.metadataWrites.length + calls.storageDeletes.length, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
