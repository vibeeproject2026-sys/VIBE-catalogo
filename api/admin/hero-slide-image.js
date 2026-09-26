// POST /api/admin/hero-slide-image — admin-only. Uploads an image
// (slot: "desktop" | "mobile") for one hero slide to the existing
// product-images Storage bucket (under hero/{slideId}/) and records its
// public URL in the slide's `image` (desktop) or `mobileImage` (mobile)
// field in hero/slides.json.
//
// Same discipline as api/admin/product-images.js: the only Storage path
// this can ever write to is hero/{slideId}/, the only file it can ever
// modify is hero/slides.json (via _lib/heroSlides.js), and it never
// touches products/categories/sales/transactions in any way.
//
// Body is JSON with the file embedded as base64 — same as
// product-images.js, no multipart parser, dependency-free.
//
// No CORS headers — same-origin only, called exclusively from
// admin/admin.js.

const { getEnv } = require("../catalog/_lib/env");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { decodeBase64Image, validateHeroUpload } = require("./_lib/imageValidation");
const { uploadObject, deleteObject, isOwnedPath, pathFromUrl } = require("./_lib/storage");
const { loadSlides, saveSlides, buildHeroImagePath } = require("../_lib/heroSlides");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/hero-slide-image] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const slideId = typeof body.slide_id === "string" ? body.slide_id : "";
  const slot = body.slot === "desktop" || body.slot === "mobile" ? body.slot : null;
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";

  if (!slideId) return sendError(res, 400, "slide_id inválido o ausente.");
  if (!slot) return sendError(res, 400, "slot inválido: usa 'desktop' o 'mobile'.");
  if (!contentType || !dataBase64) return sendError(res, 400, "Falta contentType o dataBase64.");

  let slides;
  try {
    slides = await loadSlides(env);
  } catch (e) {
    console.error("[admin/hero-slide-image] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo verificar el slide.");
  }
  const index = slides.findIndex((s) => s.id === slideId);
  if (index === -1) return sendError(res, 400, "Ese slide_id no existe.");

  let buffer;
  try {
    buffer = decodeBase64Image(dataBase64);
  } catch {
    return sendError(res, 400, "No se pudo decodificar el archivo.");
  }

  const validation = validateHeroUpload({ contentType, buffer, slot });
  if (!validation.ok) {
    return sendJson(res, 422, { error: "Archivo inválido.", details: validation.errors });
  }

  const path = buildHeroImagePath(slideId, slot, validation.ext);

  let uploadedUrl;
  try {
    uploadedUrl = await uploadObject({ env, path, buffer, contentType });
  } catch (e) {
    console.error("[admin/hero-slide-image] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo subir la imagen.");
  }

  const field = slot === "mobile" ? "mobileImage" : "image";
  const previous = slides[index][field] || null;
  const updated = { ...slides[index], [field]: uploadedUrl, updatedAt: new Date().toISOString() };
  const next = [...slides];
  next[index] = updated;

  try {
    await saveSlides(env, next);
  } catch (e) {
    console.error("[admin/hero-slide-image] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "La imagen se subió pero no se pudo guardar la referencia. Intenta de nuevo.");
  }

  // Reemplazo: limpieza best-effort del archivo anterior propio (nunca
  // uno legacy/externo, nunca si el path no cambió).
  if (previous && previous !== uploadedUrl && isOwnedPath(env, previous)) {
    const oldPath = pathFromUrl(env, previous);
    if (oldPath && oldPath !== path) {
      deleteObject({ env, path: oldPath }).catch((e) => {
        console.error("[admin/hero-slide-image] cleanup delete failed: " + (e && e.message ? e.message : e));
      });
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 200, { slide: updated, warnings: validation.warnings });
};
