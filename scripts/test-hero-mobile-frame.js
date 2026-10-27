// Runs with plain Node, no test framework, no network:
//   node scripts/test-hero-mobile-frame.js
//
// Fase 49 — Hero mobile: marco moderadamente más alto (4:3 mínimo) con la
// pieza SIEMPRE completa (contain, nunca cover) y un fondo decorativo que
// reutiliza la misma imagen desenfocada. Tablet/desktop sin cambios.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "js", "hero-carousel.js"), "utf8");

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

// Bloque mobile principal (el que contiene las reglas del Hero mobile).
const mobileBlocks = [...css.matchAll(/@media\(max-width:640px\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
const heroMobile = mobileBlocks.find((b) => b.includes(".hero-carousel{min-height:0;aspect-ratio:auto;padding-bottom:36px}")) || "";

test("Fase 51 — el marco mide la pieza (proporción medida) + franja de controles de 36px; sin bandas forzadas", () => {
  assert.ok(heroMobile, "no se encontró el bloque mobile del Hero");
  assert.match(heroMobile, /\.hero-carousel\{min-height:0;aspect-ratio:auto;padding-bottom:36px\}/);
  assert.match(heroMobile, /\.hero-slides\{height:auto;aspect-ratio:var\(--hero-mobile-ratio, 4\/5\)\}/);
  assert.doesNotMatch(heroMobile, /min-height:75vw/);
  assert.doesNotMatch(heroMobile, /\.hero-carousel\{[^}]*height:\d+px/);
});
test("la pieza real se sigue mostrando completa (contain) y nunca con cover", () => {
  assert.match(css, /\.hero-slide img\{width:100%;height:100%;object-fit:contain;display:block\}/);
  assert.match(heroMobile, /\.hero-slide img\{object-fit:contain\}/);
  assert.doesNotMatch(css, /\.hero-slide img\{[^}]*object-fit:cover/);
  assert.doesNotMatch(css, /\.hero-slide picture[^{]*\{[^}]*object-fit:cover/);
});
test("el fondo desenfocado (respaldo para piezas de otra proporción) solo existe en mobile", () => {
  assert.match(css, /\.hero-slide \.hero-slide-backdrop\{display:none\}/);
  assert.match(heroMobile, /\.hero-slide \.hero-slide-backdrop\{display:block;[^}]*object-fit:cover;filter:blur\(/);
  assert.match(heroMobile, /\.hero-slide picture\{position:relative;z-index:1\}/);
});
test("el fondo es decorativo: misma imagen que la pieza mobile, alt vacío y aria-hidden", () => {
  assert.match(js, /const backdropSrc = hasMobileVariant \? s\.mobileImage : s\.image;/);
  assert.match(js, /<img class="hero-slide-backdrop" src="\$\{esc\(backdropSrc\)\}" alt="" aria-hidden="true"/);
});
test("los indicadores quedan centrados en la franja de controles (7px + 11px = centro a 18px)", () => {
  assert.match(heroMobile, /\.hero-dots\{bottom:7px;pointer-events:none\}/);
  // Fase 50 — el contenedor no intercepta los toques destinados a las flechas.
  assert.match(heroMobile, /\.hero-dot\{pointer-events:auto\}/);
});
test("Fase 50 — flechas mobile en la banda inferior: área táctil 44×44 y círculo visible de 30px", () => {
  assert.match(heroMobile, /\.hero-arrow\{top:auto;bottom:0;transform:none;width:44px;height:44px;[^}]*background:transparent/);
  // Fase 51 — círculo centrado en la franja de 36px (3px + 15px = 18px), alineado con los indicadores.
  assert.match(heroMobile, /\.hero-arrow::before\{content:"";position:absolute;left:7px;bottom:3px;z-index:-1;width:30px;height:30px;/);
  assert.match(heroMobile, /\.hero-arrow:focus-visible::before\{outline:2px solid #fff/);
  assert.doesNotMatch(heroMobile, /\.hero-arrow\{width:34px;height:34px/);
});
test("Fase 50 — tablet/desktop conservan las flechas centradas en vertical", () => {
  assert.match(css, /\.hero-arrow\{position:absolute;top:50%;transform:translateY\(-50%\);z-index:2;width:38px;height:38px;/);
});
test("desktop conserva su marco (proporción medida, sin min-height nuevo)", () => {
  assert.match(css, /\.hero-carousel\{position:relative;aspect-ratio:var\(--hero-desktop-ratio, 16\/9\);height:auto;min-height:260px;/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
