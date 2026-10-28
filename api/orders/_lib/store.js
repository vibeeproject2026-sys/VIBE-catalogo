// Fase 39 — cliente de escritura narrow para `orders`, mismo patrón que
// api/admin/_lib/adminWrite.js (upsertCatalogMetadata): tabla siempre el
// literal hardcodeado "orders", nunca tomada de la request, y cada
// función hace exactamente una operación. Nunca un proxy genérico.

async function insertOrder({ order, env, fetchImpl = fetch }) {
  const url = `${env.url}/rest/v1/orders`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(order),
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
    // Fase 56 — 23505: la clave de idempotencia ya existe (otro intento del
    // mismo pedido ganó); PGRST204: la columna idempotency_key aún no
    // existe (migración 0005 pendiente).
    err.code = pgCode === "23505" ? "DUPLICATE_IDEMPOTENCY_KEY" : pgCode === "PGRST204" ? "MISSING_COLUMN" : "SUPABASE_WRITE_ERROR";
    err.status = res.status;
    throw err;
  }

  return Array.isArray(body) ? body[0] : body;
}

// Fase 56 — pedido ya registrado con esta clave de idempotencia.
// Devuelve { order } | { notFound: true } | { migrationPending: true }.
async function findOrderByIdempotencyKey(key, env, fetchImpl = fetch) {
  const url = `${env.url}/rest/v1/orders?idempotency_key=eq.${encodeURIComponent(key)}&select=id,total,customer_email,customer_phone&limit=1`;
  const res = await fetchImpl(url, { method: "GET", headers: headers(env) });
  const body = await readJson(res);
  if (!res.ok) {
    if (isMissingColumn(res.status, body)) return { migrationPending: true };
    const err = new Error(`orders read failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  const rows = Array.isArray(body) ? body : [];
  return rows.length ? { order: rows[0] } : { notFound: true };
}

// Fase 56 — antispam: cuántos pedidos registró este mismo teléfono desde
// `sinceIso` (máximo `limit`). Solo cuenta ids; nunca devuelve datos.
async function countRecentOrdersByPhone(phone, sinceIso, env, { limit = 10, fetchImpl = fetch } = {}) {
  const url = `${env.url}/rest/v1/orders?customer_phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=${limit}`;
  const res = await fetchImpl(url, { method: "GET", headers: headers(env) });
  const body = await readJson(res);
  if (!res.ok) {
    const err = new Error(`orders read failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return Array.isArray(body) ? body.length : 0;
}

// Best-effort: se llama DESPUÉS de haber respondido conceptualmente el
// pedido como exitoso (el insert ya ocurrió). Un fallo acá nunca debe
// propagarse como un error del pedido — el pedido ya existe y ya se le
// comunicó honestamente al cliente si el envío ocurrió o no en base a
// lo que de verdad pasó en este mismo request; esta actualización es
// solo para que el registro en Supabase quede consistente con eso.
// Fase 55 — estado del aviso interno a VIBE (email a
// ORDERS_NOTIFICATION_EMAIL), separado de email_sent (que es SOLO el email
// al cliente). Columnas de la migración 0004 (todas null = sin dato, el
// estado de los pedidos anteriores a esta fase):
//   internal_notification_status: accepted | failed | not_configured
//     ("accepted" = Resend aceptó el envío; la entrega real no se conoce
//     desde aquí)
//   internal_notification_at: momento del último intento
//   internal_notification_error: código saneado (nunca texto libre)
const INTERNAL_COLUMNS = ["internal_notification_status", "internal_notification_at", "internal_notification_error"];

function internalFromResult(result, now = new Date()) {
  const r = result || {};
  const status = r.sent ? "accepted" : /NOT_CONFIGURED$/.test(String(r.reason || "")) ? "not_configured" : "failed";
  const error = status === "accepted" ? null : String(r.errorCode || r.reason || "UNKNOWN").slice(0, 80);
  return { status, at: now.toISOString(), error };
}

// PostgREST responde así cuando una columna todavía no existe (migración
// 0004 sin aplicar): PGRST204 en escrituras, 42703 en lecturas.
function isMissingColumn(status, body) {
  const code = body && typeof body === "object" ? body.code : undefined;
  return status === 400 && (code === "PGRST204" || code === "42703");
}

async function readJson(res) {
  const text = typeof res.text === "function" ? await res.text().catch(() => "") : "";
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function headers(env, prefer) {
  return {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

// Guarda las marcas de aviso del pedido recién creado. Nunca lanza: el
// pedido ya quedó guardado y no se invalida por esto. Comprueba la
// respuesta (antes se asumía éxito). Si la migración 0004 aún no está
// aplicada, reintenta sin las columnas nuevas para no perder
// email_sent/whatsapp_notified. Devuelve { ok, internalSaved }.
// Los logs solo llevan el número de pedido y códigos.
async function markOrderNotifications(id, { emailSent, whatsappNotified, internal }, env, fetchImpl = fetch) {
  const url = `${env.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`;
  const base = { email_sent: emailSent, whatsapp_notified: whatsappNotified, updated_at: new Date().toISOString() };
  const withInternal = internal
    ? { ...base, internal_notification_status: internal.status, internal_notification_at: internal.at, internal_notification_error: internal.error }
    : base;
  try {
    let res = await fetchImpl(url, { method: "PATCH", headers: headers(env, "return=minimal"), body: JSON.stringify(withInternal) });
    if (res.ok) return { ok: true, internalSaved: Boolean(internal) };
    const body = await readJson(res);
    if (internal && isMissingColumn(res.status, body)) {
      console.error(`[orders/store] pedido #${id}: falta la migración 0004 (columnas de aviso interno); se guardan solo email_sent/whatsapp_notified.`);
      res = await fetchImpl(url, { method: "PATCH", headers: headers(env, "return=minimal"), body: JSON.stringify(base) });
      if (res.ok) return { ok: true, internalSaved: false };
    }
    console.error(`[orders/store] pedido #${id}: no se pudieron guardar las marcas de aviso (HTTP ${res.status}).`);
    return { ok: false, internalSaved: false };
  } catch (e) {
    console.error(`[orders/store] pedido #${id}: error de red al guardar las marcas de aviso (${e && e.name ? e.name : "error"}).`);
    return { ok: false, internalSaved: false };
  }
}

// Fase 55 — lectura de UN pedido para reintentar su aviso interno.
// Devuelve { order } | { notFound: true } | { migrationPending: true };
// lanza solo ante errores de red/servidor.
const RETRY_COLUMNS =
  "id,created_at,customer_name,customer_phone,customer_email,customer_city,customer_address,customer_notes,items,total,status," +
  INTERNAL_COLUMNS.join(",");
async function getOrderForInternalRetry(id, env, fetchImpl = fetch) {
  const url = `${env.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=${RETRY_COLUMNS}`;
  const res = await fetchImpl(url, { method: "GET", headers: headers(env) });
  const body = await readJson(res);
  if (!res.ok) {
    if (isMissingColumn(res.status, body)) return { migrationPending: true };
    const err = new Error(`orders read failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  const rows = Array.isArray(body) ? body : [];
  return rows.length ? { order: rows[0] } : { notFound: true };
}

// Fase 55 — escribe SOLO las columnas internal_notification_* de un
// pedido (nunca email_sent, whatsapp_notified, items, total, status ni
// datos del cliente). Devuelve { ok, migrationPending? }.
async function setInternalNotification(id, internal, env, fetchImpl = fetch) {
  const url = `${env.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`;
  const payload = { internal_notification_status: internal.status, internal_notification_at: internal.at, internal_notification_error: internal.error };
  try {
    const res = await fetchImpl(url, { method: "PATCH", headers: headers(env, "return=minimal"), body: JSON.stringify(payload) });
    if (res.ok) return { ok: true };
    const body = await readJson(res);
    if (isMissingColumn(res.status, body)) return { ok: false, migrationPending: true };
    console.error(`[orders/store] pedido #${id}: no se pudo guardar el resultado del reintento de aviso (HTTP ${res.status}).`);
    return { ok: false };
  } catch (e) {
    console.error(`[orders/store] pedido #${id}: error de red al guardar el reintento de aviso (${e && e.name ? e.name : "error"}).`);
    return { ok: false };
  }
}

// Fase 56 — "reclama" atómicamente un reintento del aviso interno: una
// sola escritura condicional marca internal_notification_at = ahora SOLO
// si el pedido no consta como avisado y no hubo un intento desde
// `cutoffIso`. Si dos reintentos llegan a la vez, solo uno obtiene la fila;
// el otro recibe { claimed: false } y no envía nada.
async function claimInternalRetry(id, nowIso, cutoffIso, env, fetchImpl = fetch) {
  const cond = `(or(internal_notification_status.is.null,internal_notification_status.neq.accepted),or(internal_notification_at.is.null,internal_notification_at.lt."${cutoffIso}"))`;
  const url = `${env.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&and=${encodeURIComponent(cond)}&select=id`;
  const res = await fetchImpl(url, { method: "PATCH", headers: headers(env, "return=representation"), body: JSON.stringify({ internal_notification_at: nowIso }) });
  const body = await readJson(res);
  if (!res.ok) {
    if (isMissingColumn(res.status, body)) return { claimed: false, migrationPending: true };
    const err = new Error(`orders claim failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return { claimed: Array.isArray(body) && body.length === 1 };
}

module.exports = { claimInternalRetry, insertOrder, markOrderNotifications, internalFromResult, getOrderForInternalRetry, setInternalNotification, INTERNAL_COLUMNS, findOrderByIdempotencyKey, countRecentOrdersByPhone };
