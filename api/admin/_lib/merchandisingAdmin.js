// Organización comercial — administración (vive en /api/admin/products
// ?resource=merchandising|bestsellers para no sumar funciones serverless).
//
// GET  ?resource=merchandising → { merchandising (documento completo),
//        newArrivals (Novedades automáticas con la configuración guardada),
//        pending (productos sin clasificación principal) }
// POST ?resource=merchandising  { doc, expectedRevision } → guarda el
//        documento completo saneado, solo si nadie guardó antes (409 si no).
// GET  ?resource=bestsellers[&periodDays=N] → ranking con UNIDADES (solo
//        Admin), ventas contadas y omitidas. Solo lectura del POS.

const { pgrestSelect } = require("../../catalog/_lib/supabaseRead");
const { sendJson, sendError } = require("../../catalog/_lib/http");
const M = require("../../_lib/merchandising");
const { loadBestSellers } = require("../../_lib/bestsellers");
const { loadTaxonomy, categoryIndex } = require("../../_lib/taxonomyStore");

async function handleMerchandising(req, res, env) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    try {
      const [doc, rows, tax] = await Promise.all([
        M.loadMerchandising(env),
        pgrestSelect({ table: "catalog_metadata", columns: "product_id,published,created_at,category", env }),
        loadTaxonomy(env),
      ]);
      const cats = categoryIndex(tax);
      // Pendientes de clasificación: publicados sin categoría principal de
      // la taxonomía vigente (siguen visibles en la tienda).
      const pending = rows.filter((m) => m && m.published === true && !(m.category && cats.has(m.category))).map((m) => Number(m.product_id));
      return sendJson(res, 200, { merchandising: doc, newArrivals: M.computeNewArrivals(rows, doc.showcases.novedades), pending });
    } catch (e) {
      console.error("[admin/merchandising] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo leer la organización comercial.");
    }
  }
  // POST: guardar
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return sendError(res, 400, "Falta la revisión de referencia.");
  if (!body.doc || typeof body.doc !== "object") return sendError(res, 400, "Documento inválido.");
  try {
    const current = await M.loadMerchandisingAtLeast(env, body.expectedRevision);
    if (current.revision !== body.expectedRevision) {
      return sendJson(res, 409, { error: "Otra sesión guardó cambios antes. Recarga para ver la versión vigente.", merchandising: current });
    }
    const next = M.sanitizeMerchandising({ ...body.doc, revision: current.revision + 1, updatedAt: new Date().toISOString() });
    next.revision = current.revision + 1;
    next.updatedAt = new Date().toISOString();
    await M.saveMerchandising(env, next);
    return sendJson(res, 200, { merchandising: next });
  } catch (e) {
    console.error("[admin/merchandising] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo guardar la organización comercial.");
  }
}

async function handleBestSellers(req, res, env) {
  res.setHeader("Cache-Control", "no-store");
  const raw = req.query && req.query.periodDays;
  const periodDays = /^\d{1,3}$/.test(String(raw || "")) && Number(raw) >= 1 && Number(raw) <= 365 ? Number(raw) : null;
  try {
    const days = periodDays || (await M.loadMerchandising(env)).showcases.masElegidos.periodDays;
    const best = await loadBestSellers(env, { periodDays: days });
    return sendJson(res, 200, best);
  } catch (e) {
    console.error("[admin/bestsellers] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo calcular el ranking de ventas.");
  }
}

module.exports = { handleMerchandising, handleBestSellers };
