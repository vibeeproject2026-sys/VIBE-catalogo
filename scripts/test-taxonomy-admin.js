// Runs with plain Node, no network, no real credentials:
//   node scripts/test-taxonomy-admin.js
//
// Fase 56 — taxonomía VIBE administrable desde el Admin:
// - reglas de cada acción (planAction): nombres vacíos/duplicados/«Otra»,
//   destino explícito obligatorio al eliminar algo en uso, sin
//   reasignaciones implícitas;
// - handler: revisión (conflictos y lecturas atrasadas), orden de
//   escritura (fichas primero, documento después), solo category/
//   subcategory, protección por token;
// - vista pública ?view=taxonomy y validación del editor contra la
//   taxonomía vigente;
// - js/taxonomy.js applyTaxonomy.
// Supabase/Storage simulados: nada real se lee ni se escribe.

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
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real", ADMIN_API_TOKEN: "admin-test-token" };
const AUTH = { authorization: "Bearer admin-test-token" };

const T = require("../api/_lib/taxonomyStore");
const { planAction } = require("../api/admin/_lib/taxonomyAdmin");

const USAGE = [
  { id: 99, name: "Crema Retinol", category: "Tratamiento", subcategory: "Cremas faciales", published: true },
  { id: 109, name: "Kit rainbow", category: "Labios", subcategory: "Kits de labios", published: true },
  { id: 110, name: "VIBE Lip Duo", category: "Labios", subcategory: "Kits de labios", published: true },
  { id: 106, name: "Set Perfect Lips", category: "Labios", subcategory: "Kits de labios", published: true },
  { id: 122, name: "Liquid Blush", category: "Rostro", subcategory: "Rubor", published: true },
  { id: 7, name: "Histórico", category: "Limpieza", subcategory: "Crema Facial", published: false },
];
const base = () => ({ ...T.defaultTaxonomy(), revision: 3 });
const cat = (tax, name) => tax.groups.flatMap((g) => g.categories).find((c) => c.name === name);

