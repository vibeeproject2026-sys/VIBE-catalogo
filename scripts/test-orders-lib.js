// Runs with plain Node, no network, no real credentials:
//   node scripts/test-orders-lib.js
//
// Pure-logic tests for api/orders/_lib/{validate,email,whatsappNotify}.js.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const { validatePhone, isValidEmail, isValidQuantity, validateOrderPayload } = require("../api/orders/_lib/validate");
const { buildOrderEmail, buildInternalOrderEmail, sendEmail, sendOrderConfirmationEmail, sendInternalOrderNotificationEmail } = require("../api/orders/_lib/email");
const { buildOrderNotificationMessage, sendWhatsAppNotification } = require("../api/orders/_lib/whatsappNotify");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const k of Object.keys(vars)) {
    if (vars[k] === undefined) delete process.env[k];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  })();
}

const FAKE_ORDER = {
  id: 42,
  created_at: "2026-09-27T15:30:00.000Z",
  customer_name: "Ana Cliente",
  customer_phone: "3001234567",
  customer_email: "ana@example.com",
  customer_city: "Bogotá",
  customer_address: "Calle 123 #45-67",
  customer_notes: "Entregar en portería",
  items: [
    { productId: 1, variantId: "default", name: "Rubor líquido", variantName: "Único", brand: "VIBE", sku: null, quantity: 2, price: 15000, lineSubtotal: 30000 },
  ],
  total: 30000,
};

