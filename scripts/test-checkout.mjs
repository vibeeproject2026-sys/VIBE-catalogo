// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-checkout.mjs
//
// js/checkout.js has zero imports, so it loads directly via a data: URL
// (same technique as test-taxonomy.mjs/test-url-state.mjs).

import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
const { computeOrderSummary, validatePhone, validateCheckoutForm, buildWhatsAppMessage, buildWhatsAppUrl } = await import(
  "data:text/javascript," + encodeURIComponent(src)
);

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

console.log("validateCheckoutForm (Fase 29 — TEST 7/8: campos obligatorios)");
test("todo vacío produce un error por cada campo obligatorio, nunca un mensaje genérico único", () => {
  const { valid, errors } = validateCheckoutForm({});
  assert.equal(valid, false);
  assert.deepEqual(Object.keys(errors).sort(), ["address", "city", "name", "phone"]);
});
test("con todos los campos obligatorios completos y un teléfono válido, es válido", () => {
  const { valid, errors } = validateCheckoutForm({ name: "Ana", phone: "3001234567", city: "Bogotá", address: "Calle 1 # 2-3" });
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});
test("un teléfono con formato inválido se rechaza específicamente (no como campo vacío)", () => {
  const { valid, errors } = validateCheckoutForm({ name: "Ana", phone: "abc", city: "Bogotá", address: "Calle 1" });
  assert.equal(valid, false);
  assert.equal(errors.phone, "Ingresa un número de WhatsApp válido.");
});
test("observaciones nunca es obligatorio (no aparece en errors aunque falte)", () => {
  const { errors } = validateCheckoutForm({ name: "Ana", phone: "3001234567", city: "Bogotá", address: "Calle 1" });
  assert.ok(!("notes" in errors));
});

console.log("buildWhatsAppMessage (Fase 29 — TEST 10/11/12/13/14/15/16/17)");
const summary = computeOrderSummary([
  { productId: 56, name: "Makeup Brush Set", variantName: "Único", price: 18000, quantity: 2 },
  { productId: 7, name: "Soft Vibe Lip", variantName: "Berry", price: 62900, quantity: 1 },
]);
const customer = { name: "Ana Ramírez", phone: "3001234567", city: "Medellín", address: "Cra 45 # 10-20", notes: "Entregar en la tarde" };
const message = buildWhatsAppMessage(summary, customer);

test("contiene los nombres reales de los productos del carrito", () => {
  assert.ok(message.includes("Makeup Brush Set"));
  assert.ok(message.includes("Soft Vibe Lip — Berry"));
});
test("contiene las cantidades correctas de cada línea", () => {
  assert.ok(message.includes("Cantidad: 2"));
  assert.ok(message.includes("Cantidad: 1"));
});
test("contiene los precios unitarios y subtotales correctos, formateados como dinero", () => {
  const moneyFmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  assert.ok(message.includes(`Precio: ${moneyFmt(18000)}`));
  assert.ok(message.includes(`Subtotal: ${moneyFmt(36000)}`));
});
test("contiene el total correcto (suma real, no inventado)", () => {
  assert.equal(summary.total, 18000 * 2 + 62900);
  const moneyFmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  assert.ok(message.includes(`*TOTAL: ${moneyFmt(summary.total)}*`));
});
test("contiene los datos del cliente tal como los escribió", () => {
  assert.ok(message.includes("Ana Ramírez"));
  assert.ok(message.includes("3001234567"));
  assert.ok(message.includes("Medellín"));
  assert.ok(message.includes("Cra 45 # 10-20"));
  assert.ok(message.includes("Entregar en la tarde"));
});
test("sin observaciones, el mensaje lo dice explícitamente en vez de dejar la sección vacía", () => {
  const m = buildWhatsAppMessage(summary, { ...customer, notes: "" });
  assert.ok(m.includes("Ninguna"));
});
test("nunca contiene stock, costos ni ningún término interno del POS", () => {
  const forbidden = ["stock", "cost_base", "cost_pack", "min_stock", "inventario"];
  forbidden.forEach((w) => assert.ok(!message.toLowerCase().includes(w), `no debería contener "${w}"`));
});
test("nunca contiene secretos ni tokens (defensa adicional, no solo confianza en que nunca lleguen aquí)", () => {
  const forbidden = ["SUPABASE_SERVICE_ROLE_KEY", "ADMIN_API_TOKEN", "sbp_", "eyJhbGciOi"];
  forbidden.forEach((w) => assert.ok(!message.includes(w), `no debería contener "${w}"`));
});
test("una línea no disponible queda fuera del mensaje enviado a WhatsApp", () => {
  const withUnavailable = computeOrderSummary([
    { productId: 1, name: "Disponible ahora", variantName: "Único", price: 10000, quantity: 1, unavailable: false },
    { productId: 2, name: "Ya no disponible", variantName: "Único", price: 20000, quantity: 1, unavailable: true },
  ]);
  const m = buildWhatsAppMessage(withUnavailable, customer);
  assert.ok(m.includes("Disponible ahora"));
  assert.ok(!m.includes("Ya no disponible"));
});

