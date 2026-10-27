// Runs with plain Node, no test framework, no network:
//   node scripts/test-catalog-filters-mobile.js
//
// Fase 54 — cabecera y filtros del Catálogo:
// - las subcategorías solo se ofrecen dentro de una categoría concreta
//   (en «Todos» mezclaban subcategorías de varias categorías y parecían
//   duplicar la fila de grupos);
// - en mobile se muestran en un selector compacto que aplica exactamente
//   el mismo filtro que los chips (que siguen en tablet/escritorio);
// - encabezado compacto en mobile, sin tocar el de escritorio.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");

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

test("subcategorías solo con una categoría concreta en contexto", () => {
  assert.match(app, /const subcategoriesHere = effectiveCategory !== "Todos" \? getSubcategories\(state\.products, state\.group, effectiveCategory\) : \[\];/);
});
test("chips y selector se muestran/ocultan juntos y con la misma lista", () => {
  assert.match(app, /\$\("#subcategoryTabs"\)\.classList\.toggle\("hidden", !showSubcategoryRow\);\s*\$\("#subcategorySelectWrap"\)\.classList\.toggle\("hidden", !showSubcategoryRow\);/);
  assert.match(app, /\$\("#subcategorySelect"\)\.innerHTML = options\.map/);
});
test("el selector aplica el mismo filtro que los chips (state.subcategory → URL)", () => {
  assert.match(app, /\$\("#subcategorySelect"\)\.addEventListener\("change", e => \{\s*state\.subcategory = e\.target\.value;\s*applyFiltersAndRender\(\);/);
  assert.match(app, /\$\("#subcategoryTabs"\)\.addEventListener\("click"/);
});
test("markup: selector accesible justo después de la fila de chips", () => {
  assert.match(html, /<div id="subcategoryTabs" class="tabs tabs-sub hidden"><\/div>\s*<!--[\s\S]*?-->\s*<label id="subcategorySelectWrap" class="subcategory-select hidden"><span>Subcategoría<\/span><select id="subcategorySelect" aria-label="Filtrar por subcategoría"><\/select><\/label>/);
});
test("CSS: selector solo en mobile; chips de subcategoría solo en tablet/escritorio", () => {
  assert.match(css, /\.subcategory-select\{display:none\}/);
  const block = css.slice(css.lastIndexOf(".subcategory-select{display:none}"));
  assert.match(block, /@media\(max-width:640px\)\{\s*#subcategoryTabs\{display:none\}\s*\.subcategory-select\{display:flex;/);
  assert.match(block, /\.subcategory-select\.hidden\{display:none\}/);
});
test("los chips nunca parten su texto en varias líneas", () => {
  assert.match(css, /\.tab\{white-space:nowrap;flex-shrink:0\}/);
});
test("encabezado del Catálogo compacto en mobile; escritorio intacto", () => {
  const block = css.slice(css.lastIndexOf(".subcategory-select{display:none}"));
  assert.match(block, /\.heading-catalog h2\{font-size:34px\}/);
  assert.match(block, /\.catalog-brand\{display:flex;[^}]*border-left:0\}/);
  assert.match(block, /\.catalog-brand-title\{margin:0;font-size:11px;/);
  assert.match(css, /\.heading-catalog h2\{font-size:clamp\(42px,5vw,64px\);line-height:\.95\}/);
  assert.match(css, /\.catalog-brand\{max-width:34ch;padding-left:20px;border-left:3px solid var\(--pink\)\}/);
  assert.match(html, /<p class="catalog-brand-title">Beauty for your <span class="title-accent">VIBE\.<\/span><\/p>/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
