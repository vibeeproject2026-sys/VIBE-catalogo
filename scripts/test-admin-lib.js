// Runs with plain Node, no network, no credentials:
//   node scripts/test-admin-lib.js
//
// Both files under test are CommonJS, so plain require() works
// directly — no ESM/temp-dir trickery needed here.

const assert = require("assert/strict");
const { requireAdmin } = require("../api/admin/_lib/auth");
const { EDITORIAL_FIELDS, pickEditorialFields } = require("../api/admin/_lib/editorialFields");

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

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
  };
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const k of Object.keys(vars)) {
    if (vars[k] === undefined) delete process.env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

console.log("requireAdmin — fail-closed cuando no está configurado");
test("sin ADMIN_API_TOKEN en el servidor, deniega siempre (503), incluso con un header presente", () => {
  withEnv({ ADMIN_API_TOKEN: undefined }, () => {
    const req = { headers: { authorization: "Bearer cualquier-cosa" } };
    const res = mockRes();
    const ok = requireAdmin(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 503);
  });
});

console.log("requireAdmin — configurado");
test("sin header Authorization, deniega (401)", () => {
  withEnv({ ADMIN_API_TOKEN: "secreto-de-prueba" }, () => {
    const req = { headers: {} };
    const res = mockRes();
    const ok = requireAdmin(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 401);
  });
});
test("con token incorrecto, deniega (401)", () => {
  withEnv({ ADMIN_API_TOKEN: "secreto-de-prueba" }, () => {
    const req = { headers: { authorization: "Bearer token-equivocado" } };
    const res = mockRes();
    const ok = requireAdmin(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 401);
  });
});
test("con token de longitud distinta, deniega sin lanzar excepción (timingSafeEqual con largos distintos)", () => {
  withEnv({ ADMIN_API_TOKEN: "secreto-de-prueba" }, () => {
    const req = { headers: { authorization: "Bearer corto" } };
    const res = mockRes();
    assert.doesNotThrow(() => requireAdmin(req, res));
    assert.equal(res.statusCode, 401);
  });
});
test("con el token correcto, autoriza (true) y no escribe ninguna respuesta", () => {
  withEnv({ ADMIN_API_TOKEN: "secreto-de-prueba" }, () => {
    const req = { headers: { authorization: "Bearer secreto-de-prueba" } };
    const res = mockRes();
    const ok = requireAdmin(req, res);
    assert.equal(ok, true);
    assert.equal(res.body, undefined);
  });
});

console.log("pickEditorialFields — whitelist");
test("solo copia los 15 campos editoriales definidos", () => {
  assert.equal(EDITORIAL_FIELDS.length, 15);
});
test("un payload con campos operativos/prohibidos solo conserva los editoriales", () => {
  const malicious = {
    product_id: 999, // se maneja aparte por el handler, no por esta función
    name: "Producto falso",
    price: 1,
    stock: 999,
    category: "Otro",
    cost_base: 1,
    cost_pack: 1,
    min_stock: 1,
    sales: "algo",
    transactions: "algo",
    published: true,
    badge: "NUEVO",
  };
  const picked = pickEditorialFields(malicious);
  assert.deepEqual(Object.keys(picked).sort(), ["badge", "published"]);
  for (const forbidden of ["product_id", "name", "price", "stock", "category", "cost_base", "cost_pack", "min_stock", "sales", "transactions"]) {
    assert.ok(!(forbidden in picked), `campo prohibido se filtró: ${forbidden}`);
  }
});
test("un payload vacío o inválido no lanza y devuelve objeto vacío", () => {
  assert.deepEqual(pickEditorialFields({}), {});
  assert.deepEqual(pickEditorialFields(null), {});
  assert.deepEqual(pickEditorialFields(undefined), {});
});
test("todos los campos editoriales pasan cuando están presentes", () => {
  const full = Object.fromEntries(EDITORIAL_FIELDS.map((k) => [k, `valor-${k}`]));
  const picked = pickEditorialFields(full);
  assert.deepEqual(Object.keys(picked).sort(), [...EDITORIAL_FIELDS].sort());
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
