// Runs with plain Node, no network, no real credentials:
//   node scripts/test-promo-write-lib.js
//
// Pure-logic + mocked-fetch tests for api/admin/_lib/promoWrite.js.

const assert = require("assert/strict");
const { PROMO_FIELDS, pickPromoFields, updateProductPromo } = require("../api/admin/_lib/promoWrite");

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

console.log("pickPromoFields — nunca deja pasar nada fuera de las 5 columnas promo");

test("solo copia claves dentro de PROMO_FIELDS, sin importar qué más venga en el body", () => {
  const picked = pickPromoFields({
    promo_active: true,
    promo_price: 16640,
    price: 1,
    stock: 999,
    name: "Producto falso",
    category: "Hackeado",
    cost_base: 1,
    cost_pack: 1,
    min_stock: 1,
  });
  assert.deepEqual(Object.keys(picked).sort(), ["promo_active", "promo_price"]);
  assert.equal(PROMO_FIELDS.includes("promo_price"), true);
  assert.equal(PROMO_FIELDS.includes("price"), false);
  assert.equal(PROMO_FIELDS.includes("stock"), false);
});

test("body vacío o no-objeto -> objeto vacío, nunca lanza", () => {
  assert.deepEqual(pickPromoFields({}), {});
  assert.deepEqual(pickPromoFields(null), {});
  assert.deepEqual(pickPromoFields(undefined), {});
});

console.log("\nupdateProductPromo — mock de red, nunca real");

async function main() {
  await test("PATCH manda solo las 5 columnas promo al body, con select= restringido (nunca cost_base/stock)", async () => {
    let capturedUrl = null;
    let capturedBody = null;
    const fetchImpl = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 96, price: 20800, promo_active: true, promo_price: 16640, promo_start: null, promo_end: null, promo_text: "-20%" }]),
      };
    };
    const row = await updateProductPromo({
      productId: 96,
      fields: { promo_active: true, promo_price: 16640, name: "intento de colar un campo ajeno" },
      env: { url: "https://example.supabase.co", serviceRoleKey: "test-key" },
      fetchImpl,
    });
    assert.deepEqual(capturedBody, { promo_active: true, promo_price: 16640 });
    assert.ok(String(capturedUrl).includes("select=id,price,promo_active,promo_price,promo_start,promo_end,promo_text"), "el select= debe restringir explícitamente las columnas devueltas");
    assert.ok(!String(capturedUrl).includes("cost_base"));
    assert.equal(row.id, 96);
    assert.equal(row.promo_price, 16640);
    assert.ok(!("stock" in row), "el resultado nunca debería incluir stock aunque products lo tenga");
  });

  await test("producto inexistente (fila vacía) -> lanza PRODUCT_NOT_FOUND", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "[]" });
    await assert.rejects(
      () => updateProductPromo({ productId: 9999, fields: { promo_active: false }, env: { url: "https://x.co", serviceRoleKey: "k" }, fetchImpl }),
      (e) => e.code === "PRODUCT_NOT_FOUND"
    );
  });

  await test("Supabase responde error -> lanza SUPABASE_WRITE_ERROR, nunca silencioso", async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ code: "23514", message: "check constraint" }) });
    await assert.rejects(
      () => updateProductPromo({ productId: 1, fields: { promo_price: -5 }, env: { url: "https://x.co", serviceRoleKey: "k" }, fetchImpl }),
      (e) => e.code === "SUPABASE_WRITE_ERROR"
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
