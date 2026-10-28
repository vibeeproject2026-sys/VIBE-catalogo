// Runs with plain Node, no network, no real credentials:
//   node scripts/test-orders-internal-notification.js
//
// Fase 55 — trazabilidad del aviso interno a VIBE (email a
// ORDERS_NOTIFICATION_EMAIL), separado del email al cliente:
// - /api/orders/create guarda el resultado del aviso interno, comprueba
//   el PATCH de marcas y registra solo códigos (sin datos personales);
// - /api/admin/orders lista el estado (o avisa que falta la migración
//   0004) y permite reintentar SOLO el aviso interno, protegido.
// Supabase, Resend y Meta están simulados con un fetch falso: nunca se
// envía nada ni se toca producción.

const assert = require("assert/strict");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  // Fase 56 — el límite por IP (en memoria) se reinicia entre pruebas.
  require("../api/orders/_lib/guard").resetIpLimiter();
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

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

const BASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real",
  ADMIN_API_TOKEN: "admin-test-token",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM_ADDRESS: "VIBE <pedidos@vibe.test>",
  ORDERS_NOTIFICATION_EMAIL: "buzon-vibe@example.com",
  WHATSAPP_BUSINESS_TOKEN: undefined,
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  VIBE_WHATSAPP_NOTIFICATION_NUMBER: undefined,
};
const CUSTOMER = { name: "Clienta Prueba", phone: "3001112233", email: "clienta@example.com", city: "Bogotá", address: "Calle 1 # 2-3", notes: "" };
const PII = /clienta|3001112233|Calle 1|buzon-vibe|example\.com/i;

