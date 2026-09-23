const crypto = require("crypto");

// Fail-closed: if ADMIN_API_TOKEN isn't configured server-side, every
// admin request is denied — there is no "open by default" state, the
// same safety posture as api/catalog/_lib/env.js (Fase 6): missing
// configuration is always treated as "not available", never as
// "unprotected".
//
// This is a single shared bearer token, not a multi-user auth system —
// deliberately, per Fase 17's scope ("no construir usuarios/roles
// avanzados"). It is a real, server-side-enforced gate (constant-time
// comparison, required on every request, never exposed to the
// browser's bundle), not a cosmetic check. See docs/fase17-admin.md
// for what a stronger mechanism (Supabase Auth, per-admin sessions)
// would need if multiple administrators are required later.
function requireAdmin(req, res) {
  const configured = process.env.ADMIN_API_TOKEN;
  if (!configured) {
    res.status(503).json({ error: "Panel administrativo no configurado todavía." });
    return false;
  }

  const header = (req.headers && req.headers.authorization) || "";
  const match = header.match(/^Bearer\s+(.+)$/);
  const provided = match ? match[1] : "";

  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    res.status(401).json({ error: "No autorizado." });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
