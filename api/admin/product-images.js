// POST /api/admin/product-images — admin-only. Uploads a product image
// (slot: "main" | "secondary") to Supabase Storage and records its
// public URL in catalog_metadata.image / catalog_metadata.images.
//
// DELETE /api/admin/product-images — admin-only (Fase 56). Body:
// { product_id, slot: "main" | "secondary", path, deleteFile? }.
// QUITA una imagen de la ficha (catalog_metadata.image = null, o la saca
// de catalog_metadata.images) y CONSERVA el archivo en Storage. Solo si
// deleteFile === true (confirmación expresa en el Admin) se intenta además
// borrar el archivo, y únicamente si es nuestro, está bajo
// products/{product_id}/ y ninguna otra ficha ni slide del Hero lo usa.
// Antes (Fase 21) quitar una secundaria borraba siempre el archivo.
//
// The only tables/paths this file can ever write to are catalog_metadata
// (via _lib/adminWrite.js, same as catalog-metadata.js) and Storage
// objects under products/{id}/ in the fixed BUCKET (via _lib/storage.js).
// There is no code path here that can reach products/categories/sales/
// transactions, and no arbitrary bucket or path is ever accepted from
// the request body.
//
// Body is JSON with the file embedded as base64 (no multipart parser —
// keeps this project dependency-free, consistent with every other
// endpoint). Vercel's default body size limit comfortably fits
// MAX_UPLOAD_BYTES once base64-encoded.
//
// No CORS headers — same-origin only, called exclusively from
// admin/admin.js, same as every other /api/admin/* endpoint.

const { getEnv } = require("../catalog/_lib/env");
const { pgrestSelect } = require("../catalog/_lib/supabaseRead");
const { upsertCatalogMetadata } = require("./_lib/adminWrite");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { decodeBase64Image, validateUpload } = require("./_lib/imageValidation");
const { loadSlides } = require("../_lib/heroSlides");
const {
  buildMainPath,
  buildSecondaryPath,
  nextSecondarySeq,
  uploadVersion,
  uploadObject,
  deleteObject,
  isOwnedPath,
  pathFromUrl,
} = require("./_lib/storage");

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return methodNotAllowed(res, ["POST", "DELETE"]);
  }
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/product-images] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const productId = Number(body.product_id);
  if (!Number.isInteger(productId)) {
    return sendError(res, 400, "product_id inválido o ausente.");
  }

  // Confirm the product exists in the POS, and load the current image
  // references, before touching Storage at all — never uploads a file
  // for a product_id that doesn't exist, and never guesses the current
  // state of `images`.
  let existingMetadata;
  try {
    const [products, metadataRows] = await Promise.all([
      pgrestSelect({ table: "products", columns: "id", filters: [["id", `eq.${productId}`]], env }),
      pgrestSelect({
        table: "catalog_metadata",
        columns: "product_id,image,images",
        filters: [["product_id", `eq.${productId}`]],
        env,
      }),
    ]);
    if (!products.length) return sendError(res, 400, "Ese product_id no existe en products.");
    existingMetadata = metadataRows[0] || null;
  } catch (e) {
    console.error("[admin/product-images] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo verificar el producto.");
  }

  const currentImages = Array.isArray(existingMetadata && existingMetadata.images) ? existingMetadata.images : [];

  if (req.method === "DELETE") {
    const slot = body.slot === "main" ? "main" : body.slot === undefined || body.slot === "secondary" ? "secondary" : null;
    if (!slot) return sendError(res, 400, "slot inválido: usa 'main' o 'secondary'.");
    const targetUrl = typeof body.path === "string" ? body.path : "";
    const registered = slot === "main" ? Boolean(targetUrl) && existingMetadata && existingMetadata.image === targetUrl : Boolean(targetUrl) && currentImages.includes(targetUrl);
    if (!registered) {
      return sendError(res, 404, slot === "main" ? "Esa no es la imagen principal actual de este producto." : "Esa imagen secundaria no está registrada para este producto.");
    }
    // Solo se escribe el campo de imagen correspondiente: nunca textos,
    // clasificación, publicación ni datos comerciales.
    const fields = slot === "main" ? { image: null } : { images: currentImages.filter((u) => u !== targetUrl) };

    let saved;
    try {
      saved = await upsertCatalogMetadata({ productId, fields, env });
    } catch (e) {
      console.error("[admin/product-images] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo quitar la imagen. No se cambió nada.");
    }

    const file = body.deleteFile === true ? await deleteFileIfExclusive({ env, productId, url: targetUrl }) : { deleted: false, reason: "kept" };

    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, {
      image: saved ? saved.image ?? null : null,
      images: saved && Array.isArray(saved.images) ? saved.images : [],
      file,
    });
  }

  // POST — upload
  const slot = body.slot === "main" || body.slot === "secondary" ? body.slot : null;
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!slot) return sendError(res, 400, "slot inválido: usa 'main' o 'secondary'.");
  if (!contentType || !dataBase64) return sendError(res, 400, "Falta contentType o dataBase64.");

  let buffer;
  try {
    buffer = decodeBase64Image(dataBase64);
  } catch {
    return sendError(res, 400, "No se pudo decodificar el archivo.");
  }

  const validation = validateUpload({ contentType, buffer, slot });
  if (!validation.ok) {
    return sendJson(res, 422, { error: "Archivo inválido.", details: validation.errors });
  }

  const version = uploadVersion();
  const path =
    slot === "main"
      ? buildMainPath(productId, validation.ext, version)
      : buildSecondaryPath(productId, validation.ext, nextSecondarySeq(env, currentImages), version);

  let uploadedUrl;
  try {
    uploadedUrl = await uploadObject({ env, path, buffer, contentType, upsert: false });
  } catch (e) {
    console.error("[admin/product-images] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo subir la imagen.");
  }

  const fields = slot === "main" ? { image: uploadedUrl } : { images: [...currentImages, uploadedUrl] };

  let saved;
  try {
    saved = await upsertCatalogMetadata({ productId, fields, env });
  } catch (e) {
    console.error("[admin/product-images] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "La imagen se subió pero no se pudo guardar la referencia. Intenta de nuevo.");
  }

  // Fase 56 — reemplazar la principal ya no borra la anterior: el archivo
  // original se conserva en Storage (solo deja de estar vinculado).

  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 200, {
    image: saved.image,
    images: Array.isArray(saved.images) ? saved.images : [],
    warnings: validation.warnings,
  });
};

