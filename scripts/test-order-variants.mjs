// Runs with plain Node, sin red ni credenciales:
//   node scripts/test-order-variants.mjs
//
// Integridad de las variantes del pedido, de la ficha al correo:
// selección (js/variants.js) → carrito (js/cart.js) → pedido
// (api/orders/create.js, base y correo simulados) → correo a VIBE (HTML y
// texto), correo a la clienta y aviso de WhatsApp. Valida el CONTENIDO real
// del pedido guardado y de los mensajes, no solo la interfaz.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.error("  FAIL - " + name); console.error("    " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n    ") : e)); }
}

// Carrito en Node: localStorage en memoria.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const V = await import("../js/variants.js");
const C = await import("../js/cart.js");
const { buildInternalOrderEmail, buildOrderEmail } = require("../api/orders/_lib/email.js");
const { buildOrderNotificationMessage } = require("../api/orders/_lib/whatsappNotify.js");
const { lineLabel, variantText } = require("../api/orders/_lib/lineOptions.js");

// Productos de prueba (forma pública de la tienda).
const shade = (id, name) => ({ id, name, hex: "#cc8899", active: true, order: 0 });
const pres = (id, name) => ({ id, name, active: true, order: 0 });
const P = {
  mascarilla: { id: 89, name: "Mascarilla Facial", price: 5000, variants: [{ id: "default", price: 5000 }], shades: [shade("t01", "Tono 01"), shade("t02", "Tono 02"), shade("t03", "Tono 03")], presentations: [] },
  rubor: { id: 2, name: "Rubor", price: 20000, variants: [{ id: "default", price: 20000 }], shades: [shade("peach", "Peach"), shade("pink", "Pink"), shade("rose", "Rose")], presentations: [] },
  crema: { id: 3, name: "Crema hidratante", price: 30000, variants: [{ id: "default", price: 30000 }], shades: [], presentations: [pres("p30", "30 ml"), pres("p50", "50 ml"), pres("p100", "100 ml")] },
  base: { id: 4, name: "Base líquida", price: 40000, variants: [{ id: "default", price: 40000 }], shades: [shade("b120", "Tono 120"), shade("b130", "Tono 130")], presentations: [pres("b30", "30 ml"), pres("b50", "50 ml")] },
  rizador: { id: 5, name: "Escrespador", price: 15000, variants: [{ id: "default", price: 15000 }], shades: [], presentations: [] },
};
const addSelected = (p, shadeId, presentationId, qty) => {
  const v = V.resolveVariant(p, shadeId, presentationId);
  if (!v) return false;
  C.addToCart(p, V.hasOptions(p) ? v : { ...v, price: p.price }, qty);
  return true;
};

console.log("Ficha y carrito");
await test("1. producto sin variantes: se agrega normalmente (línea «default»)", () => {
  C.clearCart();
  assert.equal(V.hasOptions(P.rizador), false);
  assert.ok(addSelected(P.rizador, null, null, 1));
  assert.deepEqual(C.getCart().map((l) => [l.productId, l.variantId, l.shadeId, l.presentationId]), [[5, "default", null, null]]);
});
await test("2. producto con tono: la línea guarda id y nombre del tono", () => {
  C.clearCart();
  assert.ok(addSelected(P.mascarilla, "t02", null, 2));
  const l = C.getCart()[0];
  assert.deepEqual([l.variantId, l.shadeId, l.shadeName, l.quantity], ["s:t02", "t02", "Tono 02", 2]);
});
await test("3. producto con varias presentaciones: la línea guarda la presentación elegida", () => {
  C.clearCart();
  assert.ok(addSelected(P.crema, null, "p50", 1));
  const l = C.getCart()[0];
  assert.deepEqual([l.variantId, l.presentationId, l.presentationName], ["p:p50", "p50", "50 ml"]);
});
await test("4. dos dimensiones: exige tono Y presentación; la línea guarda ambas", () => {
  assert.deepEqual(V.selectionStatus(P.base, "b130", null).missing, ["presentation"]);
  assert.equal(V.resolveVariant(P.base, "b130", null), null);
  C.clearCart();
  assert.ok(addSelected(P.base, "b130", "b50", 1));
  const l = C.getCart()[0];
  assert.deepEqual([l.variantId, l.shadeName, l.presentationName], ["s:b130|p:b50", "Tono 130", "50 ml"]);
});
await test("5. sin elegir la variante obligatoria NO se agrega al carrito", () => {
  C.clearCart();
  assert.deepEqual(V.selectionStatus(P.mascarilla, null, null).missing, ["shade"]);
  assert.equal(addSelected(P.mascarilla, null, null, 1), false);
  assert.equal(C.getCart().length, 0);
});
await test("6. mismo producto en dos tonos: dos líneas independientes", () => {
  C.clearCart();
  addSelected(P.mascarilla, "t01", null, 2);
  addSelected(P.mascarilla, "t03", null, 1);
  addSelected(P.mascarilla, "t01", null, 1); // mismo tono: suma a su línea
  assert.deepEqual(C.getCart().map((l) => [l.shadeName, l.quantity]), [["Tono 01", 3], ["Tono 03", 1]]);
});
await test("7. cambiar la cantidad de una variante no toca la otra", () => {
  C.changeQuantity(89, "s:t03", 1);
  assert.deepEqual(C.getCart().map((l) => [l.shadeName, l.quantity]), [["Tono 01", 3], ["Tono 03", 2]]);
});
await test("8. eliminar una variante conserva la otra", () => {
  C.removeFromCart(89, "s:t01");
  assert.deepEqual(C.getCart().map((l) => [l.shadeName, l.quantity]), [["Tono 03", 2]]);
});

