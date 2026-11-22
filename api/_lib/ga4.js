// Analítica comercial — cliente mínimo de la Google Analytics Data API
// (GA4), solo lectura, sin dependencias: firma el JWT de la cuenta de
// servicio con `crypto` de Node y llama a la API REST con fetch.
//
// Variables de entorno (Vercel, nunca en el navegador ni en Git):
// - GA4_PROPERTY_ID: id numérico de la propiedad (no el «G-…»).
// - GA4_SERVICE_ACCOUNT_KEY: el JSON de la clave de la cuenta de servicio
//   (tal cual o en base64). Solo necesita el rol «Lector» en la propiedad.
// - GA4_MEASUREMENT_ID: el «G-…» del flujo web. Es público por naturaleza
//   (lo usa la etiqueta del navegador); se lee en api/catalog/categories.js.
//
// Nunca se registra ni se devuelve la clave, el token ni el correo de la
// cuenta de servicio.

const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://analyticsdata.googleapis.com/v1beta";

const MEASUREMENT_RE = /^G-[A-Z0-9]{4,20}$/;
const PROPERTY_RE = /^\d{5,15}$/;

function measurementId(env = process.env) {
  const v = String(env.GA4_MEASUREMENT_ID || "").trim().toUpperCase();
  return MEASUREMENT_RE.test(v) ? v : null;
}

function parseKey(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (!text.startsWith("{")) {
    try { text = Buffer.from(text, "base64").toString("utf8").trim(); } catch { return null; }
  }
  try {
    const k = JSON.parse(text);
    if (!k || typeof k.client_email !== "string" || typeof k.private_key !== "string") return null;
    return { clientEmail: k.client_email, privateKey: k.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

// Estado de configuración (sin revelar valores): qué falta y si lo que hay es válido.
function ga4Config(env = process.env) {
  const propertyRaw = String(env.GA4_PROPERTY_ID || "").trim().replace(/^properties\//, "");
  const key = parseKey(env.GA4_SERVICE_ACCOUNT_KEY);
  const missing = [];
  if (!measurementId(env)) missing.push("GA4_MEASUREMENT_ID");
  if (!PROPERTY_RE.test(propertyRaw)) missing.push("GA4_PROPERTY_ID");
  if (!key) missing.push("GA4_SERVICE_ACCOUNT_KEY");
  return {
    measurementConfigured: Boolean(measurementId(env)),
    reportingConfigured: PROPERTY_RE.test(propertyRaw) && Boolean(key),
    missing,
    propertyId: PROPERTY_RE.test(propertyRaw) ? propertyRaw : null,
    key,
  };
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function signedAssertion(key, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(key.privateKey))}`;
}

class Ga4Error extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || null;
  }
}

let tokenCache = null; // { token, exp, email }

async function accessToken(key, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (tokenCache && tokenCache.email === key.clientEmail && tokenCache.exp - 60000 > now) return tokenCache.token;
  let assertion;
  try {
    assertion = signedAssertion(key, Math.floor(now / 1000));
  } catch {
    throw new Ga4Error("BAD_KEY", "La clave de la cuenta de servicio no es válida.");
  }
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(assertion)}`,
    });
  } catch {
    throw new Ga4Error("NETWORK", "No se pudo conectar con Google.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    throw new Ga4Error("AUTH", "Google rechazó la cuenta de servicio (revisa la clave configurada).", res.status);
  }
  tokenCache = { token: body.access_token, exp: now + Number(body.expires_in || 3600) * 1000, email: key.clientEmail };
  return tokenCache.token;
}

// requests: hasta 5 informes runReport. Devuelve los informes en el mismo orden.
async function batchRunReports(cfg, requests, { fetchImpl = fetch } = {}) {
  const token = await accessToken(cfg.key, { fetchImpl });
  let res;
  try {
    res = await fetchImpl(`${API}/properties/${cfg.propertyId}:batchRunReports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requests }),
    });
  } catch {
    throw new Ga4Error("NETWORK", "No se pudo conectar con Google Analytics.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) tokenCache = null;
    if (res.status === 403) throw new Ga4Error("FORBIDDEN", "La cuenta de servicio no tiene acceso a la propiedad de GA4 (agrégala como «Lector»).", 403);
    if (res.status === 404) throw new Ga4Error("PROPERTY", "Google Analytics no reconoce la propiedad configurada (revisa GA4_PROPERTY_ID).", 404);
    if (res.status === 400) throw new Ga4Error("QUERY", "Google Analytics rechazó la consulta (revisa GA4_PROPERTY_ID).", 400);
    if (res.status === 429) throw new Ga4Error("QUOTA", "Se alcanzó el límite de consultas de Google Analytics. Intenta en unos minutos.", 429);
    throw new Ga4Error("API", "Google Analytics respondió con un error.", res.status);
  }
  return (body && body.reports) || [];
}

// Informe de la API → filas planas { dim1, dim2, ..., met1, ... } (números como Number).
function rowsOf(report) {
  if (!report) return [];
  const dims = (report.dimensionHeaders || []).map((h) => h.name);
  const mets = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((r) => {
    const o = {};
    dims.forEach((d, i) => { o[d] = r.dimensionValues && r.dimensionValues[i] ? r.dimensionValues[i].value : ""; });
    mets.forEach((m, i) => { const v = Number(r.metricValues && r.metricValues[i] ? r.metricValues[i].value : 0); o[m] = Number.isFinite(v) ? v : 0; });
    return o;
  });
}

function resetTokenCache() { tokenCache = null; }

module.exports = { ga4Config, measurementId, parseKey, signedAssertion, accessToken, batchRunReports, rowsOf, Ga4Error, resetTokenCache, MEASUREMENT_RE };
