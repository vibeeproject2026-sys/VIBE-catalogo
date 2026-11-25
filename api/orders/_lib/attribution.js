// Fase B — atribución de la visita en el pedido (columnas de public.orders
// creadas por la migración 14 del POS: attribution jsonb, ga_client_id,
// ga_session_id). El navegador solo envía estos datos si la visitante
// aceptó la analítica; aquí se validan con lista blanca y se descarta todo
// lo dudoso. La analítica NUNCA impide un pedido: un dato inválido se omite,
// no produce un error. La base vuelve a sanear al insertar (disparador
// orders_sanitize_analytics).
//
// Claves aceptadas (las mismas que admite el disparador): la página de
// entrada se guarda como «landing».
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["gclid", "fbclid", "ttclid"];
const MAX_LEN = 200;
const STORE_HOSTS = ["www.vibebeautycol.com", "vibebeautycol.com"];

// Texto libre de campaña: sin controles, recortado; se descarta si parece un
// dato personal (correo o número de teléfono).
function cleanText(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  if (!s) return null;
  if (s.includes("@")) return null;
  const compact = s.replace(/[\s+\-().]/g, "");
  if (/^\d{7,13}$/.test(compact)) return null;
  return s;
}

// Identificadores de clic de Google/Meta/TikTok: solo caracteres de token.
function cleanClickId(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9._-]{8,200}$/.test(s) ? s : null;
}

// Página de entrada: solo una ruta de la tienda, con los parámetros de
// campaña permitidos (nunca otros parámetros, que podrían llevar datos).
function cleanLanding(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  let u;
  try { u = new URL(v.trim(), "https://www.vibebeautycol.com"); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!STORE_HOSTS.includes(u.hostname.toLowerCase())) return null;
  const kept = new URLSearchParams();
  for (const k of [...UTM_KEYS, ...CLICK_KEYS, "product", "group", "category", "subcategory", "collection", "tag"]) {
    if (u.searchParams.has(k)) kept.set(k, u.searchParams.get(k).slice(0, 100));
  }
  const q = kept.toString();
  const out = `${u.pathname}${q ? "?" + q : ""}`;
  return out.length <= MAX_LEN ? out : u.pathname.slice(0, MAX_LEN);
}

// Sitio de procedencia: solo origen y ruta (sin parámetros ni fragmento).
function cleanReferrer(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  let u;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  return `${u.origin}${u.pathname}`.slice(0, MAX_LEN);
}

// Fecha del primer contacto: ISO válido, no futuro ni de hace más de 90 días.
function cleanCapturedAt(v, now = Date.now()) {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t > now + 5 * 60e3 || t < now - 90 * 864e5) return null;
  return new Date(t).toISOString();
}

/**
 * body → { attribution, ga_client_id, ga_session_id } con null en lo que no
 * venga o no sea válido. Las claves no reconocidas se ignoran.
 */
function sanitizeOrderAnalytics(body, now = Date.now()) {
  const src = body && typeof body.attribution === "object" && body.attribution !== null && !Array.isArray(body.attribution) ? body.attribution : {};
  const out = {};
  for (const k of UTM_KEYS) { const v = cleanText(src[k]); if (v) out[k] = v; }
  for (const k of CLICK_KEYS) { const v = cleanClickId(src[k]); if (v) out[k] = v; }
  const landing = cleanLanding(src.landing);
  if (landing) out.landing = landing;
  const referrer = cleanReferrer(src.referrer);
  if (referrer) out.referrer = referrer;
  const capturedAt = cleanCapturedAt(src.captured_at, now);
  // La fecha sola no es atribución: solo acompaña a datos reales.
  if (capturedAt && Object.keys(out).length) out.captured_at = capturedAt;

  const cid = typeof body?.gaClientId === "string" && /^\d{1,12}\.\d{1,12}$/.test(body.gaClientId) ? body.gaClientId : null;
  const sid = typeof body?.gaSessionId === "string" && /^\d{1,15}$/.test(body.gaSessionId) ? body.gaSessionId : null;
  return { attribution: Object.keys(out).length ? out : null, ga_client_id: cid, ga_session_id: sid };
}

/** Solo las columnas con valor: sin consentimiento, el pedido se inserta igual que antes. */
function analyticsColumns(clean) {
  const cols = {};
  for (const k of ["attribution", "ga_client_id", "ga_session_id"]) if (clean[k] != null) cols[k] = clean[k];
  return cols;
}

module.exports = { sanitizeOrderAnalytics, analyticsColumns };
