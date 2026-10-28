// Runs with plain Node, no DB connection, no credentials:
//   node scripts/test-orders-notification-migration.mjs
//
// Fase 55 — checks estáticos de supabase/manual/0004_orders_internal_notification.sql
// (misma disciplina que test-orders-migration-safety.mjs para 0003). No
// puede comprobar la migración contra la base real; sí que sea
// estrictamente aditiva, que no toque otras tablas ni permisos, y que no
// marque pedidos anteriores como notificados.

import fs from "node:fs";
import assert from "node:assert/strict";

const sql = fs.readFileSync(new URL("../supabase/manual/0004_orders_internal_notification.sql", import.meta.url), "utf8");
const code = sql.split("\n").map((l) => (l.includes("--") ? l.slice(0, l.indexOf("--")) : l)).join("\n");
const lower = code.toLowerCase().replace(/\s+/g, " ");

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

console.log("supabase/manual/0004_orders_internal_notification.sql");
test("solo agrega las tres columnas con «add column if not exists» sobre orders", () => {
  const adds = [...lower.matchAll(/alter table orders add column if not exists ([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(adds, ["internal_notification_status", "internal_notification_at", "internal_notification_error"]);
  const alters = lower.match(/alter table/g) || [];
  assert.equal(alters.length, 3);
});
test("nada destructivo: sin DROP, UPDATE, DELETE, TRUNCATE, INSERT, RENAME ni ALTER COLUMN", () => {
  for (const verb of ["drop ", "update ", "delete ", "truncate ", "insert ", "rename ", "alter column"]) {
    assert.ok(!lower.includes(verb), `contiene "${verb.trim()}"`);
  }
});
test("no toca otras tablas ni permisos ni RLS", () => {
  for (const t of ["products", "categories", "sales", "catalog_metadata"]) assert.ok(!lower.includes(t), t);
  for (const w of ["grant ", "revoke ", "policy", "row level security"]) assert.ok(!lower.includes(w), w);
});
test("sin backfill ni default: los pedidos anteriores quedan en NULL (sin dato), nunca 'accepted'", () => {
  assert.ok(!lower.includes("default"), "no debe haber DEFAULT");
  assert.ok(!lower.includes("not null"), "las columnas deben admitir NULL");
});
test("estado restringido a accepted | failed | not_configured y error acotado a 80 caracteres", () => {
  assert.match(lower, /check \(internal_notification_status in \('accepted', 'failed', 'not_configured'\)\)/);
  assert.match(lower, /check \(internal_notification_error is null or char_length\(internal_notification_error\) <= 80\)/);
  assert.match(lower, /internal_notification_at timestamptz/);
});
test("los valores coinciden con los que escribe el código", () => {
  const store = fs.readFileSync(new URL("../api/orders/_lib/store.js", import.meta.url), "utf8");
  for (const v of ["accepted", "failed", "not_configured"]) assert.ok(store.includes(`"${v}"`), v);
  assert.match(store, /slice\(0, 80\)/);
});
test("no contiene secretos", () => {
  assert.ok(!/(service_role|eyJ[a-zA-Z0-9]{10,}|re_[a-zA-Z0-9]{10,}|password)/i.test(sql));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
