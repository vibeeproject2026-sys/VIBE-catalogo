// Runs with plain Node, no network, no real credentials:
//   node scripts/test-image-variants-fase57.js
//
// Fase 57 — versiones optimizadas de imágenes sin tocar originales:
// - manifiesto config/image-variants.json (api/_lib/imageVariants.js):
//   solo URLs propias .webp, anchos válidos; ante ausencia/error → nada;
// - /api/catalog/products y /api/hero/slides agregan srcset SOLO para
//   originales listados; sin manifiesto, la respuesta es la de siempre;
// - el frontend usa srcset solo si llega, con vuelta al original;
// - el script de optimización nunca escribe sobre los originales.
// Supabase/Storage simulados: nada real.

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const iv = require("../api/_lib/imageVariants");

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
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const BASE = "https://example.supabase.co";
const ENV = { url: BASE, serviceRoleKey: "service-role-test-not-real" };
const PUB = `${BASE}/storage/v1/object/public/product-images/`;
const ORIG = PUB + "products/56/main-abc.png";
const HERO = PUB + "hero/slide-1.png";
const MANIFEST = {
  version: 1,
  images: {
    [ORIG]: [
      { url: PUB + "optimized/products/56/main-abc.opt-1200w.webp", width: 1200 },
      { url: PUB + "optimized/products/56/main-abc.opt-480w.webp", width: 480 },
      { url: PUB + "optimized/products/56/main-abc.opt-800w.webp", width: 800 },
      { url: PUB + "optimized/products/56/dup.webp", width: 800 },
      { url: "https://evil.example.com/x.webp", width: 640 },
      { url: PUB + "optimized/x.png", width: 640 },
      { url: PUB + "optimized/a,b.webp", width: 300 },
      { url: PUB + "optimized/y.webp", width: 5 },
    ],
    [HERO]: [{ url: PUB + "optimized/hero/slide-1.opt-1024w.webp", width: 1024 }],
    "https://evil.example.com/original.png": [{ url: PUB + "optimized/z.webp", width: 640 }],
  },
};

console.log("Manifiesto de versiones");
test("solo URLs del propio bucket, .webp, sin comas/espacios, anchos 16–4000; ordenado y sin anchos repetidos", () => {
  const m = iv.sanitizeManifest(MANIFEST, ENV);
  assert.equal(m.size, 2);
  assert.equal(m.get(ORIG), `${PUB}optimized/products/56/main-abc.opt-480w.webp 480w, ${PUB}optimized/products/56/main-abc.opt-800w.webp 800w, ${PUB}optimized/products/56/main-abc.opt-1200w.webp 1200w`);
  assert.equal(m.has("https://evil.example.com/original.png"), false);
});
test("forma inválida → vacío (nunca lanza)", () => {
  for (const bad of [null, "x", { images: [] }, { images: { [ORIG]: "no-lista" } }]) assert.equal(iv.sanitizeManifest(bad, ENV).size, 0);
});

function storageFetch(handler) {
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/storage/v1/object/product-images/config/image-variants.json")) return handler();
    throw new Error("ruta inesperada " + u);
  };
}
const res = (status, body) => ({ ok: status < 400, status, text: async () => body, arrayBuffer: async () => Buffer.from(body), json: async () => JSON.parse(body) });
async function withFetch(fetchImpl, fn) {
  const original = global.fetch;
  const originalError = console.error;
  global.fetch = fetchImpl;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    global.fetch = original;
    console.error = originalError;
  }
}

