// Prueba funcional EN NAVEGADOR (Edge/Chromium) — Fase B, atribución del pedido.
//
// Recorre el checkout real de la tienda servida en local. El catálogo está
// simulado; /api/orders/create lo atiende el MANEJADOR REAL de este repo con
// Supabase simulado en memoria (nunca se crea un pedido real ni sale nada a
// la red). La etiqueta de Google se bloquea: los eventos quedan en dataLayer.
// Escenarios: A con consentimiento y UTM; B sin consentimiento; C con
// consentimiento y sin UTM; D generate_lead lleva order_id y solo después de
// la respuesta del servidor.
//
// No forma parte de la suite en Node (requiere puppeteer-core o
// playwright-core y un navegador). Uso:
//   PUPPETEER_PATH=<ruta a puppeteer-core> BROWSER_PATH=<msedge.exe> node scripts/browser/order-attribution.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const puppeteer = require(process.env.PUPPETEER_PATH || "puppeteer-core");
const EXE = process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MID = "G-TEST1234";

// ── Manejador real con Supabase simulado ──
Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real" });
const db = { orders: [], inserts: [] };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = opts.method || "GET";
  const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  if (/resend|graph\.facebook/.test(u)) throw new Error("sin proveedor (prueba)");
  if (u.includes("/rest/v1/products")) return json(200, [{ id: 1, name: "Labial Prueba", price: 20000, stock: 9, category: "Labios", promo_active: false }]);
  if (u.includes("/rest/v1/catalog_metadata")) return json(200, [{ product_id: 1, published: true, additional_info: null, presentation: null }]);
  if (u.includes("/rest/v1/orders") && method === "GET") return json(200, []);
  if (u.includes("/rest/v1/orders") && method === "POST") {
    const body = JSON.parse(opts.body); db.inserts.push(body);
    const row = { ...body, id: 700 + db.orders.length, created_at: new Date().toISOString(), status: "received" };
    db.orders.push(row); return json(201, [row]);
  }
  if (u.includes("/rest/v1/orders") && method === "PATCH") return json(204);
  return json(404, {});
};
const handler = require(path.join(ROOT, "api/orders/create.js"));
const guard = require(path.join(ROOT, "api/orders/_lib/guard.js"));
async function runHandler(body) {
  guard.resetIpLimiter();
  const res = { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  const ce = console.error, cl = console.log; console.error = () => {}; console.log = () => {};
  try { await handler({ method: "POST", headers: { "x-forwarded-for": "10.1.1.1" }, body }, res); } finally { console.error = ce; console.log = cl; }
  return res;
}

// ── Servidor estático del repo ──
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, p === "/" ? "index.html" : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(""); }
  res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