console.log("buildWhatsAppUrl (Fase 29 — TEST sección 10: enlace estándar wa.me)");
test("arma un enlace wa.me con solo dígitos, sin importar cómo venga formateado el número", () => {
  const url = buildWhatsAppUrl("+57 300 123 4567", "hola");
  assert.equal(url, "https://wa.me/573001234567?text=hola");
});
test("codifica el mensaje correctamente en la URL", () => {
  const url = buildWhatsAppUrl("573001234567", "línea 1\nlínea 2 & más");
  assert.ok(url.includes(encodeURIComponent("línea 1\nlínea 2 & más")));
});

console.log("WHATSAPP_NUMBER configurado (Fase 29.1 — número oficial de VIBE)");
const OFFICIAL_WHATSAPP_NUMBER = "573143490825"; // +57 314 349 0825 normalizado
test("app.js ya no contiene el placeholder de la Fase 29", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(!appSrc.includes("57XXXXXXXXXX"), "el placeholder 57XXXXXXXXXX no debería seguir en el código");
});
test("WHATSAPP_NUMBER en app.js está normalizado: solo dígitos, sin +/espacios/guiones/paréntesis", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const m = appSrc.match(/const WHATSAPP_NUMBER = "([^"]*)"/);
  assert.ok(m, "no se encontró la constante WHATSAPP_NUMBER en app.js");
  assert.equal(m[1], OFFICIAL_WHATSAPP_NUMBER);
  assert.match(m[1], /^\d+$/);
});
test("la guarda que bloquea WhatsApp sin número configurado sigue presente (sección 10 de la Fase 29.1)", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(appSrc.includes('WHATSAPP_NUMBER.includes("X")'), "la guarda contra el placeholder debe seguir en el código");
});
test("el número oficial normalizado genera la URL wa.me correcta", () => {
  const url = buildWhatsAppUrl(OFFICIAL_WHATSAPP_NUMBER, "hola");
  assert.equal(url, "https://wa.me/573143490825?text=hola");
});
test("el número oficial completo nunca aparece dentro de un console.log/warn/error de app.js (no se loguea innecesariamente)", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const consoleCalls = appSrc.match(/console\.(log|error|warn|info)\([^;]*?\);/gs) || [];
  consoleCalls.forEach((call) => {
    assert.ok(!call.includes("WHATSAPP_NUMBER"), `un console.* no debería referenciar WHATSAPP_NUMBER: ${call}`);
    assert.ok(!call.includes(OFFICIAL_WHATSAPP_NUMBER), `un console.* no debería imprimir el número completo: ${call}`);
  });
});

console.log("sección 19 — abrir WhatsApp nunca afirma una compra/pago confirmado (guarda estático de regresión)");
test("ni checkout.js ni app.js contienen frases que afirmen pedido/pago confirmado", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const forbidden = ["pedido confirmado", "pago recibido", "compra exitosa", "reserva confirmada", "stock garantizado"];
  const haystack = (src + appSrc).toLowerCase();
  forbidden.forEach((phrase) => assert.ok(!haystack.includes(phrase), `no debería afirmar "${phrase}"`));
});
test("app.js nunca vacía el carrito automáticamente como parte de abrir WhatsApp (sección 13)", () => {
  const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const start = appSrc.indexOf('$("#checkoutDialog").addEventListener("submit"');
  const end = appSrc.indexOf("renderCheckoutConfirmation();", start);
  assert.ok(start !== -1 && end !== -1, "no se encontró el handler de submit del checkout");
  const submitBlock = appSrc.slice(start, end);
  assert.ok(!submitBlock.includes("clearCart()"), "el flujo de envío no debe llamar a clearCart() automáticamente");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
