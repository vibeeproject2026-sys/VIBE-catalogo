// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-taxonomy-v2.js
//
// Fase 53 — taxonomía v2 con subcategorías controladas:
// - js/taxonomy.js y api/_lib/subcategories.js tienen exactamente las
//   mismas listas;
// - PATCH /api/admin/catalog-metadata acepta valores de la lista,
//   conserva un valor histórico sin cambios y rechaza cualquier otro
//   (Fase 54: ya no existe «Otra») sin escribir nada;
// - las notas internas de merchandising nunca llegan a la API pública.

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
  await test("needsClassificationReview marca solo valores fuera de la lista (históricos)", () => {
    assert.equal(t.needsClassificationReview({ editorialCategory: "Rostro", subcategory: "Rubor" }), false);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Rostro", subcategory: null }), false);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Limpieza", subcategory: "Crema Facial" }), true);
    assert.equal(t.needsClassificationReview({ editorialCategory: "Herramientas de aplicación", subcategory: "Pestañas" }), true);
    assert.equal(t.needsClassificationReview({ editorialCategory: null, subcategory: "Algo" }), true);
  });
  await test("Fase 54 — ninguna lista ofrece «Otra»", () => {
    for (const list of Object.values(t.SUBCATEGORIES_BY_CATEGORY)) assert.ok(!list.some((s) => /^otra/i.test(s)), list.join());
  });
  await test("Fase 54 — sugerencia editable para históricos = decisiones ya aprobadas", () => {
    assert.deepEqual(t.suggestClassification("Crema Facial", "Limpieza"), { category: "Tratamiento", subcategory: "Cremas faciales" });
    assert.deepEqual(t.suggestClassification("Set ojos y cejas", "Ojos"), { category: "Ojos", subcategory: "Kits de ojos" });
    assert.deepEqual(t.suggestClassification("Pestañas", "Herramientas de aplicación"), { category: "Herramientas de aplicación", subcategory: "Rizadores de pestañas" });
    assert.equal(t.suggestClassification("Algo raro", null), null);
    assert.equal(t.suggestClassification("", "Ojos"), null);
  });

  console.log("validateClassification (servidor)");
  const v = server.validateClassification;
  await test("vacío o de la lista: válido", () => {
    assert.deepEqual(v({ category: "Ojos", subcategory: "" }), { ok: true });
    assert.deepEqual(v({ category: "Ojos", subcategory: "Kits de ojos" }), { ok: true });
    assert.deepEqual(v({ category: "", subcategory: "" }), { ok: true });
  });
  await test("valor histórico sin cambios: válido aunque no esté en la lista", () => {
    assert.equal(v({ category: "Limpieza", subcategory: "Crema Facial", stored: { category: "Limpieza", subcategory: "Crema Facial" } }).ok, true);
    assert.equal(v({ category: "Tratamiento", subcategory: "Crema Facial", stored: { category: "Limpieza", subcategory: "Crema Facial" } }).ok, true);
    assert.equal(v({ category: "Cosas viejas", subcategory: "", stored: { category: "Cosas viejas" } }).ok, true);
  });
  await test("cualquier otro valor (antes «Otra») se rechaza, con o sin texto adicional", () => {
    assert.equal(v({ category: "Ojos", subcategory: "Fijadores" }).ok, false);
    assert.equal(v({ category: "Ojos", subcategory: "Fijadores", reason: "una justificación larga cualquiera" }).ok, false);
    assert.equal(v({ category: "Inventada", subcategory: "" }).ok, false);
    assert.equal(v({ category: "", subcategory: "Rubor" }).ok, false);
  });

  console.log("PATCH /api/admin/catalog-metadata (Fase 53/54)");
  const base = { product_id: 99, category: "Tratamiento", additional_info: { tone: null } };
  await test("categoría y subcategoría de la lista: se guardan sin leer la fila", async () => {
    const { res, calls, written } = await patchWith({ ...base, subcategory: "Cremas faciales" }, null);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter((c) => c.method === "GET").length, 0);
    assert.equal(written.category, "Tratamiento");
    assert.equal(written.subcategory, "Cremas faciales");
  });
  await test("valor histórico SIN cambios (#99 «Crema Facial»): se conserva y el guardado no se bloquea", async () => {
    const stored = { category: "Limpieza", subcategory: "Crema Facial" };
    const { res, written } = await patchWith({ product_id: 99, category: "Limpieza", subcategory: "Crema Facial", usage: "Modo de uso intacto", additional_info: {} }, stored);
    assert.equal(res.statusCode, 200);
    assert.equal(written.subcategory, "Crema Facial");
    assert.equal(written.usage, "Modo de uso intacto");
  });
  await test("valor fuera de la lista y distinto del guardado: 400 y NADA se escribe", async () => {
    const stored = { category: "Ojos", subcategory: "Set ojos y cejas" };
    const { res, writes } = await patchWith({ product_id: 106, category: "Ojos", subcategory: "Inventada", additional_info: {} }, stored);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Elige una de la lista/);
    assert.equal(writes.length, 0);
  });
  await test("categoría que no es VIBE (y no es la guardada): 400 y nada se escribe", async () => {
    const { res, writes } = await patchWith({ product_id: 5, category: "Inventada", additional_info: {} }, { category: "Labios", subcategory: null });
    assert.equal(res.statusCode, 400);
    assert.equal(writes.length, 0);
  });
  await test("guardado parcial sin clasificación: no valida ni lee nada (otros campos no se ven afectados)", async () => {
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
  await test("las notas internas de merchandising no salen en el producto público", () => {
    const p = shapeProduct({ id: 1, name: "x", price: 1, stock: 1, category: "Labios" }, { additional_info: JSON.stringify({ tone: "Rojo", commercialAngle: "interno", usageOccasion: "interno" }) }, () => "Maquillaje");
    assert.equal(p.tone, "Rojo");
    for (const k of details.INTERNAL_FIELDS) assert.equal(k in p, false, k);
    assert.equal(details.PUBLIC_FIELDS.length + details.INTERNAL_FIELDS.length, details.ALL_FIELDS.length);
  });
  await test("Fase 54 — la justificación de «Otra» ya no es un campo editorial", () => {
    assert.equal(details.ALL_FIELDS.includes("subcategoryOtherReason"), false);
  });

  console.log("Formulario del Admin");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
  await test("la subcategoría es un <select> controlado (ya no texto libre con datalist)", () => {
    assert.match(src, /<select name="subcategory_choice">/);
    assert.doesNotMatch(src, /list="subcategorySuggestions"/);
  });
  await test("Fase 54 — el editor ya no ofrece «Otra» ni pide justificación", () => {
    assert.doesNotMatch(src, /SUB_OTHER|subcategory_other|MIN_OTHER_REASON|subcategoryOtherReason/);
  });
  await test("el valor histórico se ofrece tal cual, se envía sin cambios si no se toca, y hay sugerencia editable", () => {
    assert.match(src, /if \(choice === SUB_HISTORICAL\) return subInitial\.historical;/);
    assert.match(src, /suggestClassification\(subInitial\.historical/);
    assert.match(src, /id="applySuggestion"/);
  });
  await test("una categoría guardada fuera de las 7 aprobadas se conserva en el selector", () => {
    assert.match(src, /if \(selected && !VIBE_CATEGORY_GROUPS\.some\(\(g\) => g\.categories\.includes\(selected\)\)\)/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
