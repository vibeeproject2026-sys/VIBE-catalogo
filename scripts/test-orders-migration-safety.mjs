// Runs with plain Node, no DB connection, no credentials:
//   node scripts/test-orders-migration-safety.mjs
//
// Static safety checks against supabase/migrations/0003_orders.sql —
// same discipline as test-migration-safety.mjs (0001), kept as a
// separate file since that one is hardcoded to 0001's exact shape.
// This cannot verify the migration is *correct* against a real
// database (no credentials exist in this environment to do that), but
// it can verify it never touches products/categories/sales/
// catalog_metadata, grants nothing to anon/authenticated, requires
// contact_consent = true, and never embeds a secret.

import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath = new URL("../supabase/migrations/0003_orders.sql", import.meta.url);

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

function stripLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

console.log("supabase/migrations/0003_orders.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const code = stripLineComments(migration);
const lower = code.toLowerCase();

test("el archivo existe y no está vacío", () => {
  assert.ok(migration.length > 100);
});

test("crea orders", () => {
  assert.match(lower, /create table (if not exists )?orders/);
});

test("nunca toca products/categories/sales/catalog_metadata (ni ALTER, ni DROP, ni UPDATE, ni DELETE, ni INSERT)", () => {
  for (const table of ["products", "categories", "sales", "catalog_metadata"]) {
    for (const verb of ["alter table " + table, "drop table " + table, "update " + table, "delete from " + table, "insert into " + table, "truncate " + table]) {
      assert.ok(!lower.includes(verb), `la migración contiene una operación peligrosa: "${verb}"`);
    }
  }
});

test("no contiene ningún DROP TABLE ni TRUNCATE en absoluto", () => {
  assert.ok(!lower.includes("drop table"));
  assert.ok(!lower.includes("truncate"));
});

test("habilita RLS en orders", () => {
  assert.match(lower, /alter table orders enable row level security/);
});

test("no contiene ninguna policy (deny-by-default total, ni siquiera SELECT)", () => {
  assert.ok(!/create\s+policy/i.test(migration), "la migración no debería crear ninguna policy sobre orders");
});

test("revoca explícitamente todos los privilegios de anon/authenticated", () => {
  assert.match(lower, /revoke all on orders from anon,\s*authenticated/);
});

test("no otorga ningún privilegio (GRANT) a nadie", () => {
  assert.ok(!/\bgrant\b/i.test(migration), "la migración no debería otorgar ningún privilegio");
});

test("contact_consent exige = true a nivel de columna (check constraint)", () => {
  assert.match(lower, /contact_consent\s+boolean\s+not\s+null\s+default\s+false\s+check\s*\(\s*contact_consent\s*=\s*true\s*\)/);
});

test("consent_timestamp es not null", () => {
  assert.match(lower, /consent_timestamp\s+timestamptz\s+not\s+null/);
});

test("status tiene un check constraint con los 3 valores esperados y default 'received'", () => {
  assert.match(lower, /status\s+text\s+not\s+null\s+default\s+'received'\s+check\s*\(\s*status\s+in\s*\(\s*'received'\s*,\s*'confirmed'\s*,\s*'cancelled'\s*\)\s*\)/);
});

test("items es jsonb not null (snapshot del pedido, no referencias mutables)", () => {
  assert.match(lower, /items\s+jsonb\s+not\s+null/);
});

test("total es not null", () => {
  assert.match(lower, /total\s+numeric\s+not\s+null/);
});

test("email_sent y whatsapp_notified arrancan en false (nunca un envío asumido)", () => {
  assert.match(lower, /email_sent\s+boolean\s+not\s+null\s+default\s+false/);
  assert.match(lower, /whatsapp_notified\s+boolean\s+not\s+null\s+default\s+false/);
});

test("no incluye cost_base/cost_pack/min_stock/stock como columnas (nada operativo del POS se duplica acá)", () => {
  const match = lower.match(/create table[\s\S]*?\n\);/);
  assert.ok(match, "no se pudo aislar el bloque create table(...) para revisarlo");
  const columnBlock = match[0];
  for (const col of ["cost_base", "cost_pack", "min_stock", "\n  stock "]) {
    assert.ok(!columnBlock.includes(col), `la migración parece incluir un campo operativo del POS: "${col.trim()}"`);
  }
});

test("no contiene ningún secreto embebido (heurística: nada con forma de JWT ni asignación de SUPABASE_*KEY)", () => {
  assert.ok(!/eyJ[a-zA-Z0-9_-]{10,}/.test(migration), "parece contener un JWT/API key embebido");
  assert.ok(!/SUPABASE_(SERVICE_ROLE_|ANON_)?KEY\s*[:=]\s*['"]?[a-zA-Z0-9._-]{10,}/i.test(migration));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
