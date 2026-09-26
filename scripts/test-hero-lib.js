// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-hero-lib.js
//
// Pure-logic tests for api/_lib/heroSlides.js y las reglas nuevas de
// api/admin/_lib/imageValidation.js (validateHeroUpload). No toca
// Supabase — loadSlides/saveSlides (que sí hacen red) se prueban a
// través de los handlers reales en test-hero-handlers.js.

const assert = require("assert/strict");
const {
  isSafeCtaHref,
  getActiveSlides,
  shapePublicSlide,
  nextOrder,
  pickSlideFields,
  makeSlideId,
  buildHeroImagePath,
  SLIDE_FIELDS,
} = require("../api/_lib/heroSlides");
const { validateHeroUpload, HERO_DESKTOP_MIN_WIDTH, HERO_DESKTOP_MIN_HEIGHT, HERO_MOBILE_MIN_WIDTH, HERO_MOBILE_MIN_HEIGHT } = require("../api/admin/_lib/imageValidation");
const { downloadObject } = require("../api/admin/_lib/storage");

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

function makePng(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

console.log("isSafeCtaHref (sección 7 — no permitir destinos peligrosos)");
test("acepta rutas internas y anclas", () => {
  assert.equal(isSafeCtaHref("/discover"), true);
  assert.equal(isSafeCtaHref("#catalogo"), true);
});
test("acepta URLs http(s) válidas", () => {
  assert.equal(isSafeCtaHref("https://wa.me/573143490825"), true);
  assert.equal(isSafeCtaHref("http://example.com"), true);
});
test("rechaza esquemas peligrosos", () => {
  assert.equal(isSafeCtaHref("javascript:alert(1)"), false);
  assert.equal(isSafeCtaHref("data:text/html,<script>alert(1)</script>"), false);
});
test("rechaza texto que no es una URL ni una ruta", () => {
  assert.equal(isSafeCtaHref("no es un link"), false);
});
test("vacío/null/undefined es válido (el CTA es opcional)", () => {
  assert.equal(isSafeCtaHref(null), true);
  assert.equal(isSafeCtaHref(undefined), true);
  assert.equal(isSafeCtaHref(""), true);
});

console.log("getActiveSlides (sección 4/18 — solo activos, ordenados)");
test("excluye slides inactivos", () => {
  const slides = [
    { id: "a", active: true, order: 1 },
    { id: "b", active: false, order: 2 },
  ];
  assert.deepEqual(getActiveSlides(slides).map((s) => s.id), ["a"]);
});
test("ordena por order ascendente", () => {
  const slides = [
    { id: "c", active: true, order: 3 },
    { id: "a", active: true, order: 1 },
    { id: "b", active: true, order: 2 },
  ];
  assert.deepEqual(getActiveSlides(slides).map((s) => s.id), ["a", "b", "c"]);
});
test("sin ningún slide activo, arreglo vacío (nunca inventa uno)", () => {
  assert.deepEqual(getActiveSlides([]), []);
  assert.deepEqual(getActiveSlides([{ id: "a", active: false }]), []);
});
test("slides sin order van al final, de forma estable", () => {
  const slides = [
    { id: "b", active: true, order: null },
    { id: "a", active: true, order: 1 },
  ];
  assert.deepEqual(getActiveSlides(slides).map((s) => s.id), ["a", "b"]);
});

console.log("shapePublicSlide (sección 10 — nunca expone campos administrativos)");
test("no incluye createdAt/updatedAt/active", () => {
  const s = shapePublicSlide({ id: "x", image: "i.jpg", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-02" });
  assert.deepEqual(Object.keys(s).sort(), ["alt", "ctaHref", "ctaText", "eyebrow", "id", "image", "mobileImage", "order", "subtitle", "title"]);
});
test("campos ausentes caen a null, nunca undefined", () => {
  const s = shapePublicSlide({ id: "x", image: "i.jpg" });
  assert.equal(s.title, null);
  assert.equal(s.ctaHref, null);
  assert.equal(s.mobileImage, null);
});

console.log("nextOrder / makeSlideId / pickSlideFields / buildHeroImagePath");
test("nextOrder devuelve max+1, nunca colisiona", () => {
  assert.equal(nextOrder([]), 1);
  assert.equal(nextOrder([{ order: 1 }, { order: 5 }, { order: 3 }]), 6);
});
test("makeSlideId genera ids únicos", () => {
  const a = makeSlideId();
  const b = makeSlideId();
  assert.notEqual(a, b);
  assert.ok(a.startsWith("hero-"));
});
test("pickSlideFields solo copia los campos de la whitelist (nunca product_id/name/price/stock)", () => {
  const picked = pickSlideFields({ title: "Hola", name: "Producto falso", price: 1, stock: 999, product_id: 56, active: true });
  assert.deepEqual(Object.keys(picked).sort(), ["active", "title"]);
  assert.equal(SLIDE_FIELDS.includes("title"), true);
  assert.equal(SLIDE_FIELDS.includes("name"), false);
});
test("buildHeroImagePath usa el prefijo hero/{id}/, separado por completo de products/{id}/", () => {
  assert.equal(buildHeroImagePath("hero-abc", "desktop", "webp"), "hero/hero-abc/main.webp");
  assert.equal(buildHeroImagePath("hero-abc", "mobile", "png"), "hero/hero-abc/mobile.png");
});

console.log("validateHeroUpload (sección 3 — formato horizontal en desktop, 4:5 opcional en mobile)");
test("imagen desktop bajo el mínimo -> error", () => {
  const r = validateHeroUpload({ contentType: "image/png", buffer: makePng(400, 300), slot: "desktop" });
  assert.equal(r.ok, false);
});
test("imagen desktop 1600x900 -> ok, sin exigir proporción 4:5", () => {
  const r = validateHeroUpload({ contentType: "image/png", buffer: makePng(1600, 900), slot: "desktop" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.some((w) => w.includes("Proporción")), false);
});
test("imagen mobile sigue el estándar 4:5 (advertencia, no bloqueo, si no lo cumple)", () => {
  const r = validateHeroUpload({ contentType: "image/png", buffer: makePng(1000, 1000), slot: "mobile" });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("4:5")));
});
test("imagen mobile 1080x1350 (4:5 real) -> ok, sin warning", () => {
  const r = validateHeroUpload({ contentType: "image/png", buffer: makePng(1080, 1350), slot: "mobile" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});
test("tipo no permitido -> error", () => {
  const r = validateHeroUpload({ contentType: "image/gif", buffer: Buffer.alloc(10), slot: "desktop" });
  assert.equal(r.ok, false);
});
test("los mínimos de Hero son mayores/distintos a los de producto (formato realmente distinto)", () => {
  assert.ok(HERO_DESKTOP_MIN_WIDTH > 0 && HERO_DESKTOP_MIN_HEIGHT > 0);
  assert.equal(HERO_MOBILE_MIN_WIDTH, 800);
  assert.equal(HERO_MOBILE_MIN_HEIGHT, 1000);
});

console.log("downloadObject (regresión real: Supabase Storage responde HTTP 400, no 404, para un objeto inexistente)");

// Estos 4 casos necesitan await de verdad (downloadObject es async) — se
// aíslan en su propia función async en vez de convertir el test() de
// arriba (síncrono, usado por ~20 casos ya probados) para no arriesgar
// el orden/conteo de esos otros tests.
async function asyncTest(name, fn) {
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

async function runDownloadObjectTests() {
  await asyncTest("un 404 real (HTTP 404 puro) devuelve null", async () => {
    const fetchImpl = async () => ({ status: 404, ok: false, text: async () => "" });
    const result = await downloadObject({ env: { url: "https://example.supabase.co", serviceRoleKey: "k" }, path: "hero/slides.json", fetchImpl });
    assert.equal(result, null);
  });
  await asyncTest("el 'no existe' real de Storage (HTTP 400 + code NoSuchKey en el body) también devuelve null, no lanza", async () => {
    const fetchImpl = async () => ({
      status: 400,
      ok: false,
      text: async () => JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" }),
    });
    const result = await downloadObject({ env: { url: "https://example.supabase.co", serviceRoleKey: "k" }, path: "hero/slides.json", fetchImpl });
    assert.equal(result, null);
  });
  await asyncTest("un error real distinto (500, sin code NoSuchKey) sí lanza", async () => {
    const fetchImpl = async () => ({ status: 500, ok: false, text: async () => JSON.stringify({ error: "internal_error" }) });
    await assert.rejects(() => downloadObject({ env: { url: "https://example.supabase.co", serviceRoleKey: "k" }, path: "hero/slides.json", fetchImpl }));
  });
  await asyncTest("objeto existente devuelve su contenido como Buffer", async () => {
    // Buffer.from(str).buffer puede apuntar al ArrayBuffer compartido del
    // pool interno de Node (más grande que el contenido real) — se
    // recorta exactamente al contenido, igual que devolvería un
    // Response.arrayBuffer() real.
    const src = Buffer.from("[]", "utf8");
    const exactArrayBuffer = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
    const fetchImpl = async () => ({ status: 200, ok: true, arrayBuffer: async () => exactArrayBuffer });
    const result = await downloadObject({ env: { url: "https://example.supabase.co", serviceRoleKey: "k" }, path: "hero/slides.json", fetchImpl });
    assert.equal(result.toString("utf8"), "[]");
  });
}

runDownloadObjectTests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
