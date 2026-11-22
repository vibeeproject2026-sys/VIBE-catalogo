// Analítica comercial — GET /api/admin/products?resource=analytics
//   &range=today|7d|30d|90d|custom[&start=YYYY-MM-DD&end=YYYY-MM-DD][&refresh=1]
//
// Vive en este endpoint para no sumar funciones serverless (límite del plan).
// Solo lectura en todas sus fuentes:
// - GA4 (Data API, en el servidor): tráfico, productos, vitrinas, embudo.
// - POS (`sales`): ventas confirmadas (pagadas, activas, no anuladas). Nunca
//   se atribuyen a visitantes: se muestran aparte.
// - Catálogo (`orders`): solicitudes de pedido por estado (sin datos de la
//   clienta: solo id, fecha, estado y total).
// - Catálogo (`catalog_metadata` + `products`): productos PUBLICADOS y su
//   clasificación VIGENTE. Los no publicados nunca entran en los informes.
//
// Clasificación: cada evento de GA4 guarda el grupo/categoría/subcategoría
// que el producto tenía cuando ocurrió (item_category, item_category2,
// item_category3) y GA4 nunca lo reescribe. Este informe ofrece las dos
// lecturas: «al momento del evento» (lo que guardó GA4) y «vigente» (las
// mismas cifras sumadas según la clasificación actual de cada producto).

const { pgrestSelect } = require("../../catalog/_lib/supabaseRead");
const { sendJson, sendError } = require("../../catalog/_lib/http");
const { resolveCategoryGroup } = require("../../catalog/_lib/categoryGroups");
const { loadTaxonomy, categoryIndex, canonicalGroup } = require("../../_lib/taxonomyStore");
const { isConfirmed, saleLines } = require("../../_lib/bestsellers");
const G = require("../../_lib/ga4");

const TZ = "America/Bogota";
const CACHE_MS = 10 * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;
const MAX_CUSTOM_DAYS = 366;
const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
// Listas de productos de la tienda (item_list_id) y piezas promocionales
// (creative_slot). Los ids los fija js/analytics.js.
const SHOWCASES = [
  { id: "novedades", name: "Novedades", kind: "list" },
  { id: "mas_elegidos", name: "Más vendidos", kind: "list" },
  { id: "destacados", name: "Destacados VIBE", kind: "list" },
  { id: "ofertas", name: "Ofertas", kind: "list" },
  { id: "colecciones", name: "Colecciones VIBE", kind: "both" },
  { id: "descubre", name: "Descubre tu VIBE", kind: "both" },
  { id: "catalogo", name: "Catálogo", kind: "list" },
  { id: "relacionados", name: "También te puede interesar", kind: "list" },
  { id: "banner", name: "Carrusel principal", kind: "promo" },
];
const FUNNEL_EVENTS = ["page_view", "view_item", "select_item", "add_to_cart", "remove_from_cart", "view_cart", "begin_checkout", "generate_lead", "contact_whatsapp", "search", "select_promotion"];

