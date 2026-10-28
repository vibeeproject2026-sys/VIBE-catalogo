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
const { insertOrder, markOrderNotifications, internalFromResult, findOrderByIdempotencyKey, countRecentOrdersByPhone } = require("./_lib/store");
const { parseDetails } = require("../_lib/editorialDetails");
const { productOptions, resolveSelection } = require("../_lib/variants");
const { isHoneypotFilled, ipRateLimited, parseIdempotencyKey, PHONE_WINDOW_MS, PHONE_MAX_ORDERS } = require("./_lib/guard");
const { sendOrderConfirmationEmail, sendInternalOrderNotificationEmail } = require("./_lib/email");
const { sendWhatsAppNotification } = require("./_lib/whatsappNotify");

const PRODUCT_COLUMNS = "id,name,price,stock,category,promo_active,promo_price,promo_start,promo_end,promo_text";
// Fase 43 — se necesita saber si la ficha está publicada. Fase 56 —
// también sus tonos (additional_info.shades) para validar la variante
// elegida; precio, nombre y stock siguen saliendo solo del POS.
const METADATA_COLUMNS = "product_id,published,additional_info,presentation";

function effectivePrice(shaped) {
  return shaped.promoActive === true && shaped.promoPrice != null ? shaped.promoPrice : shaped.price;
}

// Fase 55 — una línea por aviso: solo número de pedido, tipo, resultado y
// un código saneado. Nunca destinatarios, teléfonos ni contenido.
function logNotice(orderId, kind, result) {
  const r = result || {};
  const outcome = r.sent ? "aceptado" : /NOT_CONFIGURED$/.test(String(r.reason || "")) ? "no_configurado" : "fallido";
  const line = `[orders/notify] pedido=#${orderId} aviso=${kind} resultado=${outcome}` + (r.sent ? "" : ` codigo=${String(r.errorCode || r.reason || "UNKNOWN").slice(0, 80)}`);
  (r.sent ? console.log : console.error)(line);
}

