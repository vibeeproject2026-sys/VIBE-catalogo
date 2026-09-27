// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-checkout.mjs
//
// js/checkout.js has zero imports, so it loads directly via a data: URL
// (same technique as test-taxonomy.mjs/test-url-state.mjs).

import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
const { computeOrderSummary, validatePhone, validateCheckoutForm } = await import("data:text/javascript," + encodeURIComponent(src));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

console.log("computeOrderSummary (Fase 29 — TEST 1/2/3/5/9: carrito -> resumen)");
test("carrito vacío produce un resumen vacío con total 0", () => {
  assert.deepEqual(computeOrderSummary([]), { lines: [], total: 0 });
});
test("subtotal por línea = precio unitario x cantidad", () => {
  const r = computeOrderSummary([{ productId: 56, name: "Set de brochas", variantName: "Único", price: 18000, quantity: 3 }]);
  assert.equal(r.lines[0].lineSubtotal, 54000);
});
test("el total suma el subtotal de todas las líneas", () => {
  const r = computeOrderSummary([
    { productId: 1, name: "A", variantName: "Único", price: 10000, quantity: 2 },
    { productId: 2, name: "B", variantName: "Único", price: 5000, quantity: 1 },
  ]);
  assert.equal(r.total, 25000);
});
test("el resumen refleja exactamente lo que trae el carrito (nada inventado, nada omitido)", () => {
  const cart = [{ productId: 56, name: "Makeup Brush Set", brand: null, variantName: "Único", price: 18000, quantity: 1, image: "x.jpg" }];
  const r = computeOrderSummary(cart);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].name, "Makeup Brush Set");
  assert.equal(r.lines[0].price, 18000);
});
test("una línea marcada 'unavailable' no suma al total, aunque siga en la lista", () => {
  const r = computeOrderSummary([
    { productId: 1, name: "Disponible", variantName: "Único", price: 10000, quantity: 1, unavailable: false },
    { productId: 2, name: "Agotado ahora", variantName: "Único", price: 20000, quantity: 1, unavailable: true },
  ]);
  assert.equal(r.total, 10000);
  assert.equal(r.lines.length, 2); // sigue visible para que la UI la muestre y permita quitarla
});
test("el precio de la línea ya es el efectivo (promo si aplica) — computeOrderSummary nunca recalcula nada", () => {
  // originalPrice=25000 pero price=18000 (promo ya resuelta antes de llegar aquí, ver cart.js)
  const r = computeOrderSummary([{ productId: 1, name: "En promo", variantName: "Único", price: 18000, originalPrice: 25000, quantity: 2 }]);
  assert.equal(r.lines[0].lineSubtotal, 36000);
});

console.log("validatePhone (Fase 29 — TEST 8: teléfono, formatos razonables)");
test("acepta un celular colombiano típico (10 dígitos)", () => {
  assert.equal(validatePhone("3001234567"), true);
});
test("acepta el mismo número con +57, espacios y guiones", () => {
  assert.equal(validatePhone("+57 300 123 4567"), true);
  assert.equal(validatePhone("300-123-4567"), true);
});
test("rechaza vacío o solo un par de dígitos", () => {
  assert.equal(validatePhone(""), false);
  assert.equal(validatePhone("12345"), false);
});
test("rechaza algo claramente no numérico", () => {
  assert.equal(validatePhone("no tengo whatsapp"), false);
});

console.log("validateCheckoutForm (Fase 39 — sección 1/2/3: nombre/WhatsApp/email/ciudad/dirección + autorización de contacto)");
const VALID_FORM = {
  name: "Ana",
  phone: "3001234567",
  email: "ana@example.com",
  city: "Bogotá",
  address: "Calle 1 # 2-3",
  contactConsent: true,
};
test("todo vacío produce un error por cada campo obligatorio, nunca un mensaje genérico único", () => {
  const { valid, errors } = validateCheckoutForm({});
  assert.equal(valid, false);
  assert.deepEqual(Object.keys(errors).sort(), ["address", "city", "contactConsent", "email", "name", "phone"]);
});
test("con todos los campos obligatorios completos, teléfono/email válidos y consentimiento, es válido", () => {
  const { valid, errors } = validateCheckoutForm(VALID_FORM);
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});
test("un teléfono con formato inválido se rechaza específicamente (no como campo vacío)", () => {
  const { valid, errors } = validateCheckoutForm({ ...VALID_FORM, phone: "abc" });
  assert.equal(valid, false);
  assert.equal(errors.phone, "Ingresa un número de WhatsApp válido.");
});
test("un email con formato inválido se rechaza específicamente", () => {
  const { valid, errors } = validateCheckoutForm({ ...VALID_FORM, email: "no-es-un-correo" });
  assert.equal(valid, false);
  assert.equal(errors.email, "Ingresa un correo electrónico válido.");
});
test("sin autorización de contacto, se rechaza — nunca se asume por omisión", () => {
  const { contactConsent, ...withoutConsent } = VALID_FORM;
  const rejectedFalse = validateCheckoutForm({ ...VALID_FORM, contactConsent: false });
  const rejectedAbsent = validateCheckoutForm(withoutConsent);
  assert.equal(rejectedFalse.valid, false);
  assert.ok(rejectedFalse.errors.contactConsent);
  assert.equal(rejectedAbsent.valid, false);
  assert.ok(rejectedAbsent.errors.contactConsent);
});
test("observaciones nunca es obligatorio (no aparece en errors aunque falte)", () => {
  const { errors } = validateCheckoutForm(VALID_FORM);
  assert.ok(!("notes" in errors));
});

console.log("Fase 39 — el checkout ya no depende de WhatsApp (sección 4/10: reemplaza la wa.me/window.open del cliente)");
const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

