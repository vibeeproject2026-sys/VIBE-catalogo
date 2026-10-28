// Runs with plain Node, no network, no real credentials:
//   node scripts/test-orders-create-guards.js
//
// Fase 56 — /api/orders/create:
// - antispam: honeypot, límite por IP (en memoria) y por teléfono (base);
// - idempotencia: repetir el mismo intento devuelve el pedido existente
//   sin crear otro ni volver a notificar (también con dos solicitudes
//   simultáneas); compatible antes de la migración 0005;
// - tonos: validación server-side de la variante elegida;
// - precios: si el total cambió desde que el cliente lo vio, 409 con los
//   precios vigentes (el servidor sigue siendo la autoridad);
// - estático: migración 0005 aditiva.
// Supabase/Resend simulados: nada real.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const guard = require("../api/orders/_lib/guard");

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
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real", RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE <p@vibe.test>", ORDERS_NOTIFICATION_EMAIL: "buzon@example.com" };
const CUSTOMER = { name: "Clienta", phone: "3001112233", email: "c@example.com", city: "Bogotá", address: "Calle 1" };
const SHADES = JSON.stringify({ shades: [
  { id: "rojo", name: "Rojo pasión", hex: "#aa0011", active: true, order: 0 },
  { id: "nude", name: "Nude", hex: "#c99b87", active: false, order: 1 },
  { id: "pend", name: "Pendiente", hex: null, active: true, order: 2 },
] });

