// Runs with plain Node, sin red ni credenciales reales:
//   node scripts/test-analytics.mjs
//
// Analítica comercial (GA4):
// - js/analytics.js: consentimiento, dominio, privacidad de parámetros,
//   ids estables y clasificación en los items, sin duplicados.
// - api/_lib/ga4.js: configuración, firma JWT y errores de la Data API.
// - api/admin/_lib/analyticsAdmin.js: rangos, ventas confirmadas (POS solo
//   lectura), solo productos publicados, clasificación vigente vs. histórica,
//   protección del endpoint, caché y que nunca se filtren secretos.
// - Endpoint público: solo el id de medición.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { failed++; console.error("  FAIL - " + name); console.error("    " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n    ") : e)); }
}
const mockRes = () => ({ statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } });

const A = await import("../js/analytics.js");
const G = require("../api/_lib/ga4.js");
const AA = require("../api/admin/_lib/analyticsAdmin.js");

// Clave RSA de prueba (generada en memoria; no es una credencial real).
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const KEY_JSON = JSON.stringify({ type: "service_account", client_email: "lector@proyecto-prueba.iam.gserviceaccount.com", private_key: PEM });

console.log("Tienda: js/analytics.js");
await test("solo el dominio de producción mide (vistas previas y localhost no)", () => {
  assert.equal(A.isAllowedHost("www.vibebeautycol.com", {}), true);
  assert.equal(A.isAllowedHost("vibebeautycol.com", {}), true);
  assert.equal(A.isAllowedHost("vibe-catalogo-git-x.vercel.app", {}), false);
  assert.equal(A.isAllowedHost("localhost", {}), false);
  assert.equal(A.isAllowedHost("localhost", { __VIBE_ANALYTICS_TEST__: true }), true);
});
await test("búsquedas: normalizadas; descarta correos, teléfonos/documentos y términos vacíos", () => {
  assert.equal(A.sanitizeSearchTerm("  Labial   ROJO "), "labial rojo");
  assert.equal(A.sanitizeSearchTerm("a"), null);
  assert.equal(A.sanitizeSearchTerm("ana@correo.com"), null);
  assert.equal(A.sanitizeSearchTerm("314 349 0825"), null);
  assert.equal(A.sanitizeSearchTerm("1020304050"), null);
  assert.equal(A.sanitizeSearchTerm("spf 50"), "spf 50");
  assert.equal(A.sanitizeSearchTerm("x".repeat(90)).length, 60);
});
await test("page_location solo conserva parámetros conocidos (nunca la búsqueda ni otros)", () => {
  assert.equal(A.cleanPageLocation("https://www.vibebeautycol.com/?q=ana%40correo.com&group=Skincare&utm_source=ig&x=1#catalogo"), "https://www.vibebeautycol.com/?group=Skincare&utm_source=ig");
  assert.equal(A.cleanPageLocation("https://www.vibebeautycol.com/"), "https://www.vibebeautycol.com/");
});
await test("item de producto: id estable como texto, clasificación vigente, lista y posición; sin campos vacíos", () => {
  const p = { id: 175, name: "Acne Patch", brand: "VIBE", subcategory: "Parches", price: 13000, promoActive: true, promoPrice: 11000 };
  const it = A.gaItem(p, { group: "Skincare", category: "Tratamiento" }, { listId: "mas_elegidos", index: 2 });
  assert.deepEqual(it, { item_id: "175", item_name: "Acne Patch", item_brand: "VIBE", item_category: "Skincare", item_category2: "Tratamiento", item_category3: "Parches", price: 11000, item_list_id: "mas_elegidos", item_list_name: "Más vendidos", index: 2 });
  const plain = A.gaItem({ id: 9, name: "X", price: 5000 }, {}, { variant: "Rojo", price: 6000, quantity: 2 });
  assert.deepEqual(plain, { item_id: "9", item_name: "X", item_variant: "Rojo", price: 6000, quantity: 2 });
});
await test("piezas promocionales con id prefijado (nunca se confunden con productos)", () => {
  const it = A.promoItem({ slot: "colecciones", id: "navidad-2026", name: "Navidad", index: 0 });
  assert.equal(it.item_id, "colecciones:navidad-2026");
  assert.equal(it.creative_slot, "colecciones");
  assert.ok(!/^\d+$/.test(it.item_id));
});
await test("sin duplicados: el mismo evento idéntico en menos de 1 s se descarta", () => {
  const mem = new Map();
  assert.equal(A.shouldSend("add_to_cart", { a: 1 }, 1000, mem), true);
  assert.equal(A.shouldSend("add_to_cart", { a: 1 }, 1500, mem), false);
  assert.equal(A.shouldSend("add_to_cart", { a: 2 }, 1600, mem), true);
  assert.equal(A.shouldSend("add_to_cart", { a: 1 }, 2700, mem), true);
});
await test("sin consentimiento no se envía ni se encola nada; con consentimiento, una impresión por clave", () => {
  globalThis.window = {}; // track solo necesita window
  A.__resetForTests();
  assert.equal(A.track("view_item", { x: 1 }), false);
  A.__setConsentForTests("denied");
  assert.equal(A.track("view_item", { x: 2 }), false);
  assert.equal(A.trackOnce("k", "view_item_list", {}), false);
  A.__setConsentForTests("granted");
  assert.equal(A.trackOnce("k", "view_item_list", { y: 1 }), true); // encolado hasta que cargue la etiqueta
  assert.equal(A.trackOnce("k", "view_item_list", { y: 1 }), false);
  delete globalThis.window;
  A.__resetForTests();
});
await test("la tienda nunca manda datos de la clienta a GA4 (revisión del código de los eventos)", () => {
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const calls = [...app.matchAll(/track(?:Once)?\(([^;]*?)\);/g)].map((m) => m[1]);
  assert.ok(calls.length >= 10, "no se encontraron las llamadas de medición");
  for (const c of calls) assert.doesNotMatch(c, /data\.(name|phone|email|city|address|notes)|customer|payload\.id|order\.id/, c);
  // Fase B: generate_lead solo con 201 (no en reintentos) y con order_id = número que devolvió el servidor.
  assert.match(app, /if \(res\.status === 201\) \{\s*const lead = \{ currency: CURRENCY, value: expectedTotal, lead_source: "pedido_catalogo" \};\s*if \(payload && payload\.id != null\) lead\.order_id = String\(payload\.id\);\s*track\("generate_lead", lead\);/, "la solicitud de pedido se cuenta una vez (no en reintentos), con order_id");
  assert.doesNotMatch(app.replace(/\/\/.*$/gm, ""), /transaction_id/, "transaction_id queda reservado para purchase (Fase C)");
  assert.doesNotMatch(app, /track\("purchase"/, "nunca se registra una «compra» desde la tienda");
});
await test("una sola etiqueta: no agrega otra si ya existe gtag/googletagmanager", () => {
  const src = fs.readFileSync(new URL("../js/analytics.js", import.meta.url), "utf8");
  assert.match(src, /querySelector\('script\[src\*="googletagmanager\.com\/gtag\/js"\]'\)/);
  assert.match(src, /if \(!existing\)/);
  assert.match(src, /allow_google_signals: false/);
  assert.match(src, /ad_storage: "denied"/);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /googletagmanager|gtag\(/, "index.html no lleva una etiqueta fija");
});

console.log("Servidor: api/_lib/ga4.js");
await test("configuración: informa qué falta sin revelar valores", () => {
  const c = G.ga4Config({});
  assert.deepEqual(c.missing, ["GA4_MEASUREMENT_ID", "GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_KEY"]);
  assert.equal(c.reportingConfigured, false);
  const ok = G.ga4Config({ GA4_MEASUREMENT_ID: "g-abc12345", GA4_PROPERTY_ID: "properties/123456789", GA4_SERVICE_ACCOUNT_KEY: Buffer.from(KEY_JSON).toString("base64") });
  assert.deepEqual(ok.missing, []);
  assert.equal(ok.propertyId, "123456789");
  assert.equal(G.measurementId({ GA4_MEASUREMENT_ID: "G-ABC12345" }), "G-ABC12345");
  assert.equal(G.measurementId({ GA4_MEASUREMENT_ID: "UA-1234-1" }), null);
  assert.equal(G.ga4Config({ GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: "{no es json" }).reportingConfigured, false);
});
await test("JWT firmado con RS256 y alcance de solo lectura", () => {
  const key = G.parseKey(KEY_JSON);
  const jwt = G.signedAssertion(key, 1700000000);
  const [h, c, s] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.scope, "https://www.googleapis.com/auth/analytics.readonly");
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url")));
});
await test("errores de la Data API con mensajes claros (403, 429) y token reutilizado", async () => {
  G.resetTokenCache();
  const cfg = G.ga4Config({ GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: KEY_JSON });
  let tokenCalls = 0;
  const mk = (status) => async (url) => {
    if (url.startsWith("https://oauth2.googleapis.com/")) { tokenCalls++; return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) }; }
    return { ok: status === 200, status, json: async () => (status === 200 ? { reports: [{ dimensionHeaders: [{ name: "date" }], metricHeaders: [{ name: "sessions" }], rows: [{ dimensionValues: [{ value: "20261120" }], metricValues: [{ value: "7" }] }] }] } : { error: {} }) };
  };
  await assert.rejects(G.batchRunReports(cfg, [{}], { fetchImpl: mk(403) }), (e) => e.code === "FORBIDDEN" && /Lector/.test(e.message));
  await assert.rejects(G.batchRunReports(cfg, [{}], { fetchImpl: mk(429) }), (e) => e.code === "QUOTA");
  const reports = await G.batchRunReports(cfg, [{}], { fetchImpl: mk(200) });
  assert.deepEqual(G.rowsOf(reports[0]), [{ date: "20261120", sessions: 7 }]);
  assert.equal(tokenCalls, 1, "el token se pide una vez y se reutiliza");
  G.resetTokenCache();
});

