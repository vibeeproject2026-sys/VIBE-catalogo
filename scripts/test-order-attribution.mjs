// Runs with plain Node, sin red ni credenciales reales:
//   node scripts/test-order-attribution.mjs
//
// Fase B — atribución de la tienda en el pedido:
// - js/analytics.js: captura solo con consentimiento, último origen no
//   directo (nunca se reemplaza con vacíos), sin datos personales, ids GA4.
// - api/orders/_lib/attribution.js: lista blanca y saneamiento.
// - /api/orders/create (Supabase simulado): con consentimiento, sin él, sin
//   UTM e intentos de inyección; compatibilidad sin las columnas.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.error("  FAIL - " + name); console.error("    " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n    ") : e)); }
}

// ── Navegador simulado (localStorage, location, cookies) ──
const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { href: "https://www.vibebeautycol.com/", hostname: "www.vibebeautycol.com" },
};
globalThis.document = { referrer: "", cookie: "", getElementById: () => null, querySelector: () => null, createElement: () => ({ addEventListener() {}, setAttribute() {} }), body: { appendChild() {} }, head: { appendChild() {} } };
const A = await import("../js/analytics.js");
const visit = (href, referrer = "") => { window.location.href = href; document.referrer = referrer; };

console.log("Navegador: js/analytics.js");
await test("campaña: UTM, ids de clic, página de entrada (sin parámetros ajenos) y procedencia", () => {
  const v = A.attributionFromVisit("https://www.vibebeautycol.com/?product=12&utm_source=instagram&utm_medium=social&utm_campaign=lanzamiento&fbclid=IwAR0abcDEF123_xyz&email=ana@x.com", "https://l.instagram.com/redirect?u=abc", Date.parse("2026-11-25T10:00:00Z"));
  assert.equal(v.kind, "campaign");
  assert.deepEqual(v.data, { utm_source: "instagram", utm_medium: "social", utm_campaign: "lanzamiento", fbclid: "IwAR0abcDEF123_xyz", referrer: "https://l.instagram.com/redirect", landing: "/?product=12&utm_source=instagram&utm_medium=social&utm_campaign=lanzamiento&fbclid=IwAR0abcDEF123_xyz", captured_at: "2026-11-25T10:00:00.000Z" });
});
await test("datos personales en UTM se descartan (correo, teléfono); ids de campaña largos se conservan", () => {
  const v = A.attributionFromVisit("https://www.vibebeautycol.com/?utm_source=ana%40mail.com&utm_term=300%20123%204567&utm_content=120212345678901234&gclid=x", "");
  assert.equal(v.data.utm_source, undefined);
  assert.equal(v.data.utm_term, undefined);
  assert.equal(v.data.utm_content, "120212345678901234");
  assert.equal(v.data.gclid, undefined);   // demasiado corto para ser un id de clic
});
await test("visita directa: solo página de entrada; navegación interna: nada", () => {
  const d = A.attributionFromVisit("https://www.vibebeautycol.com/legal.html", "");
  assert.equal(d.kind, "direct"); assert.deepEqual(Object.keys(d.data), ["landing", "captured_at"]);
  assert.equal(A.attributionFromVisit("https://www.vibebeautycol.com/?product=3", "https://vibebeautycol.com/").kind, "internal");
});
await test("no se reemplaza un origen válido con una visita directa o interna; uno nuevo sí; vence a los 30 días", () => {
  const now = Date.parse("2026-11-25T10:00:00Z");
  const camp = { utm_source: "instagram", landing: "/", captured_at: "2026-11-20T10:00:00.000Z" };
  assert.deepEqual(A.mergeAttribution(camp, { kind: "direct", data: { landing: "/x", captured_at: "2026-11-25T10:00:00.000Z" } }, now), camp);
  assert.deepEqual(A.mergeAttribution(camp, { kind: "internal", data: null }, now), camp);
  const g = { utm_source: "google", captured_at: "2026-11-25T10:00:00.000Z" };
  assert.deepEqual(A.mergeAttribution(camp, { kind: "campaign", data: g }, now), g);
  const old = { ...camp, captured_at: "2026-10-01T10:00:00.000Z" };
  assert.equal(A.mergeAttribution(old, { kind: "internal", data: null }, now), null);
});
await test("ids de GA4 desde las cookies (_ga y formatos GS1/GS2 de sesión)", () => {
  assert.deepEqual(A.parseGaCookies("_ga=GA1.1.1234567890.1700000000; _ga_R4YBBE3F2P=GS1.1.1764000000.3.1.1764000100.0.0.0", "G-R4YBBE3F2P"), { clientId: "1234567890.1700000000", sessionId: "1764000000" });
  assert.deepEqual(A.parseGaCookies("_ga=GA1.1.99.88; _ga_R4YBBE3F2P=GS2.1.s1764000555$o3$g1$t1764000600$j60$l0$h0", "G-R4YBBE3F2P"), { clientId: "99.88", sessionId: "1764000555" });
  assert.deepEqual(A.parseGaCookies("_ga=malo; otra=1", "G-X"), {});
});
await test("B. sin consentimiento: no se lee ni se guarda nada y el pedido no lleva atribución", async () => {
  A.__resetForTests(); store.clear(); A.__setMeasurementIdForTests("G-R4YBBE3F2P");
  visit("https://www.vibebeautycol.com/?utm_source=instagram", "https://instagram.com/");
  document.cookie = "_ga=GA1.1.1234567890.1700000000";
  A.__setConsentForTests(null);
  assert.equal(A.captureAttribution(), null);
  assert.deepEqual(await A.orderAttribution(), {});
  A.__setConsentForTests("denied");
  assert.equal(A.captureAttribution(), null);
  assert.deepEqual(await A.orderAttribution(), {});
  assert.equal(store.has(A.ATTRIBUTION_KEY), false);
});
await test("A. con consentimiento: guarda el origen y el pedido lleva atribución + ids de GA4", async () => {
  A.__resetForTests(); store.clear(); A.__setMeasurementIdForTests("G-R4YBBE3F2P");
  visit("https://www.vibebeautycol.com/?utm_source=instagram&utm_medium=social&utm_campaign=nov", "https://l.instagram.com/");
  document.cookie = "_ga=GA1.1.1234567890.1700000000; _ga_R4YBBE3F2P=GS1.1.1764000000.3.1.1764000100.0.0.0";
  A.__setConsentForTests("granted");
  A.captureAttribution();
  visit("https://www.vibebeautycol.com/?product=5", "https://www.vibebeautycol.com/");   // navegación interna
  A.captureAttribution();
  const p = await A.orderAttribution();
  assert.equal(p.attribution.utm_source, "instagram");
  assert.equal(p.attribution.utm_campaign, "nov");
  assert.equal(p.gaClientId, "1234567890.1700000000");
  assert.equal(p.gaSessionId, "1764000000");
  assert.deepEqual(Object.keys(p).sort(), ["attribution", "gaClientId", "gaSessionId"]);
});
await test("rechazar después de aceptar borra la atribución guardada", () => {
  A.setConsent("denied");
  assert.equal(store.has(A.ATTRIBUTION_KEY), false);
});
await test("C. con consentimiento y sin UTM: solo página de entrada (sin inventar origen)", async () => {
  A.__resetForTests(); store.clear(); A.__setMeasurementIdForTests("G-R4YBBE3F2P");
  visit("https://www.vibebeautycol.com/", "");
  document.cookie = "";
  A.__setConsentForTests("granted");
  A.captureAttribution();
  const p = await A.orderAttribution();
  assert.deepEqual(Object.keys(p), ["attribution"]);
  assert.deepEqual(Object.keys(p.attribution), ["landing", "captured_at"]);
  assert.equal(p.attribution.landing, "/");
});