// ── Fechas (calendario de Bogotá) ───────────────────────────────────────
function todayIn(tz, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validYmd = (s) => YMD.test(String(s || "")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

function resolveRange(query = {}, now = new Date()) {
  const today = todayIn(TZ, now);
  const key = String(query.range || "7d");
  let start, end;
  if (RANGE_DAYS[key]) {
    end = today;
    start = addDays(today, -(RANGE_DAYS[key] - 1));
  } else if (key === "custom") {
    start = String(query.start || "");
    end = String(query.end || "");
    if (!validYmd(start) || !validYmd(end)) return { error: "Elige una fecha de inicio y una de fin válidas." };
    if (start > end) return { error: "La fecha de inicio debe ser anterior a la de fin." };
    if (end > today) return { error: "El rango no puede incluir fechas futuras." };
    if (daysBetween(start, end) + 1 > MAX_CUSTOM_DAYS) return { error: "El rango personalizado admite hasta 366 días." };
  } else {
    return { error: "Período no válido." };
  }
  const days = daysBetween(start, end) + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { key, start, end, prevStart, prevEnd, days, today };
}

// Día local (Bogotá) de una venta del POS: `date` si viene como fecha;
// si no, la fecha local de sold_at / created_at.
function saleDay(s) {
  if (s && typeof s.date === "string" && YMD.test(s.date.slice(0, 10))) return s.date.slice(0, 10);
  const raw = (s && (s.sold_at || s.created_at)) || null;
  const t = raw ? new Date(raw) : null;
  return t && !Number.isNaN(t.getTime()) ? todayIn(TZ, t) : null;
}

// ── POS: ventas confirmadas (pura) ──────────────────────────────────────
function summarizeSales(sales, range) {
  const blank = () => ({ sales: 0, revenue: 0, units: 0, byChannel: {}, unitsByDay: {} });
  const cur = blank(), prev = blank();
  const unitsByProduct = {};
  const seen = new Set();
  let skipped = 0;
  for (const s of Array.isArray(sales) ? sales : []) {
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    const day = saleDay(s);
    if (!day) continue;
    const inCur = day >= range.start && day <= range.end;
    const inPrev = day >= range.prevStart && day <= range.prevEnd;
    if (!inCur && !inPrev) continue;
    if (!isConfirmed(s)) continue; // sin pagar, anulada o en otro estado: no es venta confirmada
    const lines = saleLines(s);
    const bucket = inCur ? cur : prev;
    bucket.sales++;
    const total = Number(s.total);
    if (Number.isFinite(total)) bucket.revenue += total;
    const channel = String(s.channel || "Sin canal").trim() || "Sin canal";
    bucket.byChannel[channel] = (bucket.byChannel[channel] || 0) + 1;
    if (!lines) { skipped++; continue; }
    for (const l of lines) {
      bucket.units += l.qty;
      bucket.unitsByDay[day] = (bucket.unitsByDay[day] || 0) + l.qty;
      if (inCur) unitsByProduct[l.productId] = (unitsByProduct[l.productId] || 0) + l.qty;
    }
  }
  return { current: cur, previous: prev, unitsByProduct, linesUnreadable: skipped };
}

function summarizeOrders(orders, range) {
  const out = { received: 0, confirmed: 0, cancelled: 0, total: 0 };
  for (const o of Array.isArray(orders) ? orders : []) {
    const t = o && o.created_at ? new Date(o.created_at) : null;
    if (!t || Number.isNaN(t.getTime())) continue;
    const day = todayIn(TZ, t);
    if (day < range.start || day > range.end) continue;
    out.total++;
    if (o.status in out) out[o.status]++;
  }
  return out;
}

// ── Catálogo publicado con clasificación vigente (pura) ─────────────────
function publishedCatalog(products, metadataRows, taxonomy) {
  const cats = categoryIndex(taxonomy);
  const names = new Map((products || []).map((p) => [Number(p.id), p]));
  const out = new Map();
  for (const m of metadataRows || []) {
    if (!m || m.published !== true) continue;
    const id = Number(m.product_id);
    const p = names.get(id);
    if (!p) continue;
    const editorial = m.category && cats.has(m.category) ? m.category : null;
    const group = editorial ? cats.get(editorial).group : canonicalGroup(resolveCategoryGroup(p.category));
    out.set(id, { id, name: p.name, group, category: editorial || p.category || null, subcategory: m.subcategory || null });
  }
  return out;
}

// ── GA4: definición de los informes ─────────────────────────────────────
function reportRequests(range) {
  const cur = { startDate: range.start, endDate: range.end, name: "actual" };
  const prev = { startDate: range.prevStart, endDate: range.prevEnd, name: "anterior" };
  const m = (...names) => names.map((name) => ({ name }));
  const d = (...names) => names.map((name) => ({ name }));
  const desc = (metric) => [{ metric: { metricName: metric }, desc: true }];
  const traffic = [
    { dateRanges: [cur, prev], metrics: m("activeUsers", "newUsers", "sessions", "screenPageViews", "totalUsers") },
    { dateRanges: [cur, prev], dimensions: d("date"), metrics: m("activeUsers", "sessions", "screenPageViews"), orderBys: [{ dimension: { dimensionName: "date" } }], limit: 1000 },
    { dateRanges: [cur], dimensions: d("deviceCategory"), metrics: m("activeUsers", "sessions"), orderBys: desc("activeUsers") },
    { dateRanges: [cur, prev], dimensions: d("sessionDefaultChannelGroup"), metrics: m("sessions", "activeUsers"), orderBys: desc("sessions") },
    { dateRanges: [cur], dimensions: d("sessionSource", "sessionMedium", "sessionCampaignName"), metrics: m("sessions", "activeUsers"), orderBys: desc("sessions"), limit: 30 },
  ];
  const commerce = [
    { dateRanges: [cur, prev], dimensions: d("itemId", "itemName", "itemCategory", "itemCategory2", "itemCategory3"), metrics: m("itemsViewed", "itemsAddedToCart", "itemsClickedInList", "itemsViewedInList"), limit: 2000 },
    { dateRanges: [cur], dimensions: d("itemListId"), metrics: m("itemsViewedInList", "itemsClickedInList", "itemsViewed", "itemsAddedToCart"), limit: 50 },
    { dateRanges: [cur], dimensions: d("itemPromotionCreativeSlot", "itemPromotionId", "itemPromotionName"), metrics: m("itemsViewedInPromotion", "itemsClickedInPromotion"), limit: 200 },
    { dateRanges: [cur, prev], dimensions: d("eventName"), metrics: m("eventCount", "totalUsers"), dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } } } },
    { dateRanges: [cur], dimensions: d("searchTerm"), metrics: m("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "search" } } }, orderBys: desc("eventCount"), limit: 30 },
  ];
  const audience = [
    { dateRanges: [cur], dimensions: d("newVsReturning"), metrics: m("activeUsers") },
    { dateRanges: [cur], dimensions: d("country", "city"), metrics: m("activeUsers"), orderBys: desc("activeUsers"), limit: 15 },
    { dateRanges: [cur], dimensions: d("contentType", "contentId"), metrics: m("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "select_content" } } }, orderBys: desc("eventCount"), limit: 50 },
    // ¿La propiedad tiene algún dato PROCESADO (de cualquier fecha)? Distingue
    // «informes aún en procesamiento» de «período sin actividad».
    { dateRanges: [{ startDate: "2020-01-01", endDate: "today", name: "historico" }], metrics: m("eventCount") },
  ];
  return { traffic, commerce, audience };
}

const METRICS_TOTAL = ["activeUsers", "newUsers", "sessions", "screenPageViews", "totalUsers"];
const isNotSet = (v) => !v || v === "(not set)" || v === "(other)";

// Informes de GA4 → bloques del panel (pura).
function shapeGa4({ traffic, commerce, audience }, catalog, salesUnits = {}) {
  const pick = (rows, dr) => rows.filter((r) => !("dateRange" in r) || r.dateRange === dr);
  const totalsRows = G.rowsOf(traffic[0]);
  const totals = {};
  for (const dr of ["actual", "anterior"]) {
    const r = pick(totalsRows, dr)[0] || {};
    totals[dr] = Object.fromEntries(METRICS_TOTAL.map((k) => [k, r[k] || 0]));
  }
  const seriesRows = G.rowsOf(traffic[1]);
  const series = { actual: [], anterior: [] };
  for (const r of seriesRows) {
    const dr = r.dateRange || "actual";
    if (!series[dr]) continue;
    series[dr].push({ date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`, activeUsers: r.activeUsers, sessions: r.sessions, screenPageViews: r.screenPageViews });
  }
  const devices = G.rowsOf(traffic[2]).map((r) => ({ device: r.deviceCategory, activeUsers: r.activeUsers, sessions: r.sessions }));
  const chRows = G.rowsOf(traffic[3]);
  const channels = {};
  for (const r of chRows) {
    const c = channels[r.sessionDefaultChannelGroup] || (channels[r.sessionDefaultChannelGroup] = { channel: r.sessionDefaultChannelGroup, sessions: 0, activeUsers: 0, previousSessions: 0 });
    if ((r.dateRange || "actual") === "actual") { c.sessions = r.sessions; c.activeUsers = r.activeUsers; } else c.previousSessions = r.sessions;
  }
  const sources = G.rowsOf(traffic[4]).map((r) => ({ source: r.sessionSource, medium: r.sessionMedium, campaign: isNotSet(r.sessionCampaignName) ? null : r.sessionCampaignName, sessions: r.sessions, activeUsers: r.activeUsers }));

  // Productos: solo ids numéricos de productos PUBLICADOS hoy.
  const itemRows = G.rowsOf(commerce[0]);
  const byProduct = new Map();
  const byEventCategory = new Map();
  let excludedRows = 0;
  for (const r of itemRows) {
    const id = /^\d+$/.test(r.itemId) ? Number(r.itemId) : null;
    const cur = id != null ? catalog.get(id) : null;
    if (!cur) { if (r.dateRange !== "anterior") excludedRows++; continue; }
    const p = byProduct.get(id) || byProduct.set(id, { id, name: cur.name, group: cur.group, category: cur.category, subcategory: cur.subcategory, views: 0, adds: 0, listClicks: 0, listImpressions: 0, unitsSold: salesUnits[id] || 0, classifiedAs: [] }).get(id);
    if (r.dateRange === "anterior") { p.prevViews = (p.prevViews || 0) + r.itemsViewed; continue; }
    p.views += r.itemsViewed; p.adds += r.itemsAddedToCart; p.listClicks += r.itemsClickedInList; p.listImpressions += r.itemsViewedInList;
    const evClass = [r.itemCategory, r.itemCategory2, r.itemCategory3].map((x) => (isNotSet(x) ? "" : x));
    if (!p.classifiedAs.some((c) => c.join("›") === evClass.join("›"))) p.classifiedAs.push(evClass);
    const k = `${evClass[0]}›${evClass[1]}`;
    const e = byEventCategory.get(k) || byEventCategory.set(k, { group: evClass[0] || "(sin grupo)", category: evClass[1] || "(sin categoría)", views: 0, adds: 0 }).get(k);
    e.views += r.itemsViewed; e.adds += r.itemsAddedToCart;
  }
  // Publicados sin ninguna vista también cuentan (para «menos consultados»).
  for (const c of catalog.values()) if (!byProduct.has(c.id)) byProduct.set(c.id, { id: c.id, name: c.name, group: c.group, category: c.category, subcategory: c.subcategory, views: 0, adds: 0, listClicks: 0, listImpressions: 0, unitsSold: salesUnits[c.id] || 0, classifiedAs: [] });
  const products = [...byProduct.values()].map((p) => ({ ...p, reclassified: p.classifiedAs.some((c) => c[0] !== p.group || c[1] !== (p.category || "") || (c[2] || "") !== (p.subcategory || "")) }));

  const sumBy = (keyFn) => {
    const map = new Map();
    for (const p of products) {
      const k = keyFn(p);
      const e = map.get(k) || map.set(k, { key: k, views: 0, prevViews: 0, adds: 0, products: 0 }).get(k);
      e.views += p.views; e.prevViews += p.prevViews || 0; e.adds += p.adds; e.products++;
    }
    return [...map.values()].sort((a, b) => b.views - a.views || b.adds - a.adds || a.key.localeCompare(b.key));
  };
  const groupsCurrent = sumBy((p) => p.group || "(sin grupo)");
  const categoriesCurrent = sumBy((p) => `${p.group || "(sin grupo)"}›${p.category || "(sin categoría)"}`);
  const subcategoriesCurrent = sumBy((p) => `${p.group || "(sin grupo)"}›${p.category || "(sin categoría)"}›${p.subcategory || "(sin subcategoría)"}`).filter((x) => !x.key.endsWith("›(sin subcategoría)"));
  const categoriesAtEvent = [...byEventCategory.values()].sort((a, b) => b.views - a.views);

  const listRows = G.rowsOf(commerce[1]);
  const promoRows = G.rowsOf(commerce[2]);
  const showcases = SHOWCASES.map((s) => {
    const l = listRows.find((r) => r.itemListId === s.id) || {};
    const promos = promoRows.filter((r) => r.itemPromotionCreativeSlot === s.id);
    const tileImpressions = promos.reduce((n, r) => n + r.itemsViewedInPromotion, 0);
    const tileClicks = promos.reduce((n, r) => n + r.itemsClickedInPromotion, 0);
    return {
      id: s.id, name: s.name,
      productImpressions: l.itemsViewedInList || 0,
      productClicks: l.itemsClickedInList || 0,
      productsViewed: l.itemsViewed || 0,
      addsToCart: l.itemsAddedToCart || 0,
      tileImpressions, tileClicks,
      pieces: promos.map((r) => ({ id: r.itemPromotionId, name: isNotSet(r.itemPromotionName) ? r.itemPromotionId : r.itemPromotionName, impressions: r.itemsViewedInPromotion, clicks: r.itemsClickedInPromotion })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
    };
  });

  const evRows = G.rowsOf(commerce[3]);
  const ev = Object.fromEntries(evRows.filter((r) => (r.dateRange || "actual") === "actual").map((r) => [r.eventName, { count: r.eventCount, users: r.totalUsers }]));
  const evPrev = Object.fromEntries(evRows.filter((r) => r.dateRange === "anterior").map((r) => [r.eventName, { count: r.eventCount, users: r.totalUsers }]));
  const evOf = (n) => ev[n] || { count: 0, users: 0 };
  const evPrevOf = (n) => evPrev[n] || { count: 0, users: 0 };
  const funnel = [
    { id: "visitors", label: "Visitantes", users: totals.actual.totalUsers, count: totals.actual.sessions, note: "Personas (usuarios) con al menos una visita." },
    { id: "view_item", label: "Vieron un producto", ...evOf("view_item") },
    { id: "add_to_cart", label: "Agregaron al carrito", ...evOf("add_to_cart") },
    { id: "view_cart", label: "Vieron el carrito", ...evOf("view_cart") },
    { id: "begin_checkout", label: "Iniciaron el pedido", ...evOf("begin_checkout") },
    { id: "generate_lead", label: "Enviaron la solicitud de pedido", ...evOf("generate_lead") },
    { id: "contact_whatsapp", label: "Hicieron clic en WhatsApp", ...evOf("contact_whatsapp") },
  ];
  const events = Object.fromEntries(FUNNEL_EVENTS.map((n) => [n, evOf(n)]));
  const eventsPrevious = Object.fromEntries(FUNNEL_EVENTS.map((n) => [n, evPrevOf(n)]));
  const searches = G.rowsOf(commerce[4]).filter((r) => !isNotSet(r.searchTerm)).map((r) => ({ term: r.searchTerm, count: r.eventCount }));
  const newVsReturning = G.rowsOf(audience[0]).filter((r) => !isNotSet(r.newVsReturning)).map((r) => ({ type: r.newVsReturning, activeUsers: r.activeUsers }));
  const geo = G.rowsOf(audience[1]).map((r) => ({ country: r.country, city: isNotSet(r.city) ? null : r.city, activeUsers: r.activeUsers }));
  const categoryClicks = G.rowsOf(audience[2]).filter((r) => r.contentType === "categoria" && !isNotSet(r.contentId)).map((r) => ({ path: r.contentId, clicks: r.eventCount }));

  // Estado: una respuesta HTTP 200 sin filas NO es una desconexión.
  //  - "processed": hay datos procesados en el período;
  //  - "empty_period": la propiedad tiene datos procesados, pero no en este período;
  //  - "processing": GA4 todavía no tiene ningún informe procesado (propiedad
  //    nueva): los ceros no significan cero actividad.
  const hasCurrent = totalsRows.some((r) => (r.dateRange || "actual") === "actual" && METRICS_TOTAL.some((k) => r[k] > 0));
  const lifetime = G.rowsOf(audience[3]);
  const hasAny = hasCurrent || lifetime.some((r) => r.eventCount > 0);
  const status = hasCurrent ? "processed" : hasAny ? "empty_period" : "processing";

  return { status, processed: status !== "processing", totals, categoryClicks, eventsPrevious, series, devices, channels: Object.values(channels).sort((a, b) => b.sessions - a.sessions), sources, products, groupsCurrent, categoriesCurrent, subcategoriesCurrent, categoriesAtEvent, showcases, funnel, events, searches, newVsReturning, geo, excludedItemRows: excludedRows };
}

// ── Manejador ───────────────────────────────────────────────────────────
const cache = new Map(); // `${start}|${end}` → { at, payload }

// Solicitudes de pedido del catálogo: solo id, fecha, estado y total (nunca
// datos de la clienta). Lectura directa, como api/admin/orders.js: `orders`
// queda fuera de la lista de tablas del lector público a propósito.
// GA4 Tiempo real (últimos 30 minutos): prueba de que la medición llega,
// independiente de los informes procesados. Nunca se suma a sus métricas.
async function realtimeSummary(cfg, fetchImpl) {
  try {
    const token = await G.accessToken(cfg.key, { fetchImpl });
    const r = await fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runRealtimeReport`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ metrics: [{ name: "eventCount" }, { name: "activeUsers" }] }) });
    const b = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, code: r.status === 403 ? "FORBIDDEN" : r.status === 401 ? "AUTH" : "API", status: r.status };
    const row = b && b.rows && b.rows[0] ? b.rows[0].metricValues : null;
    return { ok: true, events: row ? Number(row[0].value) || 0 : 0, activeUsers: row ? Number(row[1].value) || 0 : 0, asOf: new Date().toISOString() };
  } catch (e) {
    return { ok: false, code: e instanceof G.Ga4Error ? e.code : "NETWORK" };
  }
}

