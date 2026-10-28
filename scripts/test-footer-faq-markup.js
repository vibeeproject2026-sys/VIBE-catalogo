// Runs with plain Node, no test framework, no network:
//   node scripts/test-footer-faq-markup.js
//
// Fase 45 — verificación estática de index.html: enlaces de contacto
// oficiales, estructura accesible del acordeón de FAQ, enlaces externos
// seguros, botón de cierre del PDP, y que las respuestas no inventen
// políticas comerciales que el sitio no define.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

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

function section(re) {
  const m = html.match(re);
  assert.ok(m, "bloque no encontrado: " + re);
  return m[0];
}
const footer = section(/<footer>[\s\S]*?<\/footer>/);
const faq = section(/<section id="ayuda"[\s\S]*?<\/section>/);
const contact = section(/<section class="footer-col" id="contacto"[\s\S]*?<\/section>/);
const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

console.log("Footer — Contacto");
test("correo oficial con mailto: funcional", () => {
  assert.ok(contact.includes('href="mailto:vibeeproject2026@gmail.com"'));
});
test("teléfono clicable con tel: e indicativo de Colombia", () => {
  assert.ok(contact.includes('href="tel:+573143490825"'));
});
test("WhatsApp con enlace internacional 57 + número, sin espacios ni símbolos", () => {
  assert.ok(contact.includes('href="https://wa.me/573143490825"'));
  for (const m of html.matchAll(/https:\/\/wa\.me\/([^"?]*)/g)) assert.equal(m[1], "573143490825");
});
test("la sección se titula Contacto y está enlazada con aria-labelledby", () => {
  assert.match(contact, /aria-labelledby="footerContactTitle"/);
  assert.match(contact, /id="footerContactTitle">Contacto</);
});
test("horario y ubicación comercial confirmados por la propietaria; sin dirección física", () => {
  // Cierre — horario y ciudad confirmados; la dirección particular es reservada.
  assert.match(contact, /<span class="footer-contact-label">Horario<\/span><span class="footer-contact-value">Lunes a domingo, 8:00 a\. m\. a 10:00 p\. m\.<\/span>/);
  assert.match(contact, /<span class="footer-contact-label">Ubicación<\/span><span class="footer-contact-value">Chía, Cundinamarca, Colombia<\/span>/);
  assert.doesNotMatch(footer, /calle |carrera |dirección:|\b(cra|cl)\.?\s*\d/i);
});
test("conserva los enlaces existentes y agrega Preguntas frecuentes", () => {
  for (const href of ['href="#catalogo"', 'href="#ofertas"', 'href="https://www.instagram.com/beautyvibe.col/"', 'href="#ayuda"']) {
    assert.ok(footer.includes(href), "falta " + href);
  }
});

console.log("Enlaces externos");
test("todo enlace target=_blank lleva rel=noopener noreferrer", () => {
  const blank = anchors.filter((a) => /target="_blank"/.test(a));
  assert.ok(blank.length >= 4);
  for (const a of blank) assert.match(a, /rel="noopener noreferrer"/, a);
});
test("Instagram apunta al perfil oficial", () => {
  const ig = anchors.filter((a) => /instagram\.com/.test(a));
  assert.ok(ig.length >= 2);
  for (const a of ig) assert.match(a, /href="https:\/\/www\.instagram\.com\/beautyvibe\.col\/"/);
});
test("el círculo decorativo de Instagram no intercepta toques", () => {
  assert.match(css, /\.instagram-vibe:after\{[^}]*pointer-events:none/);
  assert.match(css, /\.instagram-vibe-inner\{[^}]*z-index:1/);
});

console.log("Preguntas frecuentes — accesibilidad");
const buttons = [...faq.matchAll(/<button[^>]*class="faq-q"[^>]*>/g)].map((m) => m[0]);
test("hay preguntas y cada una es un <button type=button> dentro de un <h3>", () => {
  assert.ok(buttons.length >= 6);
  assert.equal((faq.match(/<h3><button type="button" class="faq-q"/g) || []).length, buttons.length);
});
test("cada botón tiene id, aria-expanded=false y aria-controls a un panel existente", () => {
  for (const b of buttons) {
    const id = b.match(/id="([^"]+)"/)[1];
    const controls = b.match(/aria-controls="([^"]+)"/)[1];
    assert.match(b, /aria-expanded="false"/);
    const panel = faq.match(new RegExp(`<div class="faq-a" id="${controls}"[^>]*>`));
    assert.ok(panel, "no existe el panel " + controls);
    assert.match(panel[0], /role="region"/);
    assert.match(panel[0], new RegExp(`aria-labelledby="${id}"`));
    assert.match(panel[0], /\shidden>/);
  }
});
test("los ids de preguntas y paneles son únicos en la página", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "ids duplicados");
});
test("el acordeón se carga desde js/faq.js", () => {
  assert.match(html, /<script type="module" src="js\/faq\.js"><\/script>/);
  assert.match(faq, /data-accordion/);
});

console.log("Preguntas frecuentes — contenido fiel al flujo real");
const faqText = faq.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
test("no presenta el envío del formulario como compra confirmada", () => {
  assert.match(faqText, /Todavía no/);
  assert.match(faqText, /queda registrado en VIBE/);
});
test("no inventa costos, tiempos, devoluciones, garantías ni medios de pago no confirmados", () => {
  assert.doesNotMatch(faqText, /\$\s?\d|gratis|\d+\s*(días|horas|hábiles)|daviplata|contraentrega|contra entrega|efectivo|débito|devoluci|garant|reembols/i);
});
test("envío y pago: cobertura Colombia, costo según destino confirmado por WhatsApp y medios confirmados", () => {
  // Cierre — datos confirmados por la propietaria (antes: «se acuerdan por WhatsApp»).
  assert.match(faqText, /Realizamos envíos dentro de Colombia\./);
  assert.match(faqText, /dependen del destino y te los confirmamos por WhatsApp antes de cerrar tu pedido/);
  assert.match(faqText, /transferencia bancaria, Nequi, PSE, Bre-B o tarjeta de crédito/);
  assert.match(faq, /<a href="legal\.html#envios">Información legal<\/a>/);
});

console.log("PDP — botón de cierre");
test("la X tiene type=button y un nombre accesible", () => {
  assert.match(html, /<button id="closeProduct" class="x dialog-x" type="button" aria-label="Cerrar ficha de producto">/);
});
test("la X mide al menos 44×44 y tiene :focus-visible propio", () => {
  const rule = css.match(/\.dialog-x\{[^}]*\}/)[0];
  assert.match(rule, /width:44px/);
  assert.match(rule, /height:44px/);
  assert.match(rule, /position:sticky/);
  assert.match(css, /\.dialog-x:focus-visible\{[^}]*outline:2px solid/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