console.log("Servidor: api/orders/_lib/attribution.js");
const { sanitizeOrderAnalytics, analyticsColumns } = require("../api/orders/_lib/attribution.js");
const NOW = Date.parse("2026-11-25T10:00:00Z");
await test("E. solo claves permitidas; se descartan claves arbitrarias, objetos anidados y datos personales", () => {
  const r = sanitizeOrderAnalytics({
    attribution: {
      utm_source: "instagram", utm_medium: { $ne: 1 }, utm_campaign: "<script>alert(1)</script>nov", utm_term: "ana@correo.com", utm_content: "+57 300 123 4567",
      gclid: "Cj0KCQiA'; drop table orders;--", fbclid: "IwAR0abcDEF123_xyz", landing: "https://evil.com/?x=1", referrer: "javascript:alert(1)",
      customer_email: "ana@correo.com", phone: "3001234567", __proto__: { polluted: true }, captured_at: "2026-11-24T10:00:00Z",
    },
    gaClientId: "1234567890.1700000000", gaSessionId: "1764000000",
  }, NOW);
  assert.deepEqual(r.attribution, { utm_source: "instagram", utm_campaign: "scriptalert(1)/scriptnov", fbclid: "IwAR0abcDEF123_xyz", captured_at: "2026-11-24T10:00:00.000Z" });
  assert.equal(r.ga_client_id, "1234567890.1700000000");
  assert.equal(r.ga_session_id, "1764000000");
  assert.equal({}.polluted, undefined);
});
await test("E. página de entrada solo de la tienda y con parámetros de campaña; procedencia sin parámetros", () => {
  const r = sanitizeOrderAnalytics({ attribution: { landing: "/?product=3&utm_source=ig&nombre=Ana&tel=300", referrer: "https://www.google.com/search?q=ana+perez+3001234567" } }, NOW);
  assert.deepEqual(r.attribution, { landing: "/?utm_source=ig&product=3", referrer: "https://www.google.com/search" });
});
await test("E. ids de GA4 con formato inválido se descartan; fechas fuera de rango también", () => {
  const r = sanitizeOrderAnalytics({ attribution: { captured_at: "2030-01-01T00:00:00Z" }, gaClientId: "GA1.1.123.456", gaSessionId: "abc" }, NOW);
  assert.deepEqual(r, { attribution: null, ga_client_id: null, ga_session_id: null });
  assert.deepEqual(analyticsColumns(r), {});
  assert.deepEqual(sanitizeOrderAnalytics({ attribution: "utm_source=x" }, NOW).attribution, null);
  assert.deepEqual(sanitizeOrderAnalytics({ attribution: [{ utm_source: "x" }] }, NOW).attribution, null);
  assert.deepEqual(sanitizeOrderAnalytics(null, NOW), { attribution: null, ga_client_id: null, ga_session_id: null });
});

