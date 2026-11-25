// VIBE — Analítica comercial (Google Analytics 4) en la tienda.
//
// Reglas:
// - Nada se carga ni se envía sin el consentimiento expreso de la visitante
//   (Ley 1581 de 2012). Sin id de medición configurado en el servidor
//   (GA4_MEASUREMENT_ID), no hay etiqueta ni aviso: la tienda queda igual.
// - Solo en el dominio de producción: vistas previas, localhost y pruebas no
//   envían nada (salvo que una prueba lo habilite y bloquee la red).
// - Una sola etiqueta (si ya existe gtag/googletagmanager, no se agrega otra).
// - Nunca datos personales: ni nombre, teléfono, correo, dirección ni lo que
//   se escribe en el checkout. Las búsquedas con «@» o números largos se
//   descartan. page_location solo conserva parámetros conocidos.
// - Sin duplicados: un mismo evento idéntico en menos de 1 s se descarta;
//   las impresiones se envían una vez por lista y contenido por página.
// - Clasificación: cada producto viaja con su id estable (item_id) y el
//   grupo / categoría / subcategoría VIGENTES en el momento del evento
//   (item_category, item_category2, item_category3). GA4 conserva ese valor
//   histórico; el Admin muestra además la clasificación actual.

export const CONSENT_KEY = "vibe_analytics_consent_v1";
export const PROD_HOSTS = ["www.vibebeautycol.com", "vibebeautycol.com"];
export const CURRENCY = "COP";
// item_list_id → nombre visible. Los mismos ids usa el informe del Admin.
export const LIST_NAMES = {
  catalogo: "Catálogo",
  novedades: "Novedades",
  mas_elegidos: "Más vendidos",
  destacados: "Destacados VIBE",
  ofertas: "Ofertas",
  colecciones: "Colecciones VIBE",
  descubre: "Descubre tu VIBE",
  relacionados: "También te puede interesar",
};
const KEEP_PARAMS = ["product", "group", "category", "subcategory", "collection", "tag", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid", "ttclid"];
const DEDUPE_MS = 1000;
const MAX_QUEUE = 60;

let measurementId = null;
let tagReady = false;
let consent = null; // "granted" | "denied" | null
let queue = [];
const recent = new Map();
const sentOnce = new Set();

// ── Funciones puras (probadas en scripts/test-analytics.mjs) ─────────────
export function isAllowedHost(host, win = typeof window !== "undefined" ? window : {}) {
  return PROD_HOSTS.includes(String(host || "").toLowerCase()) || win.__VIBE_ANALYTICS_TEST__ === true;
}

// Término de búsqueda apto para enviar, o null (vacío, muy corto o con
// aspecto de dato personal: correo o número de teléfono/documento).
export function sanitizeSearchTerm(raw) {
  const s = String(raw == null ? "" : raw).normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
  if (s.length < 2) return null;
  if (s.includes("@")) return null;
  if ((s.match(/\d/g) || []).length >= 6) return null;
  return s;
}

export function cleanPageLocation(href) {
  try {
    const u = new URL(href);
    const kept = new URLSearchParams();
    for (const k of KEEP_PARAMS) if (u.searchParams.has(k)) kept.set(k, u.searchParams.get(k).slice(0, 100));
    const q = kept.toString();
    return `${u.origin}${u.pathname}${q ? "?" + q : ""}`;
  } catch {
    return undefined;
  }
}

const clip = (v, n = 100) => (v == null || v === "" ? undefined : String(v).slice(0, n));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// Producto → item de GA4. placement = { group, category } vigentes (los
// mismos que usa la navegación pública).
export function gaItem(p, placement = {}, extra = {}) {
  const out = {
    item_id: String(p.id),
    item_name: clip(p.name),
    item_brand: clip(p.brand),
    item_category: clip(placement.group),
    item_category2: clip(placement.category),
    item_category3: clip(p.subcategory),
    item_variant: clip(extra.variant),
    price: num(extra.price ?? (p.promoActive === true && p.promoPrice != null ? p.promoPrice : p.price)),
    quantity: Number.isInteger(extra.quantity) ? extra.quantity : undefined,
    item_list_id: extra.listId || undefined,
    item_list_name: extra.listId ? clip(extra.listName || LIST_NAMES[extra.listId] || extra.listId) : undefined,
    index: Number.isInteger(extra.index) ? extra.index : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// Pieza promocional (colección, tarjeta de Descubre, banner) como item de
// GA4 con su promoción. El id lleva prefijo («coleccion:…») para que nunca
// se confunda con un producto (el Admin solo cuenta ids numéricos).
export function promoItem({ slot, id, name, index }) {
  const pid = `${slot}:${String(id).slice(0, 80)}`;
  const out = { item_id: pid, item_name: clip(name) || pid, promotion_id: pid, promotion_name: clip(name) || pid, creative_slot: slot, creative_name: clip(name) || pid, index: Number.isInteger(index) ? index : undefined };
  if (out.index === undefined) delete out.index;
  return out;
}

export function shouldSend(name, params, now = Date.now(), memory = recent) {
  const key = name + "|" + JSON.stringify(params || {});
  const last = memory.get(key);
  memory.set(key, now);
  if (memory.size > 200) for (const [k, t] of memory) if (now - t > DEDUPE_MS) memory.delete(k);
  return !(last !== undefined && now - last < DEDUPE_MS);
}

// ── Estado del consentimiento ───────────────────────────────────────────
function readConsent() {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}
function writeConsent(v) {
  try { window.localStorage.setItem(CONSENT_KEY, v); } catch {}
}

// ── Envío ───────────────────────────────────────────────────────────────
export function track(name, params = {}) {
  if (typeof window === "undefined" || consent !== "granted") return false;
  if (!shouldSend(name, params)) return false;
  if (!tagReady) {
    if (queue.length < MAX_QUEUE) queue.push([name, params]);
    return true;
  }
  window.gtag("event", name, params);
  return true;
}

// Una sola vez por página para la misma clave (impresiones).
export function trackOnce(key, name, params) {
  if (sentOnce.has(key)) return false;
  if (consent !== "granted") return false;
  sentOnce.add(key);
  return track(name, params);
}

// Envía `fn()` cuando `el` entra en pantalla (una vez por clave).
const observed = new WeakMap();
export function whenVisible(el, key, fn) {
  if (!el || consent === "denied" || sentOnce.has(key)) return;
  if (typeof IntersectionObserver === "undefined") { fn(); return; }
  const prev = observed.get(el);
  if (prev) prev.disconnect();
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    observed.delete(el);
    fn();
  }, { threshold: 0 });
  observed.set(el, io);
  io.observe(el);
}

// Banners del carrusel: una impresión por pieza la primera vez que se ve
// con el carrusel en pantalla, y el clic en una pieza con enlace.
// tiles[i] = { id, name }. Devuelve seen(i) para llamarlo al cambiar de pieza.
export function instrumentBanners(root, slidesEl, tiles, getCurrent) {
  let inView = false;
  const seen = (i) => {
    if (!inView || !tiles[i]) return;
    trackOnce(`promo:banner:${tiles[i].id}`, "view_promotion", { items: [promoItem({ slot: "banner", ...tiles[i], index: i })] });
  };
  if (root && typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) seen(getCurrent());
    }).observe(root);
  }
  if (slidesEl) slidesEl.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".hero-slide[href]");
    if (!a) return;
    const i = Number(a.dataset.index);
    if (tiles[i]) track("select_promotion", { items: [promoItem({ slot: "banner", ...tiles[i], index: i })] });
  });
  return seen;
}

