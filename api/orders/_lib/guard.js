// Fase 56 — protección proporcionada contra envíos abusivos a
// /api/orders/create, sin proveedores externos ni dependencias nuevas:
//
// 1. Honeypot: el formulario incluye un campo oculto ("website") que una
//    persona nunca ve ni completa; si llega con contenido, se rechaza.
// 2. Límite por IP (en memoria de cada instancia serverless): amortigua
//    ráfagas desde un mismo origen. Es best-effort (cada instancia tiene su
//    propio contador) y por eso se complementa con el límite por teléfono
//    que create.js verifica contra la base (persistente).
// Nunca se guarda ni se registra la IP en claro: solo un hash truncado,
// únicamente en memoria y con caducidad.

const crypto = require("crypto");

const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_ATTEMPTS = 8;
const PHONE_WINDOW_MS = 10 * 60 * 1000;
const PHONE_MAX_ORDERS = 3;
const MAX_TRACKED = 5000;

const attempts = new Map(); // hash(ip) -> [timestamps]

function isHoneypotFilled(body) {
  const v = body && body.website;
  return typeof v === "string" ? v.trim().length > 0 : v != null && v !== false;
}

function clientIp(req) {
  const fwd = req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : "";
  return first || (req.socket && req.socket.remoteAddress) || "unknown";
}

function ipKey(req) {
  return crypto.createHash("sha256").update("vibe-orders:" + clientIp(req)).digest("hex").slice(0, 16);
}

// Registra un intento y dice si supera el límite. `now` inyectable para pruebas.
function ipRateLimited(req, now = Date.now()) {
  const key = ipKey(req);
  const recent = (attempts.get(key) || []).filter((t) => now - t < IP_WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > MAX_TRACKED) {
    for (const [k, list] of attempts) {
      if (!list.some((t) => now - t < IP_WINDOW_MS)) attempts.delete(k);
    }
  }
  return recent.length > IP_MAX_ATTEMPTS;
}

function resetIpLimiter() {
  attempts.clear();
}

// Clave de idempotencia enviada por el navegador (una por intento lógico
// de compra). Opcional por compatibilidad; si viene, debe tener esta forma.
function parseIdempotencyKey(value) {
  if (value === undefined || value === null || value === "") return { key: null };
  if (typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value)) return { key: value };
  return { invalid: true };
}

module.exports = {
  IP_WINDOW_MS,
  IP_MAX_ATTEMPTS,
  PHONE_WINDOW_MS,
  PHONE_MAX_ORDERS,
  isHoneypotFilled,
  ipRateLimited,
  resetIpLimiter,
  parseIdempotencyKey,
};
