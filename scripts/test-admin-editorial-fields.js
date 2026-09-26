// Runs with plain Node, no network, no real credentials:
//   node scripts/test-admin-editorial-fields.js
//
// Fase 22B — ficha editorial manual: verifies every field of the new
// admin form can be saved independently and can be left empty.
// Complements (does not duplicate) the auth/whitelist tests already in
// test-admin-handlers.js and test-admin-lib.js.
//
// additional_info se prueba por separado más abajo (sección propia):
// desde la Fase 34 dejó de ser una nota de texto libre y pasó a ser un
// objeto JSON estructurado (~40 campos editoriales granulares, ver
// api/_lib/editorialDetails.js) — el handler lo serializa/parsea, así
// que no encaja en el loop genérico de "un valor -> se guarda tal cual"
// que usan el resto de los campos.

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

// Every field the new admin form can save, with a representative value —
// used to test each one independently ("solo este campo llega a
// Supabase, nada más") and then again with every value empty/null.
const FIELD_SAMPLES = {
  short_description: "Set de brochas suaves para el rostro.",
  description: "Descripción larga de prueba, escrita manualmente.",
  benefits: ["Suave con la piel", "Fácil de limpiar"],
  ingredients: "Fibra sintética, mango de bambú.",
  usage: "Aplicar con movimientos circulares.",
  presentation: "Set de 5 unidades.",
  brand: "VIBE",
  category: "Rostro",
  subcategory: "Base y corrector",
  search_keywords: ["brocha", "maquillaje", "rostro"],
  badge: "NUEVO",
  featured: true,
  editorial_order: 3,
  published: true,
};

function mockFetchCapture() {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    if (url.includes("/rest/v1/catalog_metadata") && (opts.method || "GET") === "POST") {
      const body = JSON.parse(opts.body);
      calls.push(body);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ product_id: body.product_id, ...body }]) };
    }
    throw new Error("URL inesperada en el mock: " + url);
  };
  return { fetchImpl, calls };
}

