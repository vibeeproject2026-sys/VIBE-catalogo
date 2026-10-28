// GET /api/catalog/products — public, read-only.
//
// Fase 43: only products whose catalog_metadata row has published = true
// are returned (see _lib/merge.js#joinCatalog) — a product with no
// editorial row, or with published = false, is not public. name/price/
// stock (-> available) still always come straight from products, the
// single operational source of truth, and are never duplicated into
// catalog_metadata; availability stays independent of publication.
// No write methods exist on this endpoint on purpose (Fase 6 is
// read-only by design).

const { getEnv } = require("./_lib/env");
const { pgrestSelect } = require("./_lib/supabaseRead");
const { joinCatalog, shapeProduct, sortCatalog, applyFilters } = require("./_lib/merge");
const { resolveCategoryGroup } = require("./_lib/categoryGroups");
const { applyCors } = require("./_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("./_lib/http");
const { loadImageVariants, srcsetFor } = require("../_lib/imageVariants");

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
const SITE_URL = "https://www.vibebeautycol.com";
// Fase 34 — additional_info ahora SÍ se selecciona: dejó de ser una nota
// interna de texto libre y pasa a guardar un JSON estructurado con los
// ~40 campos editoriales granulares de la ficha VIBE (tono, acabado,
// cobertura, cruelty-free, etc. — ver api/_lib/editorialDetails.js).
// shapeProduct() nunca expone el blob crudo bajo su nombre de columna:
// lo parsea, sanitiza contra una whitelist fija, y solo entonces aplana
// sus campos ya conocidos como propiedades normales del producto.
// Fase 36 — search_keywords se capturaba en Admin (ver
// api/admin/_lib/editorialFields.js) pero nunca salía del todo hacia el
// catálogo público: faltaba en esta lista de columnas, así que la
// búsqueda del sitio nunca podía usarlo aunque Ana lo hubiera cargado.
const METADATA_COLUMNS =
  "product_id,category,subcategory,image,images,short_description,description,benefits,ingredients,usage,presentation,brand,badge,featured,editorial_order,published,search_keywords,additional_info";

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
    // Fase 57 — versiones optimizadas (si existe el manifiesto); nunca
    // hace fallar el catálogo: sin manifiesto → Map vacío → originales.
    const [products, metadataRows, imageVariants] = await Promise.all([
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
      query.format === "sitemap" ? new Map() : loadImageVariants(env),
    ]);

    const joined = joinCatalog(products, metadataRows);
    let items = joined.map(({ product, metadata }) => shapeProduct(product, metadata, resolveCategoryGroup));
    items = applyFilters(items, { category, subcategory, featured, search });
    items = sortCatalog(items);
    // Fase final — también la galería (images): srcsetByUrl lleva el
    // srcset de CADA foto que tenga versiones; las que no, no figuran y
    // se usan tal cual.
    items = items.map((p) => {
      const srcsetByUrl = {};
      for (const url of [p.image, ...(Array.isArray(p.images) ? p.images : [])]) {
        const set = srcsetFor(imageVariants, url);
        if (set) srcsetByUrl[url] = set;
      }
      return { ...p, imageSrcset: srcsetFor(imageVariants, p.image), srcsetByUrl };
    });

    // Fase 56 — /sitemap.xml (rewrite en vercel.json): portada + fichas
    // publicadas (las mismas que devuelve esta API; nunca productos sin
    // publicar ni rutas inventadas), en el dominio oficial.
    if (query.format === "sitemap") {
      const urls = [SITE_URL + "/", ...items.map((p) => `${SITE_URL}/?product=${encodeURIComponent(p.id)}`)];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc></url>`),
        "</urlset>",
        "",
      ].join("\n");
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.statusCode = 200;
      return res.end(xml);
    }

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