function loadTag(id) {
  if (tagReady) return;
  const existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window[`ga-disable-${id}`] = false;
  window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("config", id, { page_location: cleanPageLocation(window.location.href), allow_google_signals: false, allow_ad_personalization_signals: false });
  if (!existing) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }
  tagReady = true;
  const pending = queue;
  queue = [];
  for (const [n, p] of pending) window.gtag("event", n, p);
}

function stopTag() {
  if (measurementId) window[`ga-disable-${measurementId}`] = true;
  if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: "denied" });
  // Borra las cookies de GA de este dominio.
  const host = window.location.hostname;
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!/^_ga/.test(name)) continue;
    for (const domain of ["", host, "." + host.replace(/^www\./, "")]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? "; domain=" + domain : ""}`;
    }
  }
}

export function setConsent(value) {
  consent = value === "granted" ? "granted" : "denied";
  writeConsent(consent);
  hideBanner();
  if (consent === "granted" && measurementId) { loadTag(measurementId); captureAttribution(); }
  if (consent === "denied") {
    queue = [];
    if (tagReady) stopTag();
    tagReady = false;
    clearAttribution();
  }
}

// ── Atribución del pedido (Fase B) ──────────────────────────────────────
// Origen de la visita que termina en un pedido: UTM, ids de clic, página de
// entrada y sitio de procedencia, más los ids de GA4 (cliente y sesión).
// SOLO con consentimiento analítico: antes no se lee ni se guarda nada, y al
// rechazar se borra. Nunca datos personales: valores con «@» o con aspecto
// de teléfono se descartan; la página de entrada y el sitio de procedencia
// van sin parámetros ajenos a la campaña. Modelo «último origen no directo»:
// una visita directa o una navegación interna nunca reemplaza un origen
// guardado; uno nuevo (campaña o sitio externo) sí. Vence a los 30 días.
export const ATTRIBUTION_KEY = "vibe_attribution_v1";
const ATTRIBUTION_TTL_MS = 30 * 864e5;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["gclid", "fbclid", "ttclid"];
const bareHost = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

export function cleanCampaignValue(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!s || s.includes("@")) return null;
  if (/^\d{7,13}$/.test(s.replace(/[\s+\-().]/g, ""))) return null;
  return s;
}

// Visita → { kind: "campaign" | "direct" | "internal", data }.
export function attributionFromVisit(href, referrer, now = Date.now()) {
  let u;
  try { u = new URL(href); } catch { return { kind: "internal", data: null }; }
  const data = {};
  for (const k of UTM_KEYS) { const v = cleanCampaignValue(u.searchParams.get(k)); if (v) data[k] = v; }
  for (const k of CLICK_KEYS) { const v = u.searchParams.get(k); if (v && /^[A-Za-z0-9._-]{8,200}$/.test(v)) data[k] = v; }
  let internal = false;
  if (referrer) {
    try {
      const r = new URL(referrer);
      if (bareHost(r.hostname) === bareHost(u.hostname)) internal = true;
      else if (r.protocol === "https:" || r.protocol === "http:") data.referrer = `${r.origin}${r.pathname}`.slice(0, 200);
    } catch {}
  }
  const hasSource = Object.keys(data).length > 0;
  if (!hasSource && internal) return { kind: "internal", data: null };
  const loc = cleanPageLocation(href);
  if (loc) data.landing = loc.slice(loc.indexOf("/", 8)).slice(0, 200);
  data.captured_at = new Date(now).toISOString();
  return { kind: hasSource ? "campaign" : "direct", data };
}

// Combina lo guardado con la visita actual sin perder un origen válido.
export function mergeAttribution(stored, visit, now = Date.now()) {
  const valid = stored && typeof stored === "object" && Date.parse(stored.captured_at) > now - ATTRIBUTION_TTL_MS ? stored : null;
  if (visit.kind === "campaign") return visit.data;
  if (visit.kind === "direct" && !valid) return visit.data;
  return valid;
}

function readAttribution() {
  try { return JSON.parse(window.localStorage.getItem(ATTRIBUTION_KEY) || "null"); } catch { return null; }
}
export function captureAttribution() {
  if (typeof window === "undefined" || consent !== "granted") return null;
  const next = mergeAttribution(readAttribution(), attributionFromVisit(window.location.href, document.referrer));
  try {
    if (next) window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {}
  return next;
}
function clearAttribution() {
  try { window.localStorage.removeItem(ATTRIBUTION_KEY); } catch {}
}

// Ids de GA4 desde las cookies propias de la etiqueta (_ga y _ga_<id>).
export function parseGaCookies(cookieStr, id) {
  const jar = {};
  for (const c of String(cookieStr || "").split(";")) { const i = c.indexOf("="); if (i > 0) jar[c.slice(0, i).trim()] = c.slice(i + 1).trim(); }
  const out = {};
  const ga = /^GA\d\.\d+\.(\d{1,12})\.(\d{1,12})$/.exec(jar._ga || "");
  if (ga) out.clientId = `${ga[1]}.${ga[2]}`;
  const sess = jar[`_ga_${String(id || "").replace(/^G-/, "")}`] || "";
  const m = /^GS1\.\d+\.(\d{1,15})\./.exec(sess) || /^GS2\.\d+\.s(\d{1,15})/.exec(sess);
  if (m) out.sessionId = m[1];
  return out;
}

function gtagGet(field, timeoutMs) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    try { window.gtag("get", measurementId, field, (v) => { clearTimeout(t); resolve(v == null ? null : String(v)); }); }
    catch { clearTimeout(t); resolve(null); }
  });
}

// Datos para /api/orders/create: {} sin consentimiento (el pedido sale igual
// que antes). Nunca incluye datos de la clienta.
export async function orderAttribution({ timeoutMs = 600 } = {}) {
  if (typeof window === "undefined" || consent !== "granted" || !measurementId) return {};
  const out = {};
  const stored = mergeAttribution(readAttribution(), { kind: "internal", data: null });
  if (stored) out.attribution = stored;
  let clientId = null, sessionId = null;
  if (tagReady && typeof window.gtag === "function") [clientId, sessionId] = await Promise.all([gtagGet("client_id", timeoutMs), gtagGet("session_id", timeoutMs)]);
  const fromCookies = parseGaCookies(document.cookie, measurementId);
  clientId = clientId && /^\d{1,12}\.\d{1,12}$/.test(clientId) ? clientId : fromCookies.clientId;
  sessionId = sessionId && /^\d{1,15}$/.test(sessionId) ? sessionId : fromCookies.sessionId;
  if (clientId) out.gaClientId = clientId;
  if (sessionId) out.gaSessionId = sessionId;
  return out;
}

// ── Aviso de privacidad ─────────────────────────────────────────────────
function hideBanner() {
  const b = document.getElementById("consentBanner");
  if (b) b.hidden = true;
}
export function showBanner() {
  let b = document.getElementById("consentBanner");
  if (!b) {
    b = document.createElement("section");
    b.id = "consentBanner";
    b.className = "consent-banner";
    b.setAttribute("aria-label", "Preferencias de privacidad");
    b.innerHTML = `<p class="consent-text">Si lo aceptas, usamos Google Analytics para entender de forma agregada cómo se usa el catálogo y mejorarlo. No enviamos tu nombre, teléfono, correo ni dirección. <a href="legal.html#datos">Más información</a></p>
      <div class="consent-actions"><button type="button" class="button outline" data-consent="denied">Rechazar</button><button type="button" class="button dark" data-consent="granted">Aceptar</button></div>`;
    b.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-consent]");
      if (btn) setConsent(btn.dataset.consent);
    });
    document.body.appendChild(b);
  }
  b.hidden = false;
}

function addPreferencesLink() {
  if (document.getElementById("privacyPrefs")) return;
  const list = document.querySelector("footer .footer-links");
  if (!list) return;
  const li = document.createElement("li");
  li.innerHTML = `<button type="button" id="privacyPrefs" class="footer-link-button">Preferencias de privacidad</button>`;
  li.firstChild.addEventListener("click", showBanner);
  list.appendChild(li);
}

// Clics a WhatsApp (enlaces wa.me): contacto, nunca una venta.
function bindWhatsappClicks() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    const zone = a.closest("footer") ? "pie" : a.closest("#ayuda") ? "preguntas" : a.closest("dialog") ? "dialogo" : "pagina";
    track("contact_whatsapp", { link_location: zone });
  }, true);
}

// Arranque: lee el consentimiento guardado al instante (para no perder los
// primeros eventos si ya había aceptado) y pide el id de medición.
export async function initAnalytics({ fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  if (typeof window === "undefined" || !isAllowedHost(window.location.hostname)) { consent = "denied"; return { enabled: false, reason: "host" }; }
  consent = readConsent(); // si ya aceptó, los eventos se encolan hasta cargar la etiqueta
  const stored = consent;
  bindWhatsappClicks();
  let id = null;
  try {
    const res = await fetchImpl("/api/catalog/categories?view=analytics");
    const body = res.ok ? await res.json() : null;
    id = body && typeof body.measurementId === "string" && /^G-[A-Z0-9]{4,20}$/.test(body.measurementId) ? body.measurementId : null;
  } catch {
    id = null;
  }
  if (!id) { consent = "denied"; queue = []; return { enabled: false, reason: "not-configured" }; }
  measurementId = id;
  addPreferencesLink();
  if (stored === "granted") { loadTag(id); captureAttribution(); }
  else if (stored === null) showBanner();
  return { enabled: true, consent: stored };
}

// Solo para pruebas.
export function __resetForTests() {
  measurementId = null; tagReady = false; consent = null; queue = []; recent.clear(); sentOnce.clear();
}
export function __setConsentForTests(v) { consent = v; }
export function __setMeasurementIdForTests(v) { measurementId = v; }
