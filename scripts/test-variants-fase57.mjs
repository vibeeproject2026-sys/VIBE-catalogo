// Runs with plain Node, no network, no real credentials:
//   node scripts/test-variants-fase57.mjs
//
// Fase 57 — tonos y presentaciones como dimensiones independientes, de
// extremo a extremo: modelo público (editorialDetails), reglas del cliente
// (js/variants.js), carrito (js/cart.js), validación del servidor
// (api/_lib/variants.js) y creación real del pedido (api/orders/create.js)
// con Supabase/Resend SIMULADOS. Nada se conecta a producción ni se envía.

import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const details = require("../api/_lib/editorialDetails");
const server = require("../api/_lib/variants");
const guard = require("../api/orders/_lib/guard");
const { lineLabel } = (() => {
  // email.js no exporta su helper; se reproduce su regla para el pedido
  // histórico (variantName «Único» o ausente → solo el nombre).
  const src = fs.readFileSync(path.join(root, "api/orders/_lib/email.js"), "utf8");
  assert.match(src, /const hasRealVariant = l\.variantName && l\.variantName !== "Único" && l\.variantName !== "Default";/);
  return { lineLabel: (l) => (l.variantName && l.variantName !== "Único" && l.variantName !== "Default" ? `${l.name} — ${l.variantName}` : l.name) };
})();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-f57-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["products.js", "taxonomy.js", "data-source.js", "variants.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));
const ds = await import(pathToFileURL(path.join(tmp, "data-source.js")).href);
const V = await import(pathToFileURL(path.join(tmp, "variants.js")).href);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  guard.resetIpLimiter();
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

function freshCart() {
  let store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  return import("data:text/javascript," + encodeURIComponent(fs.readFileSync(path.join(root, "js/cart.js"), "utf8")) + `\n//${Math.random()}`);
}

const SH = [
  { id: "rojo", name: "Rojo pasión", hex: "#aa0011", active: true, order: 0 },
  { id: "nude", name: "Nude", hex: "#c99b87", active: true, order: 1 },
  { id: "cereza", name: "Cereza", hex: "#7a0b2a", active: false, order: 2 },
];
const PR = [
  { id: "15ml", name: "15 ml", active: true, order: 0 },
  { id: "30ml", name: "30 ml", active: true, order: 1 },
  { id: "50ml", name: "50 ml", active: false, order: 2 },
];
const api = (extra) => ds.__internal.normalizeApiProduct({ id: 1, name: "Base", price: 20000, available: true, presentation: "", ...extra });
const CONFIGS = {
  none: api({}),
  shades: api({ shades: SH, presentations: [PR[1]] }),
  presentations: api({ shades: [SH[0]], presentations: PR }),
  both: api({ shades: SH, presentations: PR }),
};

// ---------------------------------------------------------------------
console.log("Modelo (ficha → API pública)");
await test("presentaciones: se sanean (id/nombre válidos, sin <>, sin duplicados por mayúsculas/acentos/espacios) y se reordenan", () => {
  const out = details.sanitizePresentations([
    { id: "30ml", name: "30 ml", active: true, order: 1 },
    { id: "15ml", name: "15 ml", active: false, order: 0 },
    { id: "dup", name: "  30   ML ", active: true },
    { id: "BAD ID", name: "x" },
    { id: "html", name: "<b>x</b>" },
    { id: "vacio", name: "   " },
    "texto",
  ]);
  assert.deepEqual(out.map((p) => [p.id, p.name, p.active, p.order]), [["15ml", "15 ml", false, 0], ["30ml", "30 ml", true, 1]]);
});
await test("la API pública expone tonos (solo con color) y presentaciones (activas e inactivas marcadas), independientes", () => {
  const pub = details.publicDetails(JSON.stringify({ shades: [...SH, { id: "pend", name: "Pend", hex: null, active: true }], presentations: PR }));
  assert.deepEqual(pub.shades.map((s) => s.id), ["rojo", "nude", "cereza"]);
  assert.deepEqual(pub.presentations.map((p) => [p.id, p.active]), [["15ml", true], ["30ml", true], ["50ml", false]]);
  const onlyPres = details.publicDetails(JSON.stringify({ presentations: [PR[0]] }));
  assert.deepEqual([onlyPres.shades.length, onlyPres.presentations.length], [0, 1]);
});
await test("nunca se generan opciones: una ficha sin tonos ni presentaciones no recibe ninguna (ni por categoría)", () => {
  const p = api({ category: "Labios", editorialCategory: "Labios", subcategory: "Labiales" });
  assert.deepEqual([p.shades, p.presentations], [[], []]);
  assert.equal(V.hasOptions(p), false);
});

// ---------------------------------------------------------------------
console.log("Cliente — las cuatro configuraciones");
await test("1) sin variantes: sin selector, compra directa con la variante base", () => {
  const p = CONFIGS.none;
  assert.equal(V.hasOptions(p), false);
  assert.deepEqual(V.selectionStatus(p, null, null), { missing: [], blocked: null });
  assert.equal(V.resolveVariant(p, null, null).id, "default");
});
await test("2) varios tonos + una presentación: hay que elegir tono; la presentación única se aplica sola y conserva su nombre", () => {
  const p = CONFIGS.shades;
  assert.equal(V.autoShadeId(p), null);
  assert.equal(V.autoPresentationId(p), "30ml");
  assert.deepEqual(V.selectionStatus(p, null, "30ml").missing, ["shade"]);
  assert.equal(V.resolveVariant(p, null, "30ml"), null);
  const v = V.resolveVariant(p, "nude", "30ml");
  assert.deepEqual([v.id, v.name, v.presentationName, v.hex, v.price], ["s:nude|p:30ml", "Nude · 30 ml", "30 ml", "#c99b87", 20000]);
});
await test("3) un tono + varias presentaciones: el tono único se aplica solo; hay que elegir presentación", () => {
  const p = CONFIGS.presentations;
  assert.equal(V.autoShadeId(p), "rojo");
  assert.equal(V.autoPresentationId(p), null);
  assert.deepEqual(V.selectionStatus(p, "rojo", null).missing, ["presentation"]);
  assert.equal(V.resolveVariant(p, "rojo", "15ml").name, "Rojo pasión · 15 ml");
});
await test("4) varios tonos + varias presentaciones: nada preseleccionado, hay que elegir ambos", () => {
  const p = CONFIGS.both;
  assert.deepEqual([V.autoShadeId(p), V.autoPresentationId(p)], [null, null]);
  assert.deepEqual(V.selectionStatus(p, null, null).missing, ["shade", "presentation"]);
  assert.equal(V.resolveVariant(p, "rojo", null), null);
  assert.equal(V.resolveVariant(p, null, "15ml"), null);
  assert.equal(V.resolveVariant(p, "rojo", "15ml").id, "s:rojo|p:15ml");
});
await test("solo presentaciones (sin tonos): no se exige tono", () => {
  const p = api({ presentations: PR });
  assert.deepEqual(V.selectionStatus(p, null, null).missing, ["presentation"]);
  assert.equal(V.resolveVariant(p, null, "30ml").id, "p:30ml");
});
await test("presentación única: se conserva su etiqueta real (no «Único»)", () => {
  const p = api({ presentations: [{ id: "ind", name: "Individual", active: true }] });
  const v = V.resolveVariant(p, null, V.autoPresentationId(p));
  assert.deepEqual([v.name, v.presentationName], ["Individual", "Individual"]);
  const legacy = api({ presentation: "15 g" });
  assert.equal(V.resolveVariant(legacy, null, null).name, "15 g");
  assert.equal(api({}).variants[0].name, "");
});
await test("opciones inactivas: no se pueden comprar; todas inactivas en una dimensión → bloqueado", () => {
  assert.equal(V.resolveVariant(CONFIGS.both, "cereza", "15ml"), null);
  assert.equal(V.resolveVariant(CONFIGS.both, "rojo", "50ml"), null);
  assert.equal(V.selectionStatus(CONFIGS.both, "cereza", "15ml").blocked, "shade");
  const allOff = api({ presentations: [{ id: "a", name: "A", active: false }, { id: "b", name: "B", active: false }] });
  assert.equal(V.selectionStatus(allOff, null, null).blocked, "presentation");
});
await test("ids manipulados o de otro producto: no resuelven variante", () => {
  assert.equal(V.resolveVariant(CONFIGS.both, "inventado", "15ml"), null);
  assert.equal(V.resolveVariant(CONFIGS.both, "rojo", "<script>"), null);
  const other = api({ id: 2, shades: [{ id: "azul", name: "Azul", hex: "#0000ff", active: true }] });
  assert.equal(V.resolveVariant(CONFIGS.both, other.shades[0].id, "15ml"), null);
});

// ---------------------------------------------------------------------
console.log("Carrito");
await test("dos combinaciones del mismo producto = dos líneas; la misma combinación se agrupa", async () => {
  const cart = await freshCart();
  const p = CONFIGS.both;
  cart.addToCart(p, V.resolveVariant(p, "rojo", "15ml"), 1);
  cart.addToCart(p, V.resolveVariant(p, "rojo", "30ml"), 2);
  cart.addToCart(p, V.resolveVariant(p, "nude", "15ml"), 1);
  cart.addToCart(p, V.resolveVariant(p, "rojo", "15ml"), 3);
  const lines = cart.getCart();
  assert.deepEqual(lines.map((l) => [l.variantId, l.quantity]), [["s:rojo|p:15ml", 4], ["s:rojo|p:30ml", 2], ["s:nude|p:15ml", 1]]);
  assert.deepEqual([lines[0].shadeId, lines[0].shadeName, lines[0].presentationId, lines[0].presentationName], ["rojo", "Rojo pasión", "15ml", "15 ml"]);
});
await test("cambiar cantidades conserva la selección de cada línea", async () => {
  const cart = await freshCart();
  const p = CONFIGS.both;
  cart.addToCart(p, V.resolveVariant(p, "nude", "30ml"), 1);
  cart.changeQuantity(1, "s:nude|p:30ml", 2);
  const [l] = cart.getCart();
  assert.deepEqual([l.quantity, l.shadeId, l.presentationId, l.variantName], [3, "nude", "30ml", "Nude · 30 ml"]);
});
await test("cambio de configuración después de agregar: tono desactivado, presentación quitada o dimensión nueva → la línea exige corregir", () => {
  const line = { productId: 1, variantId: "s:rojo|p:15ml", shadeId: "rojo", presentationId: "15ml" };
  assert.equal(V.lineOptionProblem(CONFIGS.both, line), null);
  const rojoOff = api({ shades: SH.map((s) => (s.id === "rojo" ? { ...s, active: false } : s)), presentations: PR });
  assert.equal(V.lineOptionProblem(rojoOff, line), "option");
  const sinPres = api({ shades: SH });
  assert.equal(V.lineOptionProblem(sinPres, line), "option");
  const plainLine = { productId: 1, variantId: "default", shadeId: null, presentationId: null };
  assert.equal(V.lineOptionProblem(CONFIGS.none, plainLine), null);
  assert.equal(V.lineOptionProblem(CONFIGS.shades, plainLine), "option");
});
await test("carritos guardados antes de esta fase (variantId «default», sin ids de opciones) siguen válidos en productos sin opciones", () => {
  const legacy = { productId: 1, variantId: "default", variantName: "Único", price: 20000, quantity: 1 };
  assert.equal(V.lineOptionProblem(CONFIGS.none, legacy), null);
});
await test("precio desde el POS: toda combinación usa el precio vigente del producto base (sin precio por opción)", async () => {
  const cart = await freshCart();
  const p = CONFIGS.both;
  cart.addToCart(p, V.resolveVariant(p, "rojo", "15ml"), 1);
  cart.addToCart(p, V.resolveVariant(p, "nude", "30ml"), 1);
  const fresh = api({ shades: SH, presentations: PR, price: 18000 });
  const changes = cart.syncCartPrices((i) => (V.lineOptionProblem(fresh, i) ? null : { price: fresh.variants[0].price, originalPrice: null }));
  assert.equal(changes.length, 2);
  assert.deepEqual(cart.getCart().map((l) => l.price), [18000, 18000]);
});

// ---------------------------------------------------------------------
console.log("Servidor — resolveSelection (ficha, nunca el navegador)");
const opts = (info, text = null) => server.productOptions(details.parseDetails(JSON.stringify(info)), text);
await test("las cuatro configuraciones con selección válida", () => {
  assert.deepEqual(server.resolveSelection(opts({}), {}), { ok: true, variantId: "default", variantName: null, shadeId: null, shadeName: null, presentationId: null, presentationName: null });
  assert.equal(server.resolveSelection(opts({ shades: SH, presentations: [PR[1]] }), { shadeId: "nude", presentationId: "30ml" }).variantName, "Nude · 30 ml");
  assert.equal(server.resolveSelection(opts({ shades: [SH[0]], presentations: PR }), { shadeId: "rojo", presentationId: "15ml" }).variantId, "s:rojo|p:15ml");
  assert.equal(server.resolveSelection(opts({ shades: SH, presentations: PR }), { shadeId: "rojo", presentationId: "30ml" }).variantName, "Rojo pasión · 30 ml");
});
await test("opción única: igualmente obligatoria en el request (el cliente la envía sola), y debe estar activa", () => {
  assert.deepEqual(server.resolveSelection(opts({ presentations: [PR[0]] }), {}), { ok: false, dimension: "presentation" });
  assert.deepEqual(server.resolveSelection(opts({ presentations: [PR[2]] }), { presentationId: "50ml" }), { ok: false, dimension: "presentation" });
});
await test("inactiva, inexistente, de otro producto o en una dimensión no configurada: rechazada con la dimensión", () => {
  const both = opts({ shades: SH, presentations: PR });
  assert.deepEqual(server.resolveSelection(both, { shadeId: "cereza", presentationId: "15ml" }), { ok: false, dimension: "shade" });
  assert.deepEqual(server.resolveSelection(both, { shadeId: "rojo", presentationId: "999ml" }), { ok: false, dimension: "presentation" });
  assert.deepEqual(server.resolveSelection(opts({}), { shadeId: "rojo" }), { ok: false, dimension: "shade" });
  assert.deepEqual(server.resolveSelection(opts({ shades: SH }), { shadeId: "rojo", presentationId: "15ml" }), { ok: false, dimension: "presentation" });
});
await test("sin presentaciones configuradas: conserva la presentación de texto de la ficha; sin ella, no inventa", () => {
  assert.equal(server.resolveSelection(opts({}, "30 ml"), {}).presentationName, "30 ml");
  assert.equal(server.resolveSelection(opts({ shades: SH }, "4 g"), { shadeId: "rojo" }).variantName, "Rojo pasión · 4 g");
  assert.equal(server.resolveSelection(opts({}, "  "), {}).variantName, null);
});

// ---------------------------------------------------------------------
console.log("Servidor — /api/orders/create (Supabase/Resend simulados)");
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real", RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE <p@vibe.test>", ORDERS_NOTIFICATION_EMAIL: "buzon@example.com" };
const CUSTOMER = { name: "Clienta", phone: "3001112233", email: "c@example.com", city: "Bogotá", address: "Calle 1" };
function makeDb(products) {
  const db = { orders: [], calls: [], emails: [] };
  db.fetch = async (url, o = {}) => {
    const u = String(url);
    const method = o.method || "GET";
    db.calls.push({ method, url: u });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (u.startsWith("https://api.resend.com")) { db.emails.push(JSON.parse(o.body)); return json(200, { id: "e" }); }
    if (u.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp no configurado");
    if (u.includes("/rest/v1/products")) return json(200, products.map((p) => p.pos));
    if (u.includes("/rest/v1/catalog_metadata")) return json(200, products.map((p) => ({ product_id: p.pos.id, published: true, additional_info: p.info ? JSON.stringify(p.info) : null, presentation: p.presentation ?? null })));
    if (u.includes("/rest/v1/orders") && method === "GET") return json(200, []);
    if (u.includes("/rest/v1/orders") && method === "POST") {
      const row = { ...JSON.parse(o.body), id: 700 + db.orders.length, created_at: "2026-10-28T00:00:00Z", status: "received" };
      db.orders.push(row);
      return json(201, [row]);
    }
    if (u.includes("/rest/v1/orders") && method === "PATCH") return json(204);
    throw new Error("ruta inesperada " + method + " " + u);
  };
  return db;
}
async function create(db, items, extra = {}) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const originalFetch = global.fetch;
  const originalError = console.error;
  const originalLog = console.log;
  global.fetch = db.fetch;
  console.error = () => {};
  console.log = (...a) => { if (!String(a[0]).startsWith("[orders/")) originalLog(...a); };
  try {
    delete require.cache[require.resolve("../api/orders/create")];
    const res = { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await require("../api/orders/create")({ method: "POST", headers: {}, body: { customer: CUSTOMER, contactConsent: true, items, ...extra } }, res);
    return res;
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    console.log = originalLog;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const POS = (id, extra) => ({ id, name: "Producto " + id, price: 20000, stock: 5, category: "Labios", promo_active: false, ...extra });
const BOTH = { pos: POS(1), info: { shades: SH, presentations: PR } };

await test("pedido con tono y presentación: nombres/ids desde la ficha (no del navegador), precio del POS", async () => {
  const db = makeDb([BOTH]);
  const res = await create(db, [{ productId: 1, quantity: 2, variantId: "manipulado", shadeId: "nude", presentationId: "30ml", variantName: "Nombre falso", price: 1 }]);
  assert.equal(res.statusCode, 201);
  const it = db.orders[0].items[0];
  assert.deepEqual([it.variantId, it.variantName, it.shadeId, it.shadeName, it.presentationId, it.presentationName, it.price, it.lineSubtotal], ["s:nude|p:30ml", "Nude · 30 ml", "nude", "Nude", "30ml", "30 ml", 20000, 40000]);
});
await test("dos combinaciones del mismo producto en un pedido: líneas separadas, total correcto", async () => {
  const db = makeDb([BOTH]);
  const res = await create(db, [{ productId: 1, quantity: 1, shadeId: "rojo", presentationId: "15ml" }, { productId: 1, quantity: 2, shadeId: "rojo", presentationId: "30ml" }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.orders[0].items.map((i) => [i.variantName, i.quantity]), [["Rojo pasión · 15 ml", 1], ["Rojo pasión · 30 ml", 2]]);
  assert.equal(db.orders[0].total, 60000);
});
await test("falta elegir, opción inactiva, id manipulado u opción de OTRO producto: 409 VARIANT_UNAVAILABLE con la dimensión, sin insertar ni notificar", async () => {
  const other = { pos: POS(2), info: { shades: [{ id: "azul", name: "Azul", hex: "#0000ff", active: true }] } };
  for (const item of [
    { shadeId: "rojo" },
    { presentationId: "15ml" },
    { shadeId: "cereza", presentationId: "15ml" },
    { shadeId: "rojo", presentationId: "50ml" },
    { shadeId: "rojo'; drop table orders;--", presentationId: "15ml" },
    { shadeId: "azul", presentationId: "15ml" },
  ]) {
    const db = makeDb([BOTH, other]);
    const res = await create(db, [{ productId: 1, quantity: 1, ...item }]);
    assert.equal(res.statusCode, 409, JSON.stringify(item));
    assert.equal(res.body.code, "VARIANT_UNAVAILABLE");
    assert.ok(["shade", "presentation"].includes(res.body.unavailableVariants[0].dimension));
    assert.equal(db.orders.length, 0);
    assert.equal(db.emails.length, 0);
  }
});
await test("producto sin opciones: no acepta ids de tono/presentación enviados por el navegador", async () => {
  const res = await create(makeDb([{ pos: POS(1) }]), [{ productId: 1, quantity: 1, shadeId: "rojo" }]);
  assert.equal(res.statusCode, 409);
});
await test("presentación única: el pedido conserva su etiqueta; sin presentaciones, la de texto de la ficha", async () => {
  const db = makeDb([{ pos: POS(1), info: { presentations: [{ id: "ind", name: "Individual", active: true }] } }, { pos: POS(2), presentation: "15 g" }]);
  const res = await create(db, [{ productId: 1, quantity: 1, presentationId: "ind" }, { productId: 2, quantity: 1 }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.orders[0].items.map((i) => i.variantName), ["Individual", "15 g"]);
});
await test("existencias del POS mandan: producto agotado → 409 aunque la combinación esté activa", async () => {
  const res = await create(makeDb([{ ...BOTH, pos: POS(1, { stock: 0 }) }]), [{ productId: 1, quantity: 1, shadeId: "rojo", presentationId: "15ml" }]);
  assert.equal(res.statusCode, 409);
  assert.ok(Array.isArray(res.body.unavailableProductIds));
});
await test("precio del POS con promoción: aplica a cualquier combinación; total esperado distinto → PRICE_CHANGED", async () => {
  const promo = { ...BOTH, pos: POS(1, { promo_active: true, promo_price: 15000 }) };
  const db = makeDb([promo]);
  assert.equal((await create(db, [{ productId: 1, quantity: 1, shadeId: "nude", presentationId: "15ml" }], { expectedTotal: 15000 })).statusCode, 201);
  assert.equal(db.orders[0].items[0].price, 15000);
  const res = await create(makeDb([promo]), [{ productId: 1, quantity: 1, shadeId: "nude", presentationId: "15ml" }], { expectedTotal: 20000 });
  assert.equal(res.body.code, "PRICE_CHANGED");
});
await test("notificación interna y correo a la clienta muestran la combinación (Nombre — Tono · Presentación); WhatsApp y Resend simulados", async () => {
  const db = makeDb([BOTH]);
  await create(db, [{ productId: 1, quantity: 1, shadeId: "rojo", presentationId: "30ml" }]);
  assert.equal(db.emails.length, 2);
  for (const e of db.emails) assert.ok(e.html.includes("Producto 1 — Rojo pasión · 30 ml"), "falta la combinación en el correo");
});
await test("pedidos históricos sin variantes (variantName «Único»/ausente, sin ids de opciones) se siguen mostrando igual", () => {
  assert.equal(lineLabel({ name: "Set de brochas", variantName: "Único" }), "Set de brochas");
  assert.equal(lineLabel({ name: "Set de brochas" }), "Set de brochas");
  assert.equal(lineLabel({ name: "Base", variantName: "Nude · 30 ml" }), "Base — Nude · 30 ml");
});
await test("nunca se escribe en products ni en catalog_metadata al crear un pedido con opciones", async () => {
  const db = makeDb([BOTH]);
  await create(db, [{ productId: 1, quantity: 1, shadeId: "rojo", presentationId: "15ml" }]);
  assert.ok(db.calls.filter((c) => /\/rest\/v1\/(products|catalog_metadata)/.test(c.url)).every((c) => c.method === "GET"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