async function main() {
  const catalogMetadataHandler = require("../api/admin/catalog-metadata");

  console.log("cada campo editorial se guarda de forma independiente");

  for (const [field, value] of Object.entries(FIELD_SAMPLES)) {
    await test(`PATCH con solo '${field}' -> únicamente product_id + ${field} llegan a Supabase`, async () => {
      await withEnv(BASE_ENV, async () => {
        const { fetchImpl, calls } = mockFetchCapture();
        const originalFetch = global.fetch;
        global.fetch = fetchImpl;
        try {
          const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 56, [field]: value } };
          const res = mockRes();
          await catalogMetadataHandler(req, res);
          assert.equal(res.statusCode, 200);
          assert.equal(calls.length, 1);
          assert.deepEqual(Object.keys(calls[0]).sort(), ["product_id", field].sort());
          assert.deepEqual(calls[0][field], value);
        } finally {
          global.fetch = originalFetch;
        }
      });
    });
  }

  console.log("\ncada campo puede quedar vacío/null sin error");

  for (const field of Object.keys(FIELD_SAMPLES)) {
    const emptyValue = field === "benefits" || field === "search_keywords" ? [] : field === "featured" || field === "published" ? false : null;
    await test(`PATCH con '${field}' vacío -> 200, se guarda tal cual (sin inventar un valor)`, async () => {
      await withEnv(BASE_ENV, async () => {
        const { fetchImpl, calls } = mockFetchCapture();
        const originalFetch = global.fetch;
        global.fetch = fetchImpl;
        try {
          const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 56, [field]: emptyValue } };
          const res = mockRes();
          await catalogMetadataHandler(req, res);
          assert.equal(res.statusCode, 200);
          assert.deepEqual(calls[0][field], emptyValue);
        } finally {
          global.fetch = originalFetch;
        }
      });
    });
  }

  console.log("\nadditional_info (Fase 34 — ~40 campos editoriales granulares, JSON estructurado)");

  await test("PATCH con additional_info como objeto se serializa a JSON antes de llegar a Supabase", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetchCapture();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const details = { tone: "Rosa nude", finish: "Mate", crueltyFree: "Sí", claims: ["Cruelty-free", "Vegano"] };
        const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 56, additional_info: details } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(typeof calls[0].additional_info, "string"); // guardado como JSON en la columna text existente
        const stored = JSON.parse(calls[0].additional_info);
        assert.equal(stored.tone, "Rosa nude");
        assert.equal(stored.finish, "Mate");
        assert.deepEqual(stored.claims, ["Cruelty-free", "Vegano"]);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("additional_info se guarda y se puede volver a leer (GET) como el mismo objeto estructurado", async () => {
    await withEnv(BASE_ENV, async () => {
      const storedJson = JSON.stringify({ tone: "Coral", texture: "Ligera" });
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes("/rest/v1/products")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 56, name: "Makeup Brush Set", price: 18000, stock: 3, category: "Otro" }]) };
        }
        if (url.includes("/rest/v1/catalog_metadata")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ product_id: 56, additional_info: storedJson, published: true }]) };
        }
        throw new Error("URL inesperada: " + url);
      };
      try {
        const req = { method: "GET", headers: AUTH, query: { product_id: "56" } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.metadata.additional_info.tone, "Coral");
        assert.equal(res.body.metadata.additional_info.texture, "Ligera");
        // El resto de los ~40 campos vienen en null/[] , nunca undefined —
        // el Admin puede poblar el formulario completo sin checks extra.
        assert.equal(res.body.metadata.additional_info.commercialName, null);
        assert.deepEqual(res.body.metadata.additional_info.claims, []);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("additional_info vacío (sin ningún campo real) se guarda como null, nunca como un JSON de puros vacíos", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetchCapture();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = { method: "PATCH", headers: AUTH, query: {}, body: { product_id: 56, additional_info: { tone: "" } } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(calls[0].additional_info, null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  await test("un valor no-JSON heredado de antes de la Fase 34 (nota de texto libre) se lee como vacío, nunca rompe el GET", async () => {
    await withEnv(BASE_ENV, async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (url.includes("/rest/v1/products")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 56, name: "X", price: 1, stock: 1, category: "Otro" }]) };
        }
        if (url.includes("/rest/v1/catalog_metadata")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ product_id: 56, additional_info: "una nota vieja en texto libre", published: true }]) };
        }
        throw new Error("URL inesperada: " + url);
      };
      try {
        const req = { method: "GET", headers: AUTH, query: { product_id: "56" } };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.metadata.additional_info.tone, null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\ncampos POS: rechazados incluso mezclados con campos editoriales legítimos");

  await test("id/name/price/stock nunca llegan a Supabase, aunque vayan junto a category/badge/published legítimos", async () => {
    await withEnv(BASE_ENV, async () => {
      const { fetchImpl, calls } = mockFetchCapture();
      const originalFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        const req = {
          method: "PATCH",
          headers: AUTH,
          query: {},
          body: {
            product_id: 56,
            id: 999999,
            name: "Nombre falso",
            price: 1,
            stock: 999,
            category: "Rostro", // editorial legítimo, catalog_metadata.category
            badge: "NUEVO",
            published: true,
          },
        };
        const res = mockRes();
        await catalogMetadataHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(calls[0].product_id, 56); // viene del propio handler (Number(body.product_id)), no del body arbitrario
        assert.equal(calls[0].category, "Rostro");
        for (const forbidden of ["id", "name", "price", "stock"]) {
          assert.ok(!(forbidden in calls[0]), `campo del POS llegó a Supabase: ${forbidden}`);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  console.log("\napi pública (Fase 34): el blob crudo nunca se expone, sus campos sanitizados sí");

  await test("shapeProduct nunca incluye una clave literal 'additional_info' en la salida pública", () => {
    const { shapeProduct } = require("../api/catalog/_lib/merge");
    const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");
    const product = { id: 1, name: "X", price: 100, stock: 1, category: "Otro" };
    const metadata = { published: true, additional_info: JSON.stringify({ tone: "Coral" }), category: "Rostro" };
    const shaped = shapeProduct(product, metadata, resolveCategoryGroup);
    assert.equal("additional_info" in shaped, false);
    assert.equal(shaped.editorialCategory, "Rostro");
  });

  await test("los campos estructurados y sanitizados de additional_info sí llegan aplanados a la salida pública", () => {
    const { shapeProduct } = require("../api/catalog/_lib/merge");
    const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");
    const product = { id: 1, name: "X", price: 100, stock: 1, category: "Otro" };
    const metadata = { published: true, additional_info: JSON.stringify({ tone: "Coral", finish: "Mate", claims: ["Vegano"] }) };
    const shaped = shapeProduct(product, metadata, resolveCategoryGroup);
    assert.equal(shaped.tone, "Coral");
    assert.equal(shaped.finish, "Mate");
    assert.deepEqual(shaped.claims, ["Vegano"]);
  });

  await test("un valor no-JSON heredado (nota de texto libre pre-Fase 34) nunca se filtra a la salida pública", () => {
    const { shapeProduct } = require("../api/catalog/_lib/merge");
    const { resolveCategoryGroup } = require("../api/catalog/_lib/categoryGroups");
    const product = { id: 1, name: "X", price: 100, stock: 1, category: "Otro" };
    const metadata = { published: true, additional_info: "nota interna secreta de prueba" };
    const shaped = shapeProduct(product, metadata, resolveCategoryGroup);
    assert.equal(shaped.tone, null);
    assert.equal(JSON.stringify(shaped).includes("secreta"), false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
