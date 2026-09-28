// Fase 39 — email de confirmación de pedido al cliente.
//
// Preparado, no simulado: si RESEND_API_KEY/EMAIL_FROM_ADDRESS no están
// configuradas (hoy no lo están — auditado, no existe ninguna
// credencial de proveedor de email en este proyecto), sendEmail nunca
// lanza ni finge un envío exitoso — devuelve {sent:false, reason:...} y
// el pedido sigue registrándose con normalidad (ver api/orders/create.js).
// Se apunta a Resend concretamente (POST a api.resend.com/emails, sin
// SDK) porque este repo no tiene un solo `npm install`: cualquier
// integración real acá tiene que ser una llamada `fetch` plana.
//
// IMPORTANTE — nunca afirmar "pagado" ni "confirmado": el pedido queda
// RECIBIDO, la confirmación real (disponibilidad, envío, forma de pago)
// la hace un humano después por WhatsApp.

function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function lineLabel(l) {
  const hasRealVariant = l.variantName && l.variantName !== "Único" && l.variantName !== "Default";
  return hasRealVariant ? `${l.name} — ${l.variantName}` : l.name;
}

function formatOrderDate(createdAt) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(createdAt));
}

// order: la fila ya insertada en Supabase (id, created_at, items,
// total, customer_*) — nunca datos crudos del request, siempre lo que
// realmente quedó persistido.
function buildOrderEmail(order) {
  const orderNumber = `#${order.id}`;
  const dateLabel = formatOrderDate(order.created_at);
  const items = Array.isArray(order.items) ? order.items : [];

  const rowsText = items.map((l) => `${lineLabel(l)}\nCantidad: ${l.quantity}  ·  Precio: ${money(l.price)}  ·  Subtotal: ${money(l.lineSubtotal)}`).join("\n\n");
  const rowsHtml = items
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(lineLabel(l))}<br><span style="color:#777;font-size:13px;">Cantidad: ${l.quantity}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${money(l.price)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;"><strong>${money(l.lineSubtotal)}</strong></td>
      </tr>`
    )
    .join("");

  const subject = `Recibimos tu pedido ${orderNumber} — VIBE`;

  const text = [
    "Recibimos tu pedido 💗",
    "",
    "Gracias por elegir VIBE.",
    "",
    `Pedido ${orderNumber} — ${dateLabel}`,
    "",
    "PEDIDO RECIBIDO — nuestro equipo se pondrá en contacto contigo por WhatsApp al número registrado para confirmar disponibilidad, envío y forma de pago.",
    "",
    rowsText,
    "",
    `Total: ${money(order.total)}`,
    "",
    "Datos de entrega:",
    `Nombre: ${order.customer_name}`,
    `Ciudad: ${order.customer_city}`,
    `Dirección: ${order.customer_address}`,
    "",
    "Gracias por tu compra 💗 — VIBE",
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;">
    <h2 style="color:#ff2f95;">Recibimos tu pedido 💗</h2>
    <p>Gracias por elegir VIBE.</p>
    <p><strong>Pedido ${orderNumber}</strong> — ${dateLabel}</p>
    <p style="background:#fff5fa;border-radius:12px;padding:14px 16px;font-size:14px;">
      <strong>PEDIDO RECIBIDO.</strong> Nuestro equipo se pondrá en contacto contigo por WhatsApp
      al número registrado para confirmar disponibilidad, envío y forma de pago.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rowsHtml}</table>
    <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total: ${money(order.total)}</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:14px;color:#555;">
      <strong>Datos de entrega</strong><br>
      ${escapeHtml(order.customer_name)}<br>
      ${escapeHtml(order.customer_city)}<br>
      ${escapeHtml(order.customer_address)}
    </p>
    <p style="font-size:13px;color:#999;">Gracias por tu compra 💗 — VIBE</p>
  </div>`;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Nunca lanza: el llamador siempre recibe {sent, reason?} y decide qué
// mostrarle al cliente (nunca afirmar un envío que no ocurrió).
async function sendEmail({ to, subject, html, text }, fetchImpl = fetch) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !from) {
    console.error("[orders/email] No configurado: falta RESEND_API_KEY y/o EMAIL_FROM_ADDRESS. El pedido se registra igual, sin enviar email.");
    return { sent: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      // Diagnóstico Fase 39.1 — antes solo se logueaba el status HTTP.
      // Resend siempre devuelve un JSON {name, message} explicando la
      // causa exacta del rechazo (dominio no verificado, remitente no
      // permitido, etc.) — nunca contiene la API key ni ningún secreto,
      // así que es seguro loguearlo completo para poder diagnosticar sin
      // adivinar. Nunca se expone en la respuesta al cliente, solo en
      // los logs del servidor.
      const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      console.error("[orders/email] Resend respondió " + res.status + " al intentar enviar la confirmación: " + body.slice(0, 500));
      return { sent: false, reason: "EMAIL_SEND_FAILED" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[orders/email] Error de red al intentar enviar la confirmación: " + (e && e.message ? e.message : e));
    return { sent: false, reason: "EMAIL_SEND_FAILED" };
  }
}

async function sendOrderConfirmationEmail(order, fetchImpl = fetch) {
  const { subject, html, text } = buildOrderEmail(order);
  return sendEmail({ to: order.customer_email, subject, html, text }, fetchImpl);
}

module.exports = { buildOrderEmail, sendEmail, sendOrderConfirmationEmail };
