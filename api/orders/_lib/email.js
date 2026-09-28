// Fase 39 — email transaccional de pedido: confirmación al cliente
// (buildOrderEmail/sendOrderConfirmationEmail) y aviso interno a VIBE
// (buildInternalOrderEmail/sendInternalOrderNotificationEmail) — dos
// correos distintos, para audiencias distintas, nunca el mismo
// contenido reetiquetado.
//
// Preparado, no simulado: si RESEND_API_KEY/EMAIL_FROM_ADDRESS (o,
// para el aviso interno, ORDERS_NOTIFICATION_EMAIL) no están
// configuradas, sendEmail nunca lanza ni finge un envío exitoso —
// devuelve {sent:false, reason:...} y el pedido sigue registrándose
// con normalidad (ver api/orders/create.js). Se apunta a Resend
// concretamente (POST a api.resend.com/emails, sin SDK) porque este
// repo no tiene un solo `npm install`: cualquier integración real acá
// tiene que ser una llamada `fetch` plana.
//
// IMPORTANTE — nunca afirmar "pagado", "confirmado", "enviado" ni "en
// camino": el pedido queda RECIBIDO/REGISTRADO, la gestión real
// (disponibilidad, envío, forma de pago) la hace un humano después por
// WhatsApp.

const BRAND = {
  pink: "#FF007A",
  pink2: "#FF4FA3",
  white: "#FFFFFF",
};

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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ==========================================================================
// Cliente — confirmación premium de marca (sección 5/6 del brief:
// header VIBE, mensaje principal, estado, identificación, productos,
// total, datos de entrega, "¿Qué sigue?", cierre). Tabla + estilos
// inline para compatibilidad real de clientes de correo (sin CSS
// moderno, sin JS, sin dependencias externas) — sección 9.
// ==========================================================================

