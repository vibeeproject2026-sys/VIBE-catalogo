// Runs with plain Node, no network:
//   node scripts/test-social-buttons.js
//
// Redes: dos botones independientes (Instagram y TikTok) en la sección
// donde estaba el botón de Instagram, con los perfiles oficiales exactos
// confirmados por la propietaria, logos en SVG propio y accesibles.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
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

const OFFICIAL = {
  instagram: "https://www.instagram.com/beautyvibe.col/",
  tiktok: "https://www.tiktok.com/@beautyvibe.col?is_from_webapp=1&sender_device=pc",
};
const section = (html.match(/<section id="instagram" class="instagram-vibe">[\s\S]*?<\/section>/) || [""])[0];
const buttons = [...section.matchAll(/<a class="social-button social-(instagram|tiktok)" ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ net: m[1], attrs: m[2], body: m[3] }));
const decode = (s) => s.replace(/&amp;/g, "&");
const attr = (b, name) => decode((b.attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || "");

console.log("Redes — botones de Instagram y TikTok");
test("en la sección de redes, en lugar del botón anterior: dos botones independientes, Instagram primero", () => {
  assert.ok(section, "sección #instagram");
  assert.deepEqual(buttons.map((b) => b.net), ["instagram", "tiktok"]);
  assert.match(section, /<div class="social-buttons">/);
  assert.doesNotMatch(section, /Seguir en Instagram →/);
  assert.match(section, /<p class="instagram-handle">@beautyvibe\.col<\/p>/);
});
test("destinos exactos de los perfiles oficiales", () => {
  assert.equal(attr(buttons[0], "href"), OFFICIAL.instagram);
  assert.equal(attr(buttons[1], "href"), OFFICIAL.tiktok);
  // En el HTML el & va escapado como &amp; (el navegador lo decodifica al mismo destino).
  assert.ok(buttons[1].attrs.includes('href="https://www.tiktok.com/@beautyvibe.col?is_from_webapp=1&amp;sender_device=pc"'));
});
test("pestaña nueva con protección y nombre accesible por botón", () => {
  for (const b of buttons) {
    assert.equal(attr(b, "target"), "_blank");
    assert.equal(attr(b, "rel"), "noopener noreferrer");
  }
  assert.equal(attr(buttons[0], "aria-label"), "Seguir a VIBE en Instagram (se abre en una pestaña nueva)");
  assert.equal(attr(buttons[1], "aria-label"), "Seguir a VIBE en TikTok (se abre en una pestaña nueva)");
});
test("logos en SVG propio (decorativos para lectores de pantalla), sin emojis ni imágenes externas", () => {
  for (const b of buttons) {
    assert.match(b.body, /<span class="social-icon" aria-hidden="true"><svg [^>]*focusable="false"/);
    assert.doesNotMatch(b.body, /<img|https?:\/\/[^"]*\.(png|jpe?g|webp|svg)/);
    assert.doesNotMatch(b.body, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  }
  // Iconos propios de VIBE: un sprite con los dos glifos, usados por <use>.
  assert.match(buttons[0].body, /<use href="#vibeIgGlyph"\/>/);
  assert.match(buttons[1].body, /<use href="#vibeTtGlyph"\/>/);
  const sprite = html.match(/<svg class="svg-sprite"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>/);
  assert.ok(sprite, "sprite de iconos oculto para lectores de pantalla");
  // Instagram: marco crema, lente rosa VIBE. TikTok: nota con acentos turquesa y rosa, trazo crema.
  assert.match(sprite[0], /<symbol id="vibeIgGlyph"[\s\S]*stroke="#F5E6D8"[\s\S]*stroke="#FF007A"[\s\S]*<\/symbol>/);
  assert.match(sprite[0], /<symbol id="vibeTtGlyph"[\s\S]*stroke="#25F4EE"[\s\S]*stroke="#FF007A"[\s\S]*stroke="#F5E6D8"[\s\S]*<\/symbol>/);
  assert.doesNotMatch(sprite[0], /<img|https?:\/\/[^"]*\.(png|jpe?g|webp|svg)|<script/);
  assert.match(css, /\.svg-sprite\{position:absolute;width:0;height:0;overflow:hidden\}/);
});
test("textos visibles: «Síguenos» + nombre de la red", () => {
  assert.match(buttons[0].body, /<span class="social-kicker">Síguenos<\/span><span class="social-name">Instagram<\/span>/);
  assert.match(buttons[1].body, /<span class="social-kicker">Síguenos<\/span><span class="social-name">TikTok<\/span>/);
});
test("estilos: hover sutil, foco visible, mobile lado a lado y movimiento reducido", () => {
  assert.match(css, /\.social-button:hover\{transform:translateY\(-3px\)\}/);
  assert.match(css, /\.social-button:focus-visible\{outline:2px solid var\(--pink\);outline-offset:4px\}/);
  assert.match(css, /\.social-instagram \.social-icon\{background:radial-gradient\(/);
  const mobile = css.match(/@media\(max-width:640px\)\{[\s\S]*?\n\}/g).find((b) => b.includes(".social-buttons"));
  assert.ok(mobile, "bloque mobile de redes");
  assert.match(mobile, /\.social-buttons\{flex-wrap:nowrap;gap:10px\}/);
  assert.match(mobile, /\.social-button\{flex:1 1 0;min-width:0;/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.social-button,\.social-arrow\{transition:none\}\.social-button:hover\{transform:none\}/);
  // El círculo decorativo de la sección sigue sin interceptar toques.
  assert.match(css, /\.instagram-vibe:after\{[^}]*pointer-events:none/);
});

console.log("Pie de página — Instagram y TikTok");
const footer = (html.match(/<footer>[\s\S]*?<\/footer>/) || [""])[0];
const explora = (footer.match(/<nav class="footer-col" aria-labelledby="footerExploreTitle">[\s\S]*?<\/nav>/) || [""])[0];
test("Explora conserva Instagram y agrega TikTok a continuación, con sus destinos oficiales", () => {
  const items = [...explora.matchAll(/<li><a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a><\/li>/g)].map((m) => ({ href: decode(m[1]), attrs: m[2], body: m[3], text: m[3].replace(/<svg[\s\S]*?<\/svg>/g, "").trim() }));
  assert.deepEqual(items.map((i) => i.text), ["Catálogo", "Ofertas", "Preguntas frecuentes", "Instagram", "TikTok"]);
  assert.equal(items[3].href, OFFICIAL.instagram);
  assert.equal(items[4].href, OFFICIAL.tiktok);
  for (const i of items.slice(3)) {
    assert.match(i.attrs, /target="_blank" rel="noopener noreferrer"/);
    assert.match(i.body, /^<svg class="footer-social-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"/);
  }
  // Los iconos del pie son los mismos glifos del bloque principal, en tamaño reducido.
  assert.match(items[3].body, /<use href="#vibeIgGlyph"\/>/);
  assert.match(items[4].body, /<use href="#vibeTtGlyph"\/>/);
  assert.match(css, /\.footer-social-icon\{flex-shrink:0;margin-right:8px\}/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
