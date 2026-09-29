// Fase 41 — cliente de escritura narrow para la CAPA PROMOCIONAL de
// `products`. Mismo patrón/disciplina que _lib/adminWrite.js
// (upsertCatalogMetadata): tabla siempre el literal hardcodeado
// "products", y el payload que se manda a PostgREST NUNCA construye
// ninguna clave fuera de PROMO_FIELDS — price/stock/name/category/
// cost_base/cost_pack/min_stock no pueden llegar a esta función
// físicamente, no por una denylist sino porque el objeto que arma
// pickPromoFields() jamás las referencia.
//
// El POS (VibeBeauty) sigue siendo la fuente de verdad de producto,
// precio base, inventario y disponibilidad — esto solo administra la
// capa promocional que esas mismas 5 columnas de `products` ya
// representan (confirmado en producción: ya existen y ya están
// conectadas de punta a punta en el catálogo público, ver
// api/catalog/_lib/merge.js#resolvePromoActive/shapeProduct). Nunca
// se toca el repositorio VibeBeauty ni su código.

const PROMO_FIELDS = ["promo_active", "promo_price", "promo_start", "promo_end", "promo_text"];

// Explícito, nunca `select=*`: aunque `products` tenga columnas
// sensibles (cost_base/cost_pack/min_stock), esta es la única forma en
// que el PATCH devuelve datos, así que esta lista es lo que realmente
// impide que esos campos salgan de aquí — independiente de cualquier
// policy de Supabase.
const RETURN_COLUMNS = "id,price,promo_active,promo_price,promo_start,promo_end,promo_text";

function pickPromoFields(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const key of PROMO_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

async function updateProductPromo({ productId, fields, env, fetchImpl = fetch }) {
  const picked = pickPromoFields(fields);
  const url = `${env.url}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=${RETURN_COLUMNS}`;

  const res = await fetchImpl(url, {
    method: "PATCH",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(picked),
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const pgCode = body && typeof body === "object" ? body.code : undefined;
    const err = new Error("Supabase write failed" + (pgCode ? ` (${pgCode})` : ` (HTTP ${res.status})`));
    err.code = "SUPABASE_WRITE_ERROR";
    err.status = res.status;
    throw err;
  }

  const row = Array.isArray(body) ? body[0] : body;
  if (!row) {
    const err = new Error("Producto no encontrado.");
    err.code = "PRODUCT_NOT_FOUND";
    throw err;
  }
  return row;
}

module.exports = { PROMO_FIELDS, RETURN_COLUMNS, pickPromoFields, updateProductPromo };
