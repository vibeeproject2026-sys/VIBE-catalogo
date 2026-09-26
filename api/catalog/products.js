// GET /api/catalog/products — public, read-only.
//
// Fase 31: every product in the POS is returned — name/price/stock
// (-> available) always come straight from products, the single
// operational source of truth, and are never duplicated into
// catalog_metadata. Editorial enrichment (image, description, etc.) is
// strictly progressive: it's layered in from catalog_metadata only for
// rows that exist and are published = true (see
// _lib/merge.js#joinCatalog/shapeProduct); a product with no editorial
// row at all is just as valid a catalog entry as a fully curated one.
// No write methods exist on this endpoint on purpose (Fase 6 is
// read-only by design).

const { getEnv } = require("./_lib/env");
const { pgrestSelect } = require("./_lib/supabaseRead");
const { joinCatalog, shapeProduct, sortCatalog, applyFilters } = require("./_lib/merge");
const { resolveCategoryGroup } = require("./_lib/categoryGroups");
const { applyCors } = require("./_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("./_lib/http");

// Explicit column whitelists — never `select=*`. This is what actually
// keeps cost_base, cost_pack, min_stock, etc. out of reach, independent
// of whatever RLS policy Supabase may or may not have configured.
//
// Fase 26: promo_active/promo_price/promo_start/promo_end/promo_text are
// added here — read-only, same as the rest of this list. This endpoint
// never writes to `products` under any circumstance; adding columns to a
// SELECT does not change that. The raw dates (promo_start/promo_end)
// never leave this file — shapeProduct() resolves them into a single
// computed `promoActive` boolean server-side (see _lib/merge.js), so the
// public API surface stays as narrow as everything else it returns.
const PRODUCT_COLUMNS = "id,name,price,stock,category,promo_active,promo_price,promo_start,promo_end,promo_text";
// additional_info is deliberately NOT selected here — it stays
// admin-only (internal notes/provider info), never exposed publicly.
// See docs/fase22b-ficha-editorial-manual.md.
const METADATA_COLUMNS =
  "product_id,category,subcategory,image,images,short_description,description,benefits,ingredients,usage,presentation,brand,badge,featured,editorial_order,published";

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return methodNotAllowed(res);

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[catalog/products] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  const query = req.query || {};
  const category = typeof query.category === "string" ? query.category.slice(0, 100) : undefined;
  const subcategory = typeof query.subcategory === "string" ? query.subcategory.slice(0, 100) : undefined;
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : undefined;
  const featured = query.featured === "true" ? true : undefined;

  try {
    const [products, metadataRows] = await Promise.all([
      pgrestSelect({
        table: "products",
        columns: PRODUCT_COLUMNS,
        filters: category ? [["category", `eq.${category}`]] : [],
        env,
      }),
      pgrestSelect({
        table: "catalog_metadata",
        columns: METADATA_COLUMNS,
        filters: [["published", "eq.true"]],
        env,
      }),
    ]);

    const joined = joinCatalog(products, metadataRows);
    let items = joined.map(({ product, metadata }) => shapeProduct(product, metadata, resolveCategoryGroup));
    items = applyFilters(items, { category, subcategory, featured, search });
    items = sortCatalog(items);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return sendJson(res, 200, { products: items });
  } catch (e) {
    if (e.code === "TABLE_MISSING") {
      console.error(
        "[catalog/products] catalog_metadata table not found — Fase 5 pending activation in Supabase (see docs/fase5-catalog-metadata-model.md)."
      );
      return sendError(res, 503, "Catálogo no disponible todavía.");
    }
    console.error("[catalog/products] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo obtener el catálogo.");
  }
};
