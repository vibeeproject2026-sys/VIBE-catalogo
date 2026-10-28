// Prueba de regresión EN NAVEGADOR (Chromium) — ficha que se cerraba sola.
//
// Bug (corregido en la fase de estabilización): al cerrar una ficha y abrir
// otra al instante, el evento 'close' (asíncrono) y el history.back() del
// cierre anterior llegaban tarde y cerraban o reemplazaban la ficha nueva.
// Cubre: cerrar A + abrir B en el mismo tick (botón × y dialog.close),
// abrir B con el back() aún en curso, cerrar A + abrir B + cerrar B, y el
// flujo normal; en todos, «Atrás» debe cerrar la ficha sin salir del sitio.
//
// No forma parte de la suite en Node (requiere playwright-core y Chromium).
// Uso: servir el repo en local (API simulada aquí mismo; /api/orders/**
// abortado, nunca se crea un pedido) y ejecutar
//   node scripts/browser/pdp-reopen-race.cjs http://localhost:<puerto>
// con CHROMIUM_PATH apuntando a chrome.exe si no está en la ruta por defecto.
const { chromium } = require("playwright-core");
const path = require("path");
const EXE = process.env.CHROMIUM_PATH || path.join(process.env.LOCALAPPDATA || "", "ms-playwright/chromium-1243/chrome-win64/chrome.exe");
const base = process.argv[2];
const P = (id) => ({ id, name: "Producto " + id, price: 20000, available: true, promoActive: false, category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Labios", subcategory: "Labiales", image: null, images: [], brand: null, shades: [], presentations: [] });
const PRODUCTS = [P(1), P(2), P(3)];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  let fails = 0;
  const ok = (c, m) => { if (!c) fails++; console.log(`${c ? "ok  " : "FAIL"} ${m}`); };
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
    page.on("close", () => ctx.close());
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route("**/api/catalog/products**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: PRODUCTS }) }));
    await page.route("**/api/catalog/categories**", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("**/api/hero/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ slides: [] }) }));
    await page.route("**/api/orders/**", (r) => r.abort());
    await page.goto(base + "/?_=1", { waitUntil: "load" });
    await page.waitForSelector("#productGrid .card");
    return { page, errs };
  };
  const st = (page) => page.evaluate(() => ({ open: document.querySelector("#productDialog").open, name: document.querySelector("#productDialog h2")?.textContent.trim(), url: new URLSearchParams(location.search).get("product"), len: history.length }));
  const openId = (id) => `document.querySelector('#productGrid .card-cta[data-product="${id}"]').click()`;

  for (const [label, closeExpr] of [["botón ×", `document.querySelector("#closeProduct").click()`], ["Escape (dialog.close)", `document.querySelector("#productDialog").close()`]]) {
    const { page, errs } = await fresh();
    await page.evaluate(openId(1));
    await page.waitForSelector("#productDialog[open]");
    // Cerrar A y abrir B en el mismo tick.
    await page.evaluate(`${closeExpr}; ${openId(2)};`);
    await page.waitForTimeout(800);
    const s = await st(page);
    ok(s.open && s.name === "Producto 2" && s.url === "2", `[${label}] cerrar A + abrir B al instante → B sigue abierta (${JSON.stringify(s)})`);
    // Atrás del navegador cierra B y deja la portada (sin reabrir A).
    await page.goBack();
    await page.waitForTimeout(500);
    const s2 = await st(page);
    ok(!s2.open && s2.url === null, `[${label}] Atrás cierra B y vuelve al catálogo (${JSON.stringify(s2)})`);
    ok(!errs.length, `[${label}] sin errores de JS ${errs.join("|")}`);
    await page.close();
  }

  { // B se abre DESPUÉS de procesar el cierre de A (back() ya lanzado) pero ANTES de que termine.
    const { page, errs } = await fresh();
    await page.evaluate(openId(1));
    await page.waitForSelector("#productDialog[open]");
    await page.evaluate(`document.querySelector("#productDialog").addEventListener("close", () => { ${openId(2)}; }, { once: true }); document.querySelector("#closeProduct").click();`);
    await page.waitForTimeout(800);
    const s = await st(page);
    ok(s.open && s.name === "Producto 2" && s.url === "2", `back() en curso + abrir B → B abierta y su URL empujada al terminar (${JSON.stringify(s)})`);
    await page.goBack();
    await page.waitForTimeout(500);
    const s2 = await st(page);
    ok(!s2.open && s2.url === null, `back() en curso: Atrás cierra B (${JSON.stringify(s2)})`);
    ok(!errs.length, `sin errores de JS ${errs.join("|")}`);
    await page.close();
  }

  { // Cerrar A, abrir B y cerrar B, todo en el mismo tick: no debe salir del sitio.
    const { page, errs } = await fresh();
    await page.evaluate(openId(1));
    await page.waitForSelector("#productDialog[open]");
    await page.evaluate(`document.querySelector("#closeProduct").click(); ${openId(2)}; document.querySelector("#closeProduct").click();`);
    await page.waitForTimeout(800);
    const s = await st(page);
    ok(!s.open && s.url === null && page.url().startsWith(base), `cerrar A, abrir B y cerrar B al instante → catálogo, sin salir del sitio (${JSON.stringify(s)} ${page.url()})`);
    ok(!errs.length, `sin errores de JS ${errs.join("|")}`);
    await page.close();
  }

  { // Comportamiento normal (con pausas humanas) intacto.
    const { page } = await fresh();
    await page.evaluate(openId(1));
    await page.waitForSelector("#productDialog[open]");
    await page.click("#closeProduct");
    await page.waitForTimeout(400);
    const a = await st(page);
    await page.evaluate(openId(3));
    await page.waitForTimeout(400);
    const c = await st(page);
    await page.goBack();
    await page.waitForTimeout(400);
    const d = await st(page);
    ok(!a.open && a.url === null && c.open && c.url === "3" && !d.open && d.url === null, `flujo normal: abrir/cerrar/abrir/Atrás (${JSON.stringify([a, c, d])})`);
    await page.close();
  }
  await b.close();
  console.log(fails ? `${fails} FAIL` : "ALL OK");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