// Ejecuta fn con env + fetch simulados; registra todas las llamadas y logs.
async function run(envOverrides, routes, fn) {
  const env = { ...BASE_ENV, ...envOverrides };
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const calls = [];
  const logs = [];
  const originalFetch = global.fetch;
  const originalError = console.error;
  const originalLog = console.log;
  global.fetch = async (url, opts = {}) => {
    const call = { url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    return routes(call);
  };
  console.error = (...a) => logs.push(a.join(" "));
  console.log = (...a) => { const l = a.join(" "); if (l.startsWith("[")) logs.push(l); else originalLog(...a); };
  try {
    return await fn({ calls, logs });
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    console.log = originalLog;
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const ok = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
const resendTo = (calls) => calls.filter((c) => c.url.startsWith("https://api.resend.com")).map((c) => c.body.to);
const orderPatches = (calls) => calls.filter((c) => c.method === "PATCH" && c.url.includes("/rest/v1/orders"));

// Rutas de Supabase para crear un pedido; `resend(call)` y `patch(call)`
// deciden las respuestas de Resend y del PATCH de marcas.
function createRoutes({ resend = () => ok({ id: "x" }), patch = () => ok(undefined, 204) } = {}) {
  return (call) => {
    if (call.url.startsWith("https://api.resend.com")) return resend(call);
    if (call.url.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp nunca debe llamarse sin configuración");
    if (call.url.includes("/rest/v1/products")) return ok([{ id: 1, name: "Rubor", price: 15000, stock: 4, category: "Rostro", promo_active: false }]);
    if (call.url.includes("/rest/v1/catalog_metadata")) return ok([{ product_id: 1, published: true }]);
    // Fase 56 — conteo antispam por teléfono (solo ids).
    if (call.url.includes("/rest/v1/orders") && call.method === "GET") return ok([]);
    if (call.url.includes("/rest/v1/orders") && call.method === "POST") return ok([{ ...call.body, id: 77, created_at: "2026-10-27T15:00:00Z", status: "received" }], 201);
    if (call.url.includes("/rest/v1/orders") && call.method === "PATCH") return patch(call);
    throw new Error("ruta inesperada " + call.method + " " + call.url);
  };
}
const ORDER_BODY = { customer: CUSTOMER, contactConsent: true, items: [{ productId: 1, quantity: 2, variantName: "Único" }] };

async function create() {
  delete require.cache[require.resolve("../api/orders/create")];
  const handler = require("../api/orders/create");
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: JSON.parse(JSON.stringify(ORDER_BODY)) }, res);
  return res;
}

async function main() {
  console.log("/api/orders/create — aviso interno");

  await test("éxito: los dos emails van a destinatarios distintos y el aviso interno se guarda como 'accepted' (aparte de email_sent)", async () => {
    await run({}, createRoutes(), async ({ calls }) => {
      const res = await create();
      assert.equal(res.statusCode, 201);
      assert.deepEqual(resendTo(calls).sort(), ["buzon-vibe@example.com", "clienta@example.com"]);
      const [p] = orderPatches(calls);
      assert.equal(p.body.email_sent, true);
      assert.equal(p.body.internal_notification_status, "accepted");
      assert.equal(p.body.internal_notification_error, null);
      assert.ok(!Number.isNaN(Date.parse(p.body.internal_notification_at)));
    });
  });

  await test("aviso interno falla y el del cliente no: email_sent=true, interno='failed' con código saneado; el pedido sigue siendo 201", async () => {
    const resend = (c) => (c.body.to === "buzon-vibe@example.com" ? ok({ name: "validation_error", message: "rejected buzon-vibe@example.com" }, 403) : ok({ id: "x" }));
    await run({}, createRoutes({ resend }), async ({ calls }) => {
      const res = await create();
      assert.equal(res.statusCode, 201);
      const [p] = orderPatches(calls);
      assert.equal(p.body.email_sent, true);
      assert.equal(p.body.internal_notification_status, "failed");
      assert.equal(p.body.internal_notification_error, "HTTP_403:validation_error");
    });
  });

  await test("sin ORDERS_NOTIFICATION_EMAIL: interno='not_configured', sin llamar a Resend para VIBE", async () => {
    await run({ ORDERS_NOTIFICATION_EMAIL: undefined }, createRoutes(), async ({ calls }) => {
      const res = await create();
      assert.equal(res.statusCode, 201);
      assert.deepEqual(resendTo(calls), ["clienta@example.com"]);
      assert.equal(orderPatches(calls)[0].body.internal_notification_status, "not_configured");
    });
  });

  await test("fallo al guardar las marcas (HTTP 500): el pedido sigue siendo 201 y se registra el fallo sin datos personales", async () => {
    await run({}, createRoutes({ patch: () => ok({ message: "boom clienta@example.com" }, 500) }), async ({ logs }) => {
      const res = await create();
      assert.equal(res.statusCode, 201);
      assert.ok(logs.some((l) => /pedido #77: no se pudieron guardar las marcas de aviso \(HTTP 500\)/.test(l)), logs.join(" | "));
    });
  });

  await test("migración 0004 sin aplicar (PGRST204): reintenta sin las columnas nuevas y conserva email_sent/whatsapp_notified", async () => {
    const patch = (c) => ("internal_notification_status" in c.body ? ok({ code: "PGRST204", message: "Could not find the column" }, 400) : ok(undefined, 204));
    await run({}, createRoutes({ patch }), async ({ calls, logs }) => {
      const res = await create();
      assert.equal(res.statusCode, 201);
      const ps = orderPatches(calls);
      assert.equal(ps.length, 2);
      assert.deepEqual(Object.keys(ps[1].body).sort(), ["email_sent", "updated_at", "whatsapp_notified"]);
      assert.equal(ps[1].body.email_sent, true);
      assert.ok(logs.some((l) => /falta la migración 0004/.test(l)));
    });
  });

  await test("los logs de avisos solo llevan número de pedido, tipo, resultado y código (nunca correo, teléfono, nombre ni dirección)", async () => {
    const resend = (c) => (c.body.to === "buzon-vibe@example.com" ? ok({ name: "validation_error", message: "x buzon-vibe@example.com" }, 403) : ok({ id: "x" }));
    await run({}, createRoutes({ resend }), async ({ logs }) => {
      await create();
      const notify = logs.filter((l) => l.startsWith("[orders/notify]"));
      assert.equal(notify.length, 3);
      assert.ok(notify.some((l) => l === "[orders/notify] pedido=#77 aviso=cliente resultado=aceptado"));
      assert.ok(notify.some((l) => l === "[orders/notify] pedido=#77 aviso=interno resultado=fallido codigo=HTTP_403:validation_error"));
      assert.ok(notify.some((l) => /aviso=whatsapp resultado=no_configurado/.test(l)));
      for (const l of logs) assert.doesNotMatch(l, PII, l);
    });
  });

  await test("Fase 56 — los emails de un pedido nuevo llevan clave de idempotencia estable por pedido y destinatario", async () => {
    const keys = [];
    await run({}, createRoutes(), async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url, opts = {}) => {
        if (String(url).startsWith("https://api.resend.com")) keys.push(opts.headers["Idempotency-Key"]);
        return originalFetch(url, opts);
      };
      try {
        await create();
      } finally {
        global.fetch = originalFetch;
      }
    });
    assert.deepEqual(keys.sort(), ["vibe-order-77-customer", "vibe-order-77-internal"]);
  });

  await test("la respuesta al cliente no cambia ni expone el estado del aviso interno", async () => {
    await run({}, createRoutes(), async () => {
      const res = await create();
      assert.deepEqual(Object.keys(res.body).sort(), ["customerEmail", "customerPhoneLast4", "emailSent", "id", "total", "whatsappNotified"]);
    });
  });

  console.log("/api/admin/orders — listado con estado del aviso");
  const admin = () => { delete require.cache[require.resolve("../api/admin/orders")]; return require("../api/admin/orders"); };
  const AUTH = { authorization: "Bearer admin-test-token" };
  const HIST = { id: 3, created_at: "2026-09-29T00:01:07Z", customer_name: "Hist", total: 10000, status: "received", email_sent: false, whatsapp_notified: false, internal_notification_status: null, internal_notification_at: null, internal_notification_error: null };

  await test("GET incluye las columnas internal_notification_* y notificationTracking:true; los históricos siguen en null (sin inferir)", async () => {
    await run({}, (c) => ok([HIST]), async ({ calls }) => {
      const res = mockRes();
      await admin()({ method: "GET", headers: AUTH, query: {} }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.notificationTracking, true);
      assert.equal(res.body.orders[0].internal_notification_status, null);
      assert.match(new URL(calls[0].url).searchParams.get("select"), /internal_notification_status,internal_notification_at,internal_notification_error/);
    });
  });

  await test("GET con la migración pendiente (42703): lista igual sin esas columnas y notificationTracking:false", async () => {
    await run({}, (c) => (/internal_notification/.test(c.url) ? ok({ code: "42703", message: "column does not exist" }, 400) : ok([{ id: 3 }])), async ({ calls }) => {
      const res = mockRes();
      await admin()({ method: "GET", headers: AUTH, query: {} }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.notificationTracking, false);
      assert.equal(res.body.orders.length, 1);
      assert.equal(calls.length, 2);
    });
  });

  console.log("POST /api/admin/orders — reintento del aviso interno");
  const retry = async (body, headers = AUTH) => { const res = mockRes(); await admin()({ method: "POST", headers, query: {}, body }, res); return res; };
  // Fase 56 — el reintento primero "reclama" el pedido con un PATCH
  // condicional (and=…, devuelve la fila si la obtuvo) y después guarda el
  // resultado con otro PATCH (solo internal_*).
  const isClaim = (c) => c.method === "PATCH" && c.url.includes("&and=");
  const resultPatches = (calls) => orderPatches(calls).filter((c) => !isClaim(c));
  const retryRoutes = ({ row = HIST, readStatus = 200, resend = () => ok({ id: "x" }), patch = () => ok(undefined, 204), claim = () => ok([{ id: 3 }]) } = {}) => (c) => {
    if (c.url.startsWith("https://api.resend.com")) return resend(c);
    if (c.url.startsWith("https://graph.facebook.com")) throw new Error("WhatsApp nunca en un reintento");
    if (c.url.includes("/rest/v1/orders") && c.method === "GET") return readStatus === 200 ? ok(row ? [{ ...row, customer_email: "clienta@example.com", customer_phone: "3001112233", customer_city: "Bogotá", customer_address: "Calle 1", customer_notes: null, items: [{ name: "Rubor", quantity: 1, price: 10000, lineSubtotal: 10000 }] }] : []) : ok({ code: "42703" }, 400);
    if (c.url.includes("/rest/v1/orders") && isClaim(c)) return claim(c);
    if (c.url.includes("/rest/v1/orders") && c.method === "PATCH") return patch(c);
    throw new Error("ruta inesperada " + c.method + " " + c.url);
  };

  await test("sin token o con token manipulado: 401 y nada se lee ni se envía", async () => {
    for (const headers of [{}, { authorization: "Bearer admin-test-tokem" }]) {
      await run({}, retryRoutes(), async ({ calls }) => {
        const res = await retry({ action: "retry-internal-notification", id: 3 }, headers);
        assert.equal(res.statusCode, 401);
        assert.equal(calls.length, 0);
      });
    }
  });

  await test("acción o id inválidos: 400 sin tocar Supabase ni Resend", async () => {
    for (const body of [{ action: "otra", id: 3 }, { id: 3 }, { action: "retry-internal-notification", id: "3; drop" }, { action: "retry-internal-notification" }, null]) {
      await run({}, retryRoutes(), async ({ calls }) => {
        const res = await retry(body);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
        assert.equal(calls.length, 0);
      });
    }
  });

  await test("éxito sobre un pedido histórico (sin dato): UN email solo al buzón de VIBE; nunca al cliente ni WhatsApp; no crea pedidos; PATCH solo internal_*", async () => {
    await run({}, retryRoutes(), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.internalNotification.status, "accepted");
      assert.equal(res.body.recorded, true);
      assert.deepEqual(resendTo(calls), ["buzon-vibe@example.com"]);
      assert.equal(calls.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/")).length, 0);
      const ps = resultPatches(calls);
      assert.equal(ps.length, 1);
      assert.match(ps[0].url, /orders\?id=eq\.3$/);
      assert.deepEqual(Object.keys(ps[0].body).sort(), ["internal_notification_at", "internal_notification_error", "internal_notification_status"]);
      // El reclamo solo escribe internal_notification_at, con condiciones.
      const claimCall = orderPatches(calls).find(isClaim);
      assert.deepEqual(Object.keys(claimCall.body), ["internal_notification_at"]);
      assert.match(decodeURIComponent(claimCall.url), /internal_notification_status\.neq\.accepted/);
    });
  });

  await test("el proveedor rechaza el reintento: 502, se guarda 'failed' con código saneado y el log no lleva datos personales", async () => {
    await run({}, retryRoutes({ resend: () => ok({ name: "rate_limit_exceeded", message: "slow down buzon-vibe@example.com" }, 429) }), async ({ calls, logs }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 502);
      assert.equal(resultPatches(calls)[0].body.internal_notification_status, "failed");
      assert.equal(resultPatches(calls)[0].body.internal_notification_error, "HTTP_429:rate_limit_exceeded");
      for (const l of logs) assert.doesNotMatch(l, PII, l);
    });
  });

  await test("Fase 56 — dos reintentos simultáneos: el que pierde el reclamo atómico no envía nada (429)", async () => {
    await run({}, retryRoutes({ claim: () => ok([]) }), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 429);
      assert.deepEqual(resendTo(calls), []);
      assert.equal(resultPatches(calls).length, 0);
    });
  });

  await test("Fase 56 — el reintento usa su propia clave de idempotencia en Resend (distinta de la del aviso original)", async () => {
    let seenKey = null;
    const resend = (c) => ok({ id: "x" });
    await run({}, (c) => retryRoutes({ resend })(c), async () => {
      const originalFetch = global.fetch;
      global.fetch = async (url, opts = {}) => {
        if (String(url).startsWith("https://api.resend.com")) seenKey = opts.headers && opts.headers["Idempotency-Key"];
        return originalFetch(url, opts);
      };
      try {
        const res = await retry({ action: "retry-internal-notification", id: 3 });
        assert.equal(res.statusCode, 200);
      } finally {
        global.fetch = originalFetch;
      }
    });
    assert.match(String(seenKey), /^vibe-order-3-internal-retry-\d+$/);
  });

  await test("pedido ya avisado ('accepted'): 409 y no se reenvía", async () => {
    await run({}, retryRoutes({ row: { ...HIST, internal_notification_status: "accepted", internal_notification_at: "2026-10-01T00:00:00Z" } }), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 409);
      assert.deepEqual(resendTo(calls), []);
    });
  });

  await test("intento hace menos de un minuto: 429 y no se reenvía (evita ráfagas accidentales)", async () => {
    await run({}, retryRoutes({ row: { ...HIST, internal_notification_status: "failed", internal_notification_at: new Date(Date.now() - 10 * 1000).toISOString() } }), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 429);
      assert.deepEqual(resendTo(calls), []);
    });
  });

  await test("pedido inexistente: 404 sin enviar nada", async () => {
    await run({}, retryRoutes({ row: null }), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 999 });
      assert.equal(res.statusCode, 404);
      assert.deepEqual(resendTo(calls), []);
    });
  });

  await test("migración 0004 pendiente: 503 y no se envía nada", async () => {
    await run({}, retryRoutes({ readStatus: 400 }), async ({ calls }) => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 503);
      assert.deepEqual(resendTo(calls), []);
    });
  });

  await test("el aviso se envió pero no se pudo registrar: responde recorded:false (sin fingir que quedó guardado)", async () => {
    await run({}, retryRoutes({ patch: () => ok({}, 500) }), async () => {
      const res = await retry({ action: "retry-internal-notification", id: 3 });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.recorded, false);
    });
  });

  console.log("Admin — interfaz (estático)");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "admin", "admin.js"), "utf8");
  await test("solo 'failed' y 'not_configured' cuentan como 'requiere revisión'; null se muestra como 'Sin dato'", () => {
    assert.match(src, /const needsNoticeReview = \(o\) => o\.internal_notification_status === "failed" \|\| o\.internal_notification_status === "not_configured";/);
    assert.match(src, />Sin dato<\/span>/);
  });
  await test("el reintento pide confirmación y no se ofrece para pedidos ya avisados", () => {
    assert.match(src, /const ok = confirm\(`¿Reenviar el aviso interno del pedido/);
    assert.match(src, /const retry = o\.internal_notification_status === "accepted"\s*\?\s*""/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
