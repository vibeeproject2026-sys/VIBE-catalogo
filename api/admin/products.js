// GET /api/admin/products — admin-only. Lists every POS product
// (read-only POS fields) merged with its catalog_metadata row, if any.
//
// Never public: requires the admin bearer token (see _lib/auth.js).
// Deliberately no CORS headers are set here — this endpoint is only
// ever called same-origin from admin/admin.js, so there is no reason
// to widen its reachability the way the public /api/catalog/* API
// does.
//
// Unlike the public API, this endpoint DOES include the raw stock
// count (not just a boolean) — that's an intentional difference: an
// authenticated internal tool legitimately needs it (e.g. to decide
// whether to publish an out-of-stock item), whereas the public API
// must never reveal it. cost_base/cost_pack/min_stock are still never
// fetched here at all — not just hidden, never selected.

const { getEnv } = require("../catalog/_lib/env");
const { pgrestSelect } = require("../catalog/_lib/supabaseRead");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");

const PRODUCT_COLUMNS = "id,name,price,stock,category";
const METADATA_COLUMNS =
  "product_id,image,images,short_description,description,benefits,ingredients,usage,presentation,subcategory,brand,badge,search_keywords,featured,editorial_order,published";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/products] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  try {
    const [products, metadataRows] = await Promise.all([
      pgrestSelect({ table: "products", columns: PRODUCT_COLUMNS, env }),
      pgrestSelect({ table: "catalog_metadata", columns: METADATA_COLUMNS, env }),
    ]);

    const metaByProductId = new Map(metadataRows.map((m) => [String(m.product_id), m]));

    const items = products.map((p) => {
      const m = metaByProductId.get(String(p.id));
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price),
        stock: Number(p.stock),
        available: Number(p.stock) > 0,
        hasMetadata: Boolean(m),
        subcategory: m ? m.subcategory ?? null : null,
        image: m ? m.image ?? null : null,
        badge: m ? m.badge ?? null : null,
        featured: m ? Boolean(m.featured) : false,
        published: m ? Boolean(m.published) : false,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { products: items });
  } catch (e) {
    if (e.code === "TABLE_MISSING") {
      return sendError(res, 503, "catalog_metadata no existe todavía.");
    }
    console.error("[admin/products] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo obtener el listado.");
  }
};
