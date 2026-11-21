// Runs with plain Node, no network, no real credentials:
//   node scripts/test-variant-prices.mjs
//
// Precio independiente por variante: un tono o una presentación pueden
// tener precio propio (opcional) en la ficha (catalog_metadata.additional_info).
// Sin precio propio, la opción usa el precio general del producto. La
// promoción vigente del POS se aplica una sola vez sobre ese precio base
// (pruebas P1–P17). De extremo a extremo: modelo (editorialDetails),
// reglas del cliente (js/variants.js), carrito (js/cart.js), resumen del
// checkout (js/checkout.js), validación del Admin (api/admin/catalog-metadata.js)
// y creación real del pedido (api/orders/create.js) con Supabase/Resend
// SIMULADOS. Nada se conecta a producción ni se envía.

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-varprice-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["products.js", "taxonomy.js", "data-source.js", "variants.js", "checkout.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));
const ds = await import(pathToFileURL(path.join(tmp, "data-source.js")).href);
const V = await import(pathToFileURL(path.join(tmp, "variants.js")).href);
const { computeOrderSummary } = await import(pathToFileURL(path.join(tmp, "checkout.js")).href);

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

// Ejemplos de la propietaria.
const RUBOR = [
  { id: "rosa", name: "Rosa", hex: "#f4a6b7", active: true, order: 0, price: 35000 },
  { id: "coral", name: "Coral", hex: "#ff7f50", active: true, order: 1, price: 38000 },
  { id: "terracota", name: "Terracota", hex: "#c0603e", active: true, order: 2, price: 37000 },
];
const POLVO = [
  { id: "individual", name: "Individual", active: true, order: 0, price: 32000 },
  { id: "grande", name: "Grande", active: true, order: 1, price: 45000 },
];
const SIN_PRECIO = [
  { id: "rojo", name: "Rojo", hex: "#aa0011", active: true, order: 0 },
  { id: "nude", name: "Nude", hex: "#c99b87", active: true, order: 1 },
];
// Producto como lo entrega el catálogo público al navegador (pasa por data-source).
function publicProduct(id, info, pos = {}) {
  const raw = { id, name: "Producto " + id, price: 30000, available: true, category: "Rostro", image: null, images: [], promoActive: false, promoPrice: null, ...pos, ...details.publicDetails(details.serializeDetails(info || {})) };
  return ds.__internal.normalizeApiProduct(raw);
}

console.log("Modelo — precio propio opcional en la ficha");
await test("se guarda solo un precio válido (entero > 0); vacío, cero, negativo, decimal o texto = sin precio propio", () => {
  const s = details.sanitizeDetails({ shades: [...RUBOR, { id: "x", name: "X", hex: "#000000", active: true, price: 0 }, { id: "y", name: "Y", hex: "#111111", active: true, price: -5 }, { id: "z", name: "Z", hex: "#222222", active: true, price: 12.5 }, { id: "w", name: "W", hex: "#333333", active: true, price: "abc" }, { id: "v", name: "V", hex: "#444444", active: true, price: "" }] }).shades;
  assert.deepEqual(s.map((o) => [o.id, o.price ?? null]), [["rosa", 35000], ["coral", 38000], ["terracota", 37000], ["x", null], ["y", null], ["z", null], ["w", null], ["v", null]]);
  assert.equal(details.sanitizeDetails({ presentations: [{ id: "g", name: "Grande", active: true, price: "45000" }] }).presentations[0].price, 45000);
});
await test("12. productos existentes: una ficha sin precios se lee y se guarda igual que antes (sin clave price)", () => {
  const s = details.sanitizeDetails({ shades: SIN_PRECIO, presentations: [{ id: "15ml", name: "15 ml", active: true, order: 0 }] });
  assert.deepEqual(s.shades, SIN_PRECIO);
  assert.deepEqual(s.presentations, [{ id: "15ml", name: "15 ml", active: true, order: 0 }]);
  assert.ok(!JSON.stringify(details.serializeDetails({ shades: SIN_PRECIO })).includes("price"));
});

console.log("Cliente — precio de cada combinación");
await test("1. producto sin variantes: mismo precio de siempre (con y sin promoción del POS)", () => {
  const p = publicProduct(1, {});
  assert.deepEqual(V.optionPriceInfo(p, null, null), { price: 30000, originalPrice: null, ownPrice: false });
  assert.equal(V.resolveVariant(p, null, null).price, 30000);
  const promo = publicProduct(2, {}, { promoActive: true, promoPrice: 25000 });
  assert.deepEqual(V.optionPriceInfo(promo, null, null), { price: 25000, originalPrice: 30000, ownPrice: false });
});
await test("2. variantes sin precio propio: usan el precio general (y su promoción)", () => {
  const p = publicProduct(3, { shades: SIN_PRECIO });
  assert.equal(V.resolveVariant(p, "rojo", null).price, 30000);
  assert.equal(V.resolveVariant(p, "nude", null).price, 30000);
  assert.deepEqual(V.priceRange(p), { min: 30000, max: 30000 });
  const promo = publicProduct(4, { shades: SIN_PRECIO }, { promoActive: true, promoPrice: 27000 });
  assert.deepEqual([V.resolveVariant(promo, "nude", null).price, V.resolveVariant(promo, "nude", null).originalPrice], [27000, 30000]);
});
await test("3. variantes con precios distintos: cada una tiene su precio; rango «desde» el menor", () => {
  const rubor = publicProduct(5, { shades: RUBOR });
  assert.deepEqual(RUBOR.map((o) => V.resolveVariant(rubor, o.id, null).price), [35000, 38000, 37000]);
  assert.deepEqual(V.priceRange(rubor), { min: 35000, max: 38000 });
  const polvo = publicProduct(6, { presentations: POLVO });
  assert.deepEqual([V.resolveVariant(polvo, null, "individual").price, V.resolveVariant(polvo, null, "grande").price], [32000, 45000]);
});
await test("4. cambiar de variante cambia el precio (sin mezclar precios entre variantes)", () => {
  const rubor = publicProduct(7, { shades: RUBOR });
  const seq = ["rosa", "coral", "terracota", "coral", "rosa"].map((id) => V.resolveVariant(rubor, id, null).price);
  assert.deepEqual(seq, [35000, 38000, 37000, 38000, 35000]);
});
await test("regla con dos dimensiones: manda el precio de la presentación; si no tiene, el del tono; si ninguno, el general", () => {
  const p = publicProduct(8, { shades: [RUBOR[1], SIN_PRECIO[0]], presentations: [POLVO[1], { id: "mini", name: "Mini", active: true, order: 2 }] });
  assert.equal(V.resolveVariant(p, "coral", "grande").price, 45000);
  assert.equal(V.resolveVariant(p, "coral", "mini").price, 38000);
  assert.equal(V.resolveVariant(p, "rojo", "mini").price, 30000);
  assert.deepEqual(V.priceRange(p), { min: 30000, max: 45000 });
});
await test("(regla vigente desde el ajuste final) la promoción del POS se aplica también al precio propio; las opciones sin precio, como siempre", () => {
  // ~~Antes: un precio propio no recibía la promoción.~~ Ahora sí, con la misma proporción.
  const p = publicProduct(9, { shades: [RUBOR[1], SIN_PRECIO[0]] }, { promoActive: true, promoPrice: 24000 });
  assert.deepEqual(V.optionPriceInfo(p, "coral", null), { price: 30400, originalPrice: 38000, ownPrice: true });
  assert.deepEqual(V.optionPriceInfo(p, "rojo", null), { price: 24000, originalPrice: 30000, ownPrice: false });
});
await test("una opción inactiva no entra en el rango «desde»", () => {
  const p = publicProduct(10, { shades: [RUBOR[0], { ...RUBOR[1], active: false }, RUBOR[2]] });
  assert.deepEqual(V.priceRange(p), { min: 35000, max: 37000 });
});

console.log("Carrito y checkout");
await test("5 y 6. el carrito guarda el precio de la variante elegida (propio o general)", async () => {
  const cart = await freshCart();
  const p = publicProduct(11, { shades: [RUBOR[1], SIN_PRECIO[0]] });
  cart.addToCart(p, V.resolveVariant(p, "coral", null), 1);
  cart.addToCart(p, V.resolveVariant(p, "rojo", null), 1);
  assert.deepEqual(cart.getCart().map((i) => [i.variantId, i.price]), [["s:coral", 38000], ["s:rojo", 30000]]);
});
await test("7. cambiar cantidades no altera el precio unitario; el subtotal se recalcula", async () => {
  const cart = await freshCart();
  const p = publicProduct(12, { shades: RUBOR });
  const v = V.resolveVariant(p, "coral", null);
  cart.addToCart(p, v, 1);
  cart.changeQuantity(p.id, v.id, 2);
  cart.addToCart(p, v, 1);
  const [line] = cart.getCart();
  assert.deepEqual([line.price, line.quantity, cart.getCartTotal()], [38000, 4, 152000]);
});
await test("8. resumen del checkout: líneas con su precio unitario y total exacto", async () => {
  const cart = await freshCart();
  const rubor = publicProduct(13, { shades: RUBOR });
  const polvo = publicProduct(14, { presentations: POLVO });
  cart.addToCart(rubor, V.resolveVariant(rubor, "terracota", null), 2);
  cart.addToCart(polvo, V.resolveVariant(polvo, null, "grande"), 1);
  const summary = computeOrderSummary(cart.getCart());
  assert.deepEqual(summary.lines.map((l) => [l.price, l.quantity, l.lineSubtotal]), [[37000, 2, 74000], [45000, 1, 45000]]);
  assert.equal(summary.total, 119000);
});
await test("10 (carrito). si cambia el precio de una variante, el carrito se actualiza al precio vigente de ESA variante", async () => {
  const cart = await freshCart();
  const p = publicProduct(15, { shades: RUBOR });
  cart.addToCart(p, V.resolveVariant(p, "coral", null), 1);
  const updated = publicProduct(15, { shades: [RUBOR[0], { ...RUBOR[1], price: 40000 }, RUBOR[2]] });
  const changes = cart.syncCartPrices((item) => V.optionPriceInfo(updated, item.shadeId, item.presentationId));
  assert.deepEqual(changes.map((c) => [c.from, c.to]), [[38000, 40000]]);
  assert.equal(cart.getCart()[0].price, 40000);
});
await test("app.js usa la regla única: ficha, agregar al carrito y sincronización del carrito", () => {
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(app, /return v \? v\.price : priceRange\(p\)\.min;/);
  assert.match(app, /addToCart\(state\.product, hasOptions\(state\.product\) \? variant : /);
  assert.match(app, /const info = optionPriceInfo\(p, item\.shadeId \?\? null, item\.presentationId \?\? null\);/);
  assert.match(app, /\$\("#pdpPriceArea"\)\.innerHTML = pdpPriceAreaHtml\(p\);/);
});

console.log("Servidor — /api/orders/create (Supabase/Resend simulados)");
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real", RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE <p@vibe.test>", ORDERS_NOTIFICATION_EMAIL: "buzon@example.com" };
const CUSTOMER = { name: "Clienta", phone: "3001112233", email: "c@example.com", city: "Bogotá", address: "Calle 1" };
function makeDb(products) {
  const db = { orders: [], products, patches: [] };
  db.fetch = async (url, o = {}) => {
    const u = String(url);
    const method = o.method || "GET";
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (u.startsWith("https://api.resend.com")) return json(200, { id: "e" });
    if (u.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp no configurado");
    if (u.includes("/rest/v1/products")) return json(200, db.products.map((p) => p.pos));
    if (u.includes("/rest/v1/catalog_metadata")) return json(200, db.products.map((p) => ({ product_id: p.pos.id, published: true, additional_info: p.info ? JSON.stringify(p.info) : null, presentation: null })));
    if (u.includes("/rest/v1/orders") && method === "GET") return json(200, []);
    if (u.includes("/rest/v1/orders") && method === "POST") {
      const row = { ...JSON.parse(o.body), id: 900 + db.orders.length, created_at: "2026-11-20T00:00:00Z", status: "received" };
      db.orders.push(row);
      return json(201, [row]);
    }
    if (u.includes("/rest/v1/orders") && method === "PATCH") { db.patches.push(JSON.parse(o.body)); return json(204); }
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
const POS = (id, extra) => ({ id, name: "Producto " + id, price: 30000, stock: 5, category: "Rostro", promo_active: false, ...extra });

await test("9. pedido: guarda el precio unitario aplicado, su origen y el subtotal de cada línea", async () => {
  const db = makeDb([{ pos: POS(20), info: { shades: [RUBOR[1], SIN_PRECIO[0]] } }]);
  const res = await create(db, [{ productId: 20, quantity: 2, shadeId: "coral" }, { productId: 20, quantity: 1, shadeId: "rojo" }], { expectedTotal: 106000 });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.orders[0].items.map((i) => [i.productId, i.name, i.variantName, i.basePrice, i.price, i.priceSource, i.promoApplied, i.discount, i.quantity, i.lineSubtotal]), [
    [20, "Producto 20", "Coral", 38000, 38000, "shade", false, 0, 2, 76000],
    [20, "Producto 20", "Rojo", 30000, 30000, "product", false, 0, 1, 30000],
  ]);
  assert.equal(db.orders[0].total, 106000);
});
await test("presentación con precio propio (Polvo: Individual / Grande) y precedencia sobre el tono en el servidor", async () => {
  const db = makeDb([{ pos: POS(21), info: { shades: [RUBOR[1]], presentations: POLVO } }]);
  const res = await create(db, [{ productId: 21, quantity: 1, shadeId: "coral", presentationId: "grande" }, { productId: 21, quantity: 1, shadeId: "coral", presentationId: "individual" }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.orders[0].items.map((i) => i.price), [45000, 32000]);
});
await test("10 (pedido). cambiar después el precio de la variante no altera el pedido ya registrado", async () => {
  const db = makeDb([{ pos: POS(22), info: { shades: RUBOR } }]);
  await create(db, [{ productId: 22, quantity: 1, shadeId: "coral" }]);
  const before = JSON.stringify(db.orders[0]);
  db.products[0].info = { shades: [RUBOR[0], { ...RUBOR[1], price: 41000 }, RUBOR[2]] };
  const res2 = await create(db, [{ productId: 22, quantity: 1, shadeId: "coral" }]);
  assert.equal(res2.statusCode, 201);
  assert.equal(JSON.stringify(db.orders[0]), before);
  assert.deepEqual([db.orders[0].items[0].price, db.orders[1].items[0].price], [38000, 41000]);
});
await test("11. precio manipulado en el navegador: el servidor lo ignora y cobra el autorizado de ESA variante", async () => {
  const db = makeDb([{ pos: POS(23), info: { shades: RUBOR } }]);
  const res = await create(db, [{ productId: 23, quantity: 1, shadeId: "coral", price: 1, originalPrice: 1, priceSource: "variant", lineSubtotal: 1, variantName: "Gratis" }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual([db.orders[0].items[0].price, db.orders[0].items[0].variantName, db.orders[0].total], [38000, "Coral", 38000]);
});
await test("11. total esperado manipulado o desactualizado: 409 PRICE_CHANGED con el precio real de la variante, sin registrar", async () => {
  const db = makeDb([{ pos: POS(24), info: { shades: RUBOR } }]);
  const res = await create(db, [{ productId: 24, quantity: 2, shadeId: "coral" }], { expectedTotal: 2 });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "PRICE_CHANGED");
  assert.equal(res.body.total, 76000);
  assert.deepEqual(res.body.prices, [{ productId: 24, variantId: "s:coral", price: 38000 }]);
  assert.equal(db.orders.length, 0);
});
await test("12. pedidos sin variantes y con variantes sin precio: precio del POS y su promoción, como antes", async () => {
  const db = makeDb([{ pos: POS(25, { promo_active: true, promo_price: 26000 }) }, { pos: POS(26), info: { shades: SIN_PRECIO } }]);
  const res = await create(db, [{ productId: 25, quantity: 1 }, { productId: 26, quantity: 1, shadeId: "nude" }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(db.orders[0].items.map((i) => [i.price, i.priceSource]), [[26000, "product"], [30000, "product"]]);
});
await test("12. pedidos históricos (sin priceSource) se siguen mostrando en el Admin", () => {
  const admin = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  assert.match(admin, /const own = l\.priceSource === "variant" \? /);
  assert.match(admin, /<td>\$\{money\(Number\(o\.total\)\)\}\$\{orderLinesHtml\(o\)\}<\/td>/);
});

console.log("Promociones del POS sobre el precio de la variante (ajuste final)");
// Producto de ejemplo de la propietaria: general 35.000 con promoción del
// POS a 31.500 (−10 %). Coral tiene precio propio 38.000 → 34.200.
const PROMO_POS = { price: 35000, promoActive: true, promoPrice: 31500, promoText: "10 % de descuento" };
const PROMO_ROW = { price: 35000, promo_active: true, promo_price: 31500, promo_text: "10 % de descuento" };
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const MIX = { shades: [RUBOR[1], SIN_PRECIO[0]], presentations: [POLVO[1], { id: "mini", name: "Mini", active: true, order: 2 }] };
const line = (db, n = 0, i = 0) => db.orders[n].items[i];
const audit = (l) => [l.basePrice, l.priceSource, l.promoApplied, l.discount, l.price, l.quantity, l.lineSubtotal];

await test("P1. promoción porcentual sobre precio propio: Coral 38.000 con −10 % → 34.200 (cliente y servidor)", async () => {
  const p = publicProduct(40, { shades: RUBOR }, PROMO_POS);
  assert.deepEqual(V.optionPriceInfo(p, "coral", null), { price: 34200, originalPrice: 38000, ownPrice: true });
  assert.deepEqual(RUBOR.map((o) => V.resolveVariant(p, o.id, null).price), [31500, 34200, 33300]);
  const db = makeDb([{ pos: POS(40, PROMO_ROW), info: { shades: RUBOR } }]);
  const res = await create(db, [{ productId: 40, quantity: 1, shadeId: "coral" }], { expectedTotal: 34200 });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(audit(line(db)), [38000, "shade", true, 3800, 34200, 1, 34200]);
});
await test("P2. promoción de valor fijo: el POS solo maneja un precio promocional fijo por producto (no hay tipo «monto de descuento»); sobre el precio propio se aplica su misma proporción", async () => {
  // POS: general 30.000, precio promocional fijo 25.000. Precio propio 36.000 → 36.000 × 25.000 / 30.000 = 30.000.
  const pos = { price: 30000, promoActive: true, promoPrice: 25000 };
  const p = publicProduct(41, { shades: [{ ...RUBOR[1], price: 36000 }, SIN_PRECIO[0]] }, pos);
  assert.equal(V.optionPriceInfo(p, "coral", null).price, 30000);
  assert.equal(V.optionPriceInfo(p, "rojo", null).price, 25000); // precio general: el fijo del POS, sin cambios
  const db = makeDb([{ pos: POS(41, { promo_active: true, promo_price: 25000 }), info: { shades: [{ ...RUBOR[1], price: 36000 }, SIN_PRECIO[0]] } }]);
  await create(db, [{ productId: 41, quantity: 1, shadeId: "coral" }, { productId: 41, quantity: 1, shadeId: "rojo" }]);
  assert.deepEqual(db.orders[0].items.map((l) => [l.basePrice, l.discount, l.price]), [[36000, 6000, 30000], [30000, 5000, 25000]]);
});
await test("P3. variante que hereda el precio general con promoción: precio promocional del POS, tachado el general", async () => {
  const p = publicProduct(42, MIX, PROMO_POS);
  assert.deepEqual(V.optionPriceInfo(p, "rojo", "mini"), { price: 31500, originalPrice: 35000, ownPrice: false });
  const db = makeDb([{ pos: POS(42, PROMO_ROW), info: MIX }]);
  await create(db, [{ productId: 42, quantity: 2, shadeId: "rojo", presentationId: "mini" }]);
  assert.deepEqual(audit(line(db)), [35000, "product", true, 3500, 31500, 2, 63000]);
});
await test("P4. precio de presentación prevalece sobre el del tono (Coral 38.000 + Grande 45.000 → base 45.000 → 40.500)", async () => {
  const p = publicProduct(43, MIX, PROMO_POS);
  assert.deepEqual(V.optionPriceInfo(p, "coral", "grande"), { price: 40500, originalPrice: 45000, ownPrice: true });
  const db = makeDb([{ pos: POS(43, PROMO_ROW), info: MIX }]);
  await create(db, [{ productId: 43, quantity: 1, shadeId: "coral", presentationId: "grande" }]);
  assert.deepEqual(audit(line(db)), [45000, "presentation", true, 4500, 40500, 1, 40500]);
});
await test("P5. precio del tono cuando la presentación no tiene precio (Coral + Mini → base 38.000 → 34.200)", async () => {
  const p = publicProduct(44, MIX, PROMO_POS);
  assert.equal(V.optionPriceInfo(p, "coral", "mini").price, 34200);
  const db = makeDb([{ pos: POS(44, PROMO_ROW), info: MIX }]);
  await create(db, [{ productId: 44, quantity: 1, shadeId: "coral", presentationId: "mini" }]);
  assert.deepEqual(audit(line(db)), [38000, "shade", true, 3800, 34200, 1, 34200]);
});
await test("P6. producto sin precio propio en ninguna opción: exactamente el precio del POS con su promoción, como antes", async () => {
  const p = publicProduct(45, { shades: SIN_PRECIO }, PROMO_POS);
  assert.deepEqual(V.priceRange(p), { min: 31500, max: 31500 });
  const db = makeDb([{ pos: POS(45, PROMO_ROW), info: { shades: SIN_PRECIO } }, { pos: POS(46, PROMO_ROW) }]);
  await create(db, [{ productId: 45, quantity: 1, shadeId: "nude" }, { productId: 46, quantity: 1 }]);
  assert.deepEqual(db.orders[0].items.map(audit), [[35000, "product", true, 3500, 31500, 1, 31500], [35000, "product", true, 3500, 31500, 1, 31500]]);
});
await test("P7. promoción vencida o aún no iniciada (vigencia del POS): no se aplica a ningún precio", async () => {
  for (const window of [{ promo_end: iso(-DAY) }, { promo_start: iso(DAY) }]) {
    const db = makeDb([{ pos: POS(47, { ...PROMO_ROW, ...window }), info: MIX }]);
    const res = await create(db, [{ productId: 47, quantity: 1, shadeId: "coral", presentationId: "mini" }, { productId: 47, quantity: 1, shadeId: "rojo", presentationId: "mini" }], { expectedTotal: 73000 });
    assert.equal(res.statusCode, 201, JSON.stringify(window));
    assert.deepEqual(db.orders[0].items.map(audit), [[38000, "shade", false, 0, 38000, 1, 38000], [35000, "product", false, 0, 35000, 1, 35000]]);
  }
  // Vigente (dentro de la ventana): sí se aplica.
  const db = makeDb([{ pos: POS(47, { ...PROMO_ROW, promo_start: iso(-DAY), promo_end: iso(DAY) }), info: MIX }]);
  await create(db, [{ productId: 47, quantity: 1, shadeId: "coral", presentationId: "mini" }]);
  assert.equal(line(db).price, 34200);
});
await test("P8. promoción no elegible (desactivada en el POS o sin precio promocional): no se aplica; un precio promocional ≥ general no rebaja un precio propio", async () => {
  const db = makeDb([{ pos: POS(48, { price: 35000, promo_active: false, promo_price: 31500 }), info: RUBOR && { shades: RUBOR } }]);
  await create(db, [{ productId: 48, quantity: 1, shadeId: "coral" }]);
  assert.deepEqual(audit(line(db)), [38000, "shade", false, 0, 38000, 1, 38000]);
  assert.deepEqual(V.optionPriceInfo(publicProduct(48, { shades: RUBOR }, { price: 35000, promoActive: false, promoPrice: 31500 }), "coral", null), { price: 38000, originalPrice: null, ownPrice: true });
  assert.deepEqual(V.optionPriceInfo(publicProduct(49, { shades: RUBOR }, { price: 35000, promoActive: true, promoPrice: null }), "coral", null), { price: 38000, originalPrice: null, ownPrice: true });
  assert.deepEqual(server.linePrice({ price: 35000, promoActive: true, promoPrice: 35000 }, { optionPrice: 38000, optionPriceSource: "shade" }), { basePrice: 38000, price: 38000, discount: 0, priceSource: "shade", promo: null });
});
await test("P9. sin doble descuento: siempre desde el precio base; sincronizar el carrito o reenviar el precio rebajado no vuelve a descontar", async () => {
  const cart = await freshCart();
  const p = publicProduct(50, { shades: RUBOR }, PROMO_POS);
  cart.addToCart(p, V.resolveVariant(p, "coral", null), 1);
  for (let k = 0; k < 3; k++) cart.syncCartPrices((item) => V.optionPriceInfo(p, item.shadeId, item.presentationId));
  assert.deepEqual([cart.getCart()[0].price, cart.getCart()[0].originalPrice], [34200, 38000]);
  const db = makeDb([{ pos: POS(50, PROMO_ROW), info: { shades: RUBOR } }]);
  await create(db, [{ productId: 50, quantity: 1, shadeId: "coral", price: 34200, originalPrice: 38000 }], { expectedTotal: 34200 });
  assert.deepEqual(audit(line(db)), [38000, "shade", true, 3800, 34200, 1, 34200]);
  assert.equal(line(db).basePrice - line(db).discount, line(db).price);
});
await test("P10. redondeo al peso y totales: 37.000 × 25.000 / 30.000 = 30.833,33 → 30.833; subtotal y total con el unitario redondeado", async () => {
  const info = { shades: [{ ...RUBOR[2] }] };
  const p = publicProduct(51, info, { price: 30000, promoActive: true, promoPrice: 25000 });
  assert.equal(V.resolveVariant(p, "terracota", null).price, 30833);
  const cart = await freshCart();
  cart.addToCart(p, V.resolveVariant(p, "terracota", null), 3);
  assert.equal(cart.getCartTotal(), 92499);
  const db = makeDb([{ pos: POS(51, { promo_active: true, promo_price: 25000 }), info }]);
  const res = await create(db, [{ productId: 51, quantity: 3, shadeId: "terracota" }], { expectedTotal: cart.getCartTotal() });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(audit(line(db)), [37000, "shade", true, 6167, 30833, 3, 92499]);
  assert.equal(db.orders[0].total, 92499);
  assert.ok(Number.isInteger(line(db).price) && Number.isInteger(line(db).discount));
  // Fracción ≥ 0,5 sube: 38.000 × 25.000 / 30.000 = 31.666,67 → 31.667 (cliente y servidor iguales).
  const info2 = { shades: [RUBOR[1]] };
  const p2 = publicProduct(61, info2, { price: 30000, promoActive: true, promoPrice: 25000 });
  assert.equal(V.resolveVariant(p2, "coral", null).price, 31667);
  const db2 = makeDb([{ pos: POS(61, { promo_active: true, promo_price: 25000 }), info: info2 }]);
  const res2 = await create(db2, [{ productId: 61, quantity: 2, shadeId: "coral" }], { expectedTotal: 63334 });
  assert.equal(res2.statusCode, 201);
  assert.deepEqual(audit(line(db2)), [38000, "shade", true, 6333, 31667, 2, 63334]);
});
await test("P11. el precio con promoción se conserva en carrito y checkout (con el precio base como tachado)", async () => {
  const cart = await freshCart();
  const rubor = publicProduct(52, { shades: RUBOR }, PROMO_POS);
  const polvo = publicProduct(53, MIX, PROMO_POS);
  cart.addToCart(rubor, V.resolveVariant(rubor, "coral", null), 2);
  cart.addToCart(polvo, V.resolveVariant(polvo, "coral", "grande"), 1);
  assert.deepEqual(cart.getCart().map((i) => [i.price, i.originalPrice]), [[34200, 38000], [40500, 45000]]);
  const summary = computeOrderSummary(cart.getCart());
  assert.deepEqual(summary.lines.map((l) => [l.price, l.quantity, l.lineSubtotal]), [[34200, 2, 68400], [40500, 1, 40500]]);
  assert.equal(summary.total, 108900);
  const db = makeDb([{ pos: POS(52, PROMO_ROW), info: { shades: RUBOR } }, { pos: POS(53, PROMO_ROW), info: MIX }]);
  const res = await create(db, [{ productId: 52, quantity: 2, shadeId: "coral" }, { productId: 53, quantity: 1, shadeId: "coral", presentationId: "grande" }], { expectedTotal: summary.total });
  assert.equal(res.statusCode, 201);
});
await test("P12. el pedido guarda precio base, origen, promoción, descuento, unitario final, cantidad y subtotal de cada línea", async () => {
  const db = makeDb([{ pos: POS(54, PROMO_ROW), info: { shades: RUBOR } }]);
  await create(db, [{ productId: 54, quantity: 3, shadeId: "coral" }]);
  const l = line(db);
  assert.deepEqual(
    { productId: l.productId, name: l.name, variantId: l.variantId, variantName: l.variantName, basePrice: l.basePrice, priceSource: l.priceSource, promoApplied: l.promoApplied, promoText: l.promoText, promoProductPrice: l.promoProductPrice, promoProductPromoPrice: l.promoProductPromoPrice, discount: l.discount, price: l.price, quantity: l.quantity, lineSubtotal: l.lineSubtotal },
    { productId: 54, name: "Producto 54", variantId: "s:coral", variantName: "Coral", basePrice: 38000, priceSource: "shade", promoApplied: true, promoText: "10 % de descuento", promoProductPrice: 35000, promoProductPromoPrice: 31500, discount: 3800, price: 34200, quantity: 3, lineSubtotal: 102600 },
  );
  // Sin promoción: los campos de promoción quedan vacíos, no inventados.
  const db2 = makeDb([{ pos: POS(55), info: { shades: RUBOR } }]);
  await create(db2, [{ productId: 55, quantity: 1, shadeId: "rosa" }]);
  assert.deepEqual([line(db2).promoApplied, line(db2).promoText, line(db2).promoProductPrice, line(db2).promoProductPromoPrice, line(db2).discount], [false, null, null, null, 0]);
});
await test("P13. cambiar después el precio del producto en el POS no altera pedidos ya registrados", async () => {
  const db = makeDb([{ pos: POS(56, PROMO_ROW), info: MIX }]);
  await create(db, [{ productId: 56, quantity: 1, shadeId: "coral", presentationId: "mini" }, { productId: 56, quantity: 1, shadeId: "rojo", presentationId: "mini" }]);
  const before = JSON.stringify(db.orders[0]);
  db.products[0].pos = POS(56, { ...PROMO_ROW, price: 40000, promo_price: 30000 });
  await create(db, [{ productId: 56, quantity: 1, shadeId: "coral", presentationId: "mini" }, { productId: 56, quantity: 1, shadeId: "rojo", presentationId: "mini" }]);
  assert.equal(JSON.stringify(db.orders[0]), before);
  assert.deepEqual(db.orders.map((o) => o.items.map((l) => l.price)), [[34200, 31500], [28500, 30000]]);
});
await test("P14. cambiar o quitar después la promoción no altera pedidos ya registrados", async () => {
  const db = makeDb([{ pos: POS(57, PROMO_ROW), info: { shades: RUBOR } }]);
  await create(db, [{ productId: 57, quantity: 2, shadeId: "coral" }]);
  const before = JSON.stringify(db.orders[0]);
  db.products[0].pos = POS(57, { ...PROMO_ROW, promo_active: false });
  await create(db, [{ productId: 57, quantity: 2, shadeId: "coral" }]);
  db.products[0].pos = POS(57, { ...PROMO_ROW, promo_price: 28000 });
  await create(db, [{ productId: 57, quantity: 2, shadeId: "coral" }]);
  assert.equal(JSON.stringify(db.orders[0]), before);
  assert.deepEqual(db.orders.map((o) => [o.items[0].price, o.items[0].promoApplied, o.total]), [[34200, true, 68400], [38000, false, 76000], [30400, true, 60800]]);
});
await test("P15. conciliación: cada línea conserva producto, variante, unitario cobrado y la referencia de la promoción del POS; las cuentas cuadran", async () => {
  const db = makeDb([{ pos: POS(58, PROMO_ROW), info: MIX }]);
  await create(db, [
    { productId: 58, quantity: 2, shadeId: "coral", presentationId: "grande" },
    { productId: 58, quantity: 1, shadeId: "coral", presentationId: "mini" },
    { productId: 58, quantity: 4, shadeId: "rojo", presentationId: "mini" },
  ]);
  const items = db.orders[0].items;
  assert.deepEqual(items.map((l) => [l.productId, l.variantId, l.variantName, l.priceSource, l.price]), [
    [58, "s:coral|p:grande", "Coral · Grande", "presentation", 40500],
    [58, "s:coral|p:mini", "Coral · Mini", "shade", 34200],
    [58, "s:rojo|p:mini", "Rojo · Mini", "product", 31500],
  ]);
  for (const l of items) {
    assert.equal(l.basePrice - l.discount, l.price);
    assert.equal(l.price * l.quantity, l.lineSubtotal);
    assert.deepEqual([l.promoProductPrice, l.promoProductPromoPrice], [35000, 31500]);
  }
  assert.equal(db.orders[0].total, items.reduce((s, l) => s + l.lineSubtotal, 0));
});
await test("P16. manipulación: precios, descuento o total enviados por el navegador se ignoran; un total que no coincide se rechaza (409) sin registrar", async () => {
  const db = makeDb([{ pos: POS(59, PROMO_ROW), info: { shades: RUBOR } }]);
  // Total con el precio sin promoción (desactualizado) o rebajado a mano: 409.
  for (const expectedTotal of [38000, 1000, 30780]) {
    const res = await create(db, [{ productId: 59, quantity: 1, shadeId: "coral" }], { expectedTotal });
    assert.equal(res.statusCode, 409, String(expectedTotal));
    assert.equal(res.body.code, "PRICE_CHANGED");
    assert.deepEqual([res.body.total, res.body.prices], [34200, [{ productId: 59, variantId: "s:coral", price: 34200 }]]);
  }
  assert.equal(db.orders.length, 0);
  // Campos de precio inventados en la línea: se ignoran, el servidor calcula todo.
  const res = await create(db, [{ productId: 59, quantity: 1, shadeId: "coral", price: 1, basePrice: 1, discount: 99999, promoApplied: true, priceSource: "presentation", lineSubtotal: 1 }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(audit(line(db)), [38000, "shade", true, 3800, 34200, 1, 34200]);
});
await test("P17. pedidos históricos: no se recalculan y el Admin los sigue mostrando como antes (sin precio base ni promoción)", async () => {
  const admin = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  assert.match(admin, /if \(l\.basePrice == null\) \{/);
  assert.match(admin, /Base \$\{money\(Number\(l\.basePrice\)\)\} \(\$\{origin\}\)/);
  assert.match(admin, /Unitario final \$\{money\(Number\(l\.price\)\)\}/);
  // Después de registrar el pedido, lo único que se actualiza son las
  // marcas de aviso: nunca items ni total.
  const db = makeDb([{ pos: POS(60, PROMO_ROW), info: { shades: RUBOR } }]);
  await create(db, [{ productId: 60, quantity: 1, shadeId: "coral" }]);
  assert.ok(db.patches.length > 0, "se esperaba al menos la marca de aviso");
  for (const body of db.patches) assert.ok(!("items" in body) && !("total" in body), JSON.stringify(body));
  // El endpoint del Admin para pedidos solo lista, borra o reenvía avisos.
  const ordersApi = fs.readFileSync(path.join(root, "api/admin/orders.js"), "utf8");
  assert.ok(!/method:\s*"PATCH"/.test(ordersApi) && !/method:\s*"PUT"/.test(ordersApi));
});

console.log("Admin — validación del precio por opción");
async function adminPatch(body, fetchImpl) {
  const saved = { t: process.env.ADMIN_API_TOKEN, u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.ADMIN_API_TOKEN = "admin-test-token";
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const originalError = console.error;
  global.fetch = fetchImpl || (async () => { throw new Error("no debería escribir"); });
  console.error = () => {};
  try {
    delete require.cache[require.resolve("../api/admin/catalog-metadata")];
    const res = { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await require("../api/admin/catalog-metadata")({ method: "PATCH", headers: { authorization: "Bearer admin-test-token" }, query: {}, body }, res);
    return res;
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    process.env.ADMIN_API_TOKEN = saved.t;
    if (saved.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.u;
    if (saved.k === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.k;
  }
}
await test("precio cero, negativo, decimal o texto: 400 con el nombre de la opción y sin escribir nada", async () => {
  for (const bad of [0, -100, 12.5, "abc", "35.000"]) {
    const res = await adminPatch({ product_id: 5, additional_info: { shades: [{ ...RUBOR[0], price: bad }] } });
    assert.equal(res.statusCode, 400, String(bad));
    assert.match(res.body.error, /Precio no válido en: Rosa\./);
  }
});
await test("precios válidos o vacíos: se guardan solo los válidos (vacío = precio general)", async () => {
  let written = null;
  const res = await adminPatch({ product_id: 5, additional_info: { shades: [{ ...RUBOR[0], price: 35000 }, { ...RUBOR[1], price: "" }] } }, async (url, o = {}) => {
    const u = String(url);
    if (u.includes("/rest/v1/catalog_metadata") && (o.method === "POST" || o.method === "PATCH")) {
      written = JSON.parse(o.body);
      return { ok: true, status: 201, text: async () => JSON.stringify([{ product_id: 5, ...(Array.isArray(written) ? written[0] : written) }]) };
    }
    return { ok: true, status: 200, text: async () => "[]" };
  });
  assert.equal(res.statusCode, 200);
  const row = Array.isArray(written) ? written[0] : written;
  const shades = JSON.parse(row.additional_info).shades;
  assert.deepEqual(shades.map((s) => [s.id, s.price ?? null]), [["rosa", 35000], ["coral", null]]);
});
await test("Admin: la validación del formulario (parseOptionPrice) acepta enteros > 0 y rechaza el resto", () => {
  // Se ejecuta la función real del Admin, extraída de su código fuente.
  const admin = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  const src = admin.match(/const parseOptionPrice = (\(text\) => \{[\s\S]*?\n  \});/);
  assert.ok(src, "parseOptionPrice no encontrada");
  const parse = new Function(`return ${src[1]}`)();
  assert.deepEqual(["38000", " 45000 ", "1"].map((t) => parse(t)), [{ price: 38000, invalid: false }, { price: 45000, invalid: false }, { price: 1, invalid: false }]);
  assert.deepEqual(["", "  ", null, undefined].map((t) => parse(t)), Array(4).fill({ price: null, invalid: false }));
  for (const t of ["0", "-5", "12.5", "35.000", "abc", "1e5", "100000001"]) assert.equal(parse(t).invalid, true, t);
});
await test("Admin: campo de precio por opción, estado visible y validación antes de guardar", () => {
  const admin = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  assert.match(admin, /\$\{optionPriceField\("shade", i, sh\)\}/);
  assert.match(admin, /\$\{optionPriceField\("presentation", i, pr\)\}/);
  assert.match(admin, /Precio propio: \\\$\{money\(price\)\}|Precio propio: \$\{money\(price\)\}/);
  assert.match(admin, /Usa el precio general \(/);
  assert.match(admin, /No se guardó: precio no válido en /);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
