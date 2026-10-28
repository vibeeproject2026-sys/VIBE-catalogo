// Runs with plain Node, no network, no credentials:
//   node scripts/test-storefront-fase56.mjs
//
// Fase 56 — catálogo público:
// - tonos: modelo (sanitizado, públicos solo los configurados) y
//   data-source (tonos → variantes; tono obligatorio solo si hay tonos);
// - carrito: sincronización de precios con el catálogo vigente;
// - sin catálogo demo ante una caída de la API;
// - una sola sección de promociones, tarjetas con bloque de compra abajo,
//   frase introductoria del Catálogo oculta solo en mobile;
// - checkout: total esperado, clave de idempotencia y campo trampa;
// - SEO: canonical, Open Graph, robots.txt, vercel.json, /sitemap.xml;
// - límite de funciones serverless (sin funciones nuevas).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

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

// data-source.js importa products.js/taxonomy.js con rutas relativas:
// se copia a un directorio temporal con package.json {type:module}.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-f56-"));
fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const f of ["products.js", "taxonomy.js", "data-source.js", "variants.js"]) fs.copyFileSync(path.join(root, "js", f), path.join(tmp, f));

function freshCart() {
  let store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  return import("data:text/javascript," + encodeURIComponent(read("js/cart.js")) + `\n//${Math.random()}`);
}