// Base simulada. `orders` guarda los pedidos insertados (con su clave).
function makeDb({ product = { id: 1, name: "Labial", price: 20000, stock: 3, category: "Labios", promo_active: false }, additionalInfo = null, presentation = null, recentByPhone = 0, idemColumn = true, raceInsert = false } = {}) {
  const db = { orders: [], calls: [], resend: [] };
  db.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || "GET";
    db.calls.push({ method, url: u });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (u.startsWith("https://api.resend.com")) { db.resend.push(JSON.parse(opts.body).to); return json(200, { id: "e" }); }
    if (u.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp no configurado");
    if (u.includes("/rest/v1/products")) return json(200, product ? [product] : []);
    if (u.includes("/rest/v1/catalog_metadata")) return json(200, [{ product_id: 1, published: true, additional_info: additionalInfo, presentation }]);
    if (u.includes("/rest/v1/orders") && method === "GET" && u.includes("idempotency_key=eq.")) {
      if (!idemColumn) return json(400, { code: "42703", message: "column does not exist" });
      const key = decodeURIComponent(u.match(/idempotency_key=eq\.([^&]+)/)[1]);
      return json(200, db.orders.filter((o) => o.idempotency_key === key).map((o) => ({ id: o.id, total: o.total, customer_email: o.customer_email, customer_phone: o.customer_phone })));
    }
    if (u.includes("/rest/v1/orders") && method === "GET" && u.includes("customer_phone=eq.")) return json(200, Array.from({ length: recentByPhone }, (_, i) => ({ id: i + 1 })));
    if (u.includes("/rest/v1/orders") && method === "POST") {
      const body = JSON.parse(opts.body);
      if ("idempotency_key" in body && !idemColumn) return json(400, { code: "PGRST204", message: "Could not find the 'idempotency_key' column" });
      if (raceInsert && body.idempotency_key) {
        // Otro intento simultáneo con la misma clave ganó justo antes.
        db.orders.push({ ...body, id: 500, total: body.total });
        return json(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      if (body.idempotency_key && db.orders.some((o) => o.idempotency_key === body.idempotency_key)) return json(409, { code: "23505" });
      const row = { ...body, id: 100 + db.orders.length, created_at: "2026-10-27T00:00:00Z", status: "received" };
      db.orders.push(row);
      return json(201, [row]);
    }
    if (u.includes("/rest/v1/orders") && method === "PATCH") return json(204);
    throw new Error("ruta inesperada " + method + " " + u);
  };
  return db;
}

async function create(db, body, headers = {}) {
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
    const res = mockRes();
    await require("../api/orders/create")({ method: "POST", headers, body: { customer: CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 1 }], ...body } }, res);
    return res;
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    console.log = originalLog;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

async function main() {
  console.log("Antispam");
  await test("honeypot completado: 400 genérico, sin tocar la base ni enviar nada", async () => {
    const db = makeDb();
    const res = await create(db, { website: "https://spam.example" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "No se pudo procesar el pedido.");
    assert.equal(db.calls.length, 0);
  });
  await test("honeypot vacío: el pedido sigue normal (201)", async () => {
    const res = await create(makeDb(), { website: "" });
    assert.equal(res.statusCode, 201);
  });
  await test("límite por IP: tras 8 intentos en 10 minutos desde el mismo origen, 429 sin tocar la base", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    for (let i = 0; i < guard.IP_MAX_ATTEMPTS; i++) assert.notEqual((await create(makeDb(), {}, headers)).statusCode, 429, "intento " + (i + 1));
    const db = makeDb();
    const res = await create(db, {}, headers);
    assert.equal(res.statusCode, 429);
    assert.equal(db.calls.length, 0);
    // Otro origen no se ve afectado.
    assert.equal((await create(makeDb(), {}, { "x-forwarded-for": "198.51.100.2" })).statusCode, 201);
  });
  await test("límite por IP: la ventana expira (intentos viejos no cuentan)", () => {
    const req = { headers: { "x-forwarded-for": "192.0.2.50" } };
    const t0 = 1_000_000;
    for (let i = 0; i < guard.IP_MAX_ATTEMPTS; i++) guard.ipRateLimited(req, t0);
    assert.equal(guard.ipRateLimited(req, t0 + 1000), true);
    assert.equal(guard.ipRateLimited(req, t0 + guard.IP_WINDOW_MS + 1), false);
  });
  await test("límite por teléfono (persistente): 3 pedidos recientes del mismo número → 429, no se inserta", async () => {
    const db = makeDb({ recentByPhone: 3 });
    const res = await create(db);
    assert.equal(res.statusCode, 429);
    assert.equal(db.orders.length, 0);
    assert.equal((await create(makeDb({ recentByPhone: 2 }))).statusCode, 201);
  });

  console.log("Idempotencia");
  await test("clave con formato inválido: 400", async () => {
    const res = await create(makeDb(), { idempotencyKey: "corta" });
    assert.equal(res.statusCode, 400);
  });
  await test("primer envío con clave: 201, se guarda la clave y se notifica una vez", async () => {
    const db = makeDb();
    const res = await create(db, { idempotencyKey: KEY });
    assert.equal(res.statusCode, 201);
    assert.equal(db.orders.length, 1);
    assert.equal(db.orders[0].idempotency_key, KEY);
    assert.equal(db.resend.length, 2);
  });
  await test("reintento con la misma clave (corte de red): mismo pedido, 200 replayed, sin crear otro ni re-notificar", async () => {
    const db = makeDb();
    const first = await create(db, { idempotencyKey: KEY });
    const again = await create(db, { idempotencyKey: KEY });
    assert.equal(again.statusCode, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.id, first.body.id);
    assert.equal(again.body.total, first.body.total);
    assert.equal(db.orders.length, 1);
    assert.equal(db.resend.length, 2, "sin emails adicionales");
  });
  await test("dos solicitudes simultáneas con la misma clave (23505): se devuelve el pedido ganador, sin duplicar ni notificar", async () => {
    const db = makeDb({ raceInsert: true });
    const res = await create(db, { idempotencyKey: KEY });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.replayed, true);
    assert.equal(res.body.id, 500);
    assert.equal(db.resend.length, 0);
  });
  await test("pedidos nuevos legítimos (otra clave) siguen creándose", async () => {
    const db = makeDb();
    await create(db, { idempotencyKey: KEY });
    const second = await create(db, { idempotencyKey: "f0e1d2c3-b4a5-4968-8776-655443322110" });
    assert.equal(second.statusCode, 201);
    assert.equal(db.orders.length, 2);
  });
  await test("migración 0005 sin aplicar: el pedido se crea igual (sin clave) y no falla", async () => {
    const db = makeDb({ idemColumn: false });
    const res = await create(db, { idempotencyKey: KEY });
    assert.equal(res.statusCode, 201);
    assert.equal(db.orders.length, 1);
    assert.equal("idempotency_key" in db.orders[0], false);
  });
  await test("sin clave (clientes anteriores): comportamiento de siempre", async () => {
    const db = makeDb();
    const res = await create(db, {});
    assert.equal(res.statusCode, 201);
    assert.equal("idempotency_key" in db.orders[0], false);
  });

  console.log("Tonos (variantes)");
  await test("producto con tonos: sin tono elegido → 409 VARIANT_UNAVAILABLE, no se inserta", async () => {
    const db = makeDb({ additionalInfo: SHADES });
    const res = await create(db, { items: [{ productId: 1, quantity: 1 }] });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "VARIANT_UNAVAILABLE");
    assert.equal(db.orders.length, 0);
  });
  // Fase 57 — el tono viaja como shadeId (dimensión propia); variantId es
  // solo la clave de la combinación y nunca basta para elegir un tono.
  await test("tono inactivo, inexistente o pendiente (sin color): 409", async () => {
    for (const shadeId of ["nude", "inventado", "pend"]) {
      const res = await create(makeDb({ additionalInfo: SHADES }), { items: [{ productId: 1, quantity: 1, shadeId }] });
      assert.equal(res.statusCode, 409, shadeId);
    }
  });
  await test("variantId con el id de un tono, sin shadeId: no se acepta como tono elegido (409)", async () => {
    const res = await create(makeDb({ additionalInfo: SHADES }), { items: [{ productId: 1, quantity: 1, variantId: "rojo" }] });
    assert.equal(res.statusCode, 409);
  });
  await test("tono activo: se registra con el nombre del tono de la ficha (no el del navegador) y el precio del POS", async () => {
    const db = makeDb({ additionalInfo: SHADES });
    const res = await create(db, { items: [{ productId: 1, quantity: 2, variantId: "s:rojo", shadeId: "rojo", variantName: "Nombre falso" }] });
    assert.equal(res.statusCode, 201);
    const it = db.orders[0].items[0];
    assert.deepEqual([it.variantId, it.variantName, it.shadeId, it.shadeName, it.price, it.lineSubtotal], ["s:rojo", "Rojo pasión", "rojo", "Rojo pasión", 20000, 40000]);
  });
  await test("varias variantes del mismo producto en el mismo pedido", async () => {
    const twoActive = JSON.stringify({ shades: [{ id: "rojo", name: "Rojo", hex: "#aa0011", active: true }, { id: "rosa", name: "Rosa", hex: "#ff88aa", active: true }] });
    const db = makeDb({ additionalInfo: twoActive });
    const res = await create(db, { items: [{ productId: 1, quantity: 1, shadeId: "rojo" }, { productId: 1, quantity: 2, shadeId: "rosa" }] });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(db.orders[0].items.map((i) => [i.variantName, i.quantity]), [["Rojo", 1], ["Rosa", 2]]);
    assert.equal(db.orders[0].total, 60000);
  });
  await test("producto agotado en el POS: 409 aunque el tono esté activo", async () => {
    const res = await create(makeDb({ additionalInfo: SHADES, product: { id: 1, name: "Labial", price: 20000, stock: 0, category: "Labios" } }), { items: [{ productId: 1, quantity: 1, shadeId: "rojo" }] });
    assert.equal(res.statusCode, 409);
  });
  // Fase 57 — corrige Fase 56: un producto sin tonos ya no se registra como
  // «Único»; conserva su presentación real de la ficha (nunca la del
  // navegador) y, si no tiene ninguna, no se inventa.
  await test("producto sin opciones: conserva la presentación real de la ficha, no la del navegador ni «Único»", async () => {
    const db = makeDb({ presentation: "30 ml" });
    const res = await create(db, { items: [{ productId: 1, quantity: 1, variantId: "default", variantName: "Nombre falso" }] });
    assert.equal(res.statusCode, 201);
    const it = db.orders[0].items[0];
    assert.deepEqual([it.variantId, it.variantName, it.presentationId, it.presentationName], ["default", "30 ml", null, "30 ml"]);
    const db2 = makeDb();
    assert.equal((await create(db2, { items: [{ productId: 1, quantity: 1, variantName: "Único" }] })).statusCode, 201);
    assert.deepEqual([db2.orders[0].items[0].variantName, db2.orders[0].items[0].presentationName], [null, null]);
  });

  console.log("Precios");
  await test("total esperado distinto (el precio cambió): 409 PRICE_CHANGED con precios vigentes, sin insertar", async () => {
    const db = makeDb();
    const res = await create(db, { expectedTotal: 18000 });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PRICE_CHANGED");
    assert.equal(res.body.total, 20000);
    assert.deepEqual(res.body.prices, [{ productId: 1, variantId: "default", price: 20000 }]);
    assert.equal(db.orders.length, 0);
  });
  await test("total esperado igual: 201; con promoción, el precio efectivo es el promocional del POS", async () => {
    assert.equal((await create(makeDb(), { expectedTotal: 20000 })).statusCode, 201);
    const promo = { id: 1, name: "Labial", price: 20000, stock: 3, category: "Labios", promo_active: true, promo_price: 15000 };
    const db = makeDb({ product: promo });
    const res = await create(db, { expectedTotal: 15000 });
    assert.equal(res.statusCode, 201);
    assert.equal(db.orders[0].items[0].price, 15000);
  });
  await test("nunca se escribe en products (POS)", async () => {
    const db = makeDb({ additionalInfo: SHADES });
    await create(db, { items: [{ productId: 1, quantity: 1, shadeId: "rojo" }], idempotencyKey: KEY });
    assert.ok(db.calls.filter((c) => c.url.includes("/rest/v1/products")).every((c) => c.method === "GET"));
  });

  console.log("Migración 0005 (estático)");
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "manual", "0005_orders_idempotency_key.sql"), "utf8");
  const code = sql.split("\n").map((l) => (l.includes("--") ? l.slice(0, l.indexOf("--")) : l)).join("\n").toLowerCase().replace(/\s+/g, " ");
  await test("aditiva: una columna nullable + índice único PARCIAL; nada destructivo ni de permisos", () => {
    assert.match(code, /alter table orders add column if not exists idempotency_key text/);
    assert.match(code, /create unique index if not exists orders_idempotency_key_uidx on orders \(idempotency_key\) where idempotency_key is not null/);
    for (const w of ["drop ", "update ", "delete ", "truncate ", "insert ", "rename ", "grant ", "revoke ", "policy", "default"]) assert.ok(!code.includes(w), w);
    const columnDef = code.slice(code.indexOf("alter table orders"), code.indexOf(";", code.indexOf("alter table orders")));
    assert.ok(!columnDef.includes("not null"), "la columna debe admitir NULL (pedidos anteriores sin clave)");
    for (const t of ["products", "catalog_metadata", "categories", "sales"]) assert.ok(!code.includes(t), t);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
