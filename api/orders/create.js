// POST /api/orders/create — público (el cliente no está autenticado),
// reemplaza el flujo anterior de "abrir WhatsApp con un mensaje
// pre-armado" (Fase 29) por un pedido real, persistido en Supabase.
//
// Nunca confía en lo que mande el cliente para precio/disponibilidad:
// revalida cada producto contra `products` (la misma fuente que usa el
// catálogo público) y usa el precio/disponibilidad reales para lo que
// se persiste, se emaila y se notifica — igual disciplina que ya aplica
// cartLinesWithAvailability()/refreshAvailability() en el cliente, ahora
// hecha autoritativa server-side.
//
// Nunca abre WhatsApp desde el navegador del cliente ni depende de que
// exista un proveedor de email/WhatsApp Business configurado: si faltan
// esas credenciales, el pedido se registra igual y la respuesta refleja
// honestamente que el envío no ocurrió (ver _lib/email.js,
// _lib/whatsappNotify.js).

const { getEnv } = require("../catalog/_lib/env");
const { pgrestSelect } = require("../catalog/_lib/supabaseRead");
const { shapeProduct } = require("../catalog/_lib/merge");
const { resolveCategoryGroup } = require("../catalog/_lib/categoryGroups");
const { applyCors } = require("../catalog/_lib/cors");
const { sendJson, sendError, methodNotAllowed } = require("../catalog/_lib/http");
const { validateOrderPayload } = require("./_lib/validate");
const { insertOrder, markOrderNotifications } = require("./_lib/store");
const { sendOrderConfirmationEmail, sendInternalOrderNotificationEmail } = require("./_lib/email");
const { sendWhatsAppNotification } = require("./_lib/whatsappNotify");

const PRODUCT_COLUMNS = "id,name,price,stock,category,promo_active,promo_price,promo_start,promo_end,promo_text";

function effectivePrice(shaped) {
  return shaped.promoActive === true && shaped.promoPrice != null ? shaped.promoPrice : shaped.price;
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length > 4 ? "•".repeat(digits.length - 4) + digits.slice(-4) : digits;
}

module.exports = async function handler(req, res) {
  applyCors(req, res, ["POST", "OPTIONS"]);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);

  let env;
  try {
    env = getEnv();
  } catch (e) {
    console.error("[orders/create] " + e.message);
    return sendError(res, 500, "Servicio no disponible temporalmente.");
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { valid, errors } = validateOrderPayload(body);
  if (!valid) {
    return sendJson(res, 400, { error: "Datos del pedido incompletos o inválidos.", fields: errors });
  }

  const customer = body.customer;
  const submittedItems = body.items;
  // Los ids reales de producto son siempre numéricos (bigint de
  // Postgres, ver shapeProduct). Cualquier valor que no tenga esa forma
  // nunca puede coincidir con un producto real, así que ni siquiera se
  // manda al filtro `in.()` de PostgREST (evita un 400 crudo de
  // Supabase por un valor no castable, y evita construir el filtro con
  // texto no validado).
  const numericIds = [...new Set(submittedItems.map((it) => String(it.productId)).filter((id) => /^\d+$/.test(id)))];

  let realProducts = [];
  try {
    if (numericIds.length) {
      realProducts = await pgrestSelect({
        table: "products",
        columns: PRODUCT_COLUMNS,
        filters: [["id", `in.(${numericIds.join(",")})`]],
        env,
      });
    }
  } catch (e) {
    console.error("[orders/create] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo verificar el pedido.");
  }

  const realById = new Map(realProducts.map((p) => [String(p.id), shapeProduct(p, null, resolveCategoryGroup)]));

  const unavailable = [];
  const shapedItems = submittedItems.map((it) => {
    const real = realById.get(String(it.productId));
    if (!real || real.available === false) {
      unavailable.push(it.productId);
      return null;
    }
    const price = effectivePrice(real);
    const quantity = it.quantity;
    return {
      productId: it.productId,
      variantId: it.variantId ?? null,
      name: real.name,
      variantName: it.variantName || "Único",
      brand: real.brand ?? null,
      sku: it.sku ?? null,
      quantity,
      price,
      lineSubtotal: price * quantity,
    };
  });

  if (unavailable.length) {
    return sendJson(res, 409, { error: "Uno o más productos ya no están disponibles.", unavailableProductIds: unavailable });
  }

  const total = shapedItems.reduce((sum, l) => sum + l.lineSubtotal, 0);

  const orderPayload = {
    customer_name: String(customer.name).trim(),
    customer_phone: String(customer.phone).trim(),
    customer_email: String(customer.email).trim(),
    customer_city: String(customer.city).trim(),
    customer_address: String(customer.address).trim(),
    customer_notes: customer.notes ? String(customer.notes).trim() : null,
    items: shapedItems,
    total,
    contact_consent: true,
  };

  let order;
  try {
    order = await insertOrder({ order: orderPayload, env });
  } catch (e) {
    console.error("[orders/create] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo registrar el pedido. Intenta de nuevo.");
  }

  // El aviso interno a VIBE (sendInternalOrderNotificationEmail) es un
  // correo distinto, a una audiencia distinta (ORDERS_NOTIFICATION_EMAIL,
  // nunca customer_email) — se intenta en paralelo con el mismo criterio
  // de "nunca bloquea ni falsea éxito" que ya aplican los otros dos.
  // Su resultado no se persiste en `orders` (no es un campo que el
  // brief pida trackear) ni se expone al cliente — solo queda en los
  // logs del servidor si falla (ver _lib/email.js).
  const [emailResult, , whatsappResult] = await Promise.all([
    sendOrderConfirmationEmail(order),
    sendInternalOrderNotificationEmail(order),
    sendWhatsAppNotification(order),
  ]);

  await markOrderNotifications(order.id, { emailSent: emailResult.sent, whatsappNotified: whatsappResult.sent }, env);

  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 201, {
    id: order.id,
    total: order.total,
    customerEmail: order.customer_email,
    customerPhoneLast4: maskPhone(order.customer_phone),
    emailSent: emailResult.sent,
    whatsappNotified: whatsappResult.sent,
  });
};