// order: la fila ya insertada en Supabase (id, created_at, items,
// total, customer_*) — nunca datos crudos del request, siempre lo que
// realmente quedó persistido.
function buildOrderEmail(order) {
  const orderNumber = `#${order.id}`;
  const dateLabel = formatOrderDate(order.created_at);
  const items = Array.isArray(order.items) ? order.items : [];
  const notes = String(order.customer_notes || "").trim();

  const rowsText = items
    .map((l) => `${lineLabel(l)}${l.brand ? ` (${l.brand})` : ""}\nCantidad: ${l.quantity}  ·  Precio: ${money(l.price)}  ·  Subtotal: ${money(l.lineSubtotal)}`)
    .join("\n\n");

  const rowsHtml = items
    .map(
      (l) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;">
          ${l.brand ? `<span style="display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#999999;margin:0 0 2px;">${escapeHtml(l.brand)}</span>` : ""}
          <span style="font-weight:600;">${escapeHtml(lineLabel(l))}</span>
          <span style="display:block;font-size:12px;color:#999999;margin-top:2px;">Cantidad: ${l.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#777777;text-align:right;vertical-align:top;">${money(l.price)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111111;text-align:right;vertical-align:top;font-weight:700;">${money(l.lineSubtotal)}</td>
      </tr>`
    )
    .join("");

  const subject = `Recibimos tu pedido ${orderNumber} — VIBE`;

  const text = [
    "VIBE — Vibrant Iconic Beauty Essentials",
    "",
    "¡Recibimos tu pedido!",
    "Gracias por elegir VIBE.",
    "",
    "PEDIDO RECIBIDO",
    "Tu pedido fue registrado correctamente. Nuestro equipo revisará la disponibilidad y se pondrá en contacto contigo por WhatsApp al número registrado para gestionar y finalizar tu pedido.",
    "",
    `Pedido ${orderNumber} — ${dateLabel}`,
    "",
    rowsText,
    "",
    `TOTAL: ${money(order.total)}`,
    "",
    "Datos de entrega:",
    order.customer_name,
    order.customer_city,
    order.customer_address,
    ...(notes ? [`Notas: ${notes}`] : []),
    "",
    "¿QUÉ SIGUE?",
    "1. Recibimos tu pedido.",
    "2. Revisamos disponibilidad.",
    "3. Te contactaremos por WhatsApp al número registrado.",
    "4. Coordinaremos contigo los siguientes pasos.",
    "",
    "Gracias por elegir VIBE.",
    "Vibrant Iconic Beauty Essentials",
    "vibebeautycol.com",
  ].join("\n");

  const html = `<div style="background:#f6f6f6;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${BRAND.white};border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background:${BRAND.pink};padding:32px 32px 28px;text-align:center;">
          <p style="margin:0;color:${BRAND.white};font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;">Vibrant Iconic Beauty Essentials</p>
          <p style="margin:8px 0 0;color:${BRAND.white};font-size:32px;font-weight:800;letter-spacing:.04em;">VIBE</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 32px 8px;text-align:center;">
          <h1 style="margin:0 0 6px;font-size:22px;color:#111111;">¡Recibimos tu pedido!</h1>
          <p style="margin:0;color:#777777;font-size:14px;">Gracias por elegir VIBE.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff5fa;border-radius:12px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.12em;color:${BRAND.pink};text-transform:uppercase;">Pedido recibido</p>
                <p style="margin:0;font-size:13px;color:#444444;line-height:1.6;">Tu pedido fue registrado correctamente. Nuestro equipo revisará la disponibilidad y se pondrá en contacto contigo por WhatsApp al número registrado para gestionar y finalizar tu pedido.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 0;">
          <p style="margin:0;font-size:13px;color:#999999;">Pedido <strong style="color:#111111;">${orderNumber}</strong> · ${dateLabel}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 0;text-align:right;">
          <p style="margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#999999;">Total</p>
          <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:#111111;">${money(order.total)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 0;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#999999;">Datos de entrega</p>
          <p style="margin:0;font-size:14px;color:#333333;line-height:1.7;">
            ${escapeHtml(order.customer_name)}<br>
            ${escapeHtml(order.customer_city)}<br>
            ${escapeHtml(order.customer_address)}
            ${notes ? `<br><span style="color:#999999;">Notas: ${escapeHtml(notes)}</span>` : ""}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:12px;">
            <tr>
              <td style="padding:18px 20px;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.pink};">¿Qué sigue?</p>
                <ol style="margin:0;padding-left:18px;color:#444444;font-size:13px;line-height:1.9;">
                  <li>Recibimos tu pedido.</li>
                  <li>Revisamos disponibilidad.</li>
                  <li>Te contactaremos por WhatsApp al número registrado.</li>
                  <li>Coordinaremos contigo los siguientes pasos.</li>
                </ol>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 36px;text-align:center;">
          <p style="margin:0 0 4px;font-size:14px;color:#333333;">Gracias por elegir VIBE.</p>
          <p style="margin:0 0 12px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#999999;">Vibrant Iconic Beauty Essentials</p>
          <p style="margin:0;font-size:12px;color:${BRAND.pink};">vibebeautycol.com</p>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, text, html };
}

// ==========================================================================
// Interno — aviso a VIBE (sección 4 del brief). Deliberadamente
// distinto en audiencia y contenido del correo del cliente: nunca se
// reusa buildOrderEmail ni su copy de marca — este es un correo
// operativo, no una pieza de marca.
// ==========================================================================
function buildInternalOrderEmail(order) {
  const orderNumber = `#${order.id}`;
  const dateLabel = formatOrderDate(order.created_at);
  const items = Array.isArray(order.items) ? order.items : [];
  const notes = String(order.customer_notes || "").trim();

  const rowsText = items
    .map((l) => `• ${lineLabel(l)}${l.brand ? ` (${l.brand})` : ""} × ${l.quantity} — ${money(l.lineSubtotal)} (unit. ${money(l.price)})`)
    .join("\n");

  const rowsHtml = items
    .map(
      (l) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #333333;font-size:13px;color:#ffffff;">${escapeHtml(lineLabel(l))}${l.brand ? ` <span style="color:#999999;">(${escapeHtml(l.brand)})</span>` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #333333;font-size:13px;color:#cccccc;text-align:center;">${l.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #333333;font-size:13px;color:#cccccc;text-align:right;">${money(l.price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #333333;font-size:13px;color:#ffffff;text-align:right;font-weight:700;">${money(l.lineSubtotal)}</td>
      </tr>`
    )
    .join("");

  const subject = `🛍️ Nuevo pedido VIBE ${orderNumber}`;

  const text = [
    "NUEVO PEDIDO VIBE",
    `Número de pedido: ${orderNumber}`,
    `Fecha/hora: ${dateLabel}`,
    `Estado: ${order.status || "received"}`,
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
    "Notas:",
    notes || "Ninguna",
    "",
    "Productos:",
    rowsText,
    "",
    `Total: ${money(order.total)}`,
  ].join("\n");

  const html = `<div style="background:#111111;padding:28px 16px;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 24px;background:${BRAND.pink};">
          <p style="margin:0;color:#ffffff;font-size:16px;font-weight:800;">🛍️ NUEVO PEDIDO VIBE</p>
          <p style="margin:2px 0 0;color:#ffffff;font-size:13px;">${orderNumber} · ${dateLabel}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px 0;">
          <p style="margin:0 0 10px;font-size:13px;color:#ffffff;line-height:1.8;">
            <strong style="color:#999999;">Cliente:</strong> ${escapeHtml(order.customer_name)}<br>
            <strong style="color:#999999;">WhatsApp:</strong> ${escapeHtml(order.customer_phone)}<br>
            <strong style="color:#999999;">Email:</strong> ${escapeHtml(order.customer_email)}<br>
            <strong style="color:#999999;">Ciudad:</strong> ${escapeHtml(order.customer_city)}<br>
            <strong style="color:#999999;">Dirección:</strong> ${escapeHtml(order.customer_address)}<br>
            <strong style="color:#999999;">Notas:</strong> ${notes ? escapeHtml(notes) : "Ninguna"}<br>
            <strong style="color:#999999;">Estado:</strong> ${escapeHtml(order.status || "received")}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px;text-align:right;">
          <p style="margin:0;font-size:15px;font-weight:800;color:#ffffff;">Total: ${money(order.total)}</p>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, text, html };
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
      // Diagnóstico Fase 39.1 — Resend siempre devuelve un JSON
      // {name, message} explicando la causa exacta del rechazo (dominio
      // no verificado, remitente no permitido, etc.) — nunca contiene la
      // API key ni ningún secreto, así que es seguro loguearlo completo
      // para poder diagnosticar sin adivinar. Nunca se expone en la
      // respuesta al cliente, solo en los logs del servidor.
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

// Fase 39.2 — aviso interno a VIBE. ORDERS_NOTIFICATION_EMAIL es una
// variable de entorno separada de EMAIL_FROM_ADDRESS (esa es el
// remitente transaccional; esta es el buzón real de VIBE que debe
// recibir el aviso) — nunca un valor hardcodeado en el código.
async function sendInternalOrderNotificationEmail(order, fetchImpl = fetch) {
  const to = process.env.ORDERS_NOTIFICATION_EMAIL;
  if (!to) {
    console.error("[orders/email] No configurado: falta ORDERS_NOTIFICATION_EMAIL. No se envía el aviso interno del pedido (el pedido queda registrado igual).");
    return { sent: false, reason: "ORDERS_NOTIFICATION_EMAIL_NOT_CONFIGURED" };
  }
  const { subject, html, text } = buildInternalOrderEmail(order);
  return sendEmail({ to, subject, html, text }, fetchImpl);
}

module.exports = { buildOrderEmail, buildInternalOrderEmail, sendEmail, sendOrderConfirmationEmail, sendInternalOrderNotificationEmail };