console.log("Servidor: informe del Admin");
const NOW = new Date("2026-11-22T15:00:00Z"); // 10:00 en Bogotá
await test("rangos: hoy, 7/30/90 días y personalizado, con período anterior de igual largo", () => {
  assert.deepEqual(AA.resolveRange({ range: "7d" }, NOW), { key: "7d", start: "2026-11-16", end: "2026-11-22", prevStart: "2026-11-09", prevEnd: "2026-11-15", days: 7, today: "2026-11-22" });
  const t = AA.resolveRange({ range: "today" }, NOW);
  assert.deepEqual([t.start, t.end, t.prevStart, t.prevEnd], ["2026-11-22", "2026-11-22", "2026-11-21", "2026-11-21"]);
  const c = AA.resolveRange({ range: "custom", start: "2026-11-01", end: "2026-11-10" }, NOW);
  assert.deepEqual([c.prevStart, c.prevEnd, c.days], ["2026-10-22", "2026-10-31", 10]);
  assert.ok(AA.resolveRange({ range: "custom", start: "2026-11-10", end: "2026-11-01" }, NOW).error);
  assert.ok(AA.resolveRange({ range: "custom", start: "2026-11-20", end: "2026-11-23" }, NOW).error);
  assert.ok(AA.resolveRange({ range: "custom", start: "2025-01-01", end: "2026-11-01" }, NOW).error);
  assert.ok(AA.resolveRange({ range: "custom", start: "2026-02-30", end: "2026-03-01" }, NOW).error);
  assert.ok(AA.resolveRange({ range: "365d" }, NOW).error);
  // A las 02:00 UTC todavía es el día anterior en Bogotá.
  assert.equal(AA.resolveRange({ range: "today" }, new Date("2026-11-23T02:00:00Z")).end, "2026-11-22");
});
await test("ventas confirmadas: solo pagadas, activas y no anuladas; una vez por id; período anterior aparte", () => {
  const range = AA.resolveRange({ range: "7d" }, NOW);
  const sales = [
    { id: 1, date: "2026-11-20", paid: true, status: "active", voided_at: null, total: 50000, channel: "WhatsApp", items: JSON.stringify([{ productId: 10, qty: 2 }, { productId: 11, qty: 1 }]) },
    { id: 1, date: "2026-11-20", paid: true, status: "active", voided_at: null, total: 50000, channel: "WhatsApp", items: "[]" },
    { id: 2, date: "2026-11-21", paid: false, status: "active", total: 9000, items: "[]" },
    { id: 3, date: "2026-11-21", paid: true, status: "active", voided_at: "2026-11-21T10:00:00Z", total: 9000, items: "[]" },
    { id: 4, date: "2026-11-10", paid: true, status: "active", total: 20000, channel: "Otro", items: JSON.stringify([{ productId: 10, qty: 1 }]) },
    { id: 5, date: "2026-10-01", paid: true, status: "active", total: 99999, items: JSON.stringify([{ productId: 10, qty: 9 }]) },
    { id: 6, date: "2026-11-22", paid: true, status: "active", total: 15000, channel: "Instagram", items: "ilegible" },
  ];
  const r = AA.summarizeSales(sales, range);
  assert.deepEqual(r.current, { sales: 2, revenue: 65000, units: 3, byChannel: { WhatsApp: 1, Instagram: 1 }, unitsByDay: { "2026-11-20": 3 } });
  assert.deepEqual(r.previous, { sales: 1, revenue: 20000, units: 1, byChannel: { Otro: 1 }, unitsByDay: { "2026-11-10": 1 } });
  assert.deepEqual(r.unitsByProduct, { 10: 2, 11: 1 });
  assert.equal(r.linesUnreadable, 1);
});
await test("solicitudes del catálogo por estado, en hora de Colombia", () => {
  const range = AA.resolveRange({ range: "today" }, NOW);
  const o = AA.summarizeOrders([
    { id: 1, created_at: "2026-11-22T13:00:00Z", status: "received" },
    { id: 2, created_at: "2026-11-23T03:00:00Z", status: "confirmed" }, // 22 nov 22:00 en Bogotá
    { id: 3, created_at: "2026-11-22T03:00:00Z", status: "received" }, // 21 nov en Bogotá
  ], range);
  assert.deepEqual(o, { received: 1, confirmed: 1, cancelled: 0, total: 2 });
});

