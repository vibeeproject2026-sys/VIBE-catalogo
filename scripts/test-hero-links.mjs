// Runs with plain Node, no DOM, no network:
//   node scripts/test-hero-links.mjs
//
// js/hero-links.js has zero imports, so it loads directly via a data:
// URL (misma técnica que test-checkout.mjs/test-taxonomy.mjs).

import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../js/hero-links.js", import.meta.url), "utf8");
const { buildSlideHref, describeSlideDestination, SECTION_DESTINATIONS } = await import("data:text/javascript," + encodeURIComponent(src));

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

console.log("buildSlideHref — cada linkType produce el href esperado");

test("sin linkType (slide legado) cae al comportamiento actual: ctaHref || #catalogo", () => {
  assert.equal(buildSlideHref({ ctaHref: "/discover" }), "/discover");
  assert.equal(buildSlideHref({ ctaHref: null }), "#catalogo");
  assert.equal(buildSlideHref({}), "#catalogo");
});

test("linkType 'none' -> null, nunca navega, incluso si ctaHref quedó cargado", () => {
  assert.equal(buildSlideHref({ linkType: "none", ctaHref: "/discover" }), null);
});

test("linkType 'category' -> ?category=<valor>#catalogo", () => {
  assert.equal(buildSlideHref({ linkType: "category", linkTarget: "Rostro" }), "?category=Rostro#catalogo");
});

test("linkType 'category' sin linkTarget -> null (nunca un href roto)", () => {
  assert.equal(buildSlideHref({ linkType: "category", linkTarget: null }), null);
});

test("linkType 'subcategory' -> ?category=<c>&subcategory=<s>#catalogo", () => {
  const href = buildSlideHref({ linkType: "subcategory", linkTarget: { category: "Rostro", subcategory: "Rubor líquido" } });
  assert.equal(href, "?category=Rostro&subcategory=Rubor+l%C3%ADquido#catalogo");
});

test("linkType 'subcategory' sin subcategory en linkTarget -> null", () => {
  assert.equal(buildSlideHref({ linkType: "subcategory", linkTarget: { category: "Rostro" } }), null);
  assert.equal(buildSlideHref({ linkType: "subcategory", linkTarget: null }), null);
});

test("linkType 'product' -> ?product=<id>#catalogo (mismo mecanismo de deep-link que ya usa app.js)", () => {
  assert.equal(buildSlideHref({ linkType: "product", linkTarget: "122" }), "?product=122#catalogo");
});

test("linkType 'section' -> #<id>, solo si el id es una sección real conocida", () => {
  assert.equal(buildSlideHref({ linkType: "section", linkTarget: "discover" }), "#discover");
  assert.equal(SECTION_DESTINATIONS.discover, "Discover (landing completa)");
});

test("linkType 'section' con un id desconocido -> null (nunca enlaza a un ancla inventado)", () => {
  assert.equal(buildSlideHref({ linkType: "section", linkTarget: "seccion-que-no-existe" }), null);
});

test("linkType 'internal_route' -> ctaHref tal cual (reusa el campo ya validado por isSafeCtaHref)", () => {
  assert.equal(buildSlideHref({ linkType: "internal_route", ctaHref: "/discover" }), "/discover");
  assert.equal(buildSlideHref({ linkType: "internal_route", ctaHref: null }), null);
});

test("un linkType desconocido/corrupto nunca rompe: se trata como sin enlace", () => {
  assert.equal(buildSlideHref({ linkType: "algo-invalido", linkTarget: "x" }), null);
});

console.log("\nbuildSlideHref — propiedad de seguridad: linkTarget nunca se usa como href crudo");

test("un linkTarget con caracteres de query string (&, #, \") queda neutralizado por encodeURIComponent", () => {
  const href = buildSlideHref({ linkType: "category", linkTarget: 'Rostro&category=Otro#hack"' });
  assert.ok(!href.includes("&category=Otro#hack"), "el valor no debería poder inyectar un segundo parámetro ni un fragmento propio");
  assert.ok(href.startsWith("?category="));
  assert.ok(href.endsWith("#catalogo"));
});

test("un linkTarget con forma de esquema peligroso (javascript:) nunca se usa como esquema — siempre es un valor de query string", () => {
  const href = buildSlideHref({ linkType: "product", linkTarget: "javascript:alert(1)" });
  assert.ok(href.startsWith("?product="));
  assert.ok(!href.startsWith("javascript:"));
});

console.log("\ndescribeSlideDestination — preview legible para Admin");

test("sin linkType o 'none' -> 'Sin enlace'", () => {
  assert.equal(describeSlideDestination({}), "Sin enlace");
  assert.equal(describeSlideDestination({ linkType: "none" }), "Sin enlace");
});
test("category/subcategory/product/section describen su destino real", () => {
  assert.equal(describeSlideDestination({ linkType: "category", linkTarget: "Rostro" }), "Categoría → Rostro");
  assert.equal(
    describeSlideDestination({ linkType: "subcategory", linkTarget: { category: "Rostro", subcategory: "Rubor líquido" } }),
    "Subcategoría → Rostro › Rubor líquido"
  );
  assert.equal(describeSlideDestination({ linkType: "product", linkTarget: "122" }), "Producto → #122");
  assert.equal(describeSlideDestination({ linkType: "section", linkTarget: "discover" }), "Sección → Discover (landing completa)");
});
test("internal_route describe la ruta configurada", () => {
  assert.equal(describeSlideDestination({ linkType: "internal_route", ctaHref: "/discover" }), "Ruta interna → /discover");
});
test("un destino sin elegir todavía (linkTarget vacío) lo dice explícitamente, nunca un texto vacío o roto", () => {
  assert.equal(describeSlideDestination({ linkType: "category", linkTarget: null }), "Categoría → (sin elegir)");
  assert.equal(describeSlideDestination({ linkType: "product", linkTarget: null }), "Producto → (sin elegir)");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
