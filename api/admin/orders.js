// GET /api/admin/orders — admin-only, listado de pedidos.
// DELETE /api/admin/orders?id=<n> — admin-only (Fase 53). Elimina UN
// pedido de verdad (no lo oculta), sea cual sea su estado. Es seguro
// borrar la fila: el pedido vive en una sola tabla (items embebidos en
// jsonb), ninguna otra tabla la referencia y crear un pedido nunca tocó
// stock ni productos — eliminarlo no deja huérfanos ni altera productos,
// inventario o fichas. Responde 404 si el pedido ya no existe.
// POST /api/admin/orders — admin-only (Fase 55). Body:
// { action: "retry-internal-notification", id }. Reintenta EXCLUSIVAMENTE
// el email interno a VIBE (ORDERS_NOTIFICATION_EMAIL) de un pedido que no
// consta como avisado. Nunca reenvía el email al cliente ni WhatsApp,
// nunca crea ni modifica el pedido comercial: solo escribe las columnas
// internal_notification_* (migración 0004).
//
// Fase 39: mientras no exista una credencial real de email/WhatsApp
// Business configurada, esta es la única forma práctica de que Ana vea
// los pedidos entrantes sin entrar directo al Table Editor de Supabase.
// Sin acciones, sin edición de estado — un pedido "recibido" solo se
// gestiona por WhatsApp, como pide el brief.
//
// A diferencia de la API pública, acá SÍ se devuelve el teléfono/email
// completos (uso interno autenticado) — no hace falta enmascararlos
// como en la confirmación que ve el cliente.

const { getEnv } = require("../catalog/_lib/env");
const { requireAdmin } = require("./_lib/auth");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { sendInternalOrderNotificationEmail } = require("../orders/_lib/email");
const { internalFromResult, getOrderForInternalRetry, setInternalNotification, claimInternalRetry, INTERNAL_COLUMNS } = require("../orders/_lib/store");

const ORDER_COLUMNS =
  "id,created_at,customer_name,customer_phone,customer_email,customer_city,customer_address,customer_notes,items,total,status,email_sent,whatsapp_notified";
const RETRY_ACTION = "retry-internal-notification";
// Evita reenvíos accidentales en ráfaga (doble clic, dos pestañas).
const RETRY_COOLDOWN_MS = 60 * 1000;

// Ids de pedido: bigserial (entero positivo). Cualquier otra cosa se
// rechaza antes de llegar a Supabase (sin filtros manipulados).
function parseOrderId(value) {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  return raw;
}

function serviceHeaders(env) {
  return {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    Accept: "application/json",
  };
}

async function deleteOrder(req, res, env) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const id = parseOrderId((req.query && req.query.id) ?? (body && body.id));
  if (!id) return sendError(res, 400, "Id de pedido inválido o ausente.");

  try {
    const url = `${env.url}/rest/v1/orders?id=eq.${id}&select=id`;
    const supaRes = await fetch(url, {
      method: "DELETE",
      headers: { ...serviceHeaders(env), Prefer: "return=representation" },
    });
    const text = await supaRes.text();
    let deleted = [];
    try { deleted = text ? JSON.parse(text) : []; } catch { deleted = []; }
    if (!supaRes.ok) {
      // Solo el código HTTP: nunca datos del cliente ni la respuesta cruda.
      console.error("[admin/orders] DELETE: Supabase respondió " + supaRes.status);
      return sendError(res, 502, "No se pudo eliminar el pedido. Intenta de nuevo.");
    }
    if (!Array.isArray(deleted) || deleted.length === 0) {
      return sendError(res, 404, "Ese pedido ya no existe.");
    }
    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { deleted: { id: deleted[0].id } });
  } catch (e) {
    console.error("[admin/orders] DELETE: " + (e && e.name ? e.name : "error"));
    return sendError(res, 502, "No se pudo eliminar el pedido. Intenta de nuevo.");
  }
}

