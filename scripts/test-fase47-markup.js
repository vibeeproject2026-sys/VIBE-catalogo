// Runs with plain Node, no test framework, no network:
//   node scripts/test-fase47-markup.js
//
// Fase 47 — verificación estática: franja editorial, encabezados de
// Ofertas y Catálogo, X del PDP, botón Eliminar del carrito y favicon
// del Admin apuntando a assets que existen.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");

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

console.log("Franja editorial");
const ticker = html.match(/<div class="vibe-ticker"[\s\S]*?<\/div>\s*<\/div>/);
test("existe entre el Hero y Descubre tu VIBE", () => {
  assert.ok(ticker);
  const iHero = html.indexOf('<section id="inicio"');
  const iTicker = html.indexOf('class="vibe-ticker"');
  const iDiscover = html.indexOf('<section id="discoverVibe"');
  assert.ok(iHero < iTicker && iTicker < iDiscover);
});
test("los 4 mensajes de marca, una copia visible y otra aria-hidden para el bucle", () => {
  const groups = [...ticker[0].matchAll(/<ul class="vibe-ticker-group"([^>]*)>([\s\S]*?)<\/ul>/g)];
  assert.equal(groups.length, 2);
  assert.equal(groups[0][1].trim(), "");
  assert.match(groups[1][1], /aria-hidden="true"/);
  const items = (g) => [...g.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(items(groups[0][2]), ["Tu ritual. Tu VIBE.", "Descubre tus esenciales de belleza.", "Explora. Combina. Exprésate.", "Encuentra tu próximo VIBE."]);
  assert.deepEqual(items(groups[1][2]), items(groups[0][2]));
});
test("sin afirmaciones comerciales (descuentos, envíos, precios)", () => {
  assert.doesNotMatch(ticker[0], /%|gratis|envío|descuento|\$|oferta/i);
});
test("rosa claro, animación CSS, sin scroll horizontal y con prefers-reduced-motion", () => {
  assert.match(css, /\.vibe-ticker\{[^}]*overflow:hidden[^}]*background:#FFB8D0/);
  assert.match(css, /@keyframes vibe-ticker/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\s*\.vibe-ticker-track\{animation:none\}/);
});
test("altura objetivo en mobile (38–46px)", () => {
  const m = css.match(/\.vibe-ticker\{height:(\d+)px\}/);
  assert.ok(m && Number(m[1]) >= 38 && Number(m[1]) <= 46, m && m[1]);
});

console.log("Encabezados");
test("Catálogo: sin el breadcrumb aislado «Inicio» y con encabezado masthead", () => {
  assert.doesNotMatch(html, /id="catalogBreadcrumb"/);
  assert.doesNotMatch(app, /catalogBreadcrumb/);
  assert.match(html, /<div class="heading heading-catalog">[\s\S]*?COLECCIÓN[\s\S]*?id="catalogTitle"/);
});
test("Ofertas (página): copy neutro por defecto, sin sugerir descuentos", () => {
  const block = html.match(/<section id="ofertas"[\s\S]*?<\/section>/)[0];
  assert.match(block, /id="ofertasEyebrow">OFERTAS VIBE</);
  assert.match(block, /id="ofertasLead">Cuando haya promociones activas, las verás aquí\.</);
  assert.doesNotMatch(block.match(/<div class="heading[\s\S]*?<\/div>\s*<\/div>/)[0], /precios especiales|Pequeños precios/);
});
test("Ofertas (Home, visible solo con promociones): titular creativo", () => {
  const block = html.match(/<section id="ofertasHome" class="featured hidden">[\s\S]*?<\/section>/)[0];
  assert.match(block, /SOLO EN OFERTAS VIBE/);
  assert.match(block, /Pequeños precios\. <span class="title-accent">Grandes VIBES\.<\/span>/);
});

console.log("X del modal y carrito");
test("la X conserva 44×44, foco visible y trazo más fino", () => {
  const rule = css.match(/\.dialog-x\{[^}]*\}/)[0];
  assert.match(rule, /width:44px/);
  assert.match(rule, /height:44px/);
  assert.match(css, /\.dialog-x:focus-visible\{[^}]*outline:2px solid/);
  assert.match(html, /id="closeProduct"[\s\S]*?stroke-width="1\.6"/);
});
test("Eliminar del carrito: botón visible con papelera y nombre accesible", () => {
  assert.match(app, /class="remove" data-a="del" \$\{ids\} aria-label="Eliminar \$\{esc\(i\.name\)\} del carrito">\$\{TRASH_ICON\}<span>Eliminar<\/span>/);
  assert.match(app, /bindCartSwipe\(\$\("#cartItems"\)\)/);
});
test("el estilo nuevo de Eliminar no cambia el «Quitar» del checkout", () => {
  assert.match(css, /\.cart-item \.remove\{/);
  assert.match(app, /class="remove" data-remove-line[^>]*>Quitar</);
});

console.log("Favicon del Admin");
test("el Admin declara los favicons oficiales con rutas absolutas existentes", () => {
  const hrefs = [...admin.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/assets/favicon/favicon-16.png", "/assets/favicon/favicon-32.png", "/assets/favicon/favicon-48.png", "/assets/favicon/apple-touch-icon.png"]);
  for (const h of hrefs) assert.ok(fs.existsSync(path.join(root, h)), "no existe " + h);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
