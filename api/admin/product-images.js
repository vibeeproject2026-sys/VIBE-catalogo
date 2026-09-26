// POST /api/admin/product-images — admin-only. Uploads a product image
// (slot: "main" | "secondary") to Supabase Storage and records its
// public URL in catalog_metadata.image / catalog_metadata.images.
//
// DELETE /api/admin/product-images — admin-only. Removes one secondary
// image: updates catalog_metadata.images FIRST, then best-effort deletes
// the underlying Storage object — so a failed file delete never leaves a
// dangling reference (worst case: an orphaned file, cleanable later).
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
const {
  buildMainPath,
  buildSecondaryPath,
  nextSecondarySeq,
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
    const targetUrl = typeof body.path === "string" ? body.path : "";
    if (!targetUrl || !currentImages.includes(targetUrl)) {
      return sendError(res, 404, "Esa imagen secundaria no está registrada para este producto.");
    }
    const nextImages = currentImages.filter((u) => u !== targetUrl);

    let saved;
    try {
      saved = await upsertCatalogMetadata({ productId, fields: { images: nextImages }, env });
    } catch (e) {
      console.error("[admin/product-images] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo actualizar la metadata.");
    }

    // Metadata already updated successfully — this is best-effort
    // cleanup. Its failure is logged, never surfaced as a request error,
    // and never touches a legacy/external URL (isOwnedPath guards that).
    if (isOwnedPath(env, targetUrl)) {
      const objectPath = pathFromUrl(env, targetUrl);
      if (objectPath) {
        deleteObject({ env, path: objectPath }).catch((e) => {
          console.error("[admin/product-images] cleanup delete failed: " + (e && e.message ? e.message : e));
        });
      }
    }

    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { images: Array.isArray(saved.images) ? saved.images : nextImages });
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

  const path =
    slot === "main"
      ? buildMainPath(productId, validation.ext)
      : buildSecondaryPath(productId, validation.ext, nextSecondarySeq(env, currentImages));

  let uploadedUrl;
  try {
    uploadedUrl = await uploadObject({ env, path, buffer, contentType });
  } catch (e) {
    console.error("[admin/product-images] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo subir la imagen.");
  }

  const previousImage = existingMetadata ? existingMetadata.image : null;
  const fields = slot === "main" ? { image: uploadedUrl } : { images: [...currentImages, uploadedUrl] };

  let saved;
  try {
    saved = await upsertCatalogMetadata({ productId, fields, env });
  } catch (e) {
    console.error("[admin/product-images] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "La imagen se subió pero no se pudo guardar la referencia. Intenta de nuevo.");
  }

  // Best-effort cleanup of the previous main image: only when it was one
  // of our own Storage objects (never a legacy/external URL like
  // assets/products/brush.svg) and the path actually changed (e.g. a
  // format change from .jpg to .webp leaves the old object behind
  // instead of being overwritten by the same-path upsert).
  if (slot === "main" && previousImage && previousImage !== uploadedUrl && isOwnedPath(env, previousImage)) {
    const oldPath = pathFromUrl(env, previousImage);
    if (oldPath && oldPath !== path) {
      deleteObject({ env, path: oldPath }).catch((e) => {
        console.error("[admin/product-images] cleanup delete failed: " + (e && e.message ? e.message : e));
      });
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 200, {
    image: saved.image,
    images: Array.isArray(saved.images) ? saved.images : [],
    warnings: validation.warnings,
  });
};
