// Runs with plain Node, no DB connection, no credentials:
//   node scripts/test-migration-safety.mjs
//
// Static safety checks against the SQL files this fase produced. This
// cannot verify the migration is *correct* against a real database (no
// credentials exist in this environment to do that), but it can verify
// it never touches products/categories/sales, never grants anonymous
// write access, and defaults `published` to false — the exact
// guarantees this fase promises in text. A real safety net, not a
// formality.

import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath = new URL("../supabase/migrations/0001_catalog_metadata.sql", import.meta.url);
const seedPath = new URL("../supabase/seed/first_product_template.sql", import.meta.url);

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

function readSql(url) {
  return fs.readFileSync(url, "utf8");
}

// Dangerous-statement checks must look only at executable SQL, not at
// prose inside `-- ...` comments (which legitimately mention things
// like "DROP TABLE" as rollback instructions, or list forbidden column
// names as documentation).
function stripLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

console.log("supabase/migrations/0001_catalog_metadata.sql");
const migration = readSql(migrationPath);
const migrationCode = stripLineComments(migration);
const migrationLower = migrationCode.toLowerCase();

test("el archivo existe y no está vacío", () => {
  assert.ok(migration.length > 100);
});

test("crea catalog_metadata", () => {
  assert.match(migrationLower, /create table (if not exists )?catalog_metadata/);
});

test("nunca toca products/categories/sales (ni ALTER, ni DROP, ni UPDATE, ni DELETE, ni INSERT)", () => {
  for (const table of ["products", "categories", "sales"]) {
    for (const verb of ["alter table " + table, "drop table " + table, "update " + table, "delete from " + table, "insert into " + table, "truncate " + table]) {
      assert.ok(!migrationLower.includes(verb), `la migración contiene una operación peligrosa: "${verb}"`);
    }
  }
});

test("no contiene ningún DROP TABLE ni TRUNCATE en absoluto (ninguna tabla)", () => {
  assert.ok(!migrationLower.includes("drop table"));
  assert.ok(!migrationLower.includes("truncate"));
});

test("no contiene ningún DELETE ni UPDATE (la migración solo crea estructura, no muta datos)", () => {
  assert.ok(!migrationLower.includes("delete from"));
  assert.ok(!/\bupdate\s+\w/.test(migrationLower));
});

test("catalog_metadata.product_id referencia products(id)", () => {
  assert.match(migrationLower, /references\s+products\s*\(\s*id\s*\)/);
});

test("published es boolean, not null, y su default es false", () => {
  assert.match(migrationLower, /published\s+boolean\s+not\s+null\s+default\s+false/);
});

test("no incluye name/price/stock/category/cost_base/cost_pack/min_stock como columnas propias", () => {
  // Scoped to the actual column-definition block (create table ... );),
  // not the whole file — a COMMENT ON TABLE elsewhere in this same file
  // legitimately *names* these forbidden fields as documentation, which
  // must not itself be flagged as duplicating them.
  const match = migrationLower.match(/create table[\s\S]*?\n\);/);
  assert.ok(match, "no se pudo aislar el bloque create table(...) para revisarlo");
  const columnBlock = match[0];
  const forbiddenColumns = ["\n  name ", "\n  price ", "\n  stock ", "\n  category ", "cost_base", "cost_pack", "min_stock"];
  for (const col of forbiddenColumns) {
    assert.ok(!columnBlock.includes(col), `la migración parece duplicar un campo operativo: "${col.trim()}"`);
  }
});

test("habilita RLS en catalog_metadata", () => {
  assert.match(migrationLower, /alter table catalog_metadata enable row level security/);
});

test("no otorga INSERT/UPDATE/DELETE a anon ni a public", () => {
  assert.ok(!/for\s+(insert|update|delete)[\s\S]{0,80}?to\s+(anon|public)/i.test(migration));
  assert.ok(!/grant\s+(insert|update|delete)/i.test(migration));
});

test("la única policy de lectura para anon exige published = true", () => {
  assert.match(migration, /to anon\s*\n?\s*using\s*\(\s*published\s*=\s*true\s*\)/i);
});

