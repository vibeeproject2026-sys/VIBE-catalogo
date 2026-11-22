// GET /api/catalog/categories — public, read-only.
//
// Returns the catalog's navigation structure: editorial group (static
// mapping, see _lib/categoryGroups.js) -> POS category -> subcategories
// actually present in the catalog. Fase 43: only published products
// count (same rule as /api/catalog/products, see
// _lib/merge.js#joinCatalog) — a group/category only ever appears if at
// least one published product exists in it, so this never leads a
// customer into a dead end or reveals unpublished products.

const { getEnv } = require("./_lib/env");
const { pgrestSelect } = require("./_lib/supabaseRead");
const { joinCatalog, shapeProduct } = require("./_lib/merge");
const { resolveCategoryGroup } = require("./_lib/categoryGroups");
const { applyCors } = require("./_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("./_lib/http");
const { loadTaxonomy, publicTaxonomy } = require("../_lib/taxonomyStore");
const { loadMerchandising, publicMerchandising, computeNewArrivals } = require("../_lib/merchandising");
const { loadBestSellers } = require("../_lib/bestsellers");

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

  // Fase 56 — ?view=taxonomy: la taxonomía VIBE vigente (editable desde el
  // Admin; por defecto, la de código). Solo nombres de grupos, categorías y
  // subcategorías: nada de productos ni datos internos. Si no se puede
  // leer, el sitio sigue con la taxonomía de código.
  if (req.query && req.query.view === "taxonomy") {
    try {
      const taxonomy = publicTaxonomy(await loadTaxonomy(env));
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
      return sendJson(res, 200, { taxonomy });
    } catch (e) {
      console.error("[catalog/categories] taxonomía no disponible (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
      return sendError(res, 502, "Taxonomía no disponible.");
    }
  }

  // Organización comercial — ?view=merchandising: colecciones vigentes,
  // etiquetas activas, sus asignaciones y la configuración de vitrinas
  // (sin datos internos). Caché corta, como el resto del catálogo.
  if (req.query && req.query.view === "merchandising") {
    try {
      const raw = await loadMerchandising(env);
      const doc = publicMerchandising(raw);
      // Novedades automáticas (solo con fecha de lanzamiento oficial).
      const rows = raw.showcases.novedades.launchDate
        ? await pgrestSelect({ table: "catalog_metadata", columns: "product_id,published,created_at", filters: [["published", "eq.true"]], env })
        : [];
      doc.showcases.novedades.autoProductIds = computeNewArrivals(rows, raw.showcases.novedades);
      res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      return sendJson(res, 200, { merchandising: doc });
    } catch (e) {
      console.error("[catalog/categories] organización comercial no disponible (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
      return sendError(res, 502, "Organización comercial no disponible.");
    }
  }
  // ?view=bestsellers: orden de «Más elegidos» por unidades vendidas en el
  // período configurado (ventas confirmadas del POS, solo lectura). La
  // tienda recibe solo el ORDEN de los productos publicados, nunca las
  // unidades. Se recalcula como máximo cada 24 horas (caché de la CDN).
  if (req.query && req.query.view === "bestsellers") {
    try {
      const merch = await loadMerchandising(env);
      const [best, metadataRows] = await Promise.all([
        loadBestSellers(env, { periodDays: merch.showcases.masElegidos.periodDays }),
        pgrestSelect({ table: "catalog_metadata", columns: "product_id,published", filters: [["published", "eq.true"]], env }),
      ]);
      const published = new Set(metadataRows.filter((m) => m && m.published === true).map((m) => Number(m.product_id)));
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600");
      return sendJson(res, 200, { periodDays: best.periodDays, computedAt: best.computedAt, productIds: best.ranking.filter((r) => published.has(r.productId)).map((r) => r.productId) });
    } catch (e) {
      console.error("[catalog/categories] ranking no disponible (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
      return sendError(res, 502, "Ranking no disponible.");
    }
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
