// Runs with plain Node, no network, no real credentials:
//   node scripts/test-hero-duration.mjs
//
// Duración individual de cada imagen del carrusel principal: validación
// (api/_lib/heroSlides.js), persistencia con el handler REAL del Admin
// (api/admin/hero-slides.js) contra un Storage simulado en memoria, forma
// pública (api/hero/slides.js), regla del carrusel (js/hero-carousel.js)
// y validación del formulario del Admin (admin/admin.js, función real).

import assert from "assert/strict";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = require("../api/_lib/heroSlides");

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

const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-not-real", ADMIN_API_TOKEN: "admin-test-token" };
const AUTH = { authorization: "Bearer admin-test-token" };
function mockRes() {
  return { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
}
// Storage en memoria (mismo contrato que test-hero-handlers.js).
function mockStorage(files = {}) {
  const store = new Map(Object.entries(files).map(([k, v]) => [k, Buffer.from(typeof v === "string" ? v : JSON.stringify(v))]));
  const uploads = [];
  const fetchImpl = async (url, opts = {}) => {
    const m = String(url).match(/\/storage\/v1\/object\/product-images\/(.+)$/);
    if (!m) throw new Error("URL inesperada " + url);
    const p = m[1].split("?")[0];
    const method = opts.method || "GET";
    if (method === "GET") {
      if (!store.has(p)) return { ok: false, status: 400, text: async () => JSON.stringify({ statusCode: "404", code: "NoSuchKey" }), arrayBuffer: async () => new ArrayBuffer(0) };
      const b = store.get(p);
      return { ok: true, status: 200, text: async () => b.toString("utf8"), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
    uploads.push(p);
    store.set(p, Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body));
    return { ok: true, status: 200, text: async () => "" };
  };
  return { fetchImpl, store, uploads, manifest: () => JSON.parse(store.get("hero/slides.json").toString("utf8")) };
}
async function withStorage(storage, fn) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const original = global.fetch;
  const originalError = console.error;
  global.fetch = storage.fetchImpl;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    global.fetch = original;
    console.error = originalError;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const admin = (body, method = "PATCH") => { const res = mockRes(); return require("../api/admin/hero-slides")({ method, headers: AUTH, body }, res).then(() => res); };
const publicSlides = () => { const res = mockRes(); return require("../api/hero/slides")({ method: "GET", headers: {} }, res).then(() => res); };

// Manifiesto existente: dos slides SIN duración (como los reales de hoy).
const EXISTING = [
  { id: "hero-a", image: "https://example.supabase.co/a.jpg", order: 1, active: true, createdAt: "2026-10-01", updatedAt: "2026-10-01" },
  { id: "hero-b", image: "https://example.supabase.co/b.jpg", order: 2, active: true, createdAt: "2026-10-01", updatedAt: "2026-10-01" },
];

console.log("Validación");
await test("duración válida: entero de 2 a 30 s, o vacía (null) para usar la predeterminada", () => {
  for (const ok of [null, undefined, 2, 5, 8, 12, 30]) assert.equal(lib.isValidDuration(ok), true, String(ok));
  for (const bad of [0, 1, 31, 100, -5, 2.5, "8", "", NaN, true, {}]) assert.equal(lib.isValidDuration(bad), false, String(bad));
  assert.deepEqual([lib.DURATION_MIN, lib.DURATION_MAX], [2, 30]);
  assert.ok(lib.SLIDE_FIELDS.includes("duration"));
});
await test("8. forma pública: slides existentes sin duración → null (usan la predeterminada); un valor corrupto también → null", () => {
  assert.equal(lib.shapePublicSlide(EXISTING[0]).duration, null);
  assert.equal(lib.shapePublicSlide({ ...EXISTING[0], duration: 8 }).duration, 8);
  assert.equal(lib.shapePublicSlide({ ...EXISTING[0], duration: 99 }).duration, null);
  assert.equal(lib.shapePublicSlide({ ...EXISTING[0], duration: "8" }).duration, null);
});

console.log("Persistencia (handler real del Admin, Storage simulado)");
await test("6 y 7. cambiar la duración de una imagen la guarda en el manifiesto y llega al público; las demás no cambian", async () => {
  const st = mockStorage({ "hero/slides.json": EXISTING });
  await withStorage(st, async () => {
    const res = await admin({ id: "hero-b", duration: 8 });
    assert.equal(res.statusCode, 200);
    const m = st.manifest();
    assert.deepEqual(m.map((s) => [s.id, s.duration ?? null]), [["hero-a", null], ["hero-b", 8]]);
    // «Recargar»: una lectura nueva del manifiesto devuelve lo guardado.
    const pub = await publicSlides();
    assert.deepEqual(pub.body.slides.map((s) => [s.id, s.duration]), [["hero-a", null], ["hero-b", 8]]);
    // El resto del slide queda intacto.
    assert.deepEqual({ ...m[0] }, EXISTING[0]);
    assert.equal(m[1].image, EXISTING[1].image);
  });
});
await test("volver a vacío (null) restaura la duración predeterminada de esa imagen", async () => {
  const st = mockStorage({ "hero/slides.json": [{ ...EXISTING[0], duration: 12 }, EXISTING[1]] });
  await withStorage(st, async () => {
    const res = await admin({ id: "hero-a", duration: null });
    assert.equal(res.statusCode, 200);
    assert.equal(st.manifest()[0].duration, null);
  });
});
await test("duración no válida: 400 y el manifiesto no se escribe", async () => {
  const st = mockStorage({ "hero/slides.json": EXISTING });
  await withStorage(st, async () => {
    for (const bad of [1, 31, 2.5, "8", 0]) {
      const res = await admin({ id: "hero-a", duration: bad });
      assert.equal(res.statusCode, 400, String(bad));
      assert.match(res.body.error, /Duración no válida/);
    }
    const post = await admin({ title: "Nuevo", duration: 45 }, "POST");
    assert.equal(post.statusCode, 400);
    assert.equal(st.uploads.length, 0);
  });
});
await test("slide nuevo: sin duración queda en null; con duración válida se guarda", async () => {
  const st = mockStorage({ "hero/slides.json": EXISTING });
  await withStorage(st, async () => {
    const a = await admin({ title: "Sin duración" }, "POST");
    const b = await admin({ title: "Con duración", duration: 6 }, "POST");
    assert.deepEqual([a.statusCode, a.body.slide.duration, b.statusCode, b.body.slide.duration], [200, null, 200, 6]);
  });
});

console.log("Carrusel y Admin");
// hero-carousel.js arranca solo al importarse; sin el bloque en la página no hace nada.
global.document = { querySelector: () => null };
const carousel = await import(pathToFileURL(path.join(root, "js/hero-carousel.js")).href);
await test("1–3. cada imagen usa su duración; sin duración propia, la predeterminada (5 s)", () => {
  assert.equal(carousel.slideDurationMs({}), 5000);
  assert.equal(carousel.slideDurationMs({ duration: null }), 5000);
  assert.equal(carousel.slideDurationMs({ duration: 8 }), 8000);
  assert.equal(carousel.slideDurationMs({ duration: 12 }), 12000);
  assert.equal(carousel.slideDurationMs({ duration: 99 }), 5000);
});
await test("11. un único temporizador por pieza (setTimeout encadenado, siempre limpiando el anterior); movimiento reducido sin avance", () => {
  const src = fs.readFileSync(path.join(root, "js/hero-carousel.js"), "utf8");
  assert.doesNotMatch(src, /setInterval/);
  assert.match(src, /function startAutoplay\(\) \{\s*if \(reduceMotion\) return;[^\n]*\n\s*stopAutoplay\(\);\s*timer = window\.setTimeout\(/);
  assert.match(src, /slideDurationMs\(slides\[current\]\)/);
});
await test("Admin: el formulario valida la duración (función real) y la tabla muestra la de cada imagen", () => {
  const adminSrc = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  const m = adminSrc.match(/const parseHeroDuration = (\(raw\) => \{[\s\S]*?\n\});/);
  assert.ok(m, "parseHeroDuration no encontrada");
  const parse = new Function("HERO_DURATION_MIN", "HERO_DURATION_MAX", `return ${m[1]}`)(2, 30);
  assert.deepEqual(["", "  ", null].map((t) => parse(t)), Array(3).fill({ value: null, invalid: false }));
  assert.deepEqual(["2", "8", " 30 "].map((t) => parse(t).value), [2, 8, 30]);
  for (const t of ["1", "31", "2.5", "abc", "-3", "8s"]) assert.equal(parse(t).invalid, true, t);
  assert.match(adminSrc, /<input name="duration" type="number"/);
  assert.match(adminSrc, /Duración: \$\{heroDurationLabel\(s\)\}/);
  assert.match(adminSrc, /duration: duration\.value,/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