const T = require("../api/_lib/taxonomyStore.js");
const tax = T.defaultTaxonomy();
const catalog = AA.publishedCatalog(
  [{ id: 10, name: "Gloss", category: "Labios" }, { id: 11, name: "Parche", category: "Otro" }, { id: 12, name: "Oculto", category: "Labios" }, { id: 13, name: "Sin vistas", category: "Rostro" }],
  [{ product_id: 10, published: true, category: "Labios", subcategory: "Gloss y oils" }, { product_id: 11, published: true, category: "Tratamiento", subcategory: null }, { product_id: 12, published: false, category: "Labios" }, { product_id: 13, published: true, category: null }],
  tax,
);
const report = (dims, mets, rows, ranges = false) => ({ dimensionHeaders: [...dims, ...(ranges ? ["dateRange"] : [])].map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name })), rows: rows.map((r) => ({ dimensionValues: r[0].map((value) => ({ value })), metricValues: r[1].map((v) => ({ value: String(v) })) })) });
function fakeReports() {
  return {
    traffic: [
      report([], ["activeUsers", "newUsers", "sessions", "screenPageViews", "totalUsers"], [[["actual"], [40, 30, 55, 120, 42]], [["anterior"], [20, 18, 25, 60, 21]]], true),
      report(["date"], ["activeUsers", "sessions", "screenPageViews"], [[["20261121", "actual"], [10, 12, 30]], [["20261114", "anterior"], [5, 6, 12]]], true),
      report(["deviceCategory"], ["activeUsers", "sessions"], [[["mobile"], [30, 40]], [["desktop"], [10, 15]]]),
      report(["sessionDefaultChannelGroup"], ["sessions", "activeUsers"], [[["Organic Social", "actual"], [30, 25]], [["Organic Social", "anterior"], [10, 8]], [["Direct", "actual"], [25, 15]]], true),
      report(["sessionSource", "sessionMedium", "sessionCampaignName"], ["sessions", "activeUsers"], [[["instagram", "social", "navidad"], [20, 18]], [["(direct)", "(none)", "(not set)"], [25, 15]]]),
    ],
    commerce: [
      report(["itemId", "itemName", "itemCategory", "itemCategory2", "itemCategory3"], ["itemsViewed", "itemsAddedToCart", "itemsClickedInList", "itemsViewedInList"], [
        [["10", "Gloss", "Maquillaje", "Labios", "Kits de labios"], [5, 1, 3, 40]], // antes de reclasificarse
        [["10", "Gloss", "Maquillaje", "Labios", "Gloss y oils"], [7, 2, 4, 50]],
        [["11", "Parche", "Skincare", "Tratamiento", "(not set)"], [3, 0, 1, 20]],
        [["12", "Oculto", "Maquillaje", "Labios", ""], [9, 9, 9, 9]], // no publicado hoy: fuera
        [["colecciones:navidad", "Navidad", "", "", ""], [0, 0, 0, 0]], // pieza promocional: fuera
      ]),
      report(["itemListId"], ["itemsViewedInList", "itemsClickedInList", "itemsViewed", "itemsAddedToCart"], [[["mas_elegidos"], [100, 8, 6, 2]], [["catalogo"], [300, 12, 10, 1]]]),
      report(["itemPromotionCreativeSlot", "itemPromotionId", "itemPromotionName"], ["itemsViewedInPromotion", "itemsClickedInPromotion"], [[["descubre", "descubre:categoria:Maquillaje›Labios", "Labios"], [50, 5]], [["banner", "banner:1", "Navidad"], [80, 4]]]),
      report(["eventName"], ["eventCount", "totalUsers"], [[["view_item"], [30, 20]], [["add_to_cart"], [6, 5]], [["begin_checkout"], [3, 3]], [["generate_lead"], [2, 2]], [["contact_whatsapp"], [4, 3]]]),
      report(["searchTerm"], ["eventCount"], [[["labial"], [6]], [["(not set)"], [1]]]),
    ],
    audience: [
      report(["newVsReturning"], ["activeUsers"], [[["new"], [30]], [["returning"], [10]], [["(not set)"], [1]]]),
      report(["country", "city"], ["activeUsers"], [[["Colombia", "Chía"], [12]], [["Colombia", "(not set)"], [3]]]),
      report(["contentType", "contentId"], ["eventCount"], [[["categoria", "Skincare"], [4]], [["otro", "x"], [1]]]),
    ],
  };
}
await test("catálogo publicado: excluye no publicados; clasificación vigente desde la taxonomía", () => {
  assert.deepEqual([...catalog.keys()].sort(), [10, 11, 13]);
  assert.deepEqual(catalog.get(11), { id: 11, name: "Parche", group: "Skincare", category: "Tratamiento", subcategory: null });
  assert.equal(catalog.get(13).group, "Maquillaje"); // sin categoría editorial: grupo del POS
});
await test("informe: solo productos publicados, cero vistas incluidas, historia de clasificación conservada", () => {
  const g = AA.shapeGa4(fakeReports(), catalog, { 10: 4 });
  assert.deepEqual(g.totals.actual, { activeUsers: 40, newUsers: 30, sessions: 55, screenPageViews: 120, totalUsers: 42 });
  assert.equal(g.totals.anterior.sessions, 25);
  assert.deepEqual(g.series.actual, [{ date: "2026-11-21", activeUsers: 10, sessions: 12, screenPageViews: 30 }]);
  const byId = Object.fromEntries(g.products.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(byId).map(Number).sort(), [10, 11, 13]);
  assert.equal(g.excludedItemRows, 2);
  assert.deepEqual([byId[10].views, byId[10].adds, byId[10].listClicks, byId[10].unitsSold], [12, 3, 7, 4]);
  assert.equal(byId[10].reclassified, true);
  assert.equal(byId[11].reclassified, false);
  assert.equal(byId[13].views, 0);
  assert.deepEqual(g.groupsCurrent.map((x) => [x.key, x.views]), [["Maquillaje", 12], ["Skincare", 3]]);
  assert.ok(g.categoriesAtEvent.some((x) => x.category === "Labios" && x.views === 12));
  assert.equal(g.channels[0].channel, "Organic Social");
  assert.equal(g.channels[0].previousSessions, 10);
  assert.equal(g.sources.find((s) => s.source === "(direct)").campaign, null);
  assert.deepEqual(g.searches, [{ term: "labial", count: 6 }]);
  assert.deepEqual(g.categoryClicks, [{ path: "Skincare", clicks: 4 }]);
  assert.deepEqual(g.newVsReturning.map((x) => x.type), ["new", "returning"]);
});
await test("vitrinas y embudo: ids correctos; WhatsApp y solicitudes separados de ventas", () => {
  const g = AA.shapeGa4(fakeReports(), catalog, {});
  const sc = Object.fromEntries(g.showcases.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(sc), ["novedades", "mas_elegidos", "destacados", "ofertas", "colecciones", "descubre", "catalogo", "relacionados", "banner"]);
  assert.equal(sc.mas_elegidos.name, "Más vendidos");
  assert.equal(sc.destacados.name, "Destacados VIBE");
  assert.deepEqual([sc.mas_elegidos.productImpressions, sc.mas_elegidos.productClicks, sc.mas_elegidos.productsViewed, sc.mas_elegidos.addsToCart], [100, 8, 6, 2]);
  assert.deepEqual([sc.descubre.tileImpressions, sc.descubre.tileClicks], [50, 5]);
  assert.equal(sc.banner.pieces[0].name, "Navidad");
  assert.equal(sc.novedades.productImpressions, 0);
  assert.deepEqual(g.funnel.map((s) => [s.id, s.users]), [["visitors", 42], ["view_item", 20], ["add_to_cart", 5], ["view_cart", 0], ["begin_checkout", 3], ["generate_lead", 2], ["contact_whatsapp", 3]]);
  assert.deepEqual(g.eventsPrevious.view_item, { count: 0, users: 0 }, "sin filas del período anterior: cero de la fuente, no inventado");
  assert.ok(!g.funnel.some((s) => /venta|purchase/i.test(s.id + s.label)), "el embudo de GA4 no presenta ventas");
  assert.deepEqual(g.events.contact_whatsapp, { count: 4, users: 3 });
});