console.log("Endpoint: /api/orders/create (Supabase simulado)");
const guard = require("../api/orders/_lib/guard");
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real" };
const mockRes = () => ({ statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } });
function makeDb({ analyticsColumns: hasCols = true } = {}) {
  const db = { orders: [], inserts: [] };
  db.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || "GET";
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (/resend|graph\.facebook/.test(u)) throw new Error("sin proveedor");
    if (u.includes("/rest/v1/products")) return json(200, [{ id: 1, name: "Labial", price: 20000, stock: 3, category: "Labios", promo_active: false }]);
    if (u.includes("/rest/v1/catalog_metadata")) return json(200, [{ product_id: 1, published: true, additional_info: null, presentation: null }]);
    if (u.includes("/rest/v1/orders") && method === "GET") return json(200, []);
    if (u.includes("/rest/v1/orders") && method === "POST") {
      const body = JSON.parse(opts.body);
      db.inserts.push(body);
      if (!hasCols && ("attribution" in body || "ga_client_id" in body || "ga_session_id" in body)) return json(400, { code: "PGRST204", message: "Could not find the 'attribution' column" });
      const row = { ...body, id: 100 + db.orders.length, created_at: "2026-11-25T10:00:00Z", status: "received" };
      db.orders.push(row);
      return json(201, [row]);
    }
    if (u.includes("/rest/v1/orders") && method === "PATCH") return json(204);
    return json(404, {});
  };
  return db;
}
async function createOrder(extra, dbOpts) {
  guard.resetIpLimiter();
  Object.assign(process.env, ENV);
  const db = makeDb(dbOpts);
  globalThis.fetch = db.fetch;
  delete require.cache[require.resolve("../api/orders/create.js")];
  const handler = require("../api/orders/create.js");
  const res = mockRes();
  const errLog = console.error, log = console.log; console.error = () => {}; console.log = () => {};
  try {
    await handler({ method: "POST", headers: { "x-forwarded-for": "10.0.0." + Math.floor(Math.random() * 200) }, body: { customer: { name: "Ana Pérez", phone: "3001234567", email: "ana@correo.com", city: "Bogotá", address: "Calle 1" }, contactConsent: true, items: [{ productId: 1, variantId: "default", quantity: 1 }], expectedTotal: 20000, ...extra } }, res);
  } finally { console.error = errLog; console.log = log; }
  return { res, db };
}
await test("A. con consentimiento: el pedido guarda attribution, ga_client_id y ga_session_id", async () => {
  const { res, db } = await createOrder({ attribution: { utm_source: "instagram", utm_medium: "social", utm_campaign: "nov", fbclid: "IwAR0abcDEF123_xyz", landing: "/?utm_source=instagram", referrer: "https://l.instagram.com/", captured_at: new Date().toISOString() }, gaClientId: "1234567890.1700000000", gaSessionId: "1764000000" });
  assert.equal(res.statusCode, 201);
  const row = db.orders[0];
  assert.equal(row.attribution.utm_source, "instagram");
  assert.equal(row.attribution.fbclid, "IwAR0abcDEF123_xyz");
  assert.equal(row.ga_client_id, "1234567890.1700000000");
  assert.equal(row.ga_session_id, "1764000000");
  assert.equal(res.body.id, row.id);   // el número que el navegador pondrá como order_id
});
await test("B. sin consentimiento: el pedido se registra exactamente como antes (sin columnas nuevas)", async () => {
  const { res, db } = await createOrder({});
  assert.equal(res.statusCode, 201);
  for (const k of ["attribution", "ga_client_id", "ga_session_id"]) assert.equal(k in db.inserts[0], false);
});
await test("C. sin UTM: solo la página de entrada; nada inventado", async () => {
  const { res, db } = await createOrder({ attribution: { landing: "/", captured_at: new Date().toISOString() } });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(Object.keys(db.orders[0].attribution).sort(), ["captured_at", "landing"]);
  assert.equal("ga_client_id" in db.inserts[0], false);
});
await test("E. inyección: claves arbitrarias y datos personales no llegan a la base ni rompen el pedido", async () => {
  const { res, db } = await createOrder({ attribution: { customer_email: "ana@correo.com", utm_term: "ana@correo.com", utm_source: "3001234567", status: "confirmed", total: 1 }, gaClientId: "x", status: "confirmed", total: 1, pos_status: "registered" });
  assert.equal(res.statusCode, 201);
  const ins = db.inserts[0];
  assert.equal("attribution" in ins, false);
  assert.equal(ins.total, 20000);
  assert.equal("pos_status" in ins, false);
  assert.equal(ins.status, undefined);
  assert.ok(!JSON.stringify(ins.attribution ?? null).includes("@"));
});
await test("compatibilidad: sin las columnas de atribución, el pedido se registra igual (sin ellas)", async () => {
  const { res, db } = await createOrder({ attribution: { utm_source: "instagram" }, gaClientId: "1.2" }, { analyticsColumns: false });
  assert.equal(res.statusCode, 201);
  assert.equal(db.inserts.length, 2);
  assert.equal("attribution" in db.inserts[1], false);
  assert.equal(db.orders.length, 1);
});

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
