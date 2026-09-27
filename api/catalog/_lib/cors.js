// CORS policy for the catalog's public read-only API.
//
// Deliberately NOT "Access-Control-Allow-Origin: *" (that pattern was
// flagged as a security issue on the POS's api/db.js during Fase 4).
// The allow-list is configurable via CATALOG_ALLOWED_ORIGINS (a
// comma-separated env var) so the final catalog domain can be set later
// without touching code. Vercel preview deployments (*.vercel.app) are
// always allowed since their URLs are dynamic and this is a public,
// read-only endpoint — low risk to allow, but still scoped, not "*".

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8080",
  "http://localhost:8123",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8123",
];

function getAllowedOrigins() {
  const fromEnv = (process.env.CATALOG_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_DEV_ORIGINS;
}

function isVercelPreview(origin) {
  return typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

// Fase 39 — `methods` se vuelve parametrizable (antes hardcodeado a
// "GET, OPTIONS") para que api/orders/create.js pueda reusar este mismo
// helper con ["POST","OPTIONS"] en vez de duplicar el archivo entero
// por un único método distinto. El default se mantiene igual que antes
// para cada llamador existente que no pasa el tercer argumento.
function applyCors(req, res, methods = ["GET", "OPTIONS"]) {
  const origin = req.headers && req.headers.origin;
  const allowed = getAllowedOrigins();
  const isAllowed = Boolean(origin) && (allowed.includes(origin) || isVercelPreview(origin));

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  return isAllowed;
}

module.exports = { applyCors, getAllowedOrigins, isVercelPreview, DEFAULT_DEV_ORIGINS };