// Manejador completo con Supabase y Google simulados.
function envFor(extra = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-test-key", ADMIN_API_TOKEN: "admin-test-token" }, extra);
  for (const k of ["GA4_MEASUREMENT_ID", "GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_KEY"]) if (!(k in extra)) delete process.env[k];
  return () => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); };
}
function fakeFetch({ gaStatus = 200, calls, empty = false, lifetime = false, realtime = { events: 7, users: 2 }, tokenStatus = 200, network = false }) {
  const rows = {
    products: [{ id: 10, name: "Gloss", category: "Labios" }, { id: 11, name: "Parche", category: "Otro" }, { id: 12, name: "Oculto", category: "Labios" }],
    catalog_metadata: [{ product_id: 10, published: true, category: "Labios", subcategory: "Gloss y oils" }, { product_id: 11, published: true, category: "Tratamiento" }, { product_id: 12, published: false, category: "Labios" }],
    sales: [{ id: 1, date: "2026-11-20", paid: true, status: "active", total: 50000, channel: "WhatsApp", items: JSON.stringify([{ productId: 10, qty: 2 }]) }],
    orders: [{ id: 7, created_at: "2026-11-21T15:00:00Z", status: "received", total: 30000 }],
  };
  const f = fakeReports();
  return async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET" });
    if (url.startsWith("https://oauth2.googleapis.com/")) return tokenStatus === 200 ? { ok: true, status: 200, json: async () => ({ access_token: "tok-prueba", expires_in: 3600 }) } : { ok: false, status: tokenStatus, json: async () => ({ error: "invalid_grant" }) };
    if (network && url.startsWith("https://analyticsdata.googleapis.com/")) throw new Error("ECONNRESET");
    if (url.includes(":runRealtimeReport")) {
      if (realtime === "error") return { ok: false, status: 403, json: async () => ({ error: {} }) };
      return { ok: true, status: 200, json: async () => ({ rows: realtime.events ? [{ metricValues: [{ value: String(realtime.events) }, { value: String(realtime.users) }] }] : [] }) };
    }
    if (url.startsWith("https://analyticsdata.googleapis.com/")) {
      if (empty) {
        const reqs = JSON.parse(opts.body).requests;
        // Respuesta HTTP 200 válida sin filas; «histórico» con filas si lifetime.
        const reports = reqs.map((q) => ({ dimensionHeaders: (q.dimensions || []).map((x) => ({ name: x.name })), metricHeaders: q.metrics.map((x) => ({ name: x.name })), rows: lifetime && q.dateRanges[0].name === "historico" ? [{ dimensionValues: [], metricValues: [{ value: "120" }] }] : [] }));
        return { ok: true, status: 200, json: async () => ({ reports }) };
      }
      const n = JSON.parse(opts.body).requests.length;
      const group = n === 5 && JSON.parse(opts.body).requests[0].metrics.some((m) => m.name === "itemsViewed") ? f.commerce : n === 5 ? f.traffic : f.audience;
      return { ok: gaStatus === 200, status: gaStatus, json: async () => (gaStatus === 200 ? { reports: group } : { error: { message: "x" } }) };
    }
    if (url.includes("/storage/v1/")) return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    const table = new URL(url).pathname.split("/").pop();
    const body = JSON.stringify(rows[table] || []);
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
}
const handler = require("../api/admin/products.js");
const call = async (query, headers = { authorization: "Bearer admin-test-token" }) => { const res = mockRes(); await handler({ method: "GET", headers, query: { resource: "analytics", ...query } }, res); return res; };

