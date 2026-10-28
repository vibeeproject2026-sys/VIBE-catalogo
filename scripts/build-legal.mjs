// Regenera el contenido estático de legal.html desde js/legal.js (única
// fuente). El texto legal queda en el HTML: se lee sin JavaScript y lo ven
// los buscadores. test-legal-structure.mjs falla si quedan desincronizados.
//   node scripts/build-legal.mjs
import fs from "node:fs";
import { legalPageHtml } from "../js/legal.js";

const file = new URL("../legal.html", import.meta.url);
const START = "<!-- legal:start (generado por scripts/build-legal.mjs; no editar a mano) -->";
const END = "<!-- legal:end -->";
const html = fs.readFileSync(file, "utf8");
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < a) throw new Error("legal.html: faltan los marcadores legal:start / legal:end");
fs.writeFileSync(file, html.slice(0, a + START.length) + "\n" + legalPageHtml() + "\n" + html.slice(b));
console.log("legal.html actualizado");
