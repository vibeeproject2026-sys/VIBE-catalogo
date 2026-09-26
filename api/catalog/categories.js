// GET /api/catalog/categories — public, read-only.
//
// Returns the catalog's navigation structure: editorial group (static
// mapping, see _lib/categoryGroups.js) -> POS category -> subcategories
// actually present in the catalog. Fase 31: every POS product counts
// here now, not only ones with a published editorial row (see
// _lib/merge.js#joinCatalog) — a group/category only ever appears if at
// least one real product (curated or not) exists in it, so this still
// never leads a customer into a dead end.

const { getEnv } = require("./_lib/env");
const { pgrestSelect } = require("./_lib/supabaseRead");
const { joinCatalog, shapeProduct } = require("./_lib/merge");
const { resolveCategoryGroup } = require("./_lib/categoryGroups");
const { applyCors } = require("./_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("./_lib/http");

const PRODUCT_COLUMNS = "id,name,price,stock,category";
const METADATA_COLUMNS = "product_id,subcategory,featured,editorial_order,published";

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return methodNotAllowed(res);

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[catalog/categories] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  try {
    const [products, metadataRows] = await Promise.all([
      pgrestSelect({ table: "products", columns: PRODUCT_COLUMNS, filters: [], env }),
      pgrestSelect({
        table: "catalog_metadata",
        columns: METADATA_COLUMNS,
        filters: [["published", "eq.true"]],
        env,
      }),
    ]);

    const joined = joinCatalog(products, metadataRows);
    const items = joined.map(({ product, metadata }) => shapeProduct(product, metadata, resolveCategoryGroup));

    const groups = new Map();
    for (const item of items) {
      const groupName = item.categoryGroup;
      if (!groups.has(groupName)) groups.set(groupName, { group: groupName, count: 0, categories: new Map() });
      const g = groups.get(groupName);
      g.count += 1;
      if (!g.categories.has(item.category)) g.categories.set(item.category, new Set());
      if (item.subcategory) g.categories.get(item.category).add(item.subcategory);
    }

    const result = [...groups.values()]
      .filter((g) => g.count > 0)
      .map((g) => ({
        group: g.group,
        count: g.count,
        categories: [...g.categories.entries()].map(([category, subcats]) => ({
          category,
          subcategories: [...subcats].sort((a, b) => a.localeCompare(b, "es")),
        })),
      }));

    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=1200");
    return sendJson(res, 200, { categories: result });
  } catch (e) {
    if (e.code === "TABLE_MISSING") {
      console.error(
        "[catalog/categories] catalog_metadata table not found — Fase 5 pending activation in Supabase (see docs/fase5-catalog-metadata-model.md)."
      );
      return sendError(res, 503, "Catálogo no disponible todavía.");
    }
    console.error("[catalog/categories] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudieron obtener las categorías.");
  }
};
