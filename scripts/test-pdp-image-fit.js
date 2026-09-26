// Runs with plain Node, no test framework:
//   node scripts/test-pdp-image-fit.js
//
// Fase 35 — regresión: la foto de producto en el PDP (imagen principal
// y galería) debe verse completa, nunca recortada/ampliada. Este test
// no puede ejecutar CSS real, así que verifica directamente el fuente
// de css/styles.css: si alguien vuelve a poner object-fit:cover en
// .detail-photo o .pdp-thumb img, este test falla.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

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

const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function ruleBodyFor(selector) {
  const idx = css.indexOf(selector + "{");
  assert.ok(idx !== -1, `selector ${selector} not found in styles.css`);
  const end = css.indexOf("}", idx);
  return css.slice(idx, end);
}

console.log("PDP — imagen de producto sin recorte (Fase 35)");

test(".detail-photo (imagen principal PDP) usa object-fit:contain, nunca cover", () => {
  const body = ruleBodyFor(".detail-photo");
  assert.ok(body.includes("object-fit:contain"), "esperaba object-fit:contain en .detail-photo");
  assert.equal(body.includes("object-fit:cover"), false, ".detail-photo no debe usar object-fit:cover");
});

test(".pdp-thumb img (galería PDP) usa object-fit:contain, nunca cover", () => {
  const body = ruleBodyFor(".pdp-thumb img");
  assert.ok(body.includes("object-fit:contain"), "esperaba object-fit:contain en .pdp-thumb img");
  assert.equal(body.includes("object-fit:cover"), false, ".pdp-thumb img no debe usar object-fit:cover");
});

test(".product-photo (miniatura Home/PLP) se mantiene intacta con object-fit:cover — fuera de alcance de esta fase", () => {
  const body = ruleBodyFor(".product-photo");
  assert.ok(body.includes("object-fit:cover"), "la miniatura de Home/PLP no debía tocarse en esta fase");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
