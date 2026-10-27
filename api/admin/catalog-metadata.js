// GET /api/admin/catalog-metadata?product_id=NN — admin-only. Returns
// the POS read-only fields + full catalog_metadata (or null if none
// exists yet) for one product, for the edit panel.
//
// PATCH /api/admin/catalog-metadata — admin-only. Body: { product_id,
// ...editorial fields }. Upserts ONLY the whitelisted editorial fields
// (_lib/editorialFields.js) in catalog_metadata. Cannot write to
// products/categories/sales/transactions — this file has no import
// path that could reach them for writes, and _lib/adminWrite.js only
// ever targets catalog_metadata.
//
// No CORS headers — same-origin only, called exclusively from
// admin/admin.js.

const { getEnv } = require("../catalog/_lib/env");
const { pgrestSelect } = require("../catalog/_lib/supabaseRead");
const { upsertCatalogMetadata } = require("./_lib/adminWrite");
const { pickEditorialFields } = require("./_lib/editorialFields");
const { parseDetails, serializeDetails } = require("../_lib/editorialDetails");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { resolveCategoryGroup } = require("../catalog/_lib/categoryGroups");
const { isListedSubcategory, validateSubcategory } = require("../_lib/subcategories");

const PRODUCT_COLUMNS = "id,name,price,stock,category";
const METADATA_COLUMNS =
  "product_id,image,images,short_description,description,benefits,ingredients,usage,presentation,category,subcategory,brand,badge,search_keywords,featured,editorial_order,published,additional_info";

// Fase 53 — subcategoría controlada (ver api/_lib/subcategories.js).
// Solo se valida cuando el guardado envía subcategory; la fila guardada
// se lee únicamente si hace falta (valor fuera de la lista), para
// permitir conservar un valor histórico sin cambios. Devuelve un mensaje
// de error o null; normaliza fields en el lugar.
async function checkSubcategory(fields, productId, env) {
  if (!("subcategory" in fields)) return null;
  const sub = typeof fields.subcategory === "string" ? fields.subcategory.trim() : "";
  fields.subcategory = sub || null;
  const sentInfo = "additional_info" in fields && fields.additional_info && typeof fields.additional_info === "object";
  const clearReason = () => {
    if (sentInfo) fields.additional_info = { ...fields.additional_info, subcategoryOtherReason: null };
  };
  if (!sub) {
    clearReason();
    return null;
  }
  if ("category" in fields && isListedSubcategory(fields.category, sub)) {
    clearReason();
    return null;
  }
  const rows = await pgrestSelect({
    table: "catalog_metadata",
    columns: "category,subcategory,additional_info",
    filters: [["product_id", `eq.${productId}`]],
    env,
  });
  const stored = rows[0] || {};
  const category = "category" in fields ? fields.category : stored.category;
  const reason = sentInfo ? fields.additional_info.subcategoryOtherReason : parseDetails(stored.additional_info).subcategoryOtherReason;
  const result = validateSubcategory({ category, subcategory: sub, storedSubcategory: stored.subcategory, reason });
  if (!result.ok) return result.error;
  if (!result.other) clearReason();
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return methodNotAllowed(res, ["GET", "PATCH"]);
  }
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/catalog-metadata] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  if (req.method === "GET") {
    const productId = Number(req.query && req.query.product_id);
    if (!Number.isInteger(productId)) {
      return sendError(res, 400, "product_id inválido.");
    }
    try {
      const [products, metadataRows] = await Promise.all([
        pgrestSelect({ table: "products", columns: PRODUCT_COLUMNS, filters: [["id", `eq.${productId}`]], env }),
        pgrestSelect({
          table: "catalog_metadata",
          columns: METADATA_COLUMNS,
          filters: [["product_id", `eq.${productId}`]],
          env,
        }),
      ]);
      if (!products.length) return sendError(res, 404, "Producto no encontrado en products.");
      // Fase 34 — additional_info se guarda como JSON (columna text
      // existente, ver api/_lib/editorialDetails.js); el Admin siempre
      // recibe el objeto ya estructurado, nunca el string crudo.
      const metadata = metadataRows[0] || null;
      if (metadata) metadata.additional_info = parseDetails(metadata.additional_info);
      res.setHeader("Cache-Control", "no-store");
      // Fase 51 — categoryGroup (solo lectura) para la vista previa de
      // "dónde aparecerá" en el formulario del Admin.
      const product = { ...products[0], categoryGroup: resolveCategoryGroup(products[0].category) };
      return sendJson(res, 200, { product, metadata });
    } catch (e) {
      console.error("[admin/catalog-metadata] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo obtener el producto.");
    }
  }

  // PATCH
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const productId = Number(body.product_id);
  if (!Number.isInteger(productId)) {
    return sendError(res, 400, "product_id inválido o ausente.");
  }
  const fields = pickEditorialFields(body);
  try {
    const subError = await checkSubcategory(fields, productId, env);
    if (subError) return sendError(res, 400, subError);
  } catch (e) {
    console.error("[admin/catalog-metadata] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo validar la subcategoría. No se guardó nada.");
  }
  // Fase 34 — el Admin envía additional_info como un objeto (no un
  // string ya serializado): se serializa aquí, en el único lugar que
  // sabe qué claves son válidas y descarta cualquier otra cosa. Un
  // objeto sin ningún campo real completado se guarda como null (nunca
  // un JSON de puros vacíos).
  if ("additional_info" in fields) {
    fields.additional_info = serializeDetails(fields.additional_info);
  }

  try {
    const saved = await upsertCatalogMetadata({ productId, fields, env });
    if (saved) saved.additional_info = parseDetails(saved.additional_info);
    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { metadata: saved });
  } catch (e) {
    if (e.code === "PRODUCT_NOT_FOUND") {
      return sendError(res, 400, "Ese product_id no existe en products.");
    }
    console.error("[admin/catalog-metadata] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo guardar la metadata.");
  }
};
