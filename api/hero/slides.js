// GET /api/hero/slides — public, read-only.
//
// Returns only ACTIVE hero slides (Fase 33), sorted by order, shaped for
// the Home carousel. Reuses the same env/CORS/response helpers as
// /api/catalog/* — this is a separate public namespace on purpose
// (sección 10: "no usar un endpoint genérico"), never mixed with product
// data. No write methods here; slides are only ever written through
// /api/admin/hero-slides (admin-only).

const { getEnv } = require("../catalog/_lib/env");
const { applyCors } = require("../catalog/_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { loadSlides, getActiveSlides, shapePublicSlide } = require("../_lib/heroSlides");

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return methodNotAllowed(res);

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[hero/slides] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  try {
    const slides = await loadSlides(env);
    const active = getActiveSlides(slides).map(shapePublicSlide);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return sendJson(res, 200, { slides: active });
  } catch (e) {
    console.error("[hero/slides] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudieron obtener los slides del Hero.");
  }
};
