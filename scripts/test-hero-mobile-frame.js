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
const heroMobile = mobileBlocks.find((b) => b.includes(".hero-carousel{min-height:75vw}")) || "";

test("el marco mobile crece hasta 4:3 como mínimo (min-height:75vw), no una altura rígida", () => {
  assert.ok(heroMobile, "no se encontró el bloque mobile del Hero");
  assert.match(heroMobile, /\.hero-carousel\{min-height:75vw\}/);
  assert.doesNotMatch(heroMobile, /\.hero-carousel\{[^}]*height:\d+px/);
});
test("la pieza real se sigue mostrando completa (contain) y nunca con cover", () => {
  assert.match(css, /\.hero-slide img\{width:100%;height:100%;object-fit:contain;display:block\}/);
  assert.match(heroMobile, /\.hero-slide img\{object-fit:contain\}/);
  assert.doesNotMatch(css, /\.hero-slide img\{[^}]*object-fit:cover/);
  assert.doesNotMatch(css, /\.hero-slide picture[^{]*\{[^}]*object-fit:cover/);
});
test("el fondo desenfocado solo existe en mobile (oculto en tablet/desktop)", () => {
  assert.match(css, /\.hero-slide \.hero-slide-backdrop\{display:none\}/);
  assert.match(heroMobile, /\.hero-slide \.hero-slide-backdrop\{display:block;[^}]*object-fit:cover;filter:blur\(/);
  assert.match(heroMobile, /\.hero-slide picture\{position:relative;z-index:1\}/);
});
test("el fondo es decorativo: misma imagen que la pieza mobile, alt vacío y aria-hidden", () => {
  assert.match(js, /const backdropSrc = hasMobileVariant \? s\.mobileImage : s\.image;/);
  assert.match(js, /<img class="hero-slide-backdrop" src="\$\{esc\(backdropSrc\)\}" alt="" aria-hidden="true"/);
});
test("los indicadores bajan a la banda inferior en mobile", () => {
  assert.match(heroMobile, /\.hero-dots\{bottom:4px\}/);
});
test("desktop conserva su marco (proporción medida, sin min-height nuevo)", () => {
  assert.match(css, /\.hero-carousel\{position:relative;aspect-ratio:var\(--hero-desktop-ratio, 16\/9\);height:auto;min-height:260px;/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