async function readOrders(env, since) {
  const params = new URLSearchParams();
  params.set("select", "id,created_at,status,total");
  params.set("created_at", `gte.${since}`);
  const r = await fetch(`${env.url}/rest/v1/orders?${params.toString()}`, { method: "GET", headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, Accept: "application/json" } });
  if (!r.ok) { const e = new Error("orders HTTP " + r.status); e.status = r.status; throw e; }
  return r.json();
}

async function loadSources(env, range) {
  const since = range.prevStart;
  const [products, metadataRows, taxonomy, sales, orders] = await Promise.all([
    pgrestSelect({ table: "products", columns: "id,name,category", env }),
    pgrestSelect({ table: "catalog_metadata", columns: "product_id,published,category,subcategory", env }),
    loadTaxonomy(env),
    pgrestSelect({ table: "sales", columns: "id,items,status,paid,voided_at,sold_at,date,created_at,total,channel", filters: [["or", `(date.gte.${since},sold_at.gte.${since},created_at.gte.${addDays(since, -1)})`]], env }).then((rows) => ({ rows }), (e) => ({ error: e })),
    readOrders(env, addDays(range.start, -1)).then((rows) => ({ rows }), (e) => ({ error: e })),
  ]);
  return { catalog: publishedCatalog(products, metadataRows, taxonomy), sales, orders };
}

