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
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");

const PRODUCT_COLUMNS = "id,name,price,stock,category";
const METADATA_COLUMNS =
  "product_id,image,images,short_description,description,benefits,ingredients,usage,presentation,subcategory,brand,badge,search_keywords,featured,editorial_order,published";

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
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, { product: products[0], metadata: metadataRows[0] || null });
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
    const saved = await upsertCatalogMetadata({ productId, fields, env });
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
