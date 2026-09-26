// Runs with plain Node, no test framework:
//   node scripts/test-pdp-gallery-nav.js
//
// Fase 35.1 — js/app.js depende de un DOM real (dialog, matchMedia,
// setTimeout con el ciclo de vida de una card) y no corre en Node sin un
// navegador real (mismo límite ya documentado en test-checkout.mjs, que
// solo hace aserciones de texto sobre app.js). Este archivo sigue esa
// misma convención: verifica por código fuente que las reglas de la
// fase están realmente implementadas, no solo descritas en un comentario.

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

const appSrc = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

console.log("Cards — preview de galería en hover (Fase 35.1, secciones 2/3)");

test("el hover de cards está condicionado a matchMedia('(hover: hover)') (nunca autoplay en touch/mobile)", () => {
  assert.ok(/matchMedia\(\s*["']\(hover:\s*hover\)["']\s*\)/.test(appSrc), "no se encontró el guard de matchMedia hover:hover");
});

test("espera ~500ms antes de empezar a alternar imágenes", () => {
  const m = appSrc.match(/CARD_HOVER_DELAY_MS\s*=\s*(\d+)/);
  assert.ok(m, "no se encontró CARD_HOVER_DELAY_MS");
  assert.equal(Number(m[1]), 500);
});

test("el intervalo por imagen está entre 1.2 y 1.5 segundos", () => {
  const m = appSrc.match(/CARD_HOVER_STEP_MS\s*=\s*(\d+)/);
  assert.ok(m, "no se encontró CARD_HOVER_STEP_MS");
  const ms = Number(m[1]);
  assert.ok(ms >= 1200 && ms <= 1500, `CARD_HOVER_STEP_MS=${ms} fuera del rango 1200-1500`);
});

test("con una sola imagen no arranca ninguna animación (images.length < 2 -> return)", () => {
  assert.ok(/images\.length\s*<\s*2\)\s*return;.*sin animaci/i.test(appSrc) || /if \(images\.length < 2\) return;/.test(appSrc));
});

test("al salir del hover, siempre vuelve a la imagen principal (images[0]), nunca queda en otra", () => {
  assert.ok(/s\.img\.src = s\.images\[0\]/.test(appSrc), "stopCardHover no restaura images[0]");
});

test("precarga las imágenes adicionales solo al iniciar el hover, no en el render inicial del grid", () => {
  assert.ok(/images\.slice\(1\)\.forEach\(src => \{ new Image\(\)\.src = src; \}\)/.test(appSrc));
});

console.log("\nPDP — navegación manual con flechas (Fase 35.1, sección 4)");

test("las flechas del PDP solo se renderizan cuando hay más de una imagen", () => {
  assert.ok(/images\.length > 1\s*\n\s*\? `<button type="button" class="pdp-arrow pdp-arrow-prev"/.test(appSrc), "las flechas no están condicionadas a images.length > 1");
});

test("las flechas tienen aria-label ('Imagen anterior' / 'Imagen siguiente')", () => {
  assert.ok(appSrc.includes('aria-label="Imagen anterior"'));
  assert.ok(appSrc.includes('aria-label="Imagen siguiente"'));
});

test("no hay autoplay ni hover para la galería del PDP: la navegación depende de click (data-gallery-nav) y teclado", () => {
  assert.ok(appSrc.includes('data-gallery-nav'));
  assert.ok(!/pdp-gallery-main[^}]*:hover/.test(appSrc), "no debe existir un :hover que mueva la galería del PDP");
});

test("navegación por teclado (ArrowLeft/ArrowRight) sobre #productDialog, sin robar las flechas de un input de texto", () => {
  assert.ok(appSrc.includes('e.key !== "ArrowLeft" && e.key !== "ArrowRight"'));
  assert.ok(/tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT"/.test(appSrc));
});

test("moveGalleryBy nunca es circular (Math.max/Math.min acota los límites, no % module)", () => {
  const fnMatch = appSrc.match(/function moveGalleryBy\(delta\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, "no se encontró moveGalleryBy");
  assert.ok(fnMatch[0].includes("Math.max(0, Math.min("), "moveGalleryBy debe acotar el índice, no dar la vuelta");
});

test("pdpGalleryImages pone siempre la imagen principal primero (p.image antes que p.images)", () => {
  const taxonomySrc = fs.readFileSync(path.join(__dirname, "..", "js", "taxonomy.js"), "utf8");
  assert.ok(/\[p\.image, \.\.\.\(Array\.isArray\(p\.images\) \? p\.images : \[\]\)\]/.test(taxonomySrc));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
