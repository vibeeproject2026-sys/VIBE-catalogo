// Runs with plain Node, no network:
//   node scripts/test-legal-structure.mjs
//
// Fase final — estructura de información legal (js/legal.js): nada se
// muestra sin datos reales; con datos, se muestran solo los completos y
// siempre escapados.

import assert from "node:assert/strict";
import fs from "node:fs";
import { LEGAL, legalFooterHtml } from "../js/legal.js";

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
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

await test("la configuración publicada no contiene datos: todo en null (nada inventado)", () => {
  assert.ok(Object.values(LEGAL.business).every((v) => v === null));
  assert.deepEqual(LEGAL.policies.map((p) => p.id), ["datos", "envios", "pagos", "cambios", "garantia"]);
  assert.ok(LEGAL.policies.every((p) => p.text === null));
});
await test("sin datos, la columna no tiene contenido y el pie la trae oculta", () => {
  assert.equal(legalFooterHtml(LEGAL), "");
  assert.match(html, /<section class="footer-col" id="legal" aria-labelledby="footerLegalTitle" hidden><\/section>/);
  assert.match(html, /<script type="module" src="js\/legal\.js"><\/script>/);
});
await test("textos vacíos o solo espacios cuentan como sin dato", () => {
  assert.equal(legalFooterHtml({ business: { name: "  ", idNumber: "" }, policies: [{ id: "datos", title: "Datos", text: "   " }] }), "");
});
await test("con datos: muestra solo lo completo, párrafos separados, todo escapado", () => {
  const out = legalFooterHtml({
    business: { name: "VIBE <SAS>", idLabel: "NIT", idNumber: "900.000.000-1", city: "Bogotá", address: null },
    policies: [
      { id: "datos", title: "Tratamiento de datos personales", text: "Primer párrafo.\n\nSegundo <b>párrafo</b>." },
      { id: "envios", title: "Envíos", text: null },
    ],
  });
  assert.match(out, /VIBE &lt;SAS&gt;<br>NIT 900\.000\.000-1<br>Bogotá/);
  assert.match(out, /<summary>Tratamiento de datos personales<\/summary><div class="footer-legal-text"><p>Primer párrafo\.<\/p><p>Segundo &lt;b&gt;párrafo&lt;\/b&gt;\.<\/p><\/div>/);
  assert.doesNotMatch(out, /Envíos/);
  assert.doesNotMatch(out, /<b>/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