async function retryInternalNotification(req, res, env) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || body.action !== RETRY_ACTION) return sendError(res, 400, "Acción inválida.");
  const id = parseOrderId(body.id);
  if (!id) return sendError(res, 400, "Id de pedido inválido o ausente.");

  let found;
  try {
    found = await getOrderForInternalRetry(id, env);
  } catch (e) {
    console.error(`[admin/orders] reintento de aviso pedido #${id}: no se pudo leer el pedido (${e && e.status ? "HTTP " + e.status : "error"}).`);
    return sendError(res, 502, "No se pudo leer el pedido. Intenta de nuevo.");
  }
  if (found.migrationPending) return sendError(res, 503, "Falta aplicar la migración 0004 para registrar los avisos. No se envió nada.");
  if (found.notFound) return sendError(res, 404, "Ese pedido ya no existe.");

  const order = found.order;
  if (order.internal_notification_status === "accepted") {
    return sendError(res, 409, "Este pedido ya consta como avisado a VIBE. No se reenvió.");
  }
  const lastAt = order.internal_notification_at ? Date.parse(order.internal_notification_at) : NaN;
  if (Number.isFinite(lastAt) && Date.now() - lastAt < RETRY_COOLDOWN_MS) {
    return sendError(res, 429, "Hubo un intento hace menos de un minuto. Espera un momento antes de reintentar.");
  }

  // Fase 56 — reclamo atómico: con dos reintentos simultáneos solo uno
  // envía. La clave de idempotencia del reintento es propia (distinta de la
  // del aviso original), así Resend no lo descarta como repetido, pero un
  // mismo reclamo nunca produce dos envíos.
  const claimAt = new Date();
  let claim;
  try {
    claim = await claimInternalRetry(order.id, claimAt.toISOString(), new Date(claimAt.getTime() - RETRY_COOLDOWN_MS).toISOString(), env);
  } catch (e) {
    console.error(`[admin/orders] reintento de aviso pedido #${order.id}: no se pudo reservar el reintento (${e && e.status ? "HTTP " + e.status : "error"}).`);
    return sendError(res, 502, "No se pudo iniciar el reintento. No se envió nada.");
  }
  if (claim.migrationPending) return sendError(res, 503, "Falta aplicar la migración 0004 para registrar los avisos. No se envió nada.");
  if (!claim.claimed) return sendError(res, 429, "Ya hay un reintento en curso o reciente para este pedido. Espera un momento.");

  const result = await sendInternalOrderNotificationEmail(order, fetch, { idempotencyKey: `vibe-order-${order.id}-internal-retry-${claimAt.getTime()}` });
  const internal = { ...internalFromResult(result), at: claimAt.toISOString() };
  const outcome = internal.status === "accepted" ? "aceptado" : internal.status === "not_configured" ? "no_configurado" : "fallido";
  (result.sent ? console.log : console.error)(
    `[orders/notify] pedido=#${order.id} aviso=interno-reintento resultado=${outcome}` + (internal.error ? ` codigo=${internal.error}` : "")
  );
  const saved = await setInternalNotification(order.id, internal, env);

  res.setHeader("Cache-Control", "no-store");
  const payload = {
    id: order.id,
    internalNotification: { status: internal.status, at: internal.at, error: internal.error },
    recorded: saved.ok,
  };
  return sendJson(res, internal.status === "accepted" ? 200 : 502, payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE" && req.method !== "POST") return methodNotAllowed(res, ["GET", "DELETE", "POST"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/orders] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  if (req.method === "DELETE") return deleteOrder(req, res, env);
  if (req.method === "POST") return retryInternalNotification(req, res, env);

  try {
    const listUrl = (columns) => {
      const params = new URLSearchParams();
      params.set("select", columns);
      params.set("order", "created_at.desc");
      params.set("limit", "200");
      return `${env.url}/rest/v1/orders?${params.toString()}`;
    };
    // Fase 55 — incluye el estado del aviso interno. Si la migración 0004
    // aún no está aplicada (columna inexistente → 42703), se lista igual
    // sin esas columnas y el Admin muestra el seguimiento como no
    // disponible.
    let notificationTracking = true;
    let supaRes = await fetch(listUrl(ORDER_COLUMNS + "," + INTERNAL_COLUMNS.join(",")), { method: "GET", headers: serviceHeaders(env) });
    let text = await supaRes.text();
    let body = text ? JSON.parse(text) : [];
    if (!supaRes.ok && supaRes.status === 400 && body && body.code === "42703") {
      notificationTracking = false;
      supaRes = await fetch(listUrl(ORDER_COLUMNS), { method: "GET", headers: serviceHeaders(env) });
      text = await supaRes.text();
      body = text ? JSON.parse(text) : [];
    }
    if (!supaRes.ok) {
      const pgCode = body && typeof body === "object" ? body.code : undefined;
      if (pgCode === "42P01") return sendError(res, 503, "La tabla de pedidos todavía no existe (falta aplicar la migración 0003_orders.sql).");
      console.error("[admin/orders] Supabase respondió " + supaRes.status);
      return sendError(res, 502, "No se pudo obtener el listado de pedidos.");
    }

    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { orders: Array.isArray(body) ? body : [], notificationTracking });
  } catch (e) {
    console.error("[admin/orders] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo obtener el listado de pedidos.");
  }
};
