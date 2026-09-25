// Fase 29 — lógica pura del checkout: cálculo del resumen del pedido,
// validación del formulario y construcción del mensaje/enlace de
// WhatsApp. Misma disciplina que js/taxonomy.js y js/url-state.js: sin
// DOM, sin localStorage, sin red — app.js es el único que toca cart.js,
// el <dialog> y window.open(). Nada aquí persiste datos del cliente en
// ningún lado; solo transforma lo que ya está en memoria.

function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

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

// Campos obligatorios (sección 4/6): nombre, WhatsApp, ciudad y
// dirección — lo mínimo real para coordinar una entrega. Observaciones
// es el único campo opcional. Devuelve un mensaje por campo, nunca un
// error genérico, para que la UI pueda mostrarlo junto al input exacto.
export function validateCheckoutForm({ name, phone, city, address } = {}) {
  const errors = {};
  if (!String(name || "").trim()) errors.name = "Ingresa tu nombre completo.";
  if (!String(phone || "").trim()) errors.phone = "Ingresa tu número de WhatsApp.";
  else if (!validatePhone(phone)) errors.phone = "Ingresa un número de WhatsApp válido.";
  if (!String(city || "").trim()) errors.city = "Ingresa tu ciudad.";
  if (!String(address || "").trim()) errors.address = "Ingresa tu dirección de entrega.";
  return { valid: Object.keys(errors).length === 0, errors };
}

function lineLabel(l) {
  const hasRealVariant = l.variantName && l.variantName !== "Único" && l.variantName !== "Default";
  return hasRealVariant ? `${l.name} — ${l.variantName}` : l.name;
}

// Sección 8 — el mensaje se arma siempre a partir de `summary` (ya
// calculado por computeOrderSummary desde el carrito real) y `customer`
// (lo que la clienta escribió en el formulario): nunca hay un producto,
// precio, cantidad o total fijo en este archivo. Las líneas no
// disponibles quedan fuera del mensaje — no tiene sentido pedir algo que
// la propia UI ya le pidió a la clienta que quitara.
export function buildWhatsAppMessage(summary, customer) {
  const availableLines = summary.lines.filter((l) => !l.unavailable);
  const productBlocks = availableLines
    .map((l) => `*${lineLabel(l)}*\nCantidad: ${l.quantity}\nPrecio: ${money(l.price)}\nSubtotal: ${money(l.lineSubtotal)}`)
    .join("\n\n");
  const notes = String((customer && customer.notes) || "").trim();

  return [
    "Hola VIBE ✨",
    "",
    "Quiero realizar el siguiente pedido:",
    "",
    productBlocks,
    "",
    `*TOTAL: ${money(summary.total)}*`,
    "",
    "Datos de entrega:",
    `Nombre: ${customer.name}`,
    `WhatsApp: ${customer.phone}`,
    `Ciudad: ${customer.city}`,
    `Dirección: ${customer.address}`,
    "",
    "Observaciones:",
    notes || "Ninguna",
    "",
    "Gracias 💗",
  ].join("\n");
}

// Sección 10 — mecanismo estándar wa.me (funciona en desktop y mobile sin
// ninguna librería nueva). Solo dígitos en el número: wa.me no acepta
// espacios, +, guiones ni paréntesis.
export function buildWhatsAppUrl(whatsappNumber, message) {
  const digits = String(whatsappNumber || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
