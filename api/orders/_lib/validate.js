// Fase 39 — validación del payload de un pedido nuevo.
//
// `validatePhone` es una duplicación intencional de js/checkout.js: no
// existe en este repo ningún precedente de que api/ importe algo desde
// js/ (siempre es al revés — el navegador llama a la API, nunca la
// función serverless importa el bundle del navegador), y una función
// dinámica `import()` de un módulo ESM fuera del árbol de api/ es un
// riesgo real de "funciona local, no se encuentra en el bundle" del
// empaquetador de Vercel. La lógica duplicada es mínima (un regex de
// largo de dígitos) — scripts/test-orders-lib.mjs incluye un test que
// compara ambas implementaciones lado a lado contra la misma tabla de
// casos, para que una diverja visiblemente si alguna cambia sin la otra.
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 13;
function validatePhone(raw) {
  const digitsOnly = String(raw || "").replace(/\D/g, "");
  return digitsOnly.length >= PHONE_MIN_DIGITS && digitsOnly.length <= PHONE_MAX_DIGITS;
}

// No existía ningún validador de email en este repo (ni cliente ni
// servidor) — deliberadamente simple: exige un solo "@" con algo antes
// y después, y al menos un "." en la parte del dominio. No pretende
// validar RFC 5322 completo, solo descartar entradas obviamente
// inválidas, mismo criterio que ya aplica validatePhone.
function isValidEmail(raw) {
  const value = String(raw || "").trim();
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const MAX_QUANTITY = 50;
function isValidQuantity(q) {
  return Number.isInteger(q) && q > 0 && q <= MAX_QUANTITY;
}

// Devuelve { valid, errors } igual que validateCheckoutForm en
// js/checkout.js (un mensaje por campo, nunca un error genérico) más la
// validación de items, que no tiene equivalente client-side porque el
// cliente nunca decide sola qué hay en su carrito.
function validateOrderPayload(body) {
  const errors = {};
  const customer = (body && body.customer) || {};

  if (!String(customer.name || "").trim()) errors.name = "Falta el nombre completo.";
  if (!String(customer.phone || "").trim()) errors.phone = "Falta el número de WhatsApp.";
  else if (!validatePhone(customer.phone)) errors.phone = "El número de WhatsApp no es válido.";
  if (!String(customer.email || "").trim()) errors.email = "Falta el correo electrónico.";
  else if (!isValidEmail(customer.email)) errors.email = "El correo electrónico no es válido.";
  if (!String(customer.city || "").trim()) errors.city = "Falta la ciudad.";
  if (!String(customer.address || "").trim()) errors.address = "Falta la dirección de entrega.";

  if (body && body.contactConsent !== true) {
    errors.contactConsent = "Falta la autorización de contacto.";
  }

  const items = Array.isArray(body && body.items) ? body.items : [];
  if (!items.length) {
    errors.items = "El carrito está vacío.";
  } else {
    const badItem = items.find((it) => !it || (it.productId === undefined || it.productId === null) || !isValidQuantity(it.quantity));
    if (badItem) errors.items = "Hay un producto o cantidad inválida en el carrito.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = { validatePhone, isValidEmail, isValidQuantity, validateOrderPayload, PHONE_MIN_DIGITS, PHONE_MAX_DIGITS, MAX_QUANTITY };
