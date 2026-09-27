// Fase 29 — lógica pura del checkout: cálculo del resumen del pedido y
// validación del formulario. Misma disciplina que js/taxonomy.js y
// js/url-state.js: sin DOM, sin localStorage, sin red — app.js es el
// único que toca cart.js y el <dialog>. Nada aquí persiste datos del
// cliente en ningún lado; solo transforma lo que ya está en memoria.
//
// Fase 39 — el pedido ahora se envía a /api/orders/create (ver
// js/app.js) en vez de abrir WhatsApp desde el navegador:
// buildWhatsAppMessage/buildWhatsAppUrl se retiraron de este archivo (ya
// no tienen ningún llamador) — el mensaje de aviso a VIBE ahora se arma
// server-side, en api/orders/_lib/whatsappNotify.js, con una audiencia y
// un contenido distintos (aviso ENTRANTE a VIBE, no un mensaje en
// primera persona del cliente).

// Fase 29, sección 3: el total del pedido excluye cualquier línea marcada
// como no disponible (chequeo fresco de disponibilidad, hecho por
// app.js contra la API real antes de llamar a esta función) — nunca se
// cobra ni se ofrece algo que ya no existe. Las líneas no disponibles
// siguen apareciendo en el resultado (para que la UI las muestre y
// permita quitarlas), pero no suman al total ni al mensaje de WhatsApp.
export function computeOrderSummary(lines) {
  const shaped = (lines || []).map((l) => ({ ...l, lineSubtotal: l.price * l.quantity }));
  const total = shaped.filter((l) => !l.unavailable).reduce((sum, l) => sum + l.lineSubtotal, 0);
  return { lines: shaped, total };
}

// Teléfono: deliberadamente permisivo (sección 6 — "no asumir un único
// formato si existen formatos razonables"). No exige el formato exacto
// de un celular colombiano (3XXXXXXXXX); acepta cualquier cantidad de
// dígitos entre 7 y 13 una vez removidos espacios/guiones/paréntesis/
// prefijo +, lo que cubre celulares colombianos con o sin +57, y
// variaciones razonables sin inventar una única regla rígida.
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 13;
export function validatePhone(raw) {
  const digitsOnly = String(raw || "").replace(/\D/g, "");
  return digitsOnly.length >= PHONE_MIN_DIGITS && digitsOnly.length <= PHONE_MAX_DIGITS;
}

function isValidEmail(raw) {
  const value = String(raw || "").trim();
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Campos obligatorios (sección 1/2/3 del brief de Fase 39): nombre,
// WhatsApp, email, ciudad y dirección — lo mínimo real para coordinar
// una entrega y enviar la confirmación. Observaciones es el único campo
// opcional. `contactConsent` es la autorización de contacto (sección 3
// — exclusiva para gestionar ESTE pedido, nunca marketing/newsletter):
// debe llegar explícitamente en `true`, nunca asumida por ausencia.
// Devuelve un mensaje por campo, nunca un error genérico, para que la
// UI pueda mostrarlo junto al input exacto.
export function validateCheckoutForm({ name, phone, email, city, address, contactConsent } = {}) {
  const errors = {};
  if (!String(name || "").trim()) errors.name = "Ingresa tu nombre completo.";
  if (!String(phone || "").trim()) errors.phone = "Ingresa tu número de WhatsApp.";
  else if (!validatePhone(phone)) errors.phone = "Ingresa un número de WhatsApp válido.";
  if (!String(email || "").trim()) errors.email = "Ingresa tu correo electrónico.";
  else if (!isValidEmail(email)) errors.email = "Ingresa un correo electrónico válido.";
  if (!String(city || "").trim()) errors.city = "Ingresa tu ciudad.";
  if (!String(address || "").trim()) errors.address = "Ingresa tu dirección de entrega.";
  if (contactConsent !== true) errors.contactConsent = "Autoriza el contacto para poder enviar tu pedido.";
  return { valid: Object.keys(errors).length === 0, errors };
}

