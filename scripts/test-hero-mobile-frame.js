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
const heroMobile = mobileBlocks.find((b) => b.includes(".hero-carousel{min-height:0;aspect-ratio:auto;padding-bottom:0}")) || "";

test("Fase 54 — el marco mide exactamente la pieza (proporción medida), sin franja inferior; sin bandas forzadas", () => {
  assert.ok(heroMobile, "no se encontró el bloque mobile del Hero");
  assert.match(heroMobile, /\.hero-carousel\{min-height:0;aspect-ratio:auto;padding-bottom:0\}/);
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
  // Fase 57 — + srcset optimizado opcional: el mismo de la pieza visible
  // (mobileImageSrcset con variante mobile, imageSrcset si no).
  assert.match(js, /<img class="hero-slide-backdrop" src="\$\{esc\(backdropSrc\)\}"\$\{backdropAttrs\} alt="" aria-hidden="true"/);
  assert.match(js, /const backdropSet = hasMobileVariant \? s\.mobileImageSrcset : s\.imageSrcset;/);
});
test("Fase 54 — indicadores superpuestos abajo sobre la pieza (9px + 11px = centro a 20px), con sombra de contraste", () => {
  assert.match(heroMobile, /\.hero-dots\{bottom:9px;gap:0;pointer-events:none;filter:drop-shadow\(/);
  // Fase 50 — el contenedor no intercepta los toques destinados a las flechas.
  assert.match(heroMobile, /\.hero-dot\{pointer-events:auto\}/);
});
test("Fase 54 — flechas superpuestas en las esquinas inferiores: área táctil 44×44 y círculo translúcido de 28px", () => {
  assert.match(heroMobile, /\.hero-arrow\{top:auto;bottom:0;transform:none;width:44px;height:44px;[^}]*background:transparent/);
  // Círculo con centro a 20px del borde (6px + 14px), alineado con los indicadores.
  assert.match(heroMobile, /\.hero-arrow::before\{content:"";position:absolute;left:8px;bottom:6px;z-index:-1;width:28px;height:28px;/);
  assert.match(heroMobile, /\.hero-arrow:focus-visible::before\{outline:2px solid #fff/);
  assert.doesNotMatch(heroMobile, /\.hero-arrow\{width:34px;height:34px/);
});
test("Fase 50 — tablet/desktop conservan las flechas centradas en vertical", () => {
  assert.match(css, /\.hero-arrow\{position:absolute;top:50%;transform:translateY\(-50%\);z-index:2;width:38px;height:38px;/);
});
test("Fase 53 — escritorio: el carrusel ocupa 2/3 del Hero; tablet no cambia", () => {
  const desk = (css.match(/@media\(min-width:901px\)\{([\s\S]*?)\n\}/) || [])[1] || "";
  assert.match(desk, /\.hero-grid\{grid-template-columns:1fr 2fr;/);
  assert.match(css, /\.hero-grid\{display:grid;grid-template-columns:2fr 3fr;/);
  assert.match(css, /@media\(max-width:900px\)\{[\s\S]*?\.hero-grid\{grid-template-columns:1fr\}/);
});
test("Fase 53 — tarjetas de Descubre en mobile más contenidas que la pieza del Hero", () => {
  assert.match(css, /\.discover-tile\{width:248px;height:310px\}/);
});
test("desktop conserva su marco (proporción medida, sin min-height nuevo)", () => {
  assert.match(css, /\.hero-carousel\{position:relative;aspect-ratio:var\(--hero-desktop-ratio, 16\/9\);height:auto;min-height:260px;/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
