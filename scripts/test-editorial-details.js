// Runs with plain Node, no network, no credentials:
//   node scripts/test-editorial-details.js
//
// Pure-logic tests for api/_lib/editorialDetails.js — la capa que
// estructura los ~40 campos editoriales granulares de la Fase 34 dentro
// de catalog_metadata.additional_info (columna text existente, sin
// tabla ni columna nueva).

const assert = require("assert/strict");
const { STRING_FIELDS, ARRAY_FIELDS, ALL_FIELDS, emptyDetails, sanitizeDetails, parseDetails, serializeDetails } = require("../api/_lib/editorialDetails");

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

console.log("cobertura de campos (sección 2/3 — ficha real de Product Studio)");
test("40 campos en total, sin duplicados", () => {
  assert.equal(ALL_FIELDS.length, 40);
  assert.equal(new Set(ALL_FIELDS).size, 40);
});
test("incluye los campos clave de la ficha real (tono, acabado, cruelty-free, etc.)", () => {
  for (const key of ["commercialName", "tone", "toneCode", "finish", "coverage", "duration", "skinType", "crueltyFree", "vegan", "dermatologicallyTested", "countryOfManufacture", "commercialAngle"]) {
    assert.ok(STRING_FIELDS.includes(key), `falta el campo "${key}"`);
  }
});
test("los campos multivalor (sección 8) son arreglo, no string", () => {
  assert.deepEqual(ARRAY_FIELDS.sort(), ["certifications", "claims", "highlightedIngredients"].sort());
});

console.log("emptyDetails");
test("todo campo string en null, todo campo arreglo en []", () => {
  const empty = emptyDetails();
  for (const k of STRING_FIELDS) assert.equal(empty[k], null);
  for (const k of ARRAY_FIELDS) assert.deepEqual(empty[k], []);
});

console.log("sanitizeDetails (nunca confía en additional_info crudo)");
test("copia solo las claves conocidas, con el tipo esperado", () => {
  const out = sanitizeDetails({ tone: "Rosa nude", claims: ["Cruelty-free", "Vegano"], name: "Producto falso", price: 1, stock: 999 });
  assert.equal(out.tone, "Rosa nude");
  assert.deepEqual(out.claims, ["Cruelty-free", "Vegano"]);
  assert.equal("name" in out, false); // "name" no es un campo de esta whitelist -> nunca se copia
  assert.equal("price" in out, false);
  assert.equal("stock" in out, false);
});
test("un campo que no está en la whitelist nunca aparece, aunque el input lo traiga", () => {
  const out = sanitizeDetails({ tone: "X", cost_base: 999, product_id: 56 });
  assert.equal("cost_base" in out, false);
  assert.equal("product_id" in out, false);
});
test("string vacío o solo espacios se trata como ausente (null), nunca como '' guardado", () => {
  const out = sanitizeDetails({ tone: "   ", finish: "" });
  assert.equal(out.tone, null);
  assert.equal(out.finish, null);
});
test("un arreglo con solo strings vacíos/espacios se trata como ausente ([])", () => {
  const out = sanitizeDetails({ claims: ["", "   "] });
  assert.deepEqual(out.claims, []);
});
test("entradas no-string dentro de un campo string se ignoran (nunca lanza)", () => {
  const out = sanitizeDetails({ tone: 123, vegan: true });
  assert.equal(out.tone, null);
  assert.equal(out.vegan, null);
});
test("input null/undefined/no-objeto -> todo vacío, sin lanzar", () => {
  assert.deepEqual(sanitizeDetails(null), emptyDetails());
  assert.deepEqual(sanitizeDetails(undefined), emptyDetails());
  assert.deepEqual(sanitizeDetails("texto suelto"), emptyDetails());
});

console.log("parseDetails (lectura desde additional_info, columna text)");
test("JSON válido se parsea y sanitiza", () => {
  const parsed = parseDetails(JSON.stringify({ tone: "Coral", finish: "Mate" }));
  assert.equal(parsed.tone, "Coral");
  assert.equal(parsed.finish, "Mate");
});
test("null/vacío -> todo vacío", () => {
  assert.deepEqual(parseDetails(null), emptyDetails());
  assert.deepEqual(parseDetails(""), emptyDetails());
});
test("JSON corrupto/no-JSON (ej. una nota vieja en texto libre de antes de la Fase 34) -> todo vacío, nunca lanza", () => {
  assert.deepEqual(parseDetails("esto no es JSON, es una nota vieja"), emptyDetails());
});

console.log("serializeDetails (escritura hacia additional_info)");
test("con al menos un campo real, produce un JSON string parseable", () => {
  const raw = serializeDetails({ tone: "Rosa" });
  assert.equal(typeof raw, "string");
  assert.equal(JSON.parse(raw).tone, "Rosa");
});
test("sin ningún campo real completado, devuelve null (no un blob de puros null/[])", () => {
  assert.equal(serializeDetails({}), null);
  assert.equal(serializeDetails({ tone: "" }), null);
  assert.equal(serializeDetails(null), null);
});
test("round-trip serialize -> parse reproduce exactamente lo mismo", () => {
  const original = { tone: "Coral", claims: ["Vegano", "Cruelty-free"], finish: "Mate", crueltyFree: "Sí" };
  const roundTripped = parseDetails(serializeDetails(original));
  assert.equal(roundTripped.tone, "Coral");
  assert.deepEqual(roundTripped.claims, ["Vegano", "Cruelty-free"]);
  assert.equal(roundTripped.finish, "Mate");
  assert.equal(roundTripped.crueltyFree, "Sí");
});
test("actualización parcial: campos no incluidos en el nuevo objeto quedan en su default vacío (el llamador es responsable de fusionar con lo existente antes de serializar)", () => {
  const raw = serializeDetails({ tone: "Solo esto" });
  const parsed = JSON.parse(raw);
  assert.equal(parsed.finish, null);
  assert.deepEqual(parsed.claims, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