(async () => {
  await test("sin manifiesto (404), ilegible o Storage caído → Map vacío: el sitio usa los originales", async () => {
    for (const h of [() => res(404, ""), () => res(200, "{no json"), () => { throw new TypeError("network"); }, () => res(500, "{}")]) {
      const m = await withFetch(storageFetch(h), () => iv.loadImageVariants(ENV));
      assert.equal(m.size, 0);
    }
  });
  await test("srcsetFor: solo para un original listado; null para cualquier otro o vacío", () => {
    const m = iv.sanitizeManifest(MANIFEST, ENV);
    assert.ok(iv.srcsetFor(m, ORIG).includes("480w"));
    assert.equal(iv.srcsetFor(m, PUB + "products/99/main.png"), null);
    assert.equal(iv.srcsetFor(m, null), null);
  });

  console.log("APIs públicas");
  const PRODUCTS = [{ id: 56, name: "Set de brochas", price: 18000, stock: 3, category: "Accesorios", promo_active: false }, { id: 57, name: "Gloss", price: 9000, stock: 2, category: "Labios", promo_active: false }];
  const META = [{ product_id: 56, published: true, image: ORIG, images: [] }, { product_id: 57, published: true, image: PUB + "products/57/main.png", images: [] }];
  function catalogFetch(manifestHandler) {
    return async (url) => {
      const u = String(url);
      if (u.includes("/storage/v1/object/product-images/config/image-variants.json")) return manifestHandler();
      if (u.includes("/storage/v1/object/product-images/hero/slides.json")) return res(200, JSON.stringify([{ id: "a", image: HERO, mobileImage: null, active: true, order: 1 }, { id: "b", image: PUB + "hero/slide-2.png", active: true, order: 2 }]));
      if (u.includes("/rest/v1/products")) return res(200, JSON.stringify(PRODUCTS));
      if (u.includes("/rest/v1/catalog_metadata")) return res(200, JSON.stringify(META));
      throw new Error("ruta inesperada " + u);
    };
  }
  function mockRes() {
    return { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end(b) { this.raw = b; return this; } };
  }
  async function call(modPath, fetchImpl, query = {}) {
    process.env.SUPABASE_URL = BASE;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.serviceRoleKey;
    return withFetch(fetchImpl, async () => {
      delete require.cache[require.resolve(modPath)];
      const r = mockRes();
      await require(modPath)({ method: "GET", headers: {}, query }, r);
      return r;
    });
  }
  await test("catálogo sin manifiesto: 200, todos los productos, imageSrcset null, imagen original intacta", async () => {
    const r = await call("../api/catalog/products", catalogFetch(() => res(404, "")));
    assert.equal(r.statusCode, 200);
    const byId = Object.fromEntries(r.body.products.map((p) => [p.id, p]));
    assert.equal(r.body.products.length, 2);
    assert.deepEqual([byId[56].image, byId[56].imageSrcset, byId[57].image, byId[57].imageSrcset], [ORIG, null, PUB + "products/57/main.png", null]);
  });
  await test("catálogo con manifiesto: srcset solo para el original listado; el resto sigue con su original", async () => {
    const r = await call("../api/catalog/products", catalogFetch(() => res(200, JSON.stringify(MANIFEST))));
    const byId = Object.fromEntries(r.body.products.map((p) => [p.id, p]));
    assert.ok(byId[56].imageSrcset.startsWith(PUB + "optimized/products/56/main-abc.opt-480w.webp 480w"));
    assert.equal(byId[56].image, ORIG);
    assert.equal(byId[57].imageSrcset, null);
  });
  await test("catálogo con Storage caído para el manifiesto: el catálogo responde igual (no falla)", async () => {
    const r = await call("../api/catalog/products", catalogFetch(() => { throw new TypeError("network"); }));
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.products.length, 2);
  });
  await test("sitemap no lee el manifiesto", async () => {
    let read = false;
    const r = await call("../api/catalog/products", catalogFetch(() => { read = true; return res(404, ""); }), { format: "sitemap" });
    assert.equal(r.statusCode, 200);
    assert.equal(read, false);
  });
  await test("Hero: srcset solo para el slide listado; sin manifiesto, null", async () => {
    let r = await call("../api/hero/slides", catalogFetch(() => res(200, JSON.stringify(MANIFEST))));
    assert.equal(r.body.slides[0].imageSrcset, `${PUB}optimized/hero/slide-1.opt-1024w.webp 1024w`);
    assert.equal(r.body.slides[1].imageSrcset, null);
    assert.equal(r.body.slides[0].image, HERO);
    r = await call("../api/hero/slides", catalogFetch(() => res(404, "")));
    assert.deepEqual(r.body.slides.map((s) => [s.imageSrcset, s.mobileImageSrcset]), [[null, null], [null, null]]);
  });

  await test("Fase final — galería: srcsetByUrl incluye cada foto listada (principal y secundarias); las no listadas no figuran", async () => {
    const SEC = PUB + "products/56/01.png", SEC2 = PUB + "products/56/02.png";
    const meta = META.map((m) => (m.product_id === 56 ? { ...m, images: [SEC, SEC2] } : m));
    const manifest = { ...MANIFEST, images: { ...MANIFEST.images, [SEC]: [{ url: PUB + "optimized/products/56/01-480w.webp", width: 480 }] } };
    const fetchImpl = async (url) => (String(url).includes("/rest/v1/catalog_metadata") ? res(200, JSON.stringify(meta)) : catalogFetch(() => res(200, JSON.stringify(manifest)))(url));
    const r = await call("../api/catalog/products", fetchImpl);
    const p56 = r.body.products.find((p) => p.id === 56);
    assert.deepEqual(Object.keys(p56.srcsetByUrl).sort(), [ORIG, SEC].sort());
    assert.equal(p56.srcsetByUrl[SEC], `${PUB}optimized/products/56/01-480w.webp 480w`);
    assert.equal(p56.srcsetByUrl[ORIG], p56.imageSrcset);
    assert.deepEqual(p56.images, [SEC, SEC2]); // las URL originales no cambian
    const r0 = await call("../api/catalog/products", catalogFetch(() => res(404, "")));
    assert.ok(r0.body.products.every((p) => Object.keys(p.srcsetByUrl).length === 0));
  });

  console.log("Frontend (estático)");
  const app = read("js/app.js");
  const hero = read("js/hero-carousel.js");
  await test("Fase final — ficha, miniaturas, carrito y checkout usan la versión optimizada de cada foto, con vuelta al original", () => {
    assert.match(app, /id="pdpMainImage" class="detail-photo" src="\$\{esc\(images\[0\]\)\}"\$\{optimizedAttrs\(p, images\[0\], SIZES_PDP\)\}/);
    assert.match(app, /<img src="\$\{esc\(img\)\}"\$\{optimizedAttrs\(p, img, SIZES_THUMB\)\}/);
    assert.match(app, /optimizedAttrs\(productById\(i\.productId\), i\.image, SIZES_THUMB\)/);
    assert.match(app, /optimizedAttrs\(productById\(l\.productId\), l\.image, SIZES_THUMB\)/);
    assert.match(app, /return set \? ` srcset="\$\{esc\(set\)\}" sizes="\$\{sizes\}" data-fallback-src="\$\{esc\(url\)\}"` : "";/);
  });
  await test("Fase final — cambiar de foto (galería y hover de tarjeta) reemplaza srcset Y src; nunca solo src", () => {
    assert.match(app, /if \(main && images\[idx\]\) swapImage\(main, state\.product, images\[idx\], SIZES_PDP\);/);
    assert.match(app, /swapImage\(img, p, images\[state_\.currentIndex\], SIZES_CARD\);/);
    assert.match(app, /swapImage\(s\.img, s\.product, s\.images\[0\], SIZES_CARD\);/);
    assert.doesNotMatch(app, /main\.src = images\[idx\]|s\.img\.src = s\.images\[0\]|img\.src = images\[state_\.currentIndex\]/);
  });
  await test("Fase final — data-source conserva solo pares URL → srcset de texto", async () => {
    const ds = read("js/data-source.js");
    assert.match(ds, /srcsetByUrl: Object\.fromEntries\(/);
    assert.match(ds, /typeof k === "string" && typeof v === "string" && v/);
  });
  await test("tarjeta: srcset solo si llega imageSrcset, con data-fallback-src al original", () => {
    assert.match(app, /const optimized = p\.image && p\.imageSrcset \? ` srcset="\$\{esc\(p\.imageSrcset\)\}" sizes="[^"]+" data-fallback-src="\$\{esc\(p\.image\)\}"` : "";/);
  });
  await test("vuelta al original: listener de error en captura que quita srcset/sizes y las <source> optimizadas", () => {
    assert.match(app, /document\.addEventListener\(\s*"error",[\s\S]*?img\.dataset\.fallbackSrc[\s\S]*?source\[data-optimized\][\s\S]*?img\.src = img\.dataset\.fallbackSrc;[\s\S]*?true\s*\);/);
  });
  await test("Hero: sin srcset la marca es la de siempre; el fondo usa el mismo srcset/sizes que la pieza visible", () => {
    assert.match(hero, /const mainAttrs = s\.imageSrcset \? ` srcset="\$\{esc\(s\.imageSrcset\)\}" sizes="\$\{SIZES_DESKTOP\}"` : "";/);
    assert.match(hero, /sizes="\$\{hasMobileVariant \? "100vw" : SIZES_DESKTOP\}"/);
    assert.match(hero, /<source media="\(max-width: 640px\)" srcset="\$\{esc\(s\.mobileImage\)\}">/);
  });

  console.log("Script de optimización (estático)");
  const script = read("scripts/images/optimize-images.cjs");
  await test("lee el original, verifica su sha256 antes y después, y escribe solo en --out", () => {
    assert.match(script, /const before = sha256\(original\);/);
    assert.match(script, /if \(after !== before\) throw new Error/);
    const writes = script.match(/fs\.writeFileSync\(([^,]+),/g) || [];
    assert.ok(writes.length >= 1 && writes.every((w) => /path\.join\(a\.out,/.test(w)), writes.join(" | "));
    assert.ok(!/unlinkSync|rmSync|renameSync|fetch\(|upload/i.test(script.replace(/^\/\/.*$/gm, "")), "no borra, no mueve, no sube nada");
  });
  await test("nunca agranda ni recorta: anchos ≤ original, resize sin extract", () => {
    assert.match(script, /Math\.min\(w, meta\.width\)/);
    assert.ok(!/\.extract\(/.test(script));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
