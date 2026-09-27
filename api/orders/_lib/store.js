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
    err.code = "SUPABASE_WRITE_ERROR";
    err.status = res.status;
    throw err;
  }

  return Array.isArray(body) ? body[0] : body;
}

// Best-effort: se llama DESPUÉS de haber respondido conceptualmente el
// pedido como exitoso (el insert ya ocurrió). Un fallo acá nunca debe
// propagarse como un error del pedido — el pedido ya existe y ya se le
// comunicó honestamente al cliente si el envío ocurrió o no en base a
// lo que de verdad pasó en este mismo request; esta actualización es
// solo para que el registro en Supabase quede consistente con eso.
async function markOrderNotifications(id, { emailSent, whatsappNotified }, env, fetchImpl = fetch) {
  try {
    const url = `${env.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`;
    await fetchImpl(url, {
      method: "PATCH",
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email_sent: emailSent, whatsapp_notified: whatsappNotified, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("[orders/store] No se pudo actualizar email_sent/whatsapp_notified del pedido " + id + ": " + (e && e.message ? e.message : e));
  }
}

module.exports = { insertOrder, markOrderNotifications };