// ── Pedido real por api/orders/create.js (base y correo simulados) ──
const asMeta = (p, presentationText = null) => ({ product_id: p.id, published: true, presentation: presentationText, additional_info: JSON.stringify({ shades: p.shades, presentations: p.presentations }) });
function makeDb() {
  const db = { orders: [], emails: [] };
  const products = Object.values(P).map((p) => ({ id: p.id, name: p.name, price: p.price, stock: 10, category: "Rostro", promo_active: false }));
  const meta = [asMeta(P.mascarilla), asMeta(P.rubor), asMeta(P.crema), asMeta(P.base), asMeta(P.rizador, "Caja individual de cartón")];
  db.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || "GET";
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)), json: async () => body });
    if (u.startsWith("https://api.resend.com")) { db.emails.push(JSON.parse(opts.body)); return json(200, { id: "e" }); }
    if (u.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp no configurado");
    if (u.includes("/rest/v1/products")) return json(200, products);
    if (u.includes("/rest/v1/catalog_metadata")) return json(200, meta);
    if (u.includes("/rest/v1/orders") && method === "GET") return json(200, []);
    if (u.includes("/rest/v1/orders") && method === "POST") { const row = { ...JSON.parse(opts.body), id: 501 + db.orders.length, created_at: "2026-11-22T18:00:00Z", status: "received" }; db.orders.push(row); return json(201, [row]); }
    if (u.includes("/rest/v1/orders") && method === "PATCH") return json(204);
    throw new Error("ruta inesperada " + method + " " + u);
  };
  return db;
}
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-not-real", RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE <p@vibe.test>", ORDERS_NOTIFICATION_EMAIL: "pedidos@vibe.test" };
async function createOrder(db, items, expectedTotal) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const of = global.fetch, oe = console.error, ol = console.log;
  global.fetch = db.fetch; console.error = () => {}; console.log = () => {};
  try {
    delete require.cache[require.resolve("../api/orders/create")];
    const res = { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await require("../api/orders/create")({ method: "POST", headers: {}, body: { customer: { name: "Clienta Prueba", phone: "3001112233", email: "c@example.com", city: "Bogotá", address: "Calle 1" }, contactConsent: true, items, expectedTotal, idempotencyKey: "a1b2c3d4-e5f6-4a7b-8c9d-" + String(Date.now()).padStart(12, "0").slice(-12) } }, res);
    return res;
  } finally {
    global.fetch = of; console.error = oe; console.log = ol;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const toItem = (l) => ({ productId: l.productId, variantId: l.variantId, shadeId: l.shadeId ?? null, presentationId: l.presentationId ?? null, variantName: l.variantName, sku: l.sku, quantity: l.quantity });

console.log("Pedido, correo y WhatsApp");
let order, internal, customer;
await test("9. pedido con varios productos y variantes: cada línea guarda su variante estructurada", async () => {
  C.clearCart();
  addSelected(P.mascarilla, "t02", null, 2); // criterio de aceptación
  addSelected(P.mascarilla, "t03", null, 1);
  addSelected(P.rubor, "pink", null, 1);
  addSelected(P.base, "b130", "b30", 1);
  addSelected(P.crema, null, "p50", 1);
  addSelected(P.rizador, null, null, 1);
  const lines = C.getCart();
  const total = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  const db = makeDb();
  const res = await createOrder(db, lines.map(toItem), total);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  order = db.orders[0];
  assert.deepEqual(order.items.map((l) => [l.name, l.shadeName, l.presentationId ? l.presentationName : null, l.quantity]), [
    ["Mascarilla Facial", "Tono 02", null, 2],
    ["Mascarilla Facial", "Tono 03", null, 1],
    ["Rubor", "Pink", null, 1],
    ["Base líquida", "Tono 130", "30 ml", 1],
    ["Crema hidratante", null, "50 ml", 1],
    ["Escrespador", null, null, 1],
  ]);
  internal = db.emails.find((e) => [].concat(e.to).includes("pedidos@vibe.test"));
  customer = db.emails.find((e) => [].concat(e.to).includes("c@example.com"));
  assert.ok(internal && customer, "se generaron el correo a VIBE y el de la clienta");
});
await test("10. el correo a VIBE (texto y HTML) muestra cada variante con su cantidad", () => {
  const t = internal.text;
  assert.match(t, /• Mascarilla Facial — Tono: Tono 02 — Cantidad: 2 —/);
  assert.match(t, /• Mascarilla Facial — Tono: Tono 03 — Cantidad: 1 —/);
  assert.match(t, /• Rubor — Tono: Pink — Cantidad: 1 —/);
  assert.match(t, /• Base líquida — Tono: Tono 130 · Presentación: 30 ml — Cantidad: 1 —/);
  assert.match(t, /• Crema hidratante — Presentación: 50 ml — Cantidad: 1 —/);
  assert.match(t, /• Escrespador — Presentación única: Caja individual de cartón — Cantidad: 1 —/, "la presentación fija se informa rotulada como única, no como elección");
  const h = internal.html;
  assert.match(h, /Variante seleccionada/);
  for (const v of ["Tono: Tono 02", "Tono: Tono 03", "Tono: Pink", "Tono: Tono 130 · Presentación: 30 ml", "Presentación: 50 ml", "Presentación única: Caja individual de cartón"]) assert.ok(h.includes(v), "HTML: " + v);
});
await test("criterio de aceptación: «Mascarilla Facial — Tono 02 — Cantidad: 2» en el correo de VIBE", () => {
  const row = internal.text.split("\n").find((r) => r.includes("Tono 02"));
  assert.ok(/^• Mascarilla Facial — Tono: Tono 02 — Cantidad: 2 — \$\s?10\.000 \(unit\. \$\s?5\.000\)$/.test(row.replace(/ /g, " ")), row);
});
await test("el correo a la clienta y el aviso de WhatsApp también llevan las variantes", () => {
  assert.ok(customer.text.includes("Mascarilla Facial — Tono: Tono 02") && customer.text.includes("Base líquida — Tono: Tono 130 · Presentación: 30 ml"));
  assert.ok(customer.html.includes("Mascarilla Facial — Tono: Tono 02"));
  const wa = buildOrderNotificationMessage(order);
  assert.match(wa, /Mascarilla Facial — Tono: Tono 02 × 2/);
  assert.match(wa, /Crema hidratante — Presentación: 50 ml × 1/);
  assert.match(wa, /Escrespador — Presentación única: Caja individual de cartón × 1/);
});
await test("el servidor rechaza una línea sin el tono obligatorio (409), aunque se salte la ficha", async () => {
  const db = makeDb();
  const res = await createOrder(db, [{ productId: 89, variantId: "default", shadeId: null, presentationId: null, quantity: 1 }], 5000);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "VARIANT_UNAVAILABLE");
  assert.equal(db.orders.length, 0, "no se guardó ningún pedido incompleto");
});
await test("un pedido sin ninguna variante funciona igual que antes", async () => {
  C.clearCart();
  addSelected(P.rizador, null, null, 2);
  const db = makeDb();
  const res = await createOrder(db, C.getCart().map(toItem), 30000);
  assert.equal(res.statusCode, 201);
  assert.match(db.emails.find((e) => [].concat(e.to).includes("pedidos@vibe.test")).text, /• Escrespador — Presentación única: Caja individual de cartón — Cantidad: 2 —/);
});
await test("pedidos anteriores ya guardados se muestran con la misma regla (compatibilidad)", () => {
  // Como #7 (tono), #9 (texto descriptivo sin elección) y un pedido con variante clásica.
  assert.equal(lineLabel({ name: "VIBE Lip Duo", shadeId: "s-1", shadeName: "rojo", variantId: "s:s-1", variantName: "rojo", presentationId: null, presentationName: null }), "VIBE Lip Duo — Tono: rojo");
  assert.equal(lineLabel({ name: "Sakura Vibe Kit", shadeId: null, shadeName: null, variantId: "default", variantName: "Set en caja de regalo", presentationId: null, presentationName: "Set en caja de regalo" }), "Sakura Vibe Kit — Presentación única: Set en caja de regalo");
  assert.equal(lineLabel({ name: "Escrespador", variantId: "default", variantName: null, presentationName: null }), "Escrespador");
  assert.equal(variantText({ name: "Labial", variantId: "v-rojo", variantName: "Rojo" }), "Opción: Rojo");
  assert.equal(variantText({ name: "Labial", variantId: "default", variantName: "Único" }), null);
  // Tono elegido + presentación fija: se informan ambos (no se pierde el «50 gr.»).
  assert.equal(lineLabel({ name: "Bálsamo", shadeId: "s1", shadeName: "Rojo", variantId: "s:s1", variantName: "Rojo · 50 gr.", presentationId: null, presentationName: "50 gr." }), "Bálsamo — Tono: Rojo · Presentación única: 50 gr.");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
