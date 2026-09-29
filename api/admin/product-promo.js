// GET/PATCH /api/admin/product-promo — admin-only. Gestiona la capa
// promocional de un producto (promo_active/promo_price/promo_start/
// promo_end/promo_text en `products`) desde Admin — la interfaz que
// hoy no existe ni en este catálogo ni en el POS.
//
// El POS sigue siendo la fuente de verdad de producto/precio base/
// inventario/disponibilidad: esto NUNCA escribe price/stock/name/
// category — ver api/admin/_lib/promoWrite.js para la garantía
// estructural. `discountPercent` nunca se guarda, siempre se calcula.
//
// No CORS — same-origin, llamado solo desde admin/admin.js.

const { getEnv } = require("../catalog/_lib/env");
const { pgrestSelect } = require("../catalog/_lib/supabaseRead");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { updateProductPromo } = require("./_lib/promoWrite");

const PROMO_COLUMNS = "id,name,price,promo_active,promo_price,promo_start,promo_end,promo_text";

function discountPercent(price, promoPrice) {
  if (!(price > 0) || promoPrice == null) return null;
  const pct = Math.round((1 - promoPrice / price) * 100);
  return pct > 0 ? pct : null;
}

function shapePromoResponse(row) {
  const price = Number(row.price);
  const promoPrice = row.promo_price === null || row.promo_price === undefined ? null : Number(row.promo_price);
  return {
    id: row.id,
    name: row.name,
    price,
    promoActive: Boolean(row.promo_active),
    promoPrice,
    promoStart: row.promo_start ?? null,
    promoEnd: row.promo_end ?? null,
    promoText: row.promo_text ?? null,
    discountPercent: discountPercent(price, promoPrice),
  };
}

// Validación server-side (sección 13 del brief, aplicada literalmente):
// promo_price siempre < price, nunca igual ni mayor. Activar una
// promoción sin un precio promocional no tiene sentido, así que se
// exige ambos juntos.
function validatePromoPayload(body, currentPrice) {
  const errors = {};

  if ("promo_active" in body && typeof body.promo_active !== "boolean") {
    errors.promo_active = "promo_active debe ser true o false.";
  }

  const hasPromoPrice = "promo_price" in body && body.promo_price !== null;
  if (hasPromoPrice) {
    const p = Number(body.promo_price);
    if (!Number.isFinite(p) || p <= 0) {
      errors.promo_price = "El precio promocional debe ser un número positivo.";
    } else if (Number.isFinite(currentPrice) && p >= currentPrice) {
      errors.promo_price = "El precio promocional debe ser menor al precio base.";
    }
  }

  for (const key of ["promo_start", "promo_end"]) {
    if (key in body && body[key] !== null) {
      const d = new Date(body[key]);
      if (Number.isNaN(d.getTime())) errors[key] = "Fecha inválida.";
    }
  }

  if ("promo_text" in body && body.promo_text !== null) {
    if (typeof body.promo_text !== "string" || body.promo_text.length > 200) {
      errors.promo_text = "Texto promocional inválido (máximo 200 caracteres).";
    }
  }

  if (body.promo_active === true && !hasPromoPrice) {
    errors.promo_price = "Necesitas un precio promocional para activar la promoción.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") return methodNotAllowed(res, ["GET", "PATCH"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/product-promo] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  if (req.method === "GET") {
    const productId = Number(req.query && req.query.product_id);
    if (!Number.isInteger(productId)) return sendError(res, 400, "product_id inválido o ausente.");
    try {
      const rows = await pgrestSelect({ table: "products", columns: PROMO_COLUMNS, filters: [["id", `eq.${productId}`]], env });
      if (!rows.length) return sendError(res, 404, "Producto no encontrado.");
      res.setHeader("Cache-Control", "no-store");
      return sendJson(res, 200, shapePromoResponse(rows[0]));
    } catch (e) {
      console.error("[admin/product-promo] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo obtener la promoción.");
    }
  }

  // PATCH
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const productId = Number(body.product_id);
  if (!Number.isInteger(productId)) return sendError(res, 400, "product_id inválido o ausente.");

  let currentRows;
  try {
    currentRows = await pgrestSelect({ table: "products", columns: "id,price", filters: [["id", `eq.${productId}`]], env });
  } catch (e) {
    console.error("[admin/product-promo] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo verificar el producto.");
  }
  if (!currentRows.length) return sendError(res, 404, "Producto no encontrado.");
  const currentPrice = Number(currentRows[0].price);

  const { valid, errors } = validatePromoPayload(body, currentPrice);
  if (!valid) return sendJson(res, 400, { error: "Datos de promoción inválidos.", fields: errors });

  const fields = {};
  for (const key of ["promo_active", "promo_price", "promo_start", "promo_end", "promo_text"]) {
    if (key in body) fields[key] = body[key];
  }

  try {
    const updated = await updateProductPromo({ productId, fields, env });
    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, shapePromoResponse(updated));
  } catch (e) {
    if (e.code === "PRODUCT_NOT_FOUND") return sendError(res, 404, "Producto no encontrado.");
    console.error("[admin/product-promo] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo guardar la promoción.");
  }
};