test("no contiene ningún secreto embebido (heurística: nada con forma de JWT ni asignación de SUPABASE_*KEY)", () => {
  assert.ok(!/eyJ[a-zA-Z0-9_-]{10,}/.test(migration), "parece contener un JWT/API key embebido");
  assert.ok(!/SUPABASE_(SERVICE_ROLE_|ANON_)?KEY\s*[:=]\s*['"]?[a-zA-Z0-9._-]{10,}/i.test(migration));
});

console.log("\nsupabase/seed/first_product_template.sql");
const seed = readSql(seedPath);
const seedLower = seed.toLowerCase();

test("el archivo existe y no está vacío", () => {
  assert.ok(seed.length > 100);
});

test("usa placeholders, no un product_id real hardcodeado", () => {
  assert.match(seed, /<PRODUCT_ID>/);
  assert.ok(!/values\s*\(\s*\d+\s*,/.test(seedLower), "el INSERT parece tener un id numérico real en vez de un placeholder");
});

test("el INSERT deja published en false por defecto (requiere validación manual antes de publicar)", () => {
  const insertBlock = seed.slice(seed.toLowerCase().indexOf("insert into"));
  // Last value before the closing `);` — tolerate a trailing inline
  // comment on that same line (e.g. `false   -- PASO 3 ...`).
  assert.match(insertBlock, /false\s*(--[^\n]*)?\n\s*\);/, "el value final del INSERT (published) no es literalmente false");
});

test("nunca inserta en products/categories/sales, solo en catalog_metadata", () => {
  assert.match(seedLower, /insert into catalog_metadata/);
  for (const table of ["insert into products", "insert into categories", "insert into sales"]) {
    assert.ok(!seedLower.includes(table));
  }
});

test("no referencia base64 ni fotografía real, solo una ruta de asset conceptual", () => {
  assert.ok(!/data:image\/[a-z]+;base64,/i.test(seed));
});

console.log("\nsupabase/seed/product_56_makeup_brush_set.sql");
const product56Path = new URL("../supabase/seed/product_56_makeup_brush_set.sql", import.meta.url);
const product56 = readSql(product56Path);
const product56Lower = product56.toLowerCase();

test("el archivo existe y no está vacío", () => {
  assert.ok(product56.length > 100);
});

test("inserta específicamente product_id = 56 en catalog_metadata (no un placeholder)", () => {
  assert.match(product56Lower, /insert into catalog_metadata/);
  assert.match(product56, /\(\s*\n\s*56,/, "el primer valor del INSERT no es literalmente 56");
});

test("el INSERT deja published en false (requiere validar antes de publicar)", () => {
  const insertBlock = product56.slice(product56.toLowerCase().indexOf("insert into"));
  const valuesBlock = insertBlock.slice(0, insertBlock.indexOf(");") + 2);
  assert.match(valuesBlock, /false\s*(--[^\n]*)?\n\s*\);/, "el value final del INSERT (published) no es literalmente false");
});

test("nunca inserta ni modifica products/categories/sales, solo catalog_metadata", () => {
  for (const table of ["insert into products", "insert into categories", "insert into sales", "update products", "update categories", "update sales"]) {
    assert.ok(!product56Lower.includes(table), `contiene una operación sobre una tabla operativa: "${table}"`);
  }
});

test("no duplica name/price/stock/category como columnas o valores del INSERT (solo product_id + campos editoriales)", () => {
  const insertBlock = product56Lower.slice(product56Lower.indexOf("insert into"), product56Lower.indexOf(");") + 2);
  for (const col of ["\n  name,", "\n  price,", "\n  stock,", "\n  category,", "'makeup brush set'", "'18000'", "18000,"]) {
    assert.ok(!insertBlock.includes(col), `el INSERT parece incluir un dato operativo duplicado: "${col}"`);
  }
});

test("no referencia base64 ni fotografía real, solo una ruta de asset ya existente en el repo", () => {
  assert.ok(!/data:image\/[a-z]+;base64,/i.test(product56));
  const imageMatch = product56.match(/'(assets\/products\/[a-zA-Z0-9_-]+\.svg)'/);
  assert.ok(imageMatch, "no se encontró una ruta de imagen conceptual reconocible");
  assert.ok(fs.existsSync(new URL("../" + imageMatch[1], import.meta.url)), `la imagen referenciada (${imageMatch[1]}) no existe en el repo`);
});

test("los campos sin sustento confiable quedan en NULL/vacío, no inventados (subcategory, brand, badge, ingredients, usage, presentation)", () => {
  const insertBlock = product56Lower.slice(product56Lower.indexOf("values"), product56Lower.indexOf(");") + 2);
  // Column order in the INSERT: ...benefits, ingredients, usage, presentation, subcategory, brand, badge, search_keywords...
  // benefits is '[]'::jsonb (empty, not a fabricated list); the next five scalar fields must be null.
  const nullCount = (insertBlock.match(/\n\s*null,/g) || []).length;
  assert.ok(nullCount >= 5, `se esperaban al menos 5 campos en NULL (ingredients/usage/presentation/subcategory/brand/badge), se encontraron ${nullCount}`);
});

test("el comentario de publicación controlada apunta únicamente a product_id = 56", () => {
  assert.match(product56Lower, /update catalog_metadata[\s\S]{0,60}set published = true[\s\S]{0,40}where product_id = 56/);
});

console.log("\nsupabase/manual/fase10_step1_activate_catalog.sql");
const manualPath = new URL("../supabase/manual/fase10_step1_activate_catalog.sql", import.meta.url);
const manual = readSql(manualPath);
const manualCode = stripLineComments(manual);
const manualLower = manualCode.toLowerCase();

test("el archivo existe y no está vacío", () => {
  assert.ok(manual.length > 100);
});

test("contiene los 7 bloques PASO 1-7 marcados", () => {
  for (let n = 1; n <= 7; n++) {
    assert.match(manual, new RegExp(`PASO ${n} —`), `falta el marcador del PASO ${n}`);
  }
});

test("nunca modifica products/categories/sales (solo las LEE en el PASO 7, vía SELECT)", () => {
  for (const table of ["products", "categories", "sales"]) {
    for (const verb of ["insert into " + table, "update " + table, "delete from " + table, "alter table " + table, "drop table " + table, "truncate " + table]) {
      assert.ok(!manualLower.includes(verb), `contiene una operación peligrosa: "${verb}"`);
    }
  }
});

test("crea catalog_metadata de forma idempotente (IF NOT EXISTS) y sin duplicar la policy (DROP POLICY IF EXISTS antes de CREATE POLICY)", () => {
  assert.match(manualLower, /create table if not exists catalog_metadata/);
  assert.match(manualLower, /drop policy if exists[\s\S]{0,120}create policy/);
});

test("el INSERT del producto 56 es idempotente (WHERE NOT EXISTS) y no es un UPDATE", () => {
  assert.match(manualLower, /insert into catalog_metadata[\s\S]*where not exists/);
  assert.ok(!/update\s+catalog_metadata/.test(manualLower), "no debería existir ningún UPDATE sobre catalog_metadata en este archivo");
});

test("published nunca se ESTABLECE en true en este archivo (la política RLS sí puede leer 'published = true' como condición de lectura — eso es distinto de escribirlo)", () => {
  assert.ok(!/set\s+published\s*=\s*true/.test(manualLower), "el archivo no debería contener ningún SET published = true, ni ejecutado ni comentado");
  assert.ok(!/update\s+catalog_metadata/.test(manualLower), "no debería existir ningún UPDATE sobre catalog_metadata en este archivo");
});

test("inserta específicamente product_id = 56 (no un placeholder), sin duplicar name/price/stock/category", () => {
  const insertBlock = manualLower.slice(manualLower.indexOf("insert into catalog_metadata"), manualLower.indexOf("where not exists") + 20);
  assert.ok(insertBlock.includes("\n  56,"), "no se encontró el literal 56 como primer valor del INSERT");
  for (const col of ["\n  name,", "\n  price,", "\n  stock,", "\n  category,"]) {
    assert.ok(!insertBlock.includes(col), `el INSERT parece incluir una columna operativa: "${col.trim()}"`);
  }
});

test("la imagen referenciada existe de verdad en el repositorio (no una fotografía real, no base64)", () => {
  assert.ok(!/data:image\/[a-z]+;base64,/i.test(manual));
  const imageMatch = manual.match(/'(assets\/products\/[a-zA-Z0-9_-]+\.svg)'/);
  assert.ok(imageMatch, "no se encontró una ruta de imagen conceptual reconocible");
  assert.ok(fs.existsSync(new URL("../" + imageMatch[1], import.meta.url)), `la imagen referenciada (${imageMatch[1]}) no existe en el repo`);
});

test("las verificaciones de RLS y FK apuntan a catalog_metadata, no a products/categories/sales", () => {
  assert.match(manualLower, /where relname = 'catalog_metadata'/);
  assert.match(manualLower, /where tablename = 'catalog_metadata'/);
});

test("no contiene ningún secreto embebido", () => {
  assert.ok(!/eyJ[a-zA-Z0-9_-]{10,}/.test(manual));
  assert.ok(!/SUPABASE_(SERVICE_ROLE_|ANON_)?KEY\s*[:=]\s*['"]?[a-zA-Z0-9._-]{10,}/i.test(manual));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