async function main() {
  const details = require("../api/_lib/editorialDetails");
  const ds = await import(pathToFileURL(path.join(tmp, "data-source.js")).href);
  const app = read("js/app.js");
  const css = read("css/styles.css");
  const html = read("index.html");

  console.log("Tonos — modelo y data-source");
  await test("sanitizeShades: id estable en minúsculas, sin duplicados ni HTML, color #rrggbb o pendiente (null), orden consecutivo", () => {
    const out = details.sanitizeShades([
      { id: "Rojo-1", name: "  Rojo   pasión ", hex: "#AA0011", active: true, order: 5 },
      { id: "rojo-1", name: "dup" },
      { id: "x y", name: "id inválido" },
      { id: "p", name: "<b>x</b>" },
      { id: "nude", name: "Nude", hex: "rosado", active: "sí", order: 1 },
    ]);
    assert.deepEqual(out, [
      { id: "nude", name: "Nude", hex: null, active: false, order: 0 },
      { id: "rojo-1", name: "Rojo pasión", hex: "#aa0011", active: true, order: 1 },
    ]);
  });
  await test("la API pública solo expone tonos configurados (con color); los inactivos van marcados", () => {
    const pub = details.publicDetails(JSON.stringify({ shades: [{ id: "a", name: "A", hex: "#111111", active: true }, { id: "b", name: "B", hex: "#222222", active: false }, { id: "c", name: "C", hex: null, active: true }] }));
    assert.deepEqual(pub.shades.map((s) => [s.id, s.active]), [["a", true], ["b", false]]);
  });
  // Fase 57 — tonos y presentaciones son dimensiones independientes
  // (js/variants.js); antes los tonos reemplazaban a `variants`.
  await test("data-source: tonos con color (inactivos marcados) en p.shades; sin opciones → variante base con la presentación real", () => {
    const withShades = ds.__internal.normalizeApiProduct({ id: 4, name: "Labial", price: 20000, available: true, shades: [{ id: "a", name: "A", hex: "#111111", active: true }, { id: "b", name: "B", hex: "#222222", active: false }, { id: "c", name: "C", hex: null, active: true }] });
    assert.deepEqual(withShades.shades.map((v) => [v.id, v.name, v.hex, v.active]), [["a", "A", "#111111", true], ["b", "B", "#222222", false]]);
    assert.deepEqual(withShades.presentations, []);
    assert.deepEqual(withShades.variants, [{ id: "default", name: "", price: 20000, sku: null }]);
    const plain = ds.__internal.normalizeApiProduct({ id: 5, name: "Crema", price: 18000, available: true, presentation: "50 ml" });
    assert.deepEqual(plain.shades, []);
    assert.deepEqual(plain.variants, [{ id: "default", name: "50 ml", price: 18000, sku: null }]);
  });
  await test("getTaxonomy devuelve null ante un error (el sitio sigue con la taxonomía de código)", async () => {
    ds.__internal.setMode("api");
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
    try {
      assert.equal(await ds.getTaxonomy(), null);
      globalThis.fetch = async () => { throw new TypeError("network"); };
      assert.equal(await ds.getTaxonomy(), null);
    } finally {
      globalThis.fetch = original;
    }
  });

  console.log("Carrito — precios vigentes");
  await test("syncCartPrices actualiza el precio guardado, informa los cambios y conserva tono y cantidad", async () => {
    const cart = await freshCart();
    cart.addToCart({ id: 1, name: "Labial", image: null }, { id: "rojo", name: "Rojo", hex: "#aa0011", price: 20000 }, 2);
    cart.addToCart({ id: 2, name: "Crema", image: null }, { id: "default", name: "Único", price: 15000 }, 1);
    const changes = cart.syncCartPrices((i) => (String(i.productId) === "1" ? { price: 18000, originalPrice: 20000 } : { price: 15000, originalPrice: null }));
    assert.deepEqual(changes, [{ name: "Labial", variantName: "Rojo", from: 20000, to: 18000 }]);
    const line = cart.getCart().find((i) => i.productId === 1);
    assert.deepEqual([line.price, line.originalPrice, line.quantity, line.variantId, line.variantHex], [18000, 20000, 2, "rojo", "#aa0011"]);
    assert.equal(cart.getCartTotal(), 18000 * 2 + 15000);
  });
  await test("syncCartPrices no toca líneas cuyo producto/tono ya no existe (el checkout las marca no disponibles)", async () => {
    const cart = await freshCart();
    cart.addToCart({ id: 9, name: "Retirado" }, { id: "default", name: "Único", price: 1000 }, 1);
    assert.deepEqual(cart.syncCartPrices(() => null), []);
    assert.equal(cart.getCart()[0].price, 1000);
  });
  await test("varias variantes del mismo producto son líneas separadas del carrito", async () => {
    const cart = await freshCart();
    cart.addToCart({ id: 1, name: "Labial" }, { id: "rojo", name: "Rojo", price: 20000 }, 1);
    cart.addToCart({ id: 1, name: "Labial" }, { id: "nude", name: "Nude", price: 20000 }, 1);
    cart.addToCart({ id: 1, name: "Labial" }, { id: "rojo", name: "Rojo", price: 20000 }, 1);
    assert.deepEqual(cart.getCart().map((i) => [i.variantId, i.quantity]), [["rojo", 2], ["nude", 1]]);
  });

  console.log("Catálogo público (estático)");
  await test("si la API falla: estado «catálogo no disponible» con Reintentar, sin productos de demostración", () => {
    assert.match(app, /function renderCatalogUnavailable\(\)/);
    assert.match(app, /data-retry-catalog/);
    assert.match(read("js/data-source.js"), /warn\("getProducts\(\)", e\);\s*throw e;/);
  });
  await test("una única sección de promociones; sin el adelanto duplicado", () => {
    assert.doesNotMatch(html, /id="ofertasHome"/);
    assert.doesNotMatch(app, /renderOfertasHome|ofertasHomeGrid/);
  });
  await test("tarjeta: columna flexible con el bloque de compra abajo (sin alturas fijas)", () => {
    assert.match(css, /\.card\{display:flex;flex-direction:column\}/);
    assert.match(css, /\.card-body\{flex:1;display:flex;flex-direction:column\}/);
    assert.match(css, /\.card-buy\{margin-top:auto;/);
    assert.match(app, /<div class="card-buy">[\s\S]*?class="card-price-row"[\s\S]*?class="button card-cta"/);
  });
  await test("Catálogo mobile: solo la frase introductoria se oculta (≤640px); título y mensaje de marca se conservan", () => {
    // Fase 58 — la misma frase también está en «Descubre tu VIBE» (.discover-lead)
    // y la propietaria decidió conservarla ahí en mobile: solo se oculta la del Catálogo.
    assert.match(css, /@media\(max-width:640px\)\{\s*\.catalog-lead-intro\{display:none\}\s*\}/);
    assert.doesNotMatch(css, /\.discover-lead\s*[,{][^}]*display:none/);
    assert.match(html, /<p class="discover-lead">Explora por categoría y encuentra tu próximo esencial\.<\/p>/);
    assert.match(html, /id="catalogSubtitle" class="catalog-lead catalog-lead-intro">Explora por categoría y encuentra tu próximo esencial\.</);
    assert.match(html, /<p class="catalog-brand-title">Beauty for your <span class="title-accent">VIBE\.<\/span><\/p>/);
    assert.match(html, /<p class="catalog-brand-text">Esenciales de belleza seleccionados para elevar tu ritual\.<\/p>/);
    assert.match(app, /classList\.remove\("catalog-lead-intro"\)/);
  });
  await test("PDP: paleta de tonos accesible (radiogroup), nada preseleccionado, inactivos no seleccionables", () => {
    assert.match(app, /role="radiogroup" aria-label="Tonos disponibles"/);
    assert.match(app, /state\.shadeId = autoShadeId\(p\);/);
    assert.match(app, /state\.presentationId = autoPresentationId\(p\);/);
    assert.match(app, /if \(opt\.dataset\.active === "false"\) return;/);
    assert.match(app, /label: "Elige un tono"/);
  });
  await test("checkout: envía total esperado, clave de idempotencia y campo trampa; maneja PRICE_CHANGED/VARIANT_UNAVAILABLE", () => {
    assert.match(app, /expectedTotal,\s*idempotencyKey: checkoutIdempotencyKey\(\),\s*website: data\.website \|\| "",/);
    assert.match(app, /payload\.code === "PRICE_CHANGED" \|\| payload\.code === "VARIANT_UNAVAILABLE"/);
    assert.match(app, /<div class="hp-field" aria-hidden="true"><label>No completar<input name="website" tabindex="-1" autocomplete="off"><\/label><\/div>/);
    assert.match(css, /\.hp-field\{position:absolute!important;left:-10000px!important;/);
  });
  await test("botones − / + del carrito y de la ficha con nombre accesible", () => {
    assert.match(app, /data-a="dec"[^>]*aria-label="Quitar una unidad de/);
    assert.match(app, /data-a="inc"[^>]*aria-label="Agregar una unidad de/);
    assert.match(app, /data-q="-1" aria-label="Quitar una unidad"/);
  });

  console.log("SEO, dominio y cabeceras");
  await test("canonical y Open Graph apuntan al dominio oficial; imagen = logo oficial existente", () => {
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.vibebeautycol\.com\/">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/www\.vibebeautycol\.com\/">/);
    const img = html.match(/<meta property="og:image" content="https:\/\/www\.vibebeautycol\.com\/(assets\/[^"]+)">/);
    assert.ok(img && fs.existsSync(path.join(root, img[1])), "la imagen OG debe existir en el repo");
    assert.doesNotMatch(html, /vercel\.app/);
  });
  await test("cierre — imagen para compartir aprobada (1200×630): dimensiones declaradas = reales, tarjeta grande en Twitter/X", () => {
    const url = "https://www.vibebeautycol.com/assets/brand/social/vibe-og-1200x630.png";
    assert.match(html, new RegExp(`<meta property="og:image" content="${url.replace(/[.\/]/g, "\\$&")}">`));
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${url.replace(/[.\/]/g, "\\$&")}">`));
    assert.match(html, /<meta property="og:image:type" content="image\/png">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    const png = fs.readFileSync(path.join(root, "assets/brand/social/vibe-og-1200x630.png"));
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.deepEqual([w, h], [1200, 630]);
    assert.match(html, new RegExp(`<meta property="og:image:width" content="${w}">\\s*<meta property="og:image:height" content="${h}">`));
  });
  await test("robots.txt: permite el sitio, excluye /admin/ y /api/, declara el sitemap oficial", () => {
    const robots = read("robots.txt");
    assert.match(robots, /User-agent: \*\nAllow: \/\nDisallow: \/admin\/\nDisallow: \/api\//);
    assert.match(robots, /Sitemap: https:\/\/www\.vibebeautycol\.com\/sitemap\.xml/);
  });
  await test("vercel.json: cabeceras básicas, noindex en *.vercel.app y /admin, y /sitemap.xml sin funciones nuevas", () => {
    const v = JSON.parse(read("vercel.json"));
    const all = v.headers.find((h) => h.source === "/(.*)" && !h.has).headers.map((h) => h.key);
    assert.deepEqual(all.sort(), ["Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"]);
    const vercelHost = v.headers.find((h) => h.has);
    assert.equal(vercelHost.has[0].type, "host");
    assert.ok(new RegExp("^" + vercelHost.has[0].value.replace("(?<sub>", "(") + "$").test("vibe-catalogo.vercel.app"));
    assert.ok(!new RegExp("^" + vercelHost.has[0].value.replace("(?<sub>", "(") + "$").test("www.vibebeautycol.com"));
    assert.deepEqual(vercelHost.headers, [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    assert.deepEqual(v.rewrites, [{ source: "/sitemap.xml", destination: "/api/catalog/products?format=sitemap" }]);
    assert.equal(Object.keys(v).sort().join(), "headers,redirects,rewrites");
  });
  await test("archivos internos: excluidos del despliegue (.vercelignore) Y bloqueados por ruta (redirects, antes del filesystem)", () => {
    // Fase 58 — docs/, scripts/ y supabase/ respondían 200 en producción.
    const ignore = read(".vercelignore").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
    assert.deepEqual(ignore, ["docs/", "scripts/", "supabase/", "README.md"]);
    // Nada de lo que el sitio necesita en ejecución queda excluido.
    for (const runtime of ["api", "js", "css", "assets", "admin", "index.html", "robots.txt", "vercel.json"]) {
      assert.ok(!ignore.some((p) => p.replace(/\/$/, "") === runtime), runtime);
    }
    const v = JSON.parse(read("vercel.json"));
    assert.deepEqual(v.redirects.map((r) => [r.source, r.destination, r.permanent]), [
      ["/docs/:path*", "/", false],
      ["/scripts/:path*", "/", false],
      ["/supabase/:path*", "/", false],
    ]);
    // Las rutas bloqueadas no las usa el sitio público ni el Admin.
    for (const f of ["index.html", "admin/index.html", "js/app.js", "admin/admin.js"]) {
      assert.doesNotMatch(read(f), /(src|href)=["']\/?(docs|scripts|supabase)\//, f);
    }
  });
  await test("/sitemap.xml: portada + SOLO fichas publicadas, en el dominio oficial", async () => {
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-real";
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      const rows = u.includes("/products") ? [{ id: 1, name: "A", price: 1, stock: 1, category: "Labios" }, { id: 2, name: "B", price: 1, stock: 1, category: "Labios" }] : u.includes("published=eq.true") ? [{ product_id: 1, published: true }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    };
    try {
      const handler = require("../api/catalog/products");
      let body = "";
      const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json() { return this; }, end(b) { body = b; return this; } };
      await handler({ method: "GET", headers: {}, query: { format: "sitemap" } }, res);
      assert.equal(res.statusCode, 200);
      assert.match(res.headers["Content-Type"], /application\/xml/);
      const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.deepEqual(locs, ["https://www.vibebeautycol.com/", "https://www.vibebeautycol.com/?product=1"]);
    } finally {
      globalThis.fetch = original;
      for (const [k, v] of Object.entries({ SUPABASE_URL: saved.url, SUPABASE_SERVICE_ROLE_KEY: saved.key })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  await test("emails enlazan al dominio oficial (no a vercel.app)", () => {
    assert.match(read("api/orders/_lib/email.js"), /const CATALOG_URL = "https:\/\/www\.vibebeautycol\.com";/);
  });

  console.log("Infraestructura");
  await test("funciones serverless ≤ 12 (límite del plan Hobby de Vercel): no se agregó ninguna", () => {
    const fns = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith("_")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) fns.push(path.relative(root, p));
      }
    };
    walk(path.join(root, "api"));
    assert.ok(fns.length <= 12, fns.join(", "));
    assert.equal(fns.length, 11, fns.join(", "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