// Fase 56 — borrado físico SOLO tras confirmación expresa y si el archivo
// es exclusivo: nuestro, bajo products/{productId}/, y sin ninguna otra
// referencia en catalog_metadata (image/images de cualquier ficha, incluida
// la propia en el otro slot) ni en los slides del Hero. Ante cualquier duda
// (no se pudo verificar), se conserva. Devuelve { deleted, reason }.
async function deleteFileIfExclusive({ env, productId, url }) {
  const objectPath = isOwnedPath(env, url) ? pathFromUrl(env, url) : null;
  if (!objectPath || !objectPath.startsWith(`products/${productId}/`)) return { deleted: false, reason: "not_owned" };
  let rows;
  let slides;
  try {
    [rows, slides] = await Promise.all([
      pgrestSelect({ table: "catalog_metadata", columns: "product_id,image,images", env }),
      loadSlides(env),
    ]);
  } catch (e) {
    console.error("[admin/product-images] no se pudo verificar si el archivo está compartido; se conserva.");
    return { deleted: false, reason: "unverified" };
  }
  const usedByMetadata = (rows || []).some((r) => r.image === url || (Array.isArray(r.images) && r.images.includes(url)));
  const usedBySlides = (slides || []).some((s) => s && (s.image === url || s.mobileImage === url));
  if (usedByMetadata || usedBySlides) return { deleted: false, reason: "shared" };
  let ok = false;
  try {
    ok = await deleteObject({ env, path: objectPath });
  } catch {
    ok = false;
  }
  if (ok === true) return { deleted: true };
  console.error("[admin/product-images] no se pudo borrar el archivo; la imagen ya quedó quitada de la ficha.");
  return { deleted: false, reason: "delete_failed" };
}
