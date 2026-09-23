// Purpose-built, read-only PostgREST client for the catalog API.
//
// Unlike a generic proxy, this module never accepts a table name or
// column list from the incoming HTTP request. The table is always one of
// two hardcoded literals passed by our own endpoint code, and the column
// list is always an explicit whitelist defined by the endpoint. The
// ALLOWED_TABLES check below is defense-in-depth against a future coding
// mistake, not a client-facing mechanism.

const ALLOWED_TABLES = new Set(["products", "catalog_metadata"]);

async function pgrestSelect({ table, columns, filters = [], order, env, fetchImpl = fetch }) {
  if (!ALLOWED_TABLES.has(table)) {
    const err = new Error("Table not allowed: " + table);
    err.code = "TABLE_NOT_ALLOWED";
    throw err;
  }
  if (!columns) {
    throw new Error("pgrestSelect requires an explicit column list (no select=*)");
  }

  const params = new URLSearchParams();
  params.set("select", columns);
  for (const [key, value] of filters) params.append(key, value);
  if (order) params.set("order", order);

  const url = `${env.url}/rest/v1/${table}?${params.toString()}`;

  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      Accept: "application/json",
    },
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
    const err = new Error("Supabase request failed" + (pgCode ? ` (${pgCode})` : ` (HTTP ${res.status})`));
    err.status = res.status;
    err.code = pgCode === "42P01" ? "TABLE_MISSING" : "SUPABASE_ERROR";
    throw err;
  }

  return Array.isArray(body) ? body : [];
}

module.exports = { pgrestSelect, ALLOWED_TABLES };
