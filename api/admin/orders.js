// GET /api/admin/orders — admin-only, solo lectura.
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!requireAdmin(req, res)) return;

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[admin/orders] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  try {
    const params = new URLSearchParams();
    params.set("select", ORDER_COLUMNS);
    params.set("order", "created_at.desc");
    params.set("limit", "200");
    const url = `${env.url}/rest/v1/orders?${params.toString()}`;

    const supaRes = await fetch(url, {
      method: "GET",
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        Accept: "application/json",
      },
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
