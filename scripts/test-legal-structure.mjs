// Runs with plain Node, no network:
//   node scripts/test-legal-structure.mjs
//
// Información legal y comercial (js/legal.js → legal.html y pie):
// - solo datos confirmados por la propietaria, sin sus datos personales
//   reservados (nombre legal, identificación, dirección particular);
// - nada de políticas voluntarias, plazos o procedimientos inventados, ni
//   afirmaciones de cumplimiento integral;
// - legal.html coincide con js/legal.js y se lee sin JavaScript;
// - todo se escapa al pintarse.

import assert from "node:assert/strict";
import fs from "node:fs";
import { LEGAL, LEGAL_PAGE, legalFooterHtml, legalPageHtml } from "../js/legal.js";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    failed++;
    console.error("  FAIL - " + name);
    console.error("    " + e.message);
  }
}
const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const index = read("index.html");
const page = read("legal.html");
const css = read("css/styles.css");
const app = read("js/app.js");
const pageText = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const allText = JSON.stringify(LEGAL);

console.log("Datos confirmados por la propietaria");
await test("identidad, ubicación comercial, contacto y horario exactos", () => {
  assert.deepEqual(LEGAL.identity, {
    brand: "VIBE",
    expandedName: "Vibrant Iconic Beauty Essentials",
    location: "Chía, Cundinamarca, Colombia",
    hours: "Lunes a domingo, de 8:00 a. m. a 10:00 p. m.",
  });
  assert.equal(LEGAL.contact.whatsapp, "314 349 0825");
  assert.equal(LEGAL.contact.whatsappUrl, "https://wa.me/573143490825");
  assert.equal(LEGAL.contact.email, "vibeeproject2026@gmail.com");
  assert.equal(LEGAL.contact.instagram, "@beautyvibe.col");
});
await test("envíos: cobertura Colombia; costo y condiciones se confirman según destino; sin tarifas ni plazos", () => {
  const t = JSON.stringify(LEGAL.policies.find((p) => p.id === "envios"));
  assert.match(t, /dentro de Colombia/);
  assert.match(t, /dependen del destino y te los confirmamos por WhatsApp antes de cerrar tu pedido/);
  assert.doesNotMatch(t, /\$\s?\d|gratis|\d+\s*(días|horas)/i);
});
await test("medios de pago: exactamente los confirmados", () => {
  const list = LEGAL.policies.find((p) => p.id === "pagos").blocks.find((b) => b && b.list).list;
  assert.deepEqual(list, ["Transferencia bancaria", "Nequi", "PSE", "Bre-B", "Tarjeta de crédito"]);
  assert.doesNotMatch(allText, /contraentrega|contra entrega|daviplata|efectivo|tarjeta débito|tarjeta de débito/i);
});

console.log("Privacidad de la propietaria");
await test("sin nombre legal, identificación, razón social, tipo societario ni dirección física", () => {
  for (const text of [allText, page, index]) {
    assert.doesNotMatch(text, /\bNIT\b|C\.C\.|c[ée]dula|raz[óo]n social|S\.A\.S|\bSAS\b|Ltda|\b(calle|carrera|cra\.?|cl\.|avenida|diagonal|transversal)\s*\d/i);
  }
  assert.deepEqual(Object.keys(LEGAL.identity).sort(), ["brand", "expandedName", "hours", "location"]);
});
await test("VIBE se presenta como marca comercial, no como sociedad", () => {
  assert.match(allText, /marca comercial/);
  assert.doesNotMatch(allText, /sociedad|empresa legalmente constituida/i);
});

console.log("Sin afirmaciones engañosas");
await test("no afirma cumplimiento integral ni inventa plazos de conservación", () => {
  assert.doesNotMatch(allText, /cumple (integralmente|con toda|plenamente)|cumplimiento (total|integral)/i);
  assert.doesNotMatch(allText, /conserva(mos|remos)[^"]{0,80}(\d+|años|meses)/i);
});
await test("cambios: sin política voluntaria; la garantía legal no se pierde por abrir el producto", () => {
  const t = JSON.stringify(LEGAL.policies.find((p) => p.id === "cambios"));
  assert.match(t, /no ofrece una política adicional de cambios/);
  assert.match(t, /Abrir un cosmético no elimina por sí solo la garantía legal/);
  assert.doesNotMatch(t, /no se aceptan (cambios|devoluciones)|productos abiertos no tienen/i);
  assert.match(t, /artículo 47 de la Ley 1480 de 2011/);
  assert.match(t, /artículo 51 de la Ley 1480 de 2011/);
});
await test("datos personales: canal de contacto confirmado, finalidades del flujo real y derechos de ley", () => {
  const t = JSON.stringify(LEGAL.policies.find((p) => p.id === "datos"));
  assert.match(t, /vibeeproject2026@gmail\.com/);
  assert.match(t, /Ley 1581 de 2012/);
  assert.match(t, /Contactarte por WhatsApp/);
  assert.match(t, /Enviarte por correo el resumen de tu pedido/);
});

console.log("Página, pie y checkout");
await test("legal.html coincide con js/legal.js y no depende de JavaScript", () => {
  const start = "<!-- legal:start (generado por scripts/build-legal.mjs; no editar a mano) -->\n";
  const body = page.slice(page.indexOf(start) + start.length, page.indexOf("\n<!-- legal:end -->"));
  assert.equal(body, legalPageHtml(), "ejecuta: node scripts/build-legal.mjs");
  assert.doesNotMatch(page, /<script/);
  for (const id of ["envios", "pagos", "cambios", "datos", "contacto-legal"]) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(pageText, /Vigente desde el 28 de octubre de 2026\./);
});
await test("legal.html: canonical en el dominio oficial, título y hoja de estilos del sitio", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/www\.vibebeautycol\.com\/legal\.html">/);
  assert.match(page, /<title>Información legal · VIBE<\/title>/);
  assert.match(page, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(page, /<html lang="es">/);
  assert.match(css, /\.legal-section\{/);
});
await test("pie: columna «Legal» con un enlace por política hacia legal.html", () => {
  const out = legalFooterHtml();
  for (const id of ["envios", "pagos", "cambios", "datos"]) assert.match(out, new RegExp(`href="${LEGAL_PAGE}#${id}"`));
  assert.match(index, /<section class="footer-col" id="legal" aria-labelledby="footerLegalTitle" hidden><\/section>/);
  assert.match(index, /<script type="module" src="js\/legal\.js"><\/script>/);
});
await test("checkout: la autorización cubre el tratamiento de datos y enlaza la política", () => {
  assert.match(app, /Autorizo a VIBE a tratar mis datos para gestionar mi pedido y a contactarme por WhatsApp al número registrado para finalizarlo, según la <a href="legal\.html#datos" target="_blank" rel="noopener noreferrer">Política de tratamiento de datos personales<\/a>\./);
});
await test("sin políticas, la columna del pie queda vacía (oculta); todo se escapa", () => {
  assert.equal(legalFooterHtml({ policies: [] }), "");
  const out = legalPageHtml({ identity: { brand: "<b>" }, contact: {}, policies: [{ id: "x", title: "T<i>", blocks: ["a <b>", { lead: "L<.", text: "t<" }, { list: ["<li>"] }] }] });
  assert.doesNotMatch(out, /<b>|<i>|<li><li>/);
  assert.match(out, /&lt;b&gt;/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
