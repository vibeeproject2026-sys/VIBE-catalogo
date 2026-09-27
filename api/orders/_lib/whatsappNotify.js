// Fase 39 — aviso automático a VIBE por WhatsApp cuando entra un pedido.
//
// Distinto de js/checkout.js#buildWhatsAppMessage (esa función era para
// el mensaje SALIENTE del cliente hacia VIBE, ya retirada del flujo de
// checkout — ver js/app.js). Este es el mensaje ENTRANTE hacia el
// número comercial de VIBE, con audiencia y contenido distintos
// (instrucción de contactar al cliente, no un pedido en primera
// persona) — correctamente una función nueva, no una reutilización.
//
// Preparado, no simulado: si WHATSAPP_BUSINESS_TOKEN/
// WHATSAPP_PHONE_NUMBER_ID/VIBE_WHATSAPP_NOTIFICATION_NUMBER no están
// configuradas (hoy no lo están), sendWhatsAppNotification nunca lanza
// ni finge un envío exitoso.
//
// Apunta a la Cloud API de Meta (HTTP directo, sin SDK, mismo motivo
// que Resend en email.js): POST a
// graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages.
//
// Nota operativa que no se puede resolver sin credenciales reales: la
// Cloud API de Meta típicamente exige plantillas pre-aprobadas
// (type:"template") para mensajes iniciados por el negocio fuera de
// una ventana de conversación de 24h — un aviso de "nuevo pedido" hacia
// el propio número de VIBE es exactamente ese caso. WHATSAPP_MESSAGE_MODE
// ("text" por defecto, o "template") queda como el punto de
// configuración para cuando se sepa qué plantilla aprobó Meta — no es
// una promesa de que el texto libre vaya a funcionar tal cual.

function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function lineLabel(l) {
  const hasRealVariant = l.variantName && l.variantName !== "Único" && l.variantName !== "Default";
  return hasRealVariant ? `${l.name} — ${l.variantName}` : l.name;
}

function buildOrderNotificationMessage(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productLines = items.map((l) => `• ${lineLabel(l)} × ${l.quantity} — ${money(l.lineSubtotal)}`).join("\n");
  const notes = String(order.customer_notes || "").trim();

  return [
    "💗 NUEVO PEDIDO VIBE",
    `Número de pedido: #${order.id}`,
    "",
    "Cliente:",
    order.customer_name,
    "",
    "WhatsApp:",
    order.customer_phone,
    "",
    "Email:",
    order.customer_email,
    "",
    "Ciudad:",
    order.customer_city,
    "",
    "Dirección:",
    order.customer_address,
    "",
    "Productos:",
    productLines,
    "",
    `Total: ${money(order.total)}`,
    "",
    "Observaciones:",
    notes || "Ninguna",
    "",
    "Contactar al cliente al número registrado para confirmar disponibilidad, envío y forma de pago.",
  ].join("\n");
}

async function sendWhatsAppNotification(order, fetchImpl = fetch) {
  const token = process.env.WHATSAPP_BUSINESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const toNumber = process.env.VIBE_WHATSAPP_NOTIFICATION_NUMBER;
  const mode = process.env.WHATSAPP_MESSAGE_MODE || "text";

  if (!token || !phoneNumberId || !toNumber) {
    console.error(
      "[orders/whatsappNotify] No configurado: falta WHATSAPP_BUSINESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID y/o VIBE_WHATSAPP_NOTIFICATION_NUMBER. El pedido se registra igual, sin notificar por WhatsApp."
    );
    return { sent: false, reason: "WHATSAPP_PROVIDER_NOT_CONFIGURED" };
  }

  const body = buildOrderNotificationMessage(order);

  try {
    const res = await fetchImpl(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: mode === "template" ? "template" : "text",
        ...(mode === "template" ? { template: { name: "nuevo_pedido_vibe", language: { code: "es_CO" } } } : { text: { body } }),
      }),
    });
    if (!res.ok) {
      console.error("[orders/whatsappNotify] Meta Cloud API respondió " + res.status + " al intentar notificar el pedido.");
      return { sent: false, reason: "WHATSAPP_SEND_FAILED" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[orders/whatsappNotify] Error de red al intentar notificar el pedido: " + (e && e.message ? e.message : e));
    return { sent: false, reason: "WHATSAPP_SEND_FAILED" };
  }
}

module.exports = { buildOrderNotificationMessage, sendWhatsAppNotification };
