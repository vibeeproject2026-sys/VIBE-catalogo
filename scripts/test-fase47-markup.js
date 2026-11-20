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

console.log("Label superior (pieza gráfica aprobada)");
// Sustituye a la franja de texto de las Fases 47/48: la propietaria aprobó
// una composición gráfica exacta que se usa completa, tal cual. Ajuste
// posterior: franja compacta con desplazamiento continuo en todos los tamaños.
const label = html.match(/<div class="vibe-label"[\s\S]*?<\/div>\s*<\/div>/);
const APPROVED_ALT = "VIBE. Cruelty free. Vegan beauty. Beauty finds, handpicked. Own your glow. Tu ritual. Tu VIBE.";
test("existe entre el Hero y Descubre tu VIBE (misma ubicación que la franja anterior)", () => {
  assert.ok(label);
  const iHero = html.indexOf('<section id="inicio"');
  const iLabel = html.indexOf('class="vibe-label"');
  const iDiscover = html.indexOf('<section id="discoverVibe"');
  assert.ok(iHero < iLabel && iLabel < iDiscover);
  assert.doesNotMatch(html, /vibe-ticker/);
});
test("usa la pieza aprobada completa (AVIF + WebP), sin texto ni HTML encima; 6 copias aria-hidden para el bucle", () => {
  const pieces = [...label[0].matchAll(/<picture class="vibe-label-piece( vibe-label-copy)?"([^>]*)>([\s\S]*?)<\/picture>/g)];
  assert.equal(pieces.length, 7);
  for (const p of pieces) {
    assert.ok(p[3].startsWith('<source type="image/avif" srcset="assets/brand/label/vibe-label.avif"><img src="assets/brand/label/vibe-label.webp" width="2172" height="354" '));
  }
  assert.equal(pieces[0][1], undefined);
  assert.ok(pieces[0][3].includes(`alt="${APPROVED_ALT}"`));
  for (const p of pieces.slice(1)) {
    assert.equal(p[1], " vibe-label-copy");
    assert.match(p[2], /aria-hidden="true"/);
    assert.match(p[3], /alt=""/);
    assert.doesNotMatch(p[3], /loading="lazy"/); // misma imagen ya cargada: sin espera al entrar
  }
  // Nada más dentro del label: ni textos, ni iconos, ni listas.
  const rest = label[0].replace(/<picture[\s\S]*?<\/picture>/g, "").replace(/<[^>]+>/g, "").trim();
  assert.equal(rest, "");
});
test("recursos: versiones optimizadas con las dimensiones declaradas y original conservado", () => {
  const dir = path.join(root, "assets/brand/label");
  const webp = fs.readFileSync(path.join(dir, "vibe-label.webp"));
  assert.equal(webp.toString("ascii", 0, 4), "RIFF");
  assert.equal(webp.toString("ascii", 8, 12), "WEBP");
  // Dimensiones según el tipo de bloque: VP8 (con pérdida) o VP8X (extendido).
  const kind = webp.toString("ascii", 12, 16);
  const dims = kind === "VP8 " ? [webp.readUInt16LE(26) & 0x3fff, webp.readUInt16LE(28) & 0x3fff] : kind === "VP8X" ? [1 + webp.readUIntLE(24, 3), 1 + webp.readUIntLE(27, 3)] : null;
  assert.deepEqual(dims, [2172, 354]);
  const avif = fs.readFileSync(path.join(dir, "vibe-label.avif"));
  assert.equal(avif.toString("ascii", 4, 12), "ftypavif");
  assert.ok(fs.existsSync(path.join(dir, "original/vibe-label-aprobado-original.png")));
});
test("franja compacta en movimiento continuo en todos los tamaños; ancho entero en px y alto por proporción; avance de exactamente una pieza", () => {
  assert.ok(css.includes(".vibe-label{--label-w:687px;overflow:hidden;background:#fdfdfe;line-height:0}"));
  assert.ok(css.includes(".vibe-label-track{display:flex;width:max-content;animation:vibe-label-scroll 26s linear infinite}"));
  assert.ok(css.includes(".vibe-label:hover .vibe-label-track{animation-play-state:paused}"));
  assert.ok(css.includes(".vibe-label-piece img{display:block;width:var(--label-w);height:auto}"));
  assert.ok(css.includes("@keyframes vibe-label-scroll{from{transform:translateX(0)}to{transform:translateX(calc(-1 * var(--label-w)))}}"));
  assert.match(css, /@media\(min-width:641px\) and \(max-width:900px\)\{\s*\.vibe-label\{--label-w:589px\}\s*\.vibe-label-track\{animation-duration:24s\}\s*\}/);
  const mobile = css.match(/@media\(max-width:640px\)\{[\s\S]*?\n\}/g).find((b) => b.includes(".vibe-label"));
  assert.ok(mobile, "bloque mobile del label");
  assert.match(mobile, /\.vibe-label\{--label-w:620px\}/);
  assert.match(mobile, /\.vibe-label-track\{animation-duration:28s\}/);
  // Con decimales cada copia se redondea por separado y el reinicio salta ~1px.
  for (const m of css.matchAll(/--label-w:([^;}]+)/g)) assert.match(m[1], /^\d+px$/, "ancho entero: " + m[1]);
});
test("prefers-reduced-motion: quieto; en mobile una sola pieza recorrible a mano", () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\s*\.vibe-label-track\{animation:none\}\s*\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\) and \(max-width:640px\)\{\s*\.vibe-label\{overflow-x:auto\}\s*\.vibe-label-copy\{display:none\}\s*\}/);
});

