// Runs with plain Node, no network, no credentials:
//   node scripts/test-admin-images-lib.js
//
// Pure-logic tests for api/admin/_lib/imageValidation.js and
// api/admin/_lib/storage.js — path generation, header-based dimension
// parsing (no image library involved), and the size/type/dimension
// validation rules.

const assert = require("assert/strict");
const {
  MAX_UPLOAD_BYTES,
  TARGET_MAX_BYTES,
  extensionForType,
  decodeBase64Image,
  readImageDimensions,
  validateUpload,
} = require("../api/admin/_lib/imageValidation");
const {
  BUCKET,
  buildMainPath,
  buildSecondaryPath,
  publicUrl,
  isOwnedPath,
  pathFromUrl,
  nextSecondarySeq,
} = require("../api/admin/_lib/storage");

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

// --- synthetic, minimal binary headers (no real image library used) ---

function makePng(width, height) {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

function makeJpeg(width, height) {
  const buf = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9,
  ]);
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

function makeWebpVp8x(width, height) {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  buf[20] = 0;
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

console.log("_lib/storage.js — generación de bucket/paths");

test("BUCKET reutiliza el bucket existente 'product-images' (no crea uno nuevo)", () => {
  assert.equal(BUCKET, "product-images");
});

test("buildMainPath usa product_id como identidad técnica, no el nombre comercial", () => {
  assert.equal(buildMainPath(56, "webp"), "products/56/main.webp");
});

test("buildSecondaryPath numera con ceros a la izquierda", () => {
  assert.equal(buildSecondaryPath(56, "jpg", 1), "products/56/01.jpg");
  assert.equal(buildSecondaryPath(56, "jpg", 12), "products/56/12.jpg");
});

test("publicUrl + pathFromUrl son inversas exactas", () => {
  const env = { url: "https://example.supabase.co" };
  const path = buildSecondaryPath(56, "webp", 2);
  const url = publicUrl(env, path);
  assert.equal(pathFromUrl(env, url), path);
});

test("isOwnedPath reconoce nuestras propias URLs de Storage", () => {
  const env = { url: "https://example.supabase.co" };
  assert.equal(isOwnedPath(env, publicUrl(env, "products/56/main.webp")), true);
});

test("isOwnedPath rechaza imágenes legacy/externas (ej. producto 56, assets/products/brush.svg)", () => {
  const env = { url: "https://example.supabase.co" };
  assert.equal(isOwnedPath(env, "assets/products/brush.svg"), false);
  assert.equal(isOwnedPath(env, "https://otrodominio.com/x.png"), false);
  assert.equal(pathFromUrl(env, "assets/products/brush.svg"), null);
});

test("nextSecondarySeq usa el máximo numérico ya usado, no solo la longitud del arreglo (evita colisiones tras un delete intermedio)", () => {
  const env = { url: "https://example.supabase.co" };
  const images = [publicUrl(env, "products/56/01.webp"), publicUrl(env, "products/56/03.webp")];
  // longitud=2 -> length+1 daría 3, que colisiona con 03.webp ya existente
  assert.equal(nextSecondarySeq(env, images), 4);
});

test("nextSecondarySeq ignora URLs externas al calcular el siguiente número", () => {
  const env = { url: "https://example.supabase.co" };
  const images = ["https://otrodominio.com/99.png"];
  assert.equal(nextSecondarySeq(env, images), 1);
});

console.log("\n_lib/imageValidation.js — tipo y decodificación");

test("extensionForType acepta exactamente webp/jpeg/png", () => {
  assert.equal(extensionForType("image/webp"), "webp");
  assert.equal(extensionForType("image/jpeg"), "jpg");
  assert.equal(extensionForType("image/png"), "png");
  assert.equal(extensionForType("image/gif"), null);
  assert.equal(extensionForType("application/pdf"), null);
});

test("decodeBase64Image acepta base64 plano y data: URL", () => {
  const raw = Buffer.from([1, 2, 3, 4]);
  const b64 = raw.toString("base64");
  assert.deepEqual(decodeBase64Image(b64), raw);
  assert.deepEqual(decodeBase64Image(`data:image/png;base64,${b64}`), raw);
});

console.log("\n_lib/imageValidation.js — dimensiones leídas del propio archivo (sin librería de imágenes)");

test("lee dimensiones PNG correctamente", () => {
  const dims = readImageDimensions(makePng(1200, 1500), "image/png");
  assert.deepEqual(dims, { width: 1200, height: 1500 });
});

test("lee dimensiones JPEG correctamente (marcador SOF0)", () => {
  const dims = readImageDimensions(makeJpeg(800, 1000), "image/jpeg");
  assert.deepEqual(dims, { width: 800, height: 1000 });
});

test("lee dimensiones WebP (VP8X) correctamente", () => {
  const dims = readImageDimensions(makeWebpVp8x(1200, 1500), "image/webp");
  assert.deepEqual(dims, { width: 1200, height: 1500 });
});

test("archivo corrupto/irreconocible -> dimensiones null (no lanza excepción)", () => {
  assert.equal(readImageDimensions(Buffer.from([0, 0, 0, 0]), "image/png"), null);
});

console.log("\n_lib/imageValidation.js — validateUpload");

test("tipo no permitido -> error, sin evaluar nada más", () => {
  const r = validateUpload({ contentType: "image/gif", buffer: Buffer.alloc(10), slot: "main" });
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes("Tipo de archivo"));
});

test("archivo mayor al máximo permitido -> error", () => {
  const big = makePng(1200, 1500);
  const oversized = Buffer.concat([big, Buffer.alloc(MAX_UPLOAD_BYTES)]);
  const r = validateUpload({ contentType: "image/png", buffer: oversized, slot: "main" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("máximo permitido")));
});

test("imagen principal bajo el mínimo (800x1000) -> error", () => {
  const r = validateUpload({ contentType: "image/png", buffer: makePng(400, 500), slot: "main" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("mínimo")));
});

test("imagen secundaria con mínimo más flexible (400x400) sí pasa", () => {
  const r = validateUpload({ contentType: "image/png", buffer: makePng(450, 450), slot: "secondary" });
  assert.equal(r.ok, true);
});

test("imagen principal 1200x1500 (4:5) -> ok, sin warning de proporción", () => {
  const r = validateUpload({ contentType: "image/png", buffer: makePng(1200, 1500), slot: "main" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.some((w) => w.includes("Proporción")), false);
});

test("imagen principal cuadrada (no 4:5) -> ok pero con warning de proporción, no bloquea", () => {
  const r = validateUpload({ contentType: "image/png", buffer: makePng(1000, 1000), slot: "main" });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("Proporción")));
});

test("archivo por encima del peso objetivo pero bajo el máximo -> warning, no bloquea", () => {
  const big = makePng(1200, 1500);
  const padded = Buffer.concat([big, Buffer.alloc(TARGET_MAX_BYTES + 1024)]);
  const r = validateUpload({ contentType: "image/png", buffer: padded, slot: "main" });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("peso objetivo")));
});

test("archivo sin dimensiones legibles -> error claro, no inventa dimensiones", () => {
  const r = validateUpload({ contentType: "image/png", buffer: Buffer.from([1, 2, 3]), slot: "main" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("dimensiones")));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
