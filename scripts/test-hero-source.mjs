// Runs with plain Node, no test framework, no DOM:
//   node scripts/test-hero-source.mjs
//
// js/hero-source.js has zero imports, loaded via a data: URL.

import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../js/hero-source.js", import.meta.url), "utf8");
const { getHeroSlides } = await import("data:text/javascript," + encodeURIComponent(src));

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

console.log("getHeroSlides");
await test("pide GET /api/hero/slides y devuelve el arreglo de slides", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "/api/hero/slides");
    return { ok: true, json: async () => ({ slides: [{ id: "a" }, { id: "b" }] }) };
  };
  const slides = await getHeroSlides(fetchImpl);
  assert.deepEqual(slides.map((s) => s.id), ["a", "b"]);
});
await test("respuesta sin slides[] -> arreglo vacío, nunca undefined", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  assert.deepEqual(await getHeroSlides(fetchImpl), []);
});
await test("HTTP no ok -> lanza (para que el llamador decida el fallback)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => getHeroSlides(fetchImpl));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
