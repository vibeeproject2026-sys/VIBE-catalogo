// Purpose-built, narrow write client — mirrors the discipline of
// api/catalog/_lib/supabaseRead.js (Fase 6): the table is always the
// hardcoded literal "catalog_metadata", never taken from the request,
// and it performs exactly one operation (upsert by product_id). This
// is not a generic write proxy, and it is never used for any table
// other than catalog_metadata.

async function upsertCatalogMetadata({ productId, fields, env, fetchImpl = fetch }) {
  const url = `${env.url}/rest/v1/catalog_metadata`;
  const payload = { product_id: productId, ...fields };

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
      // Upsert-by-primary-key: insert if product_id is new, update the
      // existing row otherwise. Never touches any other row.
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
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
    // 23503 = foreign key violation -> product_id doesn't exist in products.
    err.code = pgCode === "23503" ? "PRODUCT_NOT_FOUND" : "SUPABASE_WRITE_ERROR";
    err.status = res.status;
    throw err;
  }

  return Array.isArray(body) ? body[0] : body;
}

module.exports = { upsertCatalogMetadata };
