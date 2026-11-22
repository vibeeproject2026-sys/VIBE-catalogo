// Runs with plain Node, no network, no real credentials:
//   node scripts/test-merchandising.mjs
//
// Organización comercial: grupos administrables, colecciones, etiquetas,
// vitrinas (Novedades, Más elegidos, Colecciones, Descubre), ranking por
// unidades vendidas (ventas del POS en solo lectura) y endpoints.

import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = require("../api/_lib/merchandising");
const B = require("../api/_lib/bestsellers");
const T = require("../api/_lib/taxonomyStore");
const { planAction } = require("../api/admin/_lib/taxonomyAdmin");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-merch-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["showcases.js", "taxonomy.js", "products.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));
const S = await import(pathToFileURL(path.join(tmp, "showcases.js")).href);
const tjs = await import(pathToFileURL(path.join(tmp, "taxonomy.js")).href);

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

console.log("Fase 1 — grupos, categorías y clasificación");
await test("6 grupos iniciales en su orden; «Accesorios» guardado se lee como «Accesorios beauty» con sus categorías", () => {
  assert.deepEqual(T.defaultTaxonomy().groups.map((g) => g.group), T.INITIAL_GROUPS);
  const legacy = T.sanitizeTaxonomy({ revision: 7, groups: [
    { group: "Maquillaje", categories: [{ name: "Rostro", subcategories: ["Rubor"] }] },
    { group: "Skincare", categories: [] },
    { group: "Accesorios", categories: [{ name: "Herramientas de aplicación", subcategories: ["Brochas"] }] },
  ] });
  assert.deepEqual(legacy.groups.map((g) => g.group), T.INITIAL_GROUPS);
  assert.deepEqual(legacy.groups[3].categories.map((c) => c.name), ["Herramientas de aplicación"]);
  assert.equal(legacy.revision, 7);
});
await test("grupos administrables: crear, renombrar, ordenar, activar/desactivar; sin duplicados ni nombres inválidos", () => {
  const base = T.defaultTaxonomy();
  const add = planAction(base, { action: "addGroup", name: " Uñas  y manos " }, []);
  assert.equal(add.tax.groups.at(-1).group, "Uñas y manos");
  assert.equal(planAction(base, { action: "addGroup", name: "skincare" }, []).fail.status, 409);
  assert.equal(planAction(base, { action: "addGroup", name: "Otro" }, []).fail.status, 400);
  const ren = planAction(base, { action: "renameGroup", group: "Sets y regalos", newName: "Sets & regalos" }, []);
  assert.ok(ren.tax.groups.some((g) => g.group === "Sets & regalos"));
  const up = planAction(base, { action: "reorderGroup", group: "Skincare", direction: -1 }, []);
  assert.deepEqual(up.tax.groups.slice(0, 2).map((g) => g.group), ["Skincare", "Maquillaje"]);
  const off = planAction(base, { action: "setGroupActive", group: "Skincare", active: false }, []);
  assert.equal(off.tax.groups.find((g) => g.group === "Skincare").active, false);
  const catOff = planAction(base, { action: "setCategoryActive", name: "Ojos", active: false }, []);
  assert.equal(catOff.tax.groups[0].categories.find((c) => c.name === "Ojos").active, false);
  assert.deepEqual([add.changes, ren.changes, up.changes, off.changes, catOff.changes], [[], [], [], [], []], "ningún producto cambia");
});
await test("protección: un grupo con categorías no se elimina; uno vacío sí; una categoría en uso pide destino", () => {
  const base = T.defaultTaxonomy();
  assert.equal(planAction(base, { action: "deleteGroup", group: "Maquillaje" }, []).fail.status, 409);
  const del = planAction(base, { action: "deleteGroup", group: "Cuidado personal" }, []);
  assert.ok(!del.tax.groups.some((g) => g.group === "Cuidado personal"));
  const inUse = planAction(base, { action: "deleteCategory", name: "Rostro" }, [{ id: 1, category: "Rostro", subcategory: null }]);
  assert.equal(inUse.fail.status, 409);
});
await test("tienda: grupos en el orden del Admin; desactivados fuera de la navegación pero sus productos siguen visibles; enlaces viejos «Accesorios»", () => {
  const tax = T.defaultTaxonomy();
  tax.groups.find((g) => g.group === "Skincare").active = false;
  tax.groups[0].categories.find((c) => c.name === "Ojos").active = false;
  assert.equal(tjs.applyTaxonomy(T.publicTaxonomy(tax)), true);
  const products = [
    { id: 1, name: "a", category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Ojos" },
    { id: 2, name: "b", category: "Skincare", categoryGroup: "Skincare", editorialCategory: "Limpieza" },
    { id: 3, name: "c", category: "Otro", categoryGroup: "Accesorios", editorialCategory: "Herramientas de aplicación" },
  ];
  assert.deepEqual(tjs.getGroups(products), ["Maquillaje", "Accesorios beauty"]);
  assert.deepEqual(tjs.getCategoriesInGroup(products, "Maquillaje"), []);
  assert.deepEqual(tjs.filterProducts(products, {}).map((p) => p.id), [1, 2, 3]);
  assert.equal(tjs.normalizeSelection(products, { group: "Accesorios" }).group, "Accesorios beauty");
  assert.equal(tjs.normalizeSelection(products, { group: "Skincare" }).group, "Todos");
  tjs.applyTaxonomy(T.publicTaxonomy(T.defaultTaxonomy()));
});

console.log("Modelo comercial (config/merchandising.json)");
await test("por defecto: sin colecciones ni etiquetas; Novedades SIN fecha de lanzamiento; 30 días; orden recomendado", () => {
  const d = M.defaultMerchandising();
  assert.deepEqual([d.collections, d.tags, d.assignments], [[], [], {}]);
  assert.equal(d.showcases.novedades.launchDate, null);
  assert.deepEqual([d.showcases.novedades.windowDays, d.showcases.masElegidos.periodDays], [30, 30]);
  assert.deepEqual(d.showcases.order, ["hero", "novedades", "masElegidos", "catalogo", "colecciones", "ofertas", "descubre"]);
});
await test("saneado: nombres únicos, ids estables, asignaciones solo a colecciones/etiquetas existentes, límites y fechas válidos, sin HTML", () => {
  const d = M.sanitizeMerchandising({
    collections: [{ id: "navidad-2026", name: "Navidad 2026", startsAt: "2026-12-01", endsAt: "no-fecha" }, { name: "navidad 2026" }, { name: "<b>Favoritos</b> VIBE" }],
    tags: [{ name: "Nuevo" }, { name: "" }],
    assignments: { 5: { collections: ["navidad-2026", "inventada"], tags: ["nuevo"] }, abc: { collections: ["navidad-2026"] }, 7: { collections: [], tags: [] } },
    showcases: { order: ["ofertas", "x"], novedades: { limit: 999, windowDays: 0, launchDate: "2026-02-30x", pinned: [3, 3, "4", -1], excluded: [3, 9] }, masElegidos: { pinned: [{ productId: 8, position: 2 }, { productId: 8, position: 1 }], excluded: [8, 11] }, descubre: { picks: [{ type: "collection", value: "inventada" }, { type: "tag", value: "nuevo", title: "Lo nuevo" }, { type: "otro", value: "x" }] } },
  });
  assert.deepEqual(d.collections.map((c) => [c.id, c.name, c.startsAt, c.endsAt]), [["navidad-2026", "Navidad 2026", "2026-12-01", null], ["bfavoritos-b-vibe", "bFavoritos/b VIBE", null, null]]);
  assert.deepEqual(d.tags.map((t) => t.id), ["nuevo"]);
  assert.deepEqual(d.assignments, { 5: { collections: ["navidad-2026"], tags: ["nuevo"] } });
  assert.deepEqual(d.showcases.order.slice(0, 2), ["ofertas", "hero"]);
  assert.equal(d.showcases.order.length, 7);
  const n = d.showcases.novedades;
  assert.deepEqual([n.limit, n.windowDays, n.launchDate, n.pinned, n.excluded], [10, 30, null, [3, 4], [9]]);
  const m = d.showcases.masElegidos;
  assert.deepEqual([m.pinned, m.excluded], [[{ productId: 8, position: 2 }], [11]]);
  assert.deepEqual(d.showcases.descubre.picks, [{ type: "tag", value: "nuevo", title: "Lo nuevo" }]);
});
await test("tienda: solo colecciones activas y vigentes (programación) y etiquetas activas", () => {
  const d = M.sanitizeMerchandising({ collections: [{ name: "Navidad", startsAt: "2026-12-01", endsAt: "2026-12-31" }, { name: "Favoritos" }, { name: "Vieja", active: false }], tags: [{ name: "Regalo" }, { name: "Temporada", active: false }], assignments: { 1: { collections: ["navidad", "favoritos", "vieja"], tags: ["regalo", "temporada"] } } });
  const nov = M.publicMerchandising(d, new Date("2026-11-22T15:00:00Z"));
  assert.deepEqual(nov.collections.map((c) => c.id), ["favoritos"]);
  assert.deepEqual(nov.tags.map((t) => t.id), ["regalo"]);
  assert.deepEqual(nov.assignments, { 1: { collections: ["favoritos"], tags: ["regalo"] } });
  const dic = M.publicMerchandising(d, new Date("2026-12-10T15:00:00Z"));
  assert.deepEqual(dic.collections.map((c) => c.id), ["navidad", "favoritos"]);
});
await test("Novedades: sin fecha de lanzamiento no entra nada automático; con fecha (de prueba), solo lo publicado desde ese día y dentro de la permanencia", () => {
  const now = new Date("2026-12-20T12:00:00Z");
  const rows = [
    { product_id: 1, published: true, created_at: "2026-11-15T10:00:00Z" },
    { product_id: 2, published: true, created_at: "2026-12-02T10:00:00Z" },
    { product_id: 3, published: true, created_at: "2026-12-18T10:00:00Z" },
    { product_id: 4, published: false, created_at: "2026-12-19T10:00:00Z" },
  ];
  assert.deepEqual(M.computeNewArrivals(rows, { launchDate: null, windowDays: 30 }, now), []);
  assert.deepEqual(M.computeNewArrivals(rows, { launchDate: "2026-12-01", windowDays: 30 }, now), [3, 2]);
  assert.deepEqual(M.computeNewArrivals(rows, { launchDate: "2026-12-01", windowDays: 10 }, now), [3]);
});

console.log("Más elegidos — unidades vendidas (ventas del POS, solo lectura)");
const SALES = [
  { id: 1, date: "2026-11-18", status: "active", paid: true, voided_at: null, items: JSON.stringify([{ productId: 80, qty: 1 }, { productId: 76, qty: 2 }]) },
  { id: 2, date: "2026-11-19", status: "active", paid: true, voided_at: null, items: [{ productId: 80, qty: 3 }] },
  { id: 2, date: "2026-11-19", status: "active", paid: true, voided_at: null, items: [{ productId: 80, qty: 3 }] },
  { id: 3, date: "2026-11-19", status: "active", paid: true, voided_at: "2026-11-20T00:00:00Z", items: [{ productId: 99, qty: 50 }] },
  { id: 4, date: "2026-11-19", status: "active", paid: false, voided_at: null, items: [{ productId: 99, qty: 50 }] },
  { id: 5, date: "2026-11-19", status: "cancelled", paid: true, voided_at: null, items: [{ productId: 99, qty: 50 }] },
  { id: 6, date: "2026-09-01", status: "active", paid: true, voided_at: null, items: [{ productId: 98, qty: 50 }] },
  { id: 7, date: "2026-11-19", status: "active", paid: true, voided_at: null, items: "{roto" },
  { id: 8, date: "2026-11-20", status: "active", paid: true, voided_at: null, product_id: 76, qty: 9, items: [{ productId: 76, qty: 1 }] },
];
await test("cuenta unidades de ventas confirmadas, por línea, una vez por venta; excluye anuladas, no pagadas, canceladas, fuera de período e ilegibles", () => {
  const r = B.rankUnits(SALES, { now: Date.parse("2026-11-22T12:00:00Z"), periodDays: 30 });
  assert.deepEqual(r.ranking, [{ productId: 80, units: 4 }, { productId: 76, units: 3 }]);
  assert.equal(r.salesCounted, 3);
  assert.equal(r.salesSkipped, 4);
});
await test("la tienda recibe solo el orden de productos publicados, nunca las unidades; actualización cada 24 h", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-not-real" });
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, o = {}) => {
    const u = String(url);
    calls.push([o.method || "GET", u]);
    const json = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b), json: async () => b, arrayBuffer: async () => Buffer.from(JSON.stringify(b)) });
    if (u.includes("/storage/v1/object/")) return { ok: false, status: 400, text: async () => JSON.stringify({ statusCode: "404", code: "NoSuchKey" }), arrayBuffer: async () => new ArrayBuffer(0) };
    if (u.includes("/rest/v1/sales")) return json(SALES.map((s) => ({ ...s, date: "2026-11-21" })));
    if (u.includes("/rest/v1/catalog_metadata")) return json([{ product_id: 80, published: true }]);
    throw new Error("inesperado " + u);
  };
  try {
    delete require.cache[require.resolve("../api/catalog/categories")];
    const res = { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await require("../api/catalog/categories")({ method: "GET", headers: {}, query: { view: "bestsellers" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.productIds, [80]);
    assert.ok(!JSON.stringify(res.body).includes("units"));
    assert.match(res.headers["Cache-Control"], /s-maxage=86400/);
    assert.ok(calls.every(([m]) => m === "GET"), "solo lecturas");
  } finally {
    global.fetch = original;
    process.env = saved;
  }
});

console.log("Vitrinas en la tienda");
const P = (id, extra = {}) => ({ id, name: "P" + id, image: `https://x/${id}.png`, collections: [], tags: [], ...extra });
const PRODUCTS = [P(1), P(2), P(3), P(4), P(5), P(6, { image: null })];
await test("Novedades: fijados primero, luego automáticos; sin excluidos, duplicados ni productos que no estén publicados; respeta la cantidad", () => {
  const cfg = { active: true, limit: 3, pinned: [5, 99, 2], excluded: [3] };
  assert.deepEqual(S.selectNovedades(PRODUCTS, cfg, [2, 3, 4, 1]).map((p) => p.id), [5, 2, 4]);
  assert.deepEqual(S.selectNovedades(PRODUCTS, { ...cfg, pinned: [] }, []), [], "sin lanzamiento ni fijados → vitrina vacía (no se muestra)");
  assert.deepEqual(S.selectNovedades(PRODUCTS, { ...cfg, active: false }, [1]), []);
});
await test("Más elegidos: fijados en su posición, el resto por unidades; excluidos nunca; sin duplicados", () => {
  const cfg = { active: true, limit: 5, pinned: [{ productId: 6, position: 1 }, { productId: 4, position: 3 }], excluded: [2] };
  assert.deepEqual(S.selectBestSellers(PRODUCTS, cfg, [2, 1, 4, 3, 1, 77]).map((p) => p.id), [6, 1, 4, 3]);
  assert.deepEqual(S.selectBestSellers(PRODUCTS, { ...cfg, pinned: [] }, []), [], "sin ventas ni fijados → vacía");
});
await test("Colecciones: solo las que tienen productos, con su cantidad e imagen; Descubre: selecciones con productos", () => {
  const prods = [P(1, { collections: ["navidad"], tags: ["regalo"] }), P(2, { collections: ["navidad"], image: null }), P(3, { editorialCategory: "Rostro" })];
  const merch = { collections: [{ id: "navidad", name: "Navidad" }, { id: "vacia", name: "Vacía" }], tags: [{ id: "regalo", name: "Regalo" }], showcases: { descubre: { picks: [{ type: "collection", value: "navidad", title: "" }, { type: "tag", value: "regalo", title: "Para regalar" }, { type: "category", value: "Rostro", title: "" }, { type: "collection", value: "vacia", title: "" }] } } };
  const cols = S.collectionsWithProducts(prods, merch);
  assert.deepEqual(cols.map((c) => [c.id, c.count, c.image]), [["navidad", 2, "https://x/1.png"]]);
  const picks = S.descubrePicks(prods, merch, { groupOfCategory: () => "Maquillaje" });
  assert.deepEqual(picks.map((p) => [p.type, p.label, p.group]), [["collection", "Navidad", null], ["tag", "Para regalar", null], ["category", "Rostro", "Maquillaje"]]);
  assert.equal(S.descubrePicks(prods, { ...merch, showcases: { descubre: { picks: [] } } }), null, "sin selecciones → tarjetas de siempre");
  const att = S.attachMerchandising([{ id: 7 }, { id: 8 }], { assignments: { 7: { collections: ["a"], tags: ["b"] } } });
  assert.deepEqual(att.map((p) => [p.collections, p.tags]), [[["a"], ["b"]], [[], []]]);
  assert.deepEqual(tjs.filterProducts(prods, { collection: "navidad" }).map((p) => p.id), [1, 2]);
  assert.deepEqual(tjs.filterProducts(prods, { tag: "regalo" }).map((p) => p.id), [1]);
});

console.log("Admin — guardar con control de revisión (Storage simulado)");
await test("guarda el documento saneado, sube la revisión y rechaza (409) si otra sesión guardó antes", async () => {
  const store = new Map();
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-not-real", ADMIN_API_TOKEN: "admin-test-token" });
  const original = global.fetch;
  const writes = [];
  global.fetch = async (url, o = {}) => {
    const u = String(url);
    const m = u.match(/\/storage\/v1\/object\/product-images\/(.+)$/);
    if (m) {
      const p = m[1].split("?")[0];
      if ((o.method || "GET") === "GET") {
        if (!store.has(p)) return { ok: false, status: 400, text: async () => JSON.stringify({ statusCode: "404", code: "NoSuchKey" }), arrayBuffer: async () => new ArrayBuffer(0) };
        const b = store.get(p);
        return { ok: true, status: 200, text: async () => b.toString("utf8"), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
      }
      writes.push(p);
      store.set(p, Buffer.from(o.body));
      return { ok: true, status: 200, text: async () => "" };
    }
    if (u.includes("/rest/v1/")) throw new Error("no debería escribir en la base: " + u);
    throw new Error("inesperado " + u);
  };
  const call = async (body) => {
    delete require.cache[require.resolve("../api/admin/products")];
    const res = { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await require("../api/admin/products")({ method: "POST", headers: { authorization: "Bearer admin-test-token" }, query: { resource: "merchandising" }, body }, res);
    return res;
  };
  try {
    const doc = M.defaultMerchandising();
    doc.collections.push({ name: "Navidad 2026" });
    doc.assignments = { 12: { collections: ["navidad-2026"], tags: [] } };
    const ok = await call({ doc, expectedRevision: 0 });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.merchandising.revision, 1);
    assert.deepEqual(ok.body.merchandising.assignments, { 12: { collections: ["navidad-2026"], tags: [] } });
    assert.deepEqual(writes, ["config/merchandising.json"]);
    const stale = await call({ doc, expectedRevision: 0 });
    assert.equal(stale.statusCode, 409);
    assert.equal(writes.length, 1, "no se sobrescribe un cambio más nuevo");
    const bad = await call({ doc });
    assert.equal(bad.statusCode, 400);
  } finally {
    global.fetch = original;
    process.env = saved;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
