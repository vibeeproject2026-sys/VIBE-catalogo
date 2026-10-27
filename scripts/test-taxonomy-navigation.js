// Runs with plain Node, no test framework, no network, no credentials:
//   node scripts/test-taxonomy-navigation.js
//
// Fase 46 — navegación por categorías editoriales y menú superior:
// - Accesorios es un grupo editorial: no hereda la categoría POS "Otro".
// - Las tarjetas Skincare/Accesorios filtran por grupo, no por una
//   categoría POS que nunca coincide con la editorial.
// - normalizeSelection elimina combinaciones contradictorias.
// - Novedades (badge "Nuevo", sin distinguir mayúsculas) y Más elegidos
//   (featured) nunca incluyen productos no publicados.

const assert = require("assert/strict");

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

// Forma pública real (api/catalog/_lib/merge.js#shapeProduct): category =
// POS, categoryGroup = grupo derivado del POS, editorialCategory = Admin.
function product(over) {
  return {
    id: over.id,
    name: over.name || `P${over.id}`,
    category: over.category,
    categoryGroup: over.categoryGroup,
    editorialCategory: over.editorialCategory ?? null,
    subcategory: over.subcategory ?? null,
    badge: over.badge ?? null,
    featured: over.featured ?? false,
    available: over.available ?? true,
    promoActive: false,
    editorialOrder: null,
    searchKeywords: [],
  };
}

