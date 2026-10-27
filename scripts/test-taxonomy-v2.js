// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-taxonomy-v2.js
//
// Fase 53 — taxonomía v2 con subcategorías controladas:
// - js/taxonomy.js y api/_lib/subcategories.js tienen exactamente las
//   mismas listas;
// - PATCH /api/admin/catalog-metadata acepta una subcategoría de la
//   lista, conserva un valor histórico sin cambios, exige justificación
//   para «Otra» y no escribe nada cuando rechaza;
// - la justificación (y las notas internas de merchandising) nunca
//   llegan a la API pública.

const assert = require("assert/strict");

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

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

// Mock de Supabase: `stored` es la fila actual de catalog_metadata (o
// null). Registra lecturas y escrituras.
async function patchWith(body, stored, { failRead = false } = {}) {
  const calls = [];
  const originalFetch = global.fetch;
  const originalError = console.error;
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, admin: process.env.ADMIN_API_TOKEN };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
  process.env.ADMIN_API_TOKEN = "admin-test-token";
  console.error = () => {};
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ method, url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    if (method === "GET") {
      if (failRead) return { ok: false, status: 500, text: async () => "{}" };
      return { ok: true, status: 200, text: async () => JSON.stringify(stored ? [stored] : []) };
    }
    return { ok: true, status: 201, text: async () => JSON.stringify([JSON.parse(opts.body)]) };
  };
  const res = mockRes();
  try {
    const handler = require("../api/admin/catalog-metadata");
    await handler({ method: "PATCH", headers: { authorization: "Bearer admin-test-token" }, query: {}, body }, res);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    for (const [k, v] of Object.entries({ SUPABASE_URL: saved.url, SUPABASE_SERVICE_ROLE_KEY: saved.key, ADMIN_API_TOKEN: saved.admin })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const writes = calls.filter((c) => c.method !== "GET");
  return { res, calls, writes, written: writes[0] ? writes[0].body : null };
}

async function main() {
  const t = await import("../js/taxonomy.js");
  const server = require("../api/_lib/subcategories");

  console.log("Listas v2");
  await test("navegador y servidor tienen exactamente las mismas subcategorías", () => {
    assert.deepEqual(t.SUBCATEGORIES_BY_CATEGORY, server.SUBCATEGORIES_BY_CATEGORY);
  });
  await test("v2: altas y renombres aprobados; grupos y categorías sin cambios", () => {
    const S = t.SUBCATEGORIES_BY_CATEGORY;
    assert.ok(S.Rostro.includes("Kits de rostro"));
    assert.ok(S.Tratamiento.includes("Sérums"));
    assert.ok(S["Herramientas de aplicación"].includes("Rizadores de pestañas"));
    assert.ok(S.Ojos.includes("Máscara de pestañas") && !S.Ojos.includes("Pestañas"));
    assert.ok(S.Tratamiento.includes("Pestañas y cejas (crecimiento)") && !S.Tratamiento.includes("Pestañas (crecimiento)"));
    assert.ok(S.Ojos.includes("Kits de ojos") && S.Tratamiento.includes("Cremas faciales") && S.Rostro.includes("Rubor"));
    assert.deepEqual(t.VIBE_CATEGORY_GROUPS.map((g) => g.group), ["Maquillaje", "Skincare", "Accesorios"]);
    assert.deepEqual(Object.keys(S).sort(), t.VIBE_CATEGORY_GROUPS.flatMap((g) => g.categories).sort());
  });
  await test("isListedSubcategory depende de la categoría", () => {
    assert.equal(t.isListedSubcategory("Herramientas de aplicación", "Rizadores de pestañas"), true);
    assert.equal(t.isListedSubcategory("Ojos", "Rizadores de pestañas"), false);
    assert.equal(t.isListedSubcategory(null, "Rubor"), false);
  });
  await test("needsClassificationReview marca solo valores fuera de la lista (histórico u «Otra»)", () => {
    assert.equal(t.needsClassificationReview({ editorialCategory: "Rostro", subcategory: "Rubor" }), false);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Rostro", subcategory: null }), false);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Limpieza", subcategory: "Crema Facial" }), true);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Herramientas de aplicación", subcategory: "Pestañas" }), true);
    assert.equal(t.needsClassificationReview({ editorialCategory: null, subcategory: "Algo" }), true);
  });

  console.log("validateSubcategory (servidor)");
  const v = server.validateSubcategory;
  await test("vacío o de la lista: válido", () => {
    assert.deepEqual(v({ category: "Ojos", subcategory: "" }), { ok: true, other: false });
    assert.deepEqual(v({ category: "Ojos", subcategory: "Kits de ojos" }), { ok: true, other: false });
  });
  await test("valor histórico sin cambios: válido aunque no esté en la lista y sin justificación", () => {
    assert.equal(v({ category: "Limpieza", subcategory: "Crema Facial", storedSubcategory: "Crema Facial" }).ok, true);
  });
  await test("«Otra» sin justificación (o demasiado corta): rechazada", () => {
    assert.equal(v({ category: "Ojos", subcategory: "Fijadores" }).ok, false);
    assert.equal(v({ category: "Ojos", subcategory: "Fijadores", reason: "corta" }).ok, false);
  });
  await test("«Otra» con justificación suficiente: válida y marcada como otra", () => {
    assert.deepEqual(v({ category: "Ojos", subcategory: "Fijadores", reason: "No encaja en ninguna de la lista" }), { ok: true, other: true });
  });

  console.log("PATCH /api/admin/catalog-metadata (Fase 53)");
  const base = { product_id: 99, category: "Tratamiento", additional_info: { tone: null } };
  await test("subcategoría de la lista: se guarda sin leer la fila y limpia una justificación vieja", async () => {
    const { res, calls, written } = await patchWith({ ...base, subcategory: "Cremas faciales", additional_info: { subcategoryOtherReason: "antes era otra cosa" } }, null);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter((c) => c.method === "GET").length, 0);
    assert.equal(written.subcategory, "Cremas faciales");
    assert.equal(written.additional_info, null);
  });
  await test("valor histórico SIN cambios (#99 «Crema Facial»): se conserva y el guardado no se bloquea", async () => {
    const stored = { category: "Limpieza", subcategory: "Crema Facial", additional_info: null };
    const { res, written } = await patchWith({ product_id: 99, category: "Limpieza", subcategory: "Crema Facial", usage: "Modo de uso intacto", additional_info: {} }, stored);
    assert.equal(res.statusCode, 200);
    assert.equal(written.subcategory, "Crema Facial");
    assert.equal(written.usage, "Modo de uso intacto");
  });
  await test("valor fuera de la lista y distinto del guardado, sin justificación: 400 y NADA se escribe", async () => {
    const stored = { category: "Ojos", subcategory: "Set ojos y cejas", additional_info: null };
    const { res, writes } = await patchWith({ product_id: 106, category: "Ojos", subcategory: "Inventada", additional_info: {} }, stored);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Otra/);
    assert.equal(writes.length, 0);
  });
  await test("«Otra» con justificación: se guarda, con la justificación dentro de additional_info", async () => {
    const reason = "Producto sin equivalente en la lista actual";
    const { res, written } = await patchWith({ product_id: 5, category: "Ojos", subcategory: "Fijadores", additional_info: { subcategoryOtherReason: reason } }, { category: "Ojos", subcategory: null, additional_info: null });
    assert.equal(res.statusCode, 200);
    assert.equal(written.subcategory, "Fijadores");
    assert.equal(JSON.parse(written.additional_info).subcategoryOtherReason, reason);
  });
  await test("guardado parcial sin subcategory: no valida ni lee nada (otros campos no se ven afectados)", async () => {
    const { res, calls } = await patchWith({ product_id: 5, published: true }, null);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter((c) => c.method === "GET").length, 0);
  });
  await test("si no se puede leer la fila para validar: 502 y nada se escribe", async () => {
    const { res, writes } = await patchWith({ product_id: 5, category: "Ojos", subcategory: "Rara", additional_info: {} }, null, { failRead: true });
    assert.equal(res.statusCode, 502);
    assert.equal(writes.length, 0);
  });

  console.log("Notas internas fuera de la API pública");
  const { shapeProduct } = require("../api/catalog/_lib/merge");
  const details = require("../api/_lib/editorialDetails");
  await test("la justificación y las notas de merchandising no salen en el producto público", () => {
    const p = shapeProduct({ id: 1, name: "x", price: 1, stock: 1, category: "Labios" }, { additional_info: JSON.stringify({ tone: "Rojo", commercialAngle: "interno", usageOccasion: "interno", subcategoryOtherReason: "interna larga" }) }, () => "Maquillaje");
    assert.equal(p.tone, "Rojo");
    for (const k of details.INTERNAL_FIELDS) assert.equal(k in p, false, k);
  });
  await test("el Admin sí recibe la justificación guardada (parseDetails completo)", () => {
    assert.equal(details.parseDetails(JSON.stringify({ subcategoryOtherReason: "interna larga" })).subcategoryOtherReason, "interna larga");
    assert.deepEqual(details.PUBLIC_FIELDS.length + details.INTERNAL_FIELDS.length, details.ALL_FIELDS.length);
  });

  console.log("Formulario del Admin");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
  await test("la subcategoría es un <select> controlado (ya no texto libre con datalist)", () => {
    assert.match(src, /<select name="subcategory_choice">/);
    assert.doesNotMatch(src, /list="subcategorySuggestions"/);
  });
  await test("«Otra» exige nombre y justificación antes de enviar", () => {
    assert.match(src, /isOther && \(!fd\.subcategory_other\.trim\(\) \|\| fd\.subcategory_other_reason\.trim\(\)\.length < MIN_OTHER_REASON\)/);
    assert.equal(server.MIN_REASON_LENGTH, Number(src.match(/const MIN_OTHER_REASON = (\d+);/)[1]));
  });
  await test("el valor histórico se ofrece tal cual y se envía sin cambios si no se toca", () => {
    assert.match(src, /if \(choice === SUB_HISTORICAL\) return subInitial\.historical;/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