// El submit handler es async y anida varios objetos literales que
// terminan en "});" antes de su propio cierre real (el `fetch(url, {
// ... });` de adentro, por ejemplo) — un indexOf ingenuo del primer
// "});" trunca el bloque a la mitad. El cierre real es el que precede
// directamente a la siguiente función de nivel superior del archivo.
function extractSubmitHandlerSource() {
  const start = appSrc.indexOf('$("#checkoutDialog").addEventListener("submit"');
  const end = appSrc.indexOf("\nfunction renderCheckoutConfirmation", start);
  assert.ok(start !== -1 && end !== -1, "no se encontró el handler de submit del checkout");
  return appSrc.slice(start, end);
}

test("app.js ya no declara ninguna constante WHATSAPP_NUMBER", () => {
  assert.ok(!appSrc.includes("WHATSAPP_NUMBER"), "app.js no debería seguir teniendo la constante del número de WhatsApp");
});
test("app.js ya no importa buildWhatsAppMessage/buildWhatsAppUrl (retiradas de js/checkout.js)", () => {
  assert.ok(!appSrc.includes("buildWhatsAppMessage"));
  assert.ok(!appSrc.includes("buildWhatsAppUrl"));
});
test("js/checkout.js ya no exporta buildWhatsAppMessage/buildWhatsAppUrl", () => {
  assert.ok(!src.includes("export function buildWhatsAppMessage"));
  assert.ok(!src.includes("export function buildWhatsAppUrl"));
});
test("el submit del checkout nunca abre una URL wa.me ni llama a window.open", () => {
  const submitBlock = extractSubmitHandlerSource();
  assert.ok(!submitBlock.includes("window.open"), "el submit no debe abrir ninguna ventana/pestaña de WhatsApp");
  assert.ok(!submitBlock.includes("wa.me"), "el submit no debe construir ningún enlace wa.me");
});
test("el submit del checkout envía el pedido a /api/orders/create", () => {
  const submitBlock = extractSubmitHandlerSource();
  assert.ok(submitBlock.includes("/api/orders/create"), "el submit debe llamar al endpoint real de pedidos");
  assert.ok(submitBlock.includes("contactConsent"), "el submit debe mandar explícitamente contactConsent, nunca omitirlo");
});
test("el botón de envío dice literalmente 'ENVIAR PEDIDO' (nunca 'Comprar por WhatsApp')", () => {
  assert.ok(appSrc.includes("ENVIAR PEDIDO"), "falta el CTA 'ENVIAR PEDIDO'");
  assert.ok(!appSrc.toLowerCase().includes("comprar por whatsapp"), "no debería existir el CTA anterior");
});
test("la pantalla de confirmación depende de emailSent real, nunca de un copy fijo que asuma éxito", () => {
  const start = appSrc.indexOf("function checkoutConfirmationHtml");
  const end = appSrc.indexOf("\n}", appSrc.indexOf("function renderCheckoutForm", start));
  const block = appSrc.slice(start, appSrc.indexOf("\nfunction renderCheckoutForm", start));
  assert.ok(block.includes("order.emailSent"), "la confirmación debe ramificar según order.emailSent, no asumirlo");
});

console.log("Fase 39 — el carrito SÍ se vacía automáticamente, pero únicamente en la rama de éxito del pedido (invierte la Fase 29, sección 13)");
test("clearCart() se llama dentro del submit handler, después de que la respuesta del servidor fue exitosa", () => {
  const submitBlock = extractSubmitHandlerSource();
  const okIndex = submitBlock.indexOf("!res.ok");
  const clearIndex = submitBlock.indexOf("clearCart()");
  assert.ok(okIndex !== -1, "el submit debe revisar res.ok antes de decidir qué hacer");
  assert.ok(clearIndex !== -1, "el submit debe llamar a clearCart() en la rama de éxito");
  assert.ok(clearIndex > okIndex, "clearCart() debe estar después de la verificación de éxito, nunca antes/incondicional");
});
test("clearCart() nunca se llama dentro de la rama de error (!res.ok) ni del catch de red", () => {
  const submitBlock = extractSubmitHandlerSource();
  const errorBranchStart = submitBlock.indexOf("if (!res.ok)");
  const errorBranchEnd = submitBlock.indexOf("}", errorBranchStart);
  const errorBranch = submitBlock.slice(errorBranchStart, errorBranchEnd);
  assert.ok(!errorBranch.includes("clearCart()"), "la rama de error no debe vaciar el carrito");
  const catchStart = submitBlock.indexOf("} catch (err)");
  const catchBlock = submitBlock.slice(catchStart);
  assert.ok(!catchBlock.includes("clearCart()"), "el catch de red no debe vaciar el carrito");
});

console.log("sección 19 — nunca afirma una compra/pago confirmado (guarda estático de regresión, extendida a las plantillas server-side)");
test("ni checkout.js, ni app.js, ni las plantillas de email/WhatsApp de VIBE contienen frases que afirmen pedido/pago confirmado", () => {
  const emailSrc = fs.readFileSync(new URL("../api/orders/_lib/email.js", import.meta.url), "utf8");
  const whatsappSrc = fs.readFileSync(new URL("../api/orders/_lib/whatsappNotify.js", import.meta.url), "utf8");
  const forbidden = ["pedido confirmado", "pago recibido", "compra exitosa", "reserva confirmada", "stock garantizado"];
  const haystack = (src + appSrc + emailSrc + whatsappSrc).toLowerCase();
  forbidden.forEach((phrase) => assert.ok(!haystack.includes(phrase), `no debería afirmar "${phrase}"`));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