// Espejo del catálogo real en producción al momento de la fase.
const CATALOG = [
  product({ id: 99, category: "Skincare", categoryGroup: "Skincare", editorialCategory: "Limpieza", subcategory: "Crema Facial", available: false }),
  product({ id: 102, category: "Otro", categoryGroup: "Accesorios", editorialCategory: "Herramientas de aplicación", subcategory: "Pestañas" }),
  product({ id: 109, category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Labios" }),
  product({ id: 122, category: "Rostro", categoryGroup: "Maquillaje", editorialCategory: "Rostro", subcategory: "Rubor" }),
  product({ id: 106, category: "Labios", categoryGroup: "Maquillaje", editorialCategory: "Ojos", subcategory: "Set ojos y cejas" }),
  product({ id: 110, category: "Labios", categoryGroup: "Maquillaje" }),
];
// Producto POS "Otro" sin curaduría editorial (p. ej. una bolsa o un
// servicio): no debe aparecer en Accesorios por suposición.
const UNCURATED_OTRO = product({ id: 500, category: "Otro", categoryGroup: "Accesorios" });

const ids = (list) => list.map((p) => p.id).sort((a, b) => a - b);

async function main() {
  const t = await import("../js/taxonomy.js");

  console.log("Grupos editoriales");
  await test("Accesorios incluye el producto con categoría editorial de Accesorios (Herramientas de aplicación)", () => {
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Accesorios" })), [102]);
  });
  await test("un producto POS «Otro» sin categoría editorial NO entra a Accesorios", () => {
    assert.deepEqual(ids(t.filterProducts([...CATALOG, UNCURATED_OTRO], { group: "Accesorios" })), [102]);
  });
  await test("…pero sigue visible en «Todos» y en la búsqueda (no se oculta del catálogo)", () => {
    const all = [...CATALOG, UNCURATED_OTRO];
    assert.ok(ids(t.filterProducts(all, { group: "Todos" })).includes(500));
    assert.deepEqual(ids(t.filterProducts(all, { search: "P500" })), [500]);
  });
  await test("sin ningún producto editorial de Accesorios, el grupo Accesorios no aparece como pill", () => {
    const groups = t.getGroups([UNCURATED_OTRO, CATALOG[2]]);
    assert.deepEqual(groups, ["Maquillaje"]);
  });
  await test("la categoría editorial manda sobre el grupo POS (Limpieza → Skincare)", () => {
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Skincare" })), [99]);
  });
  await test("sin categoría editorial se conserva el grupo del POS (Labios → Maquillaje)", () => {
    assert.ok(ids(t.filterProducts(CATALOG, { group: "Maquillaje" })).includes(110));
  });
  await test("la taxonomía exportada es la aprobada (3 grupos, 7 categorías)", () => {
    assert.deepEqual(t.EDITORIAL_GROUPS, ["Maquillaje", "Skincare", "Accesorios"]);
    assert.equal(t.VIBE_CATEGORY_GROUPS.flatMap((g) => g.categories).length, 7);
  });

  await test("una categoría literal «Accesorios» (productos demo) conserva su grupo", () => {
    const demo = product({ id: 900, category: "Accesorios", categoryGroup: "Accesorios" });
    assert.deepEqual(ids(t.filterProducts([demo, UNCURATED_OTRO], { group: "Accesorios" })), [900]);
  });

  console.log("Encabezado de Ofertas (Fase 47)");
  await test("con promociones activas, copy creativo de precios especiales", () => {
    const c = t.ofertasHeadingCopy(true);
    assert.equal(c.eyebrow, "SOLO EN OFERTAS VIBE");
    assert.equal(`${c.title} ${c.accent}`, "Pequeños precios. Grandes VIBES.");
    assert.equal(c.lead, "Tus favoritos de belleza, con precios especiales.");
  });
  await test("sin promociones, copy neutro que no sugiere descuentos", () => {
    const c = t.ofertasHeadingCopy(false);
    assert.doesNotMatch(Object.values(c).join(" "), /precio|descuento|especial|Pequeños/i);
  });

  console.log("Tarjetas de «Descubre tu VIBE» (destinos)");
  await test("Skincare por grupo → 1 producto (antes, con categoría POS «Skincare», 0)", () => {
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Skincare", category: "Todos" })), [99]);
    assert.deepEqual(t.filterProducts(CATALOG, { group: "Skincare", category: "Skincare" }), []);
  });
  await test("Accesorios por grupo → 1 producto (antes, con categoría POS «Otro», 0)", () => {
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Accesorios", category: "Todos" })), [102]);
    assert.deepEqual(t.filterProducts(CATALOG, { group: "Accesorios", category: "Otro" }), []);
  });
  await test("Rostro / Labios / Ojos siguen funcionando por categoría editorial", () => {
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Maquillaje", category: "Rostro" })), [122]);
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Maquillaje", category: "Labios" })), [109, 110]);
    assert.deepEqual(ids(t.filterProducts(CATALOG, { group: "Maquillaje", category: "Ojos" })), [106]);
  });

  console.log("normalizeSelection — sin combinaciones contradictorias");
  await test("Accesorios + «Otro» (enlace viejo) → Accesorios + Todos", () => {
    assert.deepEqual(t.normalizeSelection(CATALOG, { group: "Accesorios", category: "Otro" }), { group: "Accesorios", category: "Todos", subcategory: "Todos" });
  });
  await test("Skincare + «Skincare» (chip duplicado) → Skincare + Todos", () => {
    assert.deepEqual(t.normalizeSelection(CATALOG, { group: "Skincare", category: "Skincare" }), { group: "Skincare", category: "Todos", subcategory: "Todos" });
  });
  await test("una selección válida no se toca", () => {
    const sel = { group: "Maquillaje", category: "Rostro", subcategory: "Rubor" };
    assert.deepEqual(t.normalizeSelection(CATALOG, sel), sel);
  });
  await test("un grupo editorial sin productos se conserva (para mostrar su estado vacío)", () => {
    assert.equal(t.normalizeSelection([CATALOG[2]], { group: "Accesorios" }).group, "Accesorios");
  });
  await test("un grupo desconocido vuelve a Todos", () => {
    assert.equal(t.normalizeSelection(CATALOG, { group: "Inventado" }).group, "Todos");
  });
  await test("una subcategoría que no pertenece a la categoría vuelve a Todos", () => {
    assert.equal(t.normalizeSelection(CATALOG, { group: "Maquillaje", category: "Rostro", subcategory: "Pestañas" }).subcategory, "Todos");
  });
  await test("categoría sola (enlaces del Hero, sin grupo) sigue siendo válida si existe", () => {
    assert.deepEqual(t.normalizeSelection(CATALOG, { category: "Limpieza" }), { group: "Todos", category: "Limpieza", subcategory: "Todos" });
  });

  console.log("Novedades y Más elegidos");
  const curated = [
    product({ id: 1, category: "Rostro", categoryGroup: "Maquillaje", badge: "NUEVO" }),
    product({ id: 2, category: "Rostro", categoryGroup: "Maquillaje", badge: " nuevo " }),
    product({ id: 3, category: "Rostro", categoryGroup: "Maquillaje", badge: "Nuevo", available: false }),
    product({ id: 4, category: "Rostro", categoryGroup: "Maquillaje", badge: "VIBE PICK", featured: true }),
    product({ id: 5, category: "Rostro", categoryGroup: "Maquillaje" }),
  ];
  await test("el badge «Nuevo» se reconoce sin distinguir mayúsculas ni espacios", () => {
    assert.deepEqual(curated.map(t.isNewBadge), [true, true, true, false, false]);
  });
  await test("Novedades (newOnly) muestra solo productos con badge Nuevo", () => {
    assert.deepEqual(ids(t.filterProducts(curated, { newOnly: true })), [1, 2, 3]);
  });
  await test("Más elegidos (featuredOnly) muestra solo productos destacados en Admin", () => {
    assert.deepEqual(ids(t.filterProducts(curated, { featuredOnly: true })), [4]);
  });
  await test("el chip de Más elegidos se llama así (no «más vendidos»)", () => {
    const chips = t.activeFilterChips({ featuredOnly: true });
    assert.deepEqual(chips.map((c) => c.label), ["Más elegidos"]);
  });
  await test("ordenar por «Novedades primero» usa el mismo criterio del badge", () => {
    assert.deepEqual(t.sortProducts(curated, "new").slice(0, 3).map((p) => p.id).sort(), [1, 2, 3]);
  });

  console.log("Estado vacío");
  await test("grupo sin productos → mensaje de selección en preparación, sin error técnico", () => {
    const c = t.emptyStateContent({ group: "Accesorios", category: "Todos", subcategory: "Todos" });
    assert.equal(c.title, "Estamos preparando esta selección");
    assert.match(c.message, /Accesorios/);
    assert.doesNotMatch(c.title + c.message, /error|falló|no disponible/i);
  });
  await test("Novedades / Más elegidos vacíos tienen su propio mensaje", () => {
    assert.match(t.emptyStateContent({ newOnly: true }).title, /novedades/i);
    assert.match(t.emptyStateContent({ featuredOnly: true }).title, /más elegidos/i);
  });
  await test("búsqueda y filtros sin coincidencias conservan su copy específico", () => {
    assert.match(t.emptyStateContent({ search: "xyz" }).message, /"xyz"/);
    assert.match(t.emptyStateContent({ available: true }).message, /filtros/);
  });

  console.log("Publicación (integración con la API pública real)");
  await test("Novedades y Más elegidos nunca incluyen productos no publicados", async () => {
    const handler = require("../api/catalog/products");
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
    global.fetch = async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/products")) {
        return { ok: true, status: 200, text: async () => JSON.stringify([
          { id: 1, name: "Publicado nuevo", price: 1, stock: 3, category: "Rostro" },
          { id: 2, name: "Borrador nuevo", price: 1, stock: 3, category: "Rostro" },
          { id: 3, name: "Borrador destacado", price: 1, stock: 3, category: "Rostro" },
          { id: 4, name: "Publicado destacado", price: 1, stock: 3, category: "Rostro" },
        ]) };
      }
      const rows = [
        { product_id: 1, published: true, badge: "Nuevo", featured: false },
        { product_id: 2, published: false, badge: "Nuevo", featured: false },
        { product_id: 3, published: false, badge: null, featured: true },
        { product_id: 4, published: true, badge: null, featured: true },
      ];
      const onlyPublished = u.searchParams.get("published") === "eq.true";
      return { ok: true, status: 200, text: async () => JSON.stringify(onlyPublished ? rows.filter((r) => r.published) : rows) };
    };
    try {
      const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
      await handler({ method: "GET", headers: {}, query: {} }, res);
      const list = res.body.products;
      assert.deepEqual(ids(t.filterProducts(list, { newOnly: true })), [1]);
      assert.deepEqual(ids(t.filterProducts(list, { featuredOnly: true })), [4]);
    } finally {
      global.fetch = originalFetch;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