await test("endpoint protegido: sin token o con token incorrecto → 401, sin consultar nada", async () => {
  const restore = envFor();
  const calls = []; const orig = global.fetch; global.fetch = fakeFetch({ calls });
  try {
    assert.equal((await call({}, {})).statusCode, 401);
    assert.equal((await call({}, { authorization: "Bearer otro" })).statusCode, 401);
    assert.equal(calls.length, 0);
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer admin-test-token" }, query: { resource: "analytics" }, body: {} }, res);
    assert.equal(res.statusCode, 405);
  } finally { global.fetch = orig; restore(); }
});
await test("sin GA4 configurado: explica qué falta y muestra solo datos reales (POS y solicitudes); POS solo con GET", async () => {
  const restore = envFor();
  AA.clearAnalyticsCache();
  const calls = []; const orig = global.fetch; global.fetch = fakeFetch({ calls });
  try {
    const res = await call({ range: "7d" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(res.body.ga4, null);
    assert.deepEqual(res.body.configured, { measurement: false, reporting: false, missing: ["GA4_MEASUREMENT_ID", "GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_KEY"] });
    assert.equal(res.body.publishedProducts, 2);
    assert.ok(res.body.sales.current.sales >= 0 && res.body.orders);
    assert.ok(calls.every((c) => c.method === "GET"), "solo lecturas");
    assert.ok(!calls.some((c) => c.url.includes("googleapis")), "sin configuración no se llama a Google");
    const ordersCall = calls.find((c) => c.url.includes("/rest/v1/orders"));
    assert.match(ordersCall.url, /select=id%2Ccreated_at%2Cstatus%2Ctotal/, "de los pedidos solo se leen id, fecha, estado y total");
    assert.equal((await call({ range: "custom", start: "x", end: "y" })).statusCode, 400);
  } finally { global.fetch = orig; restore(); }
});
await test("con GA4: informe completo, caché de 10 min, y ningún secreto en la respuesta", async () => {
  const restore = envFor({ GA4_MEASUREMENT_ID: "G-TEST1234", GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: KEY_JSON });
  AA.clearAnalyticsCache(); G.resetTokenCache();
  const calls = []; const orig = global.fetch; global.fetch = fakeFetch({ calls });
  try {
    const res = await call({ range: "30d" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured.reporting, true);
    assert.equal(res.body.ga4.totals.actual.activeUsers, 40);
    assert.deepEqual(res.body.ga4.products.map((p) => p.id).sort(), [10, 11]);
    const text = JSON.stringify(res.body);
    for (const secret of ["BEGIN PRIVATE KEY", "lector@proyecto-prueba", "tok-prueba", "service-test-key", "123456789", "admin-test-token"]) assert.ok(!text.includes(secret), "se filtró: " + secret);
    const gaCalls = calls.filter((c) => c.url.includes("analyticsdata")).length;
    assert.equal(gaCalls, 4, "3 lotes de informes + 1 consulta de Tiempo real");
    assert.equal(res.body.ga4.status, "processed");
    assert.deepEqual([res.body.ga4.realtime.ok, res.body.ga4.realtime.events], [true, 7]);
    assert.equal((await call({ range: "30d" })).body.cached, true);
    assert.equal(calls.filter((c) => c.url.includes("analyticsdata")).length, 4, "la segunda consulta sale de la caché");
  } finally { global.fetch = orig; restore(); }
});
await test("error de GA4 (sin acceso): mensaje claro, ventas del POS igual disponibles, no se guarda en caché", async () => {
  const restore = envFor({ GA4_MEASUREMENT_ID: "G-TEST1234", GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: KEY_JSON });
  AA.clearAnalyticsCache(); G.resetTokenCache();
  const calls = []; const orig = global.fetch; global.fetch = fakeFetch({ calls, gaStatus: 403 });
  const origErr = console.error; const logged = []; console.error = (m) => logged.push(String(m));
  try {
    const res = await call({ range: "7d" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ga4.error.code, "FORBIDDEN");
    assert.ok(res.body.sales.current);
    assert.equal((await call({ range: "7d" })).body.cached, false);
    assert.ok(logged.every((l) => !l.includes("PRIVATE KEY") && !l.includes("tok-prueba")), "los registros no llevan secretos");
  } finally { global.fetch = orig; console.error = origErr; restore(); G.resetTokenCache(); }
});

console.log("Estados: procesado, en procesamiento, período vacío y errores");
const withGa = async (opts, fn) => {
  const restore = envFor({ GA4_MEASUREMENT_ID: "G-TEST1234", GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: KEY_JSON });
  AA.clearAnalyticsCache(); G.resetTokenCache();
  const calls = []; const orig = global.fetch; global.fetch = fakeFetch({ calls, ...opts });
  const oe = console.error; console.error = () => {};
  try { return await fn(calls); } finally { global.fetch = orig; console.error = oe; restore(); G.resetTokenCache(); }
};
await test("GA4 conectado, respuesta vacía (HTTP 200 sin filas) y eventos en Tiempo real → «processing», no desconexión", async () => {
  await withGa({ empty: true, realtime: { events: 25, users: 3 } }, async () => {
    const res = await call({ range: "7d" });
    const g = res.body.ga4;
    assert.equal(res.statusCode, 200);
    assert.ok(!g.error, "no es un error");
    assert.deepEqual([g.status, g.processed], ["processing", false]);
    assert.deepEqual([g.realtime.ok, g.realtime.events, g.realtime.activeUsers], [true, 25, 3]);
    assert.equal(g.totals.actual.totalUsers, 0, "los informes no se rellenan con Tiempo real");
  });
});
await test("GA4 conectado sin eventos en Tiempo real → «processing» con 0 eventos (respuesta válida)", async () => {
  await withGa({ empty: true, realtime: { events: 0, users: 0 } }, async () => {
    const g = (await call({ range: "7d" })).body.ga4;
    assert.equal(g.status, "processing");
    assert.deepEqual([g.realtime.ok, g.realtime.events], [true, 0]);
  });
});
await test("propiedad con datos procesados pero período sin actividad → «empty_period» (cero legítimo)", async () => {
  await withGa({ empty: true, lifetime: true }, async () => {
    const g = (await call({ range: "today" })).body.ga4;
    assert.deepEqual([g.status, g.processed], ["empty_period", true]);
  });
});
await test("informes históricos disponibles → «processed» con sus métricas; Tiempo real no se suma", async () => {
  await withGa({ realtime: { events: 999, users: 50 } }, async () => {
    const g = (await call({ range: "30d" })).body.ga4;
    assert.equal(g.status, "processed");
    assert.equal(g.totals.actual.activeUsers, 40);
    assert.equal(g.events.view_item.count, 30);
  });
});
await test("error de autenticación (Google rechaza la cuenta) → error AUTH, no ceros", async () => {
  await withGa({ tokenStatus: 400 }, async () => {
    const g = (await call({ range: "7d" })).body.ga4;
    assert.equal(g.error.code, "AUTH");
    assert.ok(!("totals" in g));
  });
});
await test("error de conexión con la Data API → error NETWORK, no ceros", async () => {
  await withGa({ network: true }, async () => {
    const g = (await call({ range: "7d" })).body.ga4;
    assert.equal(g.error.code, "NETWORK");
  });
});
await test("si Tiempo real falla, los informes procesados se muestran igual", async () => {
  await withGa({ realtime: "error" }, async () => {
    const g = (await call({ range: "30d" })).body.ga4;
    assert.equal(g.status, "processed");
    assert.deepEqual([g.realtime.ok, g.realtime.code], [false, "FORBIDDEN"]);
  });
});
await test("ventas del POS disponibles mientras GA4 procesa (independientes)", async () => {
  await withGa({ empty: true }, async () => {
    const b = (await call({ range: "7d" })).body;
    assert.equal(b.ga4.status, "processing");
    assert.equal(b.sales.current.units, 2);
    assert.equal(b.sales.current.sales, 1);
  });
});
await test("el panel nunca muestra «procesando» como cero: indicadores de navegación «—»", () => {
  const view = fs.readFileSync(new URL("../admin/analytics-view.js", import.meta.url), "utf8");
  assert.match(view, /const ready = g && !g\.error && g\.status !== "processing";/);
  assert.match(view, /overviewSection\(ready \? g : null, d, processing\)/);
  assert.match(view, /GA4 está recibiendo actividad de tu tienda/);
  assert.match(view, /Los informes históricos están en procesamiento y estarán disponibles una vez Google complete su consolidación\./);
});

console.log("Endpoint público y Admin");
await test("/api/catalog/categories?view=analytics devuelve solo el id de medición (o null), sin Supabase", async () => {
  const pub = require("../api/catalog/categories.js");
  const restore = envFor({ GA4_MEASUREMENT_ID: "G-TEST1234", GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_KEY: KEY_JSON });
  try {
    delete process.env.SUPABASE_URL;
    const res = mockRes();
    await pub({ method: "GET", headers: {}, query: { view: "analytics" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { measurementId: "G-TEST1234" });
    process.env.GA4_MEASUREMENT_ID = "<script>";
    const res2 = mockRes();
    await pub({ method: "GET", headers: {}, query: { view: "analytics" } }, res2);
    assert.deepEqual(res2.body, { measurementId: null });
  } finally { restore(); }
});
await test("el panel del Admin tiene la sección «Analítica» y no muestra cifras de ejemplo", () => {
  const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  assert.match(html, /data-view="analytics"/);
  assert.match(html, /data-view-panel="analytics"/);
  const view = fs.readFileSync(new URL("../admin/analytics-view.js", import.meta.url), "utf8");
  assert.doesNotMatch(view, /Math\.random|demo|ejemplo de datos|mock/i);
  assert.equal(fs.readdirSync(new URL("../api", import.meta.url), { recursive: true }).filter((f) => /\.js$/.test(f) && !/(^|[\\/])_lib[\\/]/.test(f)).length, 11, "sigue habiendo 11 funciones serverless");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