// Simula Storage (config/taxonomy.json) + PostgREST para el handler.
async function withSupabase({ doc = null, docAfterSave = undefined, rowsPatchOk = true, saveOk = true, staleReads = 0 } = {}, fn) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const calls = [];
  let stored = doc;
  let stale = staleReads;
  const originalFetch = global.fetch;
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = (...a) => { if (!String(a[0]).startsWith("[admin/taxonomy]")) originalLog(...a); };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || "GET";
    calls.push({ method, url: u, body: opts.body && typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body ? JSON.parse(Buffer.from(opts.body).toString()) : null });
    if (u.includes("/storage/v1/object/") && u.includes("config/taxonomy.json")) {
      if (method === "GET") {
        if (stale > 0) { stale--; const old = { ...stored, revision: stored.revision - 1 }; const b = Buffer.from(JSON.stringify(old)); return { ok: true, status: 200, arrayBuffer: async () => b }; }
        if (!stored) return { ok: false, status: 404, text: async () => "" };
        const b = Buffer.from(JSON.stringify(stored));
        return { ok: true, status: 200, arrayBuffer: async () => b };
      }
      if (!saveOk) return { ok: false, status: 500, text: async () => "" };
      stored = docAfterSave === undefined ? JSON.parse(Buffer.from(opts.body).toString()) : docAfterSave;
      return { ok: true, status: 200, text: async () => "" };
    }
    if (u.includes("/rest/v1/catalog_metadata") && method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(USAGE.map((p) => ({ product_id: p.id, category: p.category, subcategory: p.subcategory, published: p.published }))) };
    if (u.includes("/rest/v1/products") && method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(USAGE.map((p) => ({ id: p.id, name: p.name }))) };
    if (u.includes("/rest/v1/catalog_metadata") && method === "PATCH") return rowsPatchOk ? { ok: true, status: 204, text: async () => "" } : { ok: false, status: 500, text: async () => "{}" };
    throw new Error("ruta inesperada " + method + " " + u);
  };
  try {
    return await fn({ calls, get stored() { return stored; } });
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    console.log = originalLog;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
async function post(body, headers = AUTH) {
  delete require.cache[require.resolve("../api/admin/products")];
  const handler = require("../api/admin/products");
  const res = mockRes();
  await handler({ method: "POST", headers, query: { resource: "taxonomy" }, body }, res);
  return res;
}

async function main() {
  console.log("Taxonomía por defecto = la de código (js/taxonomy.js y api/_lib/subcategories.js)");
  const tjs = await import("../js/taxonomy.js");
  const server = require("../api/_lib/subcategories");
  await test("DEFAULT_GROUPS coincide exactamente con VIBE_CATEGORY_GROUPS + SUBCATEGORIES_BY_CATEGORY", () => {
    const pub = T.publicTaxonomy(T.defaultTaxonomy());
    assert.deepEqual(pub.groups, tjs.VIBE_CATEGORY_GROUPS.map((g) => ({ group: g.group, categories: g.categories })));
    assert.deepEqual(pub.subcategories, tjs.SUBCATEGORIES_BY_CATEGORY);
    assert.deepEqual(pub.subcategories, server.SUBCATEGORIES_BY_CATEGORY);
  });

  console.log("Reglas de cada acción");
  await test("crear categoría: nombre limpio; rechaza vacío, duplicado (mayúsculas/acentos), «Otra» y grupo inválido", () => {
    const ok = planAction(base(), { action: "addCategory", group: "Maquillaje", name: "  Uñas   y manos " }, USAGE);
    assert.ok(cat(ok.tax, "Uñas y manos"));
    assert.equal(planAction(base(), { action: "addCategory", group: "Maquillaje", name: "   " }, USAGE).fail.status, 400);
    assert.equal(planAction(base(), { action: "addCategory", group: "Skincare", name: "rostro" }, USAGE).fail.status, 409);
    assert.equal(planAction(base(), { action: "addCategory", group: "Skincare", name: "LIMPIÉZA" }, USAGE).fail.status, 409);
    for (const n of ["Otra", "otros", "OTRAS"]) assert.equal(planAction(base(), { action: "addCategory", group: "Skincare", name: n }, USAGE).fail.status, 400, n);
    assert.equal(planAction(base(), { action: "addCategory", group: "Nuevo grupo", name: "X" }, USAGE).fail.status, 400);
    assert.equal(planAction(base(), { action: "addCategory", group: "Skincare", name: "a".repeat(61) }, USAGE).fail.status, 400);
  });
  await test("renombrar categoría: actualiza SOLO la categoría de las fichas que la usan (no las demás)", () => {
    const p = planAction(base(), { action: "renameCategory", name: "Labios", newName: "Labios y boca" }, USAGE);
    assert.ok(cat(p.tax, "Labios y boca") && !cat(p.tax, "Labios"));
    assert.deepEqual(p.changes, [{ ids: [109, 110, 106], fields: { category: "Labios y boca" } }]);
    assert.equal(planAction(base(), { action: "renameCategory", name: "Labios", newName: "Ojos" }, USAGE).fail.status, 409);
    assert.equal(planAction(base(), { action: "renameCategory", name: "No existe", newName: "X" }, USAGE).fail.status, 404);
  });
  await test("cambiar de grupo: mueve la categoría con sus subcategorías y no toca fichas", () => {
    const p = planAction(base(), { action: "setCategoryGroup", name: "Tratamiento", group: "Maquillaje" }, USAGE);
    assert.ok(p.tax.groups.find((g) => g.group === "Maquillaje").categories.some((c) => c.name === "Tratamiento" && c.subcategories.includes("Sérums")));
    assert.ok(!p.tax.groups.find((g) => g.group === "Skincare").categories.some((c) => c.name === "Tratamiento"));
    assert.deepEqual(p.changes, []);
  });
  await test("eliminar categoría en uso SIN destino: 409 con la lista de productos afectados; nada cambia", () => {
    const p = planAction(base(), { action: "deleteCategory", name: "Labios" }, USAGE);
    assert.equal(p.fail.status, 409);
    assert.deepEqual(p.fail.affected.map((x) => x.id), [109, 110, 106]);
  });
  await test("eliminar categoría en uso CON destino explícito: reasigna esas fichas al destino elegido", () => {
    const p = planAction(base(), { action: "deleteCategory", name: "Labios", reassign: { category: "Rostro", subcategory: "Kits de rostro" } }, USAGE);
    assert.ok(!cat(p.tax, "Labios"));
    assert.deepEqual(p.changes, [{ ids: [109, 110, 106], fields: { category: "Rostro", subcategory: "Kits de rostro" } }]);
    assert.equal(planAction(base(), { action: "deleteCategory", name: "Labios", reassign: { category: "Labios" } }, USAGE).fail.status, 400);
    assert.equal(planAction(base(), { action: "deleteCategory", name: "Labios", reassign: { category: "Rostro", subcategory: "Labiales" } }, USAGE).fail.status, 400);
  });
  await test("eliminar categoría sin uso: se quita sin tocar fichas", () => {
    const p = planAction(base(), { action: "deleteCategory", name: "Complementos de belleza" }, USAGE);
    assert.ok(!cat(p.tax, "Complementos de belleza"));
    assert.deepEqual(p.changes, []);
  });
  await test("subcategorías: crear (sin duplicados), renombrar (actualiza fichas), mover (las fichas se mueven con ella)", () => {
    assert.ok(cat(planAction(base(), { action: "addSubcategory", category: "Ojos", name: "Pestañas postizas" }, USAGE).tax, "Ojos").subcategories.includes("Pestañas postizas"));
    assert.equal(planAction(base(), { action: "addSubcategory", category: "Ojos", name: "sombras" }, USAGE).fail.status, 409);
    assert.equal(planAction(base(), { action: "addSubcategory", category: "Ojos", name: "Otra" }, USAGE).fail.status, 400);
    const r = planAction(base(), { action: "renameSubcategory", category: "Labios", name: "Kits de labios", newName: "Sets de labios" }, USAGE);
    assert.deepEqual(r.changes, [{ ids: [109, 110, 106], fields: { subcategory: "Sets de labios" } }]);
    const m = planAction(base(), { action: "moveSubcategory", category: "Rostro", name: "Rubor", toCategory: "Labios" }, USAGE);
    assert.ok(cat(m.tax, "Labios").subcategories.includes("Rubor") && !cat(m.tax, "Rostro").subcategories.includes("Rubor"));
    assert.deepEqual(m.changes, [{ ids: [122], fields: { category: "Labios" } }]);
    assert.equal(planAction(base(), { action: "moveSubcategory", category: "Rostro", name: "Rubor", toCategory: "Rostro" }, USAGE).fail.status, 400);
  });
  await test("eliminar subcategoría en uso: exige destino explícito (otra de la misma categoría o «sin subcategoría»)", () => {
    assert.equal(planAction(base(), { action: "deleteSubcategory", category: "Labios", name: "Kits de labios" }, USAGE).fail.status, 409);
    const none = planAction(base(), { action: "deleteSubcategory", category: "Labios", name: "Kits de labios", reassignTo: "" }, USAGE);
    assert.deepEqual(none.changes, [{ ids: [109, 110, 106], fields: { subcategory: null } }]);
    const to = planAction(base(), { action: "deleteSubcategory", category: "Labios", name: "Kits de labios", reassignTo: "Labiales" }, USAGE);
    assert.deepEqual(to.changes, [{ ids: [109, 110, 106], fields: { subcategory: "Labiales" } }]);
    assert.equal(planAction(base(), { action: "deleteSubcategory", category: "Labios", name: "Kits de labios", reassignTo: "Rubor" }, USAGE).fail.status, 400);
  });
  await test("los valores históricos (fuera de la taxonomía) nunca se tocan", () => {
    const p = planAction(base(), { action: "renameCategory", name: "Limpieza", newName: "Limpieza facial" }, USAGE);
    // #7 tiene Limpieza › «Crema Facial» (histórico): solo cambia su categoría
    // porque la categoría se renombró; su subcategoría histórica queda igual.
    assert.deepEqual(p.changes, [{ ids: [7], fields: { category: "Limpieza facial" } }]);
  });
  await test("acción desconocida: 400", () => {
    assert.equal(planAction(base(), { action: "borrarTodo" }, USAGE).fail.status, 400);
  });

  console.log("Handler /api/admin/products?resource=taxonomy");
  await test("sin token: 401 sin leer ni escribir nada", async () => {
    await withSupabase({ doc: base() }, async ({ calls }) => {
      const res = await post({ action: "addCategory", group: "Maquillaje", name: "Uñas", revision: 3 }, {});
      assert.equal(res.statusCode, 401);
      assert.equal(calls.length, 0);
    });
  });
  await test("POST sin resource=taxonomy sigue siendo 405 (el listado de productos es solo lectura)", async () => {
    await withSupabase({}, async () => {
      delete require.cache[require.resolve("../api/admin/products")];
      const res = mockRes();
      await require("../api/admin/products")({ method: "POST", headers: AUTH, query: {}, body: {} }, res);
      assert.equal(res.statusCode, 405);
    });
  });
  await test("GET devuelve la taxonomía (por defecto si no hay documento) y el uso por producto", async () => {
    await withSupabase({ doc: null }, async () => {
      delete require.cache[require.resolve("../api/admin/products")];
      const res = mockRes();
      await require("../api/admin/products")({ method: "GET", headers: AUTH, query: { resource: "taxonomy" } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.taxonomy.revision, 0);
      assert.equal(res.body.usage.length, USAGE.length);
    });
  });
  await test("renombrar: primero actualiza las fichas (solo category, por product_id), luego guarda el documento con revisión+1", async () => {
    await withSupabase({ doc: base() }, async (ctx) => {
      const res = await post({ action: "renameCategory", name: "Labios", newName: "Labios y boca", revision: 3 });
      assert.equal(res.statusCode, 200);
      const patchIdx = ctx.calls.findIndex((c) => c.method === "PATCH");
      const saveIdx = ctx.calls.findIndex((c) => c.method === "POST" && c.url.includes("config/taxonomy.json"));
      assert.ok(patchIdx > -1 && saveIdx > patchIdx, "fichas antes que el documento");
      const p = ctx.calls[patchIdx];
      assert.match(p.url, /catalog_metadata\?product_id=in\.\(109,110,106\)$/);
      assert.deepEqual(p.body, { category: "Labios y boca" });
      assert.equal(ctx.stored.revision, 4);
      assert.equal(res.body.taxonomy.revision, 4);
      assert.ok(ctx.calls.every((c) => !(c.url.includes("/rest/v1/products") && c.method !== "GET")), "products (POS) nunca se escribe");
    });
  });
  await test("revisión desactualizada (otro cambio guardado antes): 409 y nada se escribe", async () => {
    await withSupabase({ doc: { ...base(), revision: 5 } }, async ({ calls }) => {
      const res = await post({ action: "addCategory", group: "Maquillaje", name: "Uñas", revision: 3 });
      assert.equal(res.statusCode, 409);
      assert.ok(calls.every((c) => c.method === "GET"));
    });
  });
  await test("lectura atrasada de Storage: reintenta y aplica sobre la revisión correcta (nunca sobre la vieja)", async () => {
    await withSupabase({ doc: base(), staleReads: 2 }, async (ctx) => {
      const res = await post({ action: "addSubcategory", category: "Ojos", name: "Pestañas postizas", revision: 3 });
      assert.equal(res.statusCode, 200);
      assert.equal(ctx.stored.revision, 4);
    });
  });
  await test("si falla la actualización de fichas: 502 y el documento NO se guarda", async () => {
    await withSupabase({ doc: base(), rowsPatchOk: false }, async (ctx) => {
      const res = await post({ action: "renameCategory", name: "Labios", newName: "Labios y boca", revision: 3 });
      assert.equal(res.statusCode, 502);
      assert.equal(ctx.stored.revision, 3);
      assert.ok(!ctx.calls.some((c) => c.method === "POST" && c.url.includes("config/taxonomy.json")));
    });
  });
  await test("si falla guardar el documento tras actualizar fichas: 502 avisando que hay que reintentar", async () => {
    await withSupabase({ doc: base(), saveOk: false }, async () => {
      const res = await post({ action: "renameCategory", name: "Labios", newName: "Labios y boca", revision: 3 });
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.productsUpdated, true);
    });
  });
  await test("eliminar en uso sin destino: 409 con afectados y sin escribir", async () => {
    await withSupabase({ doc: base() }, async ({ calls }) => {
      const res = await post({ action: "deleteSubcategory", category: "Rostro", name: "Rubor", revision: 3 });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body.affected.map((p) => p.id), [122]);
      assert.ok(calls.every((c) => c.method === "GET"));
    });
  });
  await test("sin revisión en el cuerpo: 400", async () => {
    await withSupabase({ doc: base() }, async () => {
      const res = await post({ action: "addCategory", group: "Maquillaje", name: "Uñas" });
      assert.equal(res.statusCode, 400);
    });
  });

  console.log("Vista pública y validación del editor");
  await test("GET /api/catalog/categories?view=taxonomy: por defecto sin documento; vigente con documento; inválido → por defecto", async () => {
    const run = async (doc) => withSupabase({ doc }, async () => {
      delete require.cache[require.resolve("../api/catalog/categories")];
      const res = mockRes();
      await require("../api/catalog/categories")({ method: "GET", headers: {}, query: { view: "taxonomy" } }, res);
      return res;
    });
    const def = await run(null);
    assert.equal(def.statusCode, 200);
    assert.deepEqual(def.body.taxonomy.subcategories, tjs.SUBCATEGORIES_BY_CATEGORY);
    const withUnas = base();
    withUnas.groups[0].categories.push({ name: "Uñas", subcategories: ["Esmaltes"] });
    const cur = await run(withUnas);
    assert.deepEqual(cur.body.taxonomy.subcategories["Uñas"], ["Esmaltes"]);
    assert.ok(cur.body.taxonomy.groups[0].categories.includes("Uñas"));
    const bad = await run({ groups: "x" });
    assert.deepEqual(bad.body.taxonomy.subcategories, tjs.SUBCATEGORIES_BY_CATEGORY);
    assert.deepEqual(Object.keys(cur.body.taxonomy).sort(), ["groups", "revision", "subcategories"]);
  });
  await test("el editor acepta una categoría creada en el Admin y rechaza una eliminada (salvo que sea el valor guardado)", async () => {
    const withUnas = base();
    withUnas.groups[0].categories.push({ name: "Uñas", subcategories: ["Esmaltes"] });
    withUnas.groups[0].categories = withUnas.groups[0].categories.filter((c) => c.name !== "Ojos");
    await withSupabase({ doc: withUnas }, async ({ calls }) => {
      delete require.cache[require.resolve("../api/admin/catalog-metadata")];
      const h = require("../api/admin/catalog-metadata");
      const writes = () => calls.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/catalog_metadata"));
      global.fetch = ((orig) => async (url, opts = {}) => (String(url).includes("/rest/v1/catalog_metadata") && opts.method === "POST" ? (calls.push({ method: "POST", url: String(url) }), { ok: true, status: 201, text: async () => JSON.stringify([JSON.parse(opts.body)]) }) : orig(url, opts)))(global.fetch);
      let res = mockRes();
      await h({ method: "PATCH", headers: AUTH, query: {}, body: { product_id: 5, category: "Uñas", subcategory: "Esmaltes" } }, res);
      assert.equal(res.statusCode, 200);
      res = mockRes();
      await h({ method: "PATCH", headers: AUTH, query: {}, body: { product_id: 5, category: "Ojos", subcategory: "Sombras" } }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(writes().length, 1);
    });
  });

  // Fase 57 — ordenar categorías (dentro del grupo) y subcategorías (dentro
  // de la categoría): solo cambia el orden del documento, ningún producto.
  console.log("Orden (Fase 57)");
  await test("subir/bajar una categoría dentro de su grupo, sin cambios en productos", () => {
    const before = base().groups.find((g) => g.group === "Maquillaje").categories.map((c) => c.name);
    const p = planAction(base(), { action: "reorderCategory", name: before[1], direction: -1 }, USAGE);
    const after = p.tax.groups.find((g) => g.group === "Maquillaje").categories.map((c) => c.name);
    assert.deepEqual(after, [before[1], before[0], ...before.slice(2)]);
    assert.deepEqual([p.changes, p.affected], [[], []]);
  });
  await test("subir/bajar una subcategoría dentro de su categoría", () => {
    const subs = base().groups[0].categories[0].subcategories;
    const catName = base().groups[0].categories[0].name;
    const p = planAction(base(), { action: "reorderSubcategory", category: catName, name: subs[0], direction: 1 }, USAGE);
    assert.deepEqual(p.tax.groups[0].categories[0].subcategories.slice(0, 2), [subs[1], subs[0]]);
    assert.deepEqual(p.changes, []);
  });
  await test("orden: extremos, dirección inválida e inexistentes se rechazan sin cambiar nada", () => {
    const first = base().groups[0].categories[0];
    assert.equal(planAction(base(), { action: "reorderCategory", name: first.name, direction: -1 }, USAGE).fail.status, 400);
    assert.equal(planAction(base(), { action: "reorderCategory", name: first.name, direction: 2 }, USAGE).fail.status, 400);
    assert.equal(planAction(base(), { action: "reorderCategory", name: "Inexistente", direction: 1 }, USAGE).fail.status, 404);
    assert.equal(planAction(base(), { action: "reorderSubcategory", category: first.name, name: "Inexistente", direction: 1 }, USAGE).fail.status, 404);
    const last = first.subcategories[first.subcategories.length - 1];
    assert.equal(planAction(base(), { action: "reorderSubcategory", category: first.name, name: last, direction: 1 }, USAGE).fail.status, 400);
  });

  console.log("js/taxonomy.js — applyTaxonomy");
  await test("aplica la taxonomía vigente a listas, selectores y navegación (grupo de una categoría nueva)", () => {
    const pub = T.publicTaxonomy(base());
    pub.groups[0].categories.push("Uñas");
    pub.subcategories["Uñas"] = ["Esmaltes"];
    assert.equal(tjs.applyTaxonomy(pub), true);
    assert.ok(tjs.VIBE_CATEGORY_GROUPS[0].categories.includes("Uñas"));
    assert.deepEqual(tjs.SUBCATEGORIES_BY_CATEGORY["Uñas"], ["Esmaltes"]);
    assert.equal(tjs.publicPlacement({ category: "Otro", categoryGroup: "Accesorios", editorialCategory: "Uñas" }).group, "Maquillaje");
    assert.equal(tjs.isListedSubcategory("Uñas", "Esmaltes"), true);
    // vuelve a la de código para no afectar otras pruebas
    assert.equal(tjs.applyTaxonomy(T.publicTaxonomy(T.defaultTaxonomy())), true);
    assert.equal(tjs.SUBCATEGORIES_BY_CATEGORY["Uñas"], undefined);
  });
  await test("una forma inválida se ignora y se conserva la taxonomía actual", () => {
    const before = JSON.stringify(tjs.SUBCATEGORIES_BY_CATEGORY);
    for (const bad of [null, {}, { groups: [] , subcategories: {} }, { groups: [{ group: "Inventado", categories: [] }], subcategories: {} }]) assert.equal(tjs.applyTaxonomy(bad), false);
    assert.equal(JSON.stringify(tjs.SUBCATEGORIES_BY_CATEGORY), before);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