const PRODUCT = { id: 1, name: "Labial Prueba", price: 20000, available: true, promoActive: false, category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Labios", subcategory: "Labiales", image: null, images: [], brand: null, shades: [], presentations: [] };
const CART = [{ productId: 1, variantId: "default", name: "Labial Prueba", brand: null, variantName: "Único", variantHex: null, shadeId: null, shadeName: null, presentationId: null, presentationName: null, price: 20000, originalPrice: null, quantity: 1, sku: null, image: null }];

let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "ok  " : "FAIL"} ${m}${c || !x ? "" : " — " + x}`); };

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });

  async function scenario({ label, query = "", referer, consent, cookies = [], holdMs = 0 }) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    const sent = { orderBody: null, leadBeforeResponse: null };
    await page.evaluateOnNewDocument((cart) => {
      window.__VIBE_ANALYTICS_TEST__ = true;
      if (!localStorage.getItem("vibe-cart-v1")) localStorage.setItem("vibe-cart-v1", JSON.stringify(cart));
    }, CART);
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const u = req.url();
      const reply = (status, body, type = "application/json") => req.respond({ status, contentType: type, body: typeof body === "string" ? body : JSON.stringify(body) });
      if (u.includes("googletagmanager.com")) return reply(200, "/* etiqueta bloqueada en la prueba */", "text/javascript");
      if (!u.startsWith(base)) return req.abort();
      if (u.includes("/api/catalog/categories") && u.includes("view=analytics")) return reply(200, { measurementId: MID });
      if (u.includes("/api/catalog/products")) return reply(200, { products: [PRODUCT] });
      if (u.includes("/api/orders/create")) {
        sent.orderBody = JSON.parse(req.postData() || "{}");
        const r = await runHandler(sent.orderBody);
        if (holdMs) {
          await new Promise((t) => setTimeout(t, holdMs));
          sent.leadBeforeResponse = await page.evaluate(() => (window.dataLayer || []).some((a) => a[0] === "event" && a[1] === "generate_lead")).catch(() => null);
        }
        return reply(r.statusCode, r.body);
      }
      if (u.includes("/api/")) return reply(404, {});
      return req.continue();
    });
    if (cookies.length) await ctx.setCookie(...cookies.map(([name, value]) => ({ name, value, domain: "127.0.0.1", path: "/" })));
    const n0 = db.inserts.length;
    await page.goto(`${base}/${query}`, { waitUntil: "networkidle0", referer });
    if (consent) { await page.waitForSelector("#consentBanner:not([hidden])"); await page.click(`[data-consent="${consent}"]`); }
    const jsClick = (sel) => page.$eval(sel, (el) => el.click());
    await jsClick("#cartButton"); await page.waitForSelector("#checkoutButton");
    await jsClick("#checkoutButton"); await page.waitForSelector("#checkoutForm");
    for (const [n, v] of [["name", "Ana Prueba"], ["phone", "3001234567"], ["email", "ana@example.com"], ["city", "Bogotá"], ["address", "Calle 1 # 2-3"]]) await page.type(`#checkoutForm [name="${n}"]`, v);
    await jsClick('#checkoutForm [name="contactConsent"]');
    await jsClick("#checkoutSubmit");
    await page.waitForFunction(() => !document.querySelector("#checkoutForm"), { timeout: 15000 });
    await new Promise((t) => setTimeout(t, 300));
    const state = await page.evaluate((key) => ({
      lead: (window.dataLayer || []).filter((a) => a[0] === "event" && a[1] === "generate_lead").map((a) => a[2]),
      stored: localStorage.getItem(key),
      dataLayer: Array.isArray(window.dataLayer),
    }), "vibe_attribution_v1");
    const inserted = db.inserts.slice(n0);
    await ctx.close();
    return { ...state, sent, inserted, row: db.orders[db.orders.length - 1], errs, label };
  }

  // A + D: con consentimiento, campaña de Instagram, cookies de GA4; el servidor tarda 1,2 s.
  const A = await scenario({
    label: "A", query: "?utm_source=instagram&utm_medium=social&utm_campaign=lanzamiento_nov&fbclid=IwAR0abcDEF123_xyz",
    // Referente http: el navegador elimina el Referer al pasar de https al servidor local http (en producción todo es https).
    referer: "http://l.instagram.com/", consent: "granted", holdMs: 1200,
    cookies: [["_ga", "GA1.1.1234567890.1700000000"], [`_ga_${MID.slice(2)}`, "GS1.1.1764000000.3.1.1764000100.0.0.0"]],
  });
  ok(A.sent.orderBody && A.sent.orderBody.attribution && A.sent.orderBody.attribution.utm_source === "instagram" && A.sent.orderBody.gaClientId === "1234567890.1700000000" && A.sent.orderBody.gaSessionId === "1764000000", "A. el navegador envía atribución e ids de GA4", JSON.stringify(A.sent.orderBody && { a: A.sent.orderBody.attribution, c: A.sent.orderBody.gaClientId, s: A.sent.orderBody.gaSessionId }));
  ok(A.row && A.row.attribution && A.row.attribution.utm_campaign === "lanzamiento_nov" && A.row.attribution.fbclid === "IwAR0abcDEF123_xyz" && A.row.attribution.referrer === "http://l.instagram.com/" && /^\/\?/.test(A.row.attribution.landing) && A.row.ga_client_id === "1234567890.1700000000" && A.row.ga_session_id === "1764000000", "A. el pedido guarda attribution, ga_client_id y ga_session_id", JSON.stringify(A.row && { a: A.row.attribution, c: A.row.ga_client_id, s: A.row.ga_session_id }));
  ok(!JSON.stringify(A.row.attribution).includes("Ana") && !JSON.stringify(A.row.attribution).includes("3001234567") && !JSON.stringify(A.row.attribution).includes("@"), "A. la atribución no contiene datos de la clienta");
  ok(A.lead.length === 1 && A.lead[0].order_id === String(A.row.id) && A.lead[0].transaction_id === undefined && A.lead[0].value === 20000, "D. generate_lead lleva order_id (el número del servidor) y no transaction_id", JSON.stringify(A.lead));
  ok(A.sent.leadBeforeResponse === false, "D. generate_lead no se envía antes de la respuesta del servidor", String(A.sent.leadBeforeResponse));
  ok(!Object.values(A.lead[0] || {}).some((v) => /Ana|3001234567|@|Calle/.test(String(v))), "D. el evento no lleva datos personales", JSON.stringify(A.lead[0]));
  ok(!A.errs.length, "A. sin errores de JavaScript", A.errs.join(" | "));

  // B: sin consentimiento (rechaza), aunque haya UTM y cookies de GA.
  const B = await scenario({ label: "B", query: "?utm_source=instagram&utm_medium=social", referer: "https://l.instagram.com/", consent: "denied", cookies: [["_ga", "GA1.1.1234567890.1700000000"]] });
  ok(B.sent.orderBody && !("attribution" in B.sent.orderBody) && !("gaClientId" in B.sent.orderBody) && !("gaSessionId" in B.sent.orderBody), "B. el navegador no envía atribución ni ids de GA4", JSON.stringify(Object.keys(B.sent.orderBody || {})));
  ok(B.inserted.length === 1 && !["attribution", "ga_client_id", "ga_session_id"].some((k) => k in B.inserted[0]), "B. el pedido se registra igual que antes, sin columnas de atribución");
  ok(B.stored === null && B.lead.length === 0, "B. no se guarda atribución en el navegador ni se envía generate_lead");
  ok(!B.errs.length, "B. sin errores de JavaScript", B.errs.join(" | "));

  // C: con consentimiento, visita directa sin UTM ni cookies.
  const C = await scenario({ label: "C", consent: "granted" });
  ok(C.row && C.row.attribution && Object.keys(C.row.attribution).sort().join() === "captured_at,landing" && C.row.attribution.landing === "/", "C. sin UTM: solo página de entrada, sin origen inventado", JSON.stringify(C.row && C.row.attribution));
  ok(C.row && !("ga_client_id" in C.inserted[0]) && !("ga_session_id" in C.inserted[0]), "C. sin cookies de GA4: no se inventan ids");
  ok(C.lead.length === 1 && C.lead[0].order_id === String(C.row.id), "C. generate_lead con order_id", JSON.stringify(C.lead));
  ok(!C.errs.length, "C. sin errores de JavaScript", C.errs.join(" | "));

  await browser.close(); server.close();
  console.log(`\n${fails ? fails + " fallidas" : "todas correctas"}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