// Respuesta al navegador para un pedido registrado (nuevo o repetido por
// idempotencia). Nunca incluye datos que el cliente no haya enviado.
function orderResponse(order, { emailSent, whatsappNotified, replayed = false }) {
  const out = {
    id: order.id,
    total: Number(order.total),
    customerEmail: order.customer_email,
    customerPhoneLast4: maskPhone(order.customer_phone),
    emailSent,
    whatsappNotified,
  };
  if (replayed) out.replayed = true;
  return out;
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

  // Fase 56 — antispam (ver _lib/guard.js). El honeypot responde con un
  // error genérico, sin revelar el motivo.
  if (isHoneypotFilled(body)) {
    console.error("[orders/create] rechazado: campo trampa completado.");
    return sendError(res, 400, "No se pudo procesar el pedido.");
  }
  if (ipRateLimited(req)) {
    console.error("[orders/create] rechazado: demasiados intentos desde el mismo origen.");
    return sendError(res, 429, "Recibimos demasiados intentos seguidos. Espera unos minutos o escríbenos por WhatsApp.");
  }

  const { valid, errors } = validateOrderPayload(body);
  if (!valid) {
    return sendJson(res, 400, { error: "Datos del pedido incompletos o inválidos.", fields: errors });
  }
  const idem = parseIdempotencyKey(body.idempotencyKey);
  if (idem.invalid) return sendJson(res, 400, { error: "Datos del pedido incompletos o inválidos.", fields: { idempotencyKey: "Clave de pedido inválida." } });

  // Fase 56 — idempotencia: si este mismo intento de compra ya quedó
  // registrado (p. ej. se cortó la conexión después de guardarlo y el
  // cliente reintentó), se devuelve ESE pedido, sin crear otro ni volver a
  // notificar. Si la migración 0005 no está aplicada, se sigue sin ella.
  let idemColumn = Boolean(idem.key);
  if (idem.key) {
    try {
      const prior = await findOrderByIdempotencyKey(idem.key, env);
      if (prior.migrationPending) idemColumn = false;
      else if (prior.order) {
        res.setHeader("Cache-Control", "no-store");
        return sendJson(res, 200, orderResponse(prior.order, { emailSent: null, whatsappNotified: null, replayed: true }));
      }
    } catch (e) {
      console.error("[orders/create] no se pudo comprobar la clave de idempotencia (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
      return sendError(res, 502, "No se pudo verificar el pedido. Intenta de nuevo.");
    }
  }

  const customer = body.customer;

  // Fase 56 — límite por teléfono (persistente, contra la base): evita
  // que un mismo número registre muchos pedidos en pocos minutos.
  try {
    const since = new Date(Date.now() - PHONE_WINDOW_MS).toISOString();
    const recent = await countRecentOrdersByPhone(String(customer.phone).trim(), since, env, { limit: PHONE_MAX_ORDERS + 1 });
    if (recent >= PHONE_MAX_ORDERS) {
      return sendError(res, 429, "Ya recibimos varios pedidos desde este número hace poco. Te contactaremos por WhatsApp; si necesitas algo más, escríbenos.");
    }
  } catch (e) {
    console.error("[orders/create] no se pudo comprobar el límite por teléfono (" + (e && e.status ? "HTTP " + e.status : "error") + ").");
    return sendError(res, 502, "No se pudo verificar el pedido. Intenta de nuevo.");
  }

  const submittedItems = body.items;
  // Los ids reales de producto son siempre numéricos (bigint de
  // Postgres, ver shapeProduct). Cualquier valor que no tenga esa forma
  // nunca puede coincidir con un producto real, así que ni siquiera se
  // manda al filtro `in.()` de PostgREST (evita un 400 crudo de
  // Supabase por un valor no castable, y evita construir el filtro con
  // texto no validado).
  const numericIds = [...new Set(submittedItems.map((it) => String(it.productId)).filter((id) => /^\d+$/.test(id)))];

  // Fase 43 — misma regla que el catálogo público (ver
  // api/catalog/_lib/merge.js#joinCatalog): solo se puede pedir un
  // producto cuya fila de catalog_metadata tenga published = true. Se
  // valida aquí, server-side, porque un request armado a mano puede
  // incluir cualquier id del POS aunque el catálogo nunca lo muestre.
  let realProducts = [];
  let publishedRows = [];
  try {
    if (numericIds.length) {
      const idFilter = ["id", `in.(${numericIds.join(",")})`];
      [realProducts, publishedRows] = await Promise.all([
        pgrestSelect({ table: "products", columns: PRODUCT_COLUMNS, filters: [idFilter], env }),
        pgrestSelect({
          table: "catalog_metadata",
          columns: METADATA_COLUMNS,
          filters: [
            ["product_id", `in.(${numericIds.join(",")})`],
            ["published", "eq.true"],
          ],
          env,
        }),
      ]);
    }
  } catch (e) {
    console.error("[orders/create] " + (e && e.message ? e.message : e));
    return sendError(res, 502, "No se pudo verificar el pedido.");
  }

  const realById = new Map(realProducts.map((p) => [String(p.id), shapeProduct(p, null, resolveCategoryGroup)]));
  // published === true se vuelve a comprobar aquí, no solo en el filtro
  // de la consulta, igual que joinCatalog.
  const publishedIds = new Set(publishedRows.filter((m) => m && m.published === true).map((m) => String(m.product_id)));
  // Fase 56/57 — opciones configuradas de cada producto (tonos con color y
  // presentaciones) más su presentación de texto, solo de filas publicadas.
  const optionsById = new Map(publishedRows.map((m) => [String(m.product_id), productOptions(parseDetails(m.additional_info), m.presentation)]));

  const unavailable = [];
  const unavailableVariants = [];
  const shapedItems = submittedItems.map((it) => {
    const real = realById.get(String(it.productId));
    // Un producto no publicado (o sin ficha) se rechaza exactamente igual
    // que uno inexistente o agotado: mismo 409 y mismo mensaje, para que
    // el checkout actual lo maneje sin cambios y la respuesta no revele
    // si existe un producto que el catálogo no muestra.
    if (!real || real.available === false || !publishedIds.has(String(it.productId))) {
      unavailable.push(it.productId);
      return null;
    }
    // Fase 56/57 — tono y presentación se validan por separado contra la
    // ficha de ESTE producto (existen, activos, y obligatorios cuando la
    // dimensión está configurada). Nombres e ids salen de la ficha, nunca
    // del request; no hay inventario por opción en el POS (condición:
    // opción activa + producto con stock).
    const sel = resolveSelection(optionsById.get(String(it.productId)), it);
    if (!sel.ok) {
      unavailableVariants.push({ productId: it.productId, variantId: it.variantId ?? null, dimension: sel.dimension });
      return null;
    }
    const { variantId, variantName, shadeId, shadeName, presentationId, presentationName } = sel;
    const price = effectivePrice(real);
    const quantity = it.quantity;
    return {
      productId: it.productId,
      variantId,
      name: real.name,
      variantName,
      shadeId,
      shadeName,
      presentationId,
      presentationName,
      brand: real.brand ?? null,
      // Fase 40 — imagen real del producto (server-authoritative, igual
      // que name/brand/price: nunca la del request) para que el email de
      // confirmación pueda mostrar una miniatura cuando exista. La
      // mayoría de productos reales hoy no tienen foto (ver auditoría de
      // Fase 37) — email.js cae a un placeholder de marca cuando
      // image es null, nunca inventa ni rompe el layout.
      image: real.image ?? null,
      sku: it.sku ?? null,
      quantity,
      price,
      lineSubtotal: price * quantity,
    };
  });

  if (unavailable.length) {
    return sendJson(res, 409, { error: "Uno o más productos ya no están disponibles.", unavailableProductIds: unavailable });
  }
  if (unavailableVariants.length) {
    return sendJson(res, 409, { code: "VARIANT_UNAVAILABLE", error: "Una de las opciones elegidas (tono o presentación) ya no está disponible o cambió. Revisa tu carrito para continuar.", unavailableVariants });
  }

  const total = shapedItems.reduce((sum, l) => sum + l.lineSubtotal, 0);

  // Fase 56 — el cliente envía el total que vio; si los precios cambiaron
  // desde entonces, no se registra el pedido con un total distinto al
  // mostrado: se devuelven los precios vigentes para que confirme de nuevo.
  if (body.expectedTotal !== undefined && Number(body.expectedTotal) !== total) {
    return sendJson(res, 409, {
      code: "PRICE_CHANGED",
      error: "Los precios cambiaron desde que armaste tu carrito. Revisa el total actualizado y confirma de nuevo.",
      total,
      prices: shapedItems.map((l) => ({ productId: l.productId, variantId: l.variantId, price: l.price })),
    });
  }

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
    order = await insertOrder({ order: idemColumn ? { ...orderPayload, idempotency_key: idem.key } : orderPayload, env });
  } catch (e) {
    if (e && e.code === "DUPLICATE_IDEMPOTENCY_KEY") {
      // Otro intento simultáneo del mismo pedido ya lo registró: se
      // devuelve ese, sin duplicar ni volver a notificar.
      try {
        const prior = await findOrderByIdempotencyKey(idem.key, env);
        if (prior.order) {
          res.setHeader("Cache-Control", "no-store");
          return sendJson(res, 200, orderResponse(prior.order, { emailSent: null, whatsappNotified: null, replayed: true }));
        }
      } catch {
        // cae al error genérico de abajo
      }
    }
    if (e && e.code === "MISSING_COLUMN" && idemColumn) {
      try {
        order = await insertOrder({ order: orderPayload, env });
      } catch (e2) {
        console.error("[orders/create] " + (e2 && e2.message ? e2.message : e2));
        return sendError(res, 502, "No se pudo registrar el pedido. Intenta de nuevo.");
      }
    } else if (!order) {
      console.error("[orders/create] " + (e && e.message ? e.message : e));
      return sendError(res, 502, "No se pudo registrar el pedido. Intenta de nuevo.");
    }
  }

  // El aviso interno a VIBE (sendInternalOrderNotificationEmail) es un
  // correo distinto, a una audiencia distinta (ORDERS_NOTIFICATION_EMAIL,
  // nunca customer_email) — se intenta en paralelo con el mismo criterio
  // de "nunca bloquea ni falsea éxito" que ya aplican los otros dos.
  // Los avisos se intentan SOLO después de guardar el pedido; ninguno
  // puede invalidarlo. Fase 55 — el resultado del aviso interno a VIBE ya
  // no se descarta: se guarda aparte de email_sent (que es solo el email
  // al cliente) para que el Admin muestre qué pedidos no se avisaron.
  const [emailResult, internalResult, whatsappResult] = await Promise.all([
    sendOrderConfirmationEmail(order),
    sendInternalOrderNotificationEmail(order),
    sendWhatsAppNotification(order),
  ]);
  const internal = internalFromResult(internalResult);
  logNotice(order.id, "cliente", emailResult);
  logNotice(order.id, "interno", internalResult);
  logNotice(order.id, "whatsapp", whatsappResult);

  await markOrderNotifications(order.id, { emailSent: emailResult.sent, whatsappNotified: whatsappResult.sent, internal }, env);

  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 201, orderResponse(order, { emailSent: emailResult.sent, whatsappNotified: whatsappResult.sent }));
};