async function main() {
  console.log("validatePhone / isValidEmail / isValidQuantity");

  test("validatePhone acepta un celular colombiano de 10 dígitos", () => {
    assert.equal(validatePhone("3001234567"), true);
  });
  test("validatePhone acepta +57 con espacios/guiones", () => {
    assert.equal(validatePhone("+57 300-123-4567"), true);
  });
  test("validatePhone rechaza algo demasiado corto", () => {
    assert.equal(validatePhone("123"), false);
  });
  test("validatePhone rechaza vacío", () => {
    assert.equal(validatePhone(""), false);
  });

  test("isValidEmail acepta un correo normal", () => {
    assert.equal(isValidEmail("ana@example.com"), true);
  });
  test("isValidEmail rechaza sin @", () => {
    assert.equal(isValidEmail("ana.example.com"), false);
  });
  test("isValidEmail rechaza sin dominio con punto", () => {
    assert.equal(isValidEmail("ana@example"), false);
  });
  test("isValidEmail rechaza vacío", () => {
    assert.equal(isValidEmail(""), false);
  });

  test("isValidQuantity acepta enteros positivos razonables", () => {
    assert.equal(isValidQuantity(1), true);
    assert.equal(isValidQuantity(50), true);
  });
  test("isValidQuantity rechaza cero, negativos, decimales y valores absurdos", () => {
    assert.equal(isValidQuantity(0), false);
    assert.equal(isValidQuantity(-1), false);
    assert.equal(isValidQuantity(1.5), false);
    assert.equal(isValidQuantity(999), false);
  });

  // Tripwire de deriva: validatePhone acá es una duplicación intencional
  // de js/checkout.js (ver comentario en validate.js) — si algún cambio
  // futuro toca una implementación sin la otra, este test lo revela.
  console.log("\nvalidatePhone — paridad con js/checkout.js (tripwire de deriva)");
  await test("validatePhone (server) y validatePhone (cliente, js/checkout.js) coinciden para la misma tabla de casos", async () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "checkout.js"), "utf8");
    const clientModule = await import("data:text/javascript," + encodeURIComponent(src));
    const cases = ["3001234567", "+57 300 123 4567", "123", "", "12345678901234", "3001234", "300-123-4567"];
    for (const c of cases) {
      assert.equal(validatePhone(c), clientModule.validatePhone(c), `diverge para el caso "${c}"`);
    }
  });

  console.log("\nvalidateOrderPayload");
  const validBody = {
    customer: { name: "Ana", phone: "3001234567", email: "ana@example.com", city: "Bogotá", address: "Calle 123" },
    contactConsent: true,
    items: [{ productId: 1, quantity: 1 }],
  };

  test("payload completo y válido -> valid true, sin errores", () => {
    const { valid, errors } = validateOrderPayload(validBody);
    assert.equal(valid, true);
    assert.deepEqual(errors, {});
  });

  test("sin contactConsent -> rechazado con error contactConsent, nunca aceptado implícitamente", () => {
    const { valid, errors } = validateOrderPayload({ ...validBody, contactConsent: false });
    assert.equal(valid, false);
    assert.ok(errors.contactConsent);
  });

  test("contactConsent ausente (no solo false) -> también rechazado", () => {
    const { contactConsent, ...rest } = validBody;
    const { valid, errors } = validateOrderPayload(rest);
    assert.equal(valid, false);
    assert.ok(errors.contactConsent);
  });

  test("sin email -> rechazado con error email", () => {
    const { valid, errors } = validateOrderPayload({ ...validBody, customer: { ...validBody.customer, email: "" } });
    assert.equal(valid, false);
    assert.ok(errors.email);
  });

  test("email con forma inválida -> rechazado", () => {
    const { valid, errors } = validateOrderPayload({ ...validBody, customer: { ...validBody.customer, email: "no-es-email" } });
    assert.equal(valid, false);
    assert.ok(errors.email);
  });

  test("carrito vacío -> rechazado con error items", () => {
    const { valid, errors } = validateOrderPayload({ ...validBody, items: [] });
    assert.equal(valid, false);
    assert.ok(errors.items);
  });

  test("cantidad inválida en un item -> rechazado con error items", () => {
    const { valid, errors } = validateOrderPayload({ ...validBody, items: [{ productId: 1, quantity: 0 }] });
    assert.equal(valid, false);
    assert.ok(errors.items);
  });

  console.log("\nbuildOrderEmail — contenido honesto (Fase 39, sección 6)");
  test("incluye 'PEDIDO RECIBIDO' y el número de pedido real", () => {
    const { text, html } = buildOrderEmail(FAKE_ORDER);
    assert.ok(text.includes("PEDIDO RECIBIDO"));
    assert.ok(text.includes("#42"));
    assert.ok(html.includes("#42"));
  });
  test("incluye productos/cantidad/precio/subtotal/total/nombre/ciudad/dirección", () => {
    const { text } = buildOrderEmail(FAKE_ORDER);
    assert.ok(text.includes("Rubor líquido"));
    assert.ok(text.includes("Ana Cliente"));
    assert.ok(text.includes("Bogotá"));
    assert.ok(text.includes("Calle 123 #45-67"));
    assert.ok(text.includes("$30.000") || text.includes("30.000"));
  });
  test("nunca afirma pedido pagado/confirmado/reserva confirmada/enviado/en camino/compra finalizada", () => {
    const { text, html } = buildOrderEmail(FAKE_ORDER);
    for (const forbidden of [
      "pedido confirmado",
      "pago confirmado",
      "pago recibido",
      "compra exitosa",
      "compra finalizada",
      "reserva confirmada",
      "stock garantizado",
      "pedido enviado",
      "pedido en camino",
    ]) {
      assert.ok(!text.toLowerCase().includes(forbidden), `el texto contiene "${forbidden}"`);
      assert.ok(!html.toLowerCase().includes(forbidden), `el html contiene "${forbidden}"`);
    }
  });
  test("el asunto menciona el pedido recibido y el número real (item 1 del checklist)", () => {
    const { subject } = buildOrderEmail(FAKE_ORDER);
    assert.equal(subject, "Recibimos tu pedido #42 — VIBE");
  });
  test("contiene indicación de contacto por WhatsApp (item 10)", () => {
    const { text, html } = buildOrderEmail(FAKE_ORDER);
    assert.ok(text.toLowerCase().includes("whatsapp"));
    assert.ok(html.toLowerCase().includes("whatsapp"));
  });
  test("contiene marca del producto cuando existe, y el bloque '¿Qué sigue?' con sus 4 pasos", () => {
    const { text, html } = buildOrderEmail(FAKE_ORDER);
    assert.ok(text.includes("(VIBE)"));
    assert.ok(html.includes(">VIBE<") || html.includes("VIBE</span>"));
    for (const step of ["Recibimos tu pedido.", "Revisamos disponibilidad.", "Te contactaremos por WhatsApp al número registrado.", "Coordinaremos contigo los siguientes pasos."]) {
      assert.ok(text.includes(step), `falta el paso "${step}" en el texto`);
      assert.ok(html.includes(step), `falta el paso "${step}" en el html`);
    }
  });
  test("tiene versión text/plain completa, no solo html (item 19)", () => {
    const { text } = buildOrderEmail(FAKE_ORDER);
    assert.ok(text.length > 200);
    assert.ok(!text.includes("<"), "el texto plano no debería contener marcado HTML");
  });
  test("los datos dinámicos del cliente quedan escapados en el HTML (item 11) — nunca se puede inyectar markup vía nombre/ciudad/dirección/notas", () => {
    const malicious = {
      ...FAKE_ORDER,
      customer_name: `Ana "<script>alert(1)</script>" & Cía`,
      customer_notes: `<img src=x onerror=alert(1)> & "notas"`,
    };
    const { html } = buildOrderEmail(malicious);
    assert.ok(!html.includes("<script>"), "el HTML no debería contener un <script> sin escapar");
    assert.ok(!html.includes("<img src=x onerror"), "el HTML no debería contener el onerror sin escapar");
    assert.ok(html.includes("&lt;script&gt;"), "el nombre escapado debería aparecer como entidad HTML");
    assert.ok(html.includes("&amp;"), "el & debería quedar escapado");
  });

  console.log("\nbuildInternalOrderEmail — aviso interno a VIBE (Fase 39.2, sección 4) — distinto del correo del cliente");
  test("el asunto es el prescrito por el brief, con emoji y número real", () => {
    const { subject } = buildInternalOrderEmail(FAKE_ORDER);
    assert.equal(subject, "🛍️ Nuevo pedido VIBE #42");
  });
  test("contiene todos los campos internos pedidos: número, fecha, cliente, WhatsApp, email, ciudad, dirección, notas, productos, total, estado", () => {
    const { text } = buildInternalOrderEmail(FAKE_ORDER);
    for (const expected of [
      "NUEVO PEDIDO VIBE",
      "#42",
      "Ana Cliente",
      "3001234567",
      "ana@example.com",
      "Bogotá",
      "Calle 123 #45-67",
      "Entregar en portería",
      "Rubor líquido",
      "30.000",
      "received",
    ]) {
      assert.ok(text.includes(expected), `falta "${expected}" en el correo interno`);
    }
  });
  test("es un correo claramente distinto del correo del cliente (item 13) — ni el asunto ni el cuerpo coinciden", () => {
    const clientEmail = buildOrderEmail(FAKE_ORDER);
    const internalEmail = buildInternalOrderEmail(FAKE_ORDER);
    assert.notEqual(clientEmail.subject, internalEmail.subject);
    assert.ok(!internalEmail.text.includes("¿QUÉ SIGUE?"), "el correo interno no debería tener el copy de marca del cliente");
    assert.ok(!clientEmail.text.includes("NUEVO PEDIDO VIBE"), "el correo del cliente no debería tener el encabezado operativo interno");
  });
  test("el correo interno también tiene versión text/plain (item 19) y escapa datos dinámicos (item 11)", () => {
    const { text } = buildInternalOrderEmail(FAKE_ORDER);
    assert.ok(text.length > 100);
    const malicious = { ...FAKE_ORDER, customer_name: `<script>alert(1)</script>` };
    const { html } = buildInternalOrderEmail(malicious);
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  console.log("\nsendEmail — preparado, nunca simulado");
  await test("sin RESEND_API_KEY/EMAIL_FROM_ADDRESS -> {sent:false, reason:EMAIL_PROVIDER_NOT_CONFIGURED}, nunca lanza", async () => {
    await withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM_ADDRESS: undefined }, async () => {
      const result = await sendEmail({ to: "a@b.com", subject: "x", html: "x", text: "x" });
      assert.deepEqual(result, { sent: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" });
    });
  });
  await test("con credenciales y el proveedor respondiendo ok -> {sent:true}", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibe.test" }, async () => {
      const result = await sendEmail({ to: "a@b.com", subject: "x", html: "x", text: "x" }, async () => ({ ok: true, status: 200 }));
      assert.deepEqual(result, { sent: true });
    });
  });
  await test("con credenciales pero el proveedor falla -> {sent:false, reason:EMAIL_SEND_FAILED}, nunca lanza", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibe.test" }, async () => {
      const result = await sendEmail({ to: "a@b.com", subject: "x", html: "x", text: "x" }, async () => ({ ok: false, status: 500 }));
      assert.deepEqual(result, { sent: false, reason: "EMAIL_SEND_FAILED" });
    });
  });
  await test("un fallo de Resend sin método .text() en la respuesta no rompe el diagnóstico (mock defensivo)", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibe.test" }, async () => {
      const result = await sendEmail({ to: "a@b.com", subject: "x", html: "x", text: "x" }, async () => ({ ok: false, status: 403 }));
      assert.deepEqual(result, { sent: false, reason: "EMAIL_SEND_FAILED" });
    });
  });
  await test("el cuerpo del error real de Resend (403 dominio no verificado) se lee para diagnóstico, sin romper el flujo", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "onboarding@resend.dev" }, async () => {
      const resendErrorBody = JSON.stringify({
        statusCode: 403,
        message: "You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.",
        name: "validation_error",
      });
      const result = await sendEmail({ to: "cliente-real@gmail.com", subject: "x", html: "x", text: "x" }, async () => ({
        ok: false,
        status: 403,
        text: async () => resendErrorBody,
      }));
      assert.deepEqual(result, { sent: false, reason: "EMAIL_SEND_FAILED" });
    });
  });

  console.log("\nsendOrderConfirmationEmail — destinatario/remitente reales (items 2/3 del checklist)");
  await test("el destinatario es siempre order.customer_email, el remitente siempre EMAIL_FROM_ADDRESS", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "VIBE Beauty <pedidos@vibebeautycol.com>" }, async () => {
      let capturedPayload = null;
      await sendOrderConfirmationEmail(FAKE_ORDER, async (url, opts) => {
        capturedPayload = JSON.parse(opts.body);
        return { ok: true, status: 200 };
      });
      assert.equal(capturedPayload.to, "ana@example.com");
      assert.equal(capturedPayload.from, "VIBE Beauty <pedidos@vibebeautycol.com>");
    });
  });

  console.log("\nsendInternalOrderNotificationEmail — aviso interno (item 12 del checklist)");
  await test("sin ORDERS_NOTIFICATION_EMAIL -> {sent:false, reason:ORDERS_NOTIFICATION_EMAIL_NOT_CONFIGURED}, nunca lanza, nunca llama a Resend", async () => {
    await withEnv({ RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibebeautycol.com", ORDERS_NOTIFICATION_EMAIL: undefined }, async () => {
      let fetchCalled = false;
      const result = await sendInternalOrderNotificationEmail(FAKE_ORDER, async () => {
        fetchCalled = true;
        return { ok: true, status: 200 };
      });
      assert.deepEqual(result, { sent: false, reason: "ORDERS_NOTIFICATION_EMAIL_NOT_CONFIGURED" });
      assert.equal(fetchCalled, false);
    });
  });
  await test("con ORDERS_NOTIFICATION_EMAIL configurado, el destinatario real es exactamente ese valor (nunca hardcodeado)", async () => {
    await withEnv(
      { RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibebeautycol.com", ORDERS_NOTIFICATION_EMAIL: "ana.vibe@example.com" },
      async () => {
        let capturedPayload = null;
        const result = await sendInternalOrderNotificationEmail(FAKE_ORDER, async (url, opts) => {
          capturedPayload = JSON.parse(opts.body);
          return { ok: true, status: 200 };
        });
        assert.deepEqual(result, { sent: true });
        assert.equal(capturedPayload.to, "ana.vibe@example.com");
      }
    );
  });
  await test("si Resend falla al enviar el aviso interno, nunca lanza (item 15/17: el pedido/checkout no debe romperse)", async () => {
    await withEnv(
      { RESEND_API_KEY: "re_test", EMAIL_FROM_ADDRESS: "pedidos@vibebeautycol.com", ORDERS_NOTIFICATION_EMAIL: "ana.vibe@example.com" },
      async () => {
        const result = await sendInternalOrderNotificationEmail(FAKE_ORDER, async () => ({ ok: false, status: 500 }));
        assert.deepEqual(result, { sent: false, reason: "EMAIL_SEND_FAILED" });
      }
    );
  });

  console.log("\nbuildOrderNotificationMessage — aviso a VIBE (Fase 39, sección 7)");
  test("incluye el encabezado, número de pedido, datos del cliente e instrucción de contactar", () => {
    const msg = buildOrderNotificationMessage(FAKE_ORDER);
    assert.ok(msg.includes("NUEVO PEDIDO VIBE"));
    assert.ok(msg.includes("#42"));
    assert.ok(msg.includes("Ana Cliente"));
    assert.ok(msg.includes("3001234567"));
    assert.ok(msg.includes("ana@example.com"));
    assert.ok(msg.includes("Contactar al cliente"));
  });
  test("nunca afirma pedido pagado/confirmado", () => {
    const msg = buildOrderNotificationMessage(FAKE_ORDER).toLowerCase();
    for (const forbidden of ["pedido confirmado", "pago recibido", "compra exitosa"]) {
      assert.ok(!msg.includes(forbidden), `el mensaje contiene "${forbidden}"`);
    }
  });

  console.log("\nsendWhatsAppNotification — preparado, nunca simulado");
  await test("sin credenciales -> {sent:false, reason:WHATSAPP_PROVIDER_NOT_CONFIGURED}, nunca lanza", async () => {
    await withEnv({ WHATSAPP_BUSINESS_TOKEN: undefined, WHATSAPP_PHONE_NUMBER_ID: undefined, VIBE_WHATSAPP_NOTIFICATION_NUMBER: undefined }, async () => {
      const result = await sendWhatsAppNotification(FAKE_ORDER);
      assert.deepEqual(result, { sent: false, reason: "WHATSAPP_PROVIDER_NOT_CONFIGURED" });
    });
  });
  await test("con credenciales y Meta respondiendo ok -> {sent:true}", async () => {
    await withEnv(
      { WHATSAPP_BUSINESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123", VIBE_WHATSAPP_NOTIFICATION_NUMBER: "573000000000" },
      async () => {
        const result = await sendWhatsAppNotification(FAKE_ORDER, async () => ({ ok: true, status: 200 }));
        assert.deepEqual(result, { sent: true });
      }
    );
  });
  await test("con credenciales pero Meta falla -> {sent:false, reason:WHATSAPP_SEND_FAILED}, nunca lanza", async () => {
    await withEnv(
      { WHATSAPP_BUSINESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "123", VIBE_WHATSAPP_NOTIFICATION_NUMBER: "573000000000" },
      async () => {
        const result = await sendWhatsAppNotification(FAKE_ORDER, async () => ({ ok: false, status: 401 }));
        assert.deepEqual(result, { sent: false, reason: "WHATSAPP_SEND_FAILED" });
      }
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