async function handleAnalytics(req, res, env, { fetchImpl = fetch, now = new Date() } = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return sendError(res, 405, "Método no permitido.");
  const range = resolveRange(req.query || {}, now);
  if (range.error) return sendError(res, 400, range.error);
  const cfg = G.ga4Config(process.env);
  const cacheKey = `${range.start}|${range.end}|${cfg.reportingConfigured ? cfg.propertyId : "-"}`;
  const hit = cache.get(cacheKey);
  const wantsRefresh = req.query && req.query.refresh === "1";
  if (hit && now.getTime() - hit.at < CACHE_MS && !(wantsRefresh && now.getTime() - hit.at >= MIN_REFRESH_MS)) {
    return sendJson(res, 200, { ...hit.payload, cached: true });
  }

  let sources;
  try {
    sources = await loadSources(env, range);
  } catch (e) {
    console.error("[admin/analytics] catálogo no disponible (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
    return sendError(res, 502, "No se pudo leer el catálogo.");
  }

  const sales = sources.sales.error
    ? { error: "No se pudieron leer las ventas del POS." }
    : summarizeSales(sources.sales.rows, range);
  const orders = sources.orders.error ? { error: "No se pudieron leer las solicitudes de pedido." } : summarizeOrders(sources.orders.rows, range);

  let ga4 = null;
  if (cfg.reportingConfigured) {
    try {
      const reqs = reportRequests(range);
      const [traffic, commerce, audience] = await Promise.all([
        G.batchRunReports(cfg, reqs.traffic, { fetchImpl }),
        G.batchRunReports(cfg, reqs.commerce, { fetchImpl }),
        G.batchRunReports(cfg, reqs.audience, { fetchImpl }),
      ]);
      ga4 = shapeGa4({ traffic, commerce, audience }, sources.catalog, sales.unitsByProduct || {});
      ga4.realtime = await realtimeSummary(cfg, fetchImpl);
    } catch (e) {
      const code = e instanceof G.Ga4Error ? e.code : "API";
      console.error(`[admin/analytics] GA4 ${code}${e && e.status ? " HTTP " + e.status : ""}`);
      ga4 = { error: { code, message: e instanceof G.Ga4Error ? e.message : "No se pudo consultar Google Analytics." } };
    }
  }

  const payload = {
    configured: { measurement: cfg.measurementConfigured, reporting: cfg.reportingConfigured, missing: cfg.missing },
    range: { key: range.key, start: range.start, end: range.end, previousStart: range.prevStart, previousEnd: range.prevEnd, days: range.days, timeZone: TZ },
    generatedAt: now.toISOString(),
    publishedProducts: sources.catalog.size,
    ga4,
    sales: sales.error ? sales : { current: sales.current, previous: sales.previous, linesUnreadable: sales.linesUnreadable, unitsByProduct: sales.unitsByProduct },
    orders,
    catalog: [...sources.catalog.values()],
  };
  // Un error de GA4 no se guarda en caché (se reintenta en la próxima carga).
  if (!(ga4 && ga4.error)) cache.set(cacheKey, { at: now.getTime(), payload });
  return sendJson(res, 200, { ...payload, cached: false });
}

function clearAnalyticsCache() { cache.clear(); }

module.exports = { handleAnalytics, realtimeSummary, resolveRange, summarizeSales, summarizeOrders, publishedCatalog, reportRequests, shapeGa4, saleDay, clearAnalyticsCache, SHOWCASES, FUNNEL_EVENTS };
