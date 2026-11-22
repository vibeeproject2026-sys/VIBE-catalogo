// Runs with plain Node, no network:
//   node scripts/test-cart-layout.mjs
//
// Carrito: protege contra la causa raíz del corte de descripciones y del
// botón «Eliminar» cortado u oculto, y comprueba «Continuar comprando».
// (El comportamiento real en navegador a 1440/1024/768/390/320 se verifica
// con la prueba de navegador del carrito; ver docs §28.)

import assert from "assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

test("las líneas del artículo (tono, presentación, descripción) se ajustan en varias líneas", () => {
  assert.doesNotMatch(css, /\.opt-part\{white-space:nowrap\}/, "nowrap desbordaba descripciones largas");
  assert.match(css, /\.opt-part\{white-space:normal;overflow-wrap:anywhere\}/);
  assert.match(css, /\.cart-item \.meta\{overflow-wrap:anywhere;/);
});
test("la columna de información no se ensancha por su contenido (no empuja precio ni «Eliminar»)", () => {
  assert.match(css, /\.cart-item-inner\{[^}]*grid-template-columns:64px minmax\(0,1fr\) auto;/);
  assert.match(css, /\.cart-item-inner>div:nth-child\(2\)\{min-width:0\}/);
});
test("móvil: «Eliminar» visible con su texto y área táctil, en fila propia bajo la información", () => {
  const mobile = css.match(/@media\(max-width:640px\)\{[\s\S]*?\n\}/g).find((b) => b.includes(".cart-item .remove"));
  assert.ok(mobile, "bloque móvil del carrito");
  assert.doesNotMatch(mobile, /\.cart-item \.remove span\{position:absolute/, "el texto «Eliminar» no se oculta");
  assert.match(mobile, /\.cart-item-inner\{grid-template-columns:64px minmax\(0,1fr\)\}/);
  assert.match(mobile, /\.cart-item-side\{grid-column:2;flex-direction:row;/);
  assert.match(mobile, /\.cart-item \.remove\{min-height:40px;/);
});
test("cada artículo tiene su botón «Eliminar» visible y la acción de deslizar como atajo", () => {
  assert.match(app, /<button type="button" class="remove" data-a="del" \$\{ids\} aria-label="Eliminar \$\{esc\(i\.name\)\} del carrito">\$\{TRASH_ICON\}<span>Eliminar<\/span><\/button>/);
  assert.match(app, /<button type="button" class="cart-swipe-action" data-a="del"/);
});
test("«Continuar comprando»: botón secundario que solo cierra el carrito (no lo vacía)", () => {
  assert.match(html, /<button type="button" id="continueShopping" class="cart-continue"><span aria-hidden="true">←<\/span>Continuar comprando<\/button>/);
  assert.match(app, /\$\("#continueShopping"\)\.onclick = closeCart;/);
  assert.match(app, /\$\("#continueShopping"\)\.closest\("\.cart-continue-row"\)\.classList\.toggle\("hidden", !items\.length\);/);
  assert.match(html, /<button id="checkoutButton" class="button dark full">Continuar pedido<\/button>/, "«Continuar pedido» sigue siendo la acción principal");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