console.log("Encabezados");
test("Catálogo: sin breadcrumb «Inicio» ni bloque negro; dos zonas (título y marca)", () => {
  assert.doesNotMatch(html, /id="catalogBreadcrumb"/);
  assert.doesNotMatch(app, /catalogBreadcrumb/);
  const block = html.match(/<div class="heading heading-catalog">[\s\S]*?<\/div>\s*<\/div>/)[0];
  assert.match(block, /COLECCIÓN[\s\S]*?id="catalogTitle">Catálogo<[\s\S]*?class="catalog-lead[^"]*">Explora por categoría y encuentra tu próximo esencial\./);
  assert.match(block, /class="catalog-brand-title">Beauty for your <span class="title-accent">VIBE\.<\/span>/);
  assert.match(block, /Esenciales de belleza seleccionados para elevar tu ritual\./);
  const rule = css.match(/\.heading-catalog\{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /background:#0b0b0b|background:#000/);
});
test("frases complementarias visibles (≥15px, texto casi negro, filete rosa 3px)", () => {
  const p = css.match(/\.heading>p\{max-width[^}]*\}/)[0];
  assert.match(p, /font-size:15px/);
  assert.match(p, /color:#2a2a2a/);
  assert.match(p, /border-left:3px solid var\(--pink\)/);
  assert.match(css, /\.heading-ofertas>p\{[^}]*font-size:18px/);
});
test("Ofertas (página): copy neutro por defecto, sin sugerir descuentos", () => {
  const block = html.match(/<section id="ofertas"[\s\S]*?<\/section>/)[0];
  assert.match(block, /id="ofertasEyebrow">OFERTAS VIBE</);
  assert.match(block, /id="ofertasLead">Cuando haya promociones activas, las verás aquí\.</);
  assert.doesNotMatch(block.match(/<div class="heading[\s\S]*?<\/div>\s*<\/div>/)[0], /precios especiales|Pequeños precios/);
});
// Fase 56 — había dos secciones con las mismas promociones (#ofertasHome
// y #ofertas): con una promoción activa el bloque se veía duplicado. Ahora
// hay una sola; el titular creativo lo pone ofertasHeadingCopy cuando hay
// promociones.
test("Ofertas: una única sección de promociones (sin el adelanto duplicado)", () => {
  assert.doesNotMatch(html, /id="ofertasHome"/);
  assert.doesNotMatch(app, /ofertasHome/);
  assert.equal((html.match(/<section id="ofertas"/g) || []).length, 1);
  assert.match(app, /function renderOfertasPage\(\)/);
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
