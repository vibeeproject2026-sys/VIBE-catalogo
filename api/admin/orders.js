// GET /api/admin/orders — admin-only, listado de pedidos.
// DELETE /api/admin/orders?id=<n> — admin-only (Fase 53). Elimina UN
// pedido de verdad (no lo oculta), sea cual sea su estado. Es seguro
// borrar la fila: el pedido vive en una sola tabla (items embebidos en
// jsonb), ninguna otra tabla la referencia y crear un pedido nunca tocó
// stock ni productos — eliminarlo no deja huérfanos ni altera productos,
// inventario o fichas. Responde 404 si el pedido ya no existe.
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

const ORDER_COLUMNS =
  "id,created_at,customer_name,customer_phone,customer_email,customer_city,customer_address,customer_notes,items,total,status,email_sent,whatsapp_notified";

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

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE") return methodNotAllowed(res, ["GET", "DELETE"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/orders] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  if (req.method === "DELETE") return deleteOrder(req, res, env);

  try {
    const params = new URLSearchParams();
    params.set("select", ORDER_COLUMNS);
    params.set("order", "created_at.desc");
    params.set("limit", "200");
    const url = `${env.url}/rest/v1/orders?${params.toString()}`;

    const supaRes = await fetch(url, {
      method: "GET",
      headers: serviceHeaders(env),
    });
    const text = await supaRes.text();
    const body = text ? JSON.parse(text) : [];
    if (!supaRes.ok) {
      const pgCode = body && typeof body === "object" ? body.code : undefined;
      if (pgCode === "42P01") return sendError(res, 503, "La tabla de pedidos todavía no existe (falta aplicar la migración 0003_orders.sql).");
      console.error("[admin/orders] Supabase respondió " + supaRes.status);
      return sendError(res, 502, "No se pudo obtener el listado de pedidos.");
    }

    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { orders: Array.isArray(body) ? body : [] });
  } catch (e) {
    console.error("[admin/orders] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo obtener el listado de pedidos.");
  }
};
