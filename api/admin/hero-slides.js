// GET /api/admin/hero-slides — admin-only. Lists every slide (active and
// inactive) for the admin table.
//
// POST /api/admin/hero-slides — admin-only. Creates a new slide. Image
// upload is a separate step (see hero-slide-image.js) — a slide can, and
// initially does, exist with image: null. Always created with
// active: false (sección 8: un slide nuevo nunca aparece automáticamente).
//
// PATCH /api/admin/hero-slides — admin-only. Body: { id, ...fields }.
// Updates only the whitelisted slide fields (_lib/heroSlides.js). Never
// touches products/categories/sales/transactions — this file has no
// import path that could reach them, and the only Storage path it
// writes to is hero/slides.json plus (via the image endpoint) hero/{id}/.
//
// DELETE /api/admin/hero-slides — admin-only. Body: { id }. Removes the
// slide from the manifest, then best-effort deletes its own Storage
// images (main/mobile), same discipline as product-images.js: never
// deletes a legacy/external URL, never fails the request if the file
// cleanup fails.
//
// No CORS headers — same-origin only, called exclusively from
// admin/admin.js.

const { getEnv } = require("../catalog/_lib/env");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const {
  loadSlides,
  loadSlidesUntilFound,
  saveSlides,
  isSafeCtaHref,
  makeSlideId,
  nextOrder,
  pickSlideFields,
  isOwnedPath,
  pathFromUrl,
  deleteObject,
} = require("../_lib/heroSlides");

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "PATCH", "DELETE"]);
  }
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/hero-slides] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  if (req.method === "GET") {
    try {
      const slides = await loadSlides(env);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, { slides });
    } catch (e) {
      console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo obtener el listado de slides.");
    }
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  if (req.method === "POST") {
    const fields = pickSlideFields(body);
    if (!isSafeCtaHref(fields.ctaHref)) {
      return sendError(res, 400, "Destino de CTA no permitido. Usa una ruta interna (/, #) o una URL http(s) válida.");
    }
    try {
      const slides = await loadSlides(env);
      const now = new Date().toISOString();
      const slide = {
        id: makeSlideId(),
        image: null,
        mobileImage: null,
        eyebrow: fields.eyebrow ?? null,
        title: fields.title ?? null,
        subtitle: fields.subtitle ?? null,
        ctaText: fields.ctaText ?? null,
        ctaHref: fields.ctaHref ?? null,
        alt: fields.alt ?? null,
        order: nextOrder(slides),
        active: false,
        createdAt: now,
        updatedAt: now,
      };
      const next = [...slides, slide];
      await saveSlides(env, next);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, { slide, slides: next });
    } catch (e) {
      console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo crear el slide.");
    }
  }

  // Fase 36 — reordenar movía dos slides con dos PATCH secuenciales
  // independientes (cada uno su propio read-modify-write del manifiesto
  // completo). Con dos requests separados, el segundo puede escribir a
  // partir de una copia que no incluye lo que el primero acababa de
  // guardar, perdiendo ese cambio (clásico lost update — sección 8 de la
  // fase). Un solo request que aplica todos los `order` en un único
  // read-modify-write elimina la ventana por completo. Reservado a
  // `order`: es lo único que el reordenamiento necesita tocar.
  if (req.method === "PATCH" && Array.isArray(body.reorder)) {
    const updates = body.reorder;
    for (const u of updates) {
      if (!u || typeof u.id !== "string" || typeof u.order !== "number" || !Number.isFinite(u.order)) {
        return sendError(res, 400, "reorder inválido: cada entrada necesita id (string) y order (número).");
      }
    }
    let slides;
    try {
      slides = await loadSlides(env);
    } catch (e) {
      console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo obtener el listado de slides.");
    }
    const ids = new Set(slides.map((s) => s.id));
    for (const u of updates) {
      if (!ids.has(u.id)) return sendError(res, 404, `Ese slide no existe: ${u.id}`);
    }
    const now = new Date().toISOString();
    const next = slides.map((s) => {
      const u = updates.find((x) => x.id === s.id);
      return u ? { ...s, order: u.order, updatedAt: now } : s;
    });
    try {
      await saveSlides(env, next);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, { slides: next });
    } catch (e) {
      console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo guardar el nuevo orden.");
    }
  }

  // PATCH y DELETE necesitan un id existente.
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return sendError(res, 400, "id inválido o ausente.");

  let slides;
  try {
    // Fase 34, sección 12 — mismo reintento que hero-slide-image.js: un
    // PATCH/DELETE justo después de crear el slide no debe fallar por la
    // misma propagación no siempre instantánea de Storage.
    slides = await loadSlidesUntilFound(env, id);
  } catch (e) {
    console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo obtener el listado de slides.");
  }
  const index = slides.findIndex((s) => s.id === id);
  if (index === -1) return sendError(res, 404, "Ese slide no existe.");

  if (req.method === "PATCH") {
    const fields = pickSlideFields(body);
    if ("ctaHref" in fields && !isSafeCtaHref(fields.ctaHref)) {
      return sendError(res, 400, "Destino de CTA no permitido. Usa una ruta interna (/, #) o una URL http(s) válida.");
    }
    const updated = { ...slides[index], ...fields, updatedAt: new Date().toISOString() };
    const next = [...slides];
    next[index] = updated;
    try {
      await saveSlides(env, next);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, { slide: updated, slides: next });
    } catch (e) {
      console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo guardar el slide.");
    }
  }

  // DELETE
  const removed = slides[index];
  const next = slides.filter((s) => s.id !== id);
  try {
    await saveSlides(env, next);
  } catch (e) {
    console.error("[admin/hero-slides] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo eliminar el slide.");
  }
  // Metadata ya actualizada con éxito — limpieza de Storage best-effort,
  // nunca causa que el DELETE falle, y nunca toca una URL externa.
  for (const url of [removed.image, removed.mobileImage]) {
    if (url && isOwnedPath(env, url)) {
      const path = pathFromUrl(env, url);
      if (path) {
        deleteObject({ env, path }).catch((e) => {
          console.error("[admin/hero-slides] cleanup delete failed: " + (e && e.message ? e.message : e));
        });
      }
    }
  }
  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 200, { slides: next });
};
