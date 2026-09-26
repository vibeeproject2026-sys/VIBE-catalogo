// Single seam between the UI (js/app.js) and wherever product/category
// data actually comes from. app.js only ever calls getProducts()/
// getCategories() from this module — it never imports products.js
// directly and never calls fetch() against /api/catalog/* itself.
// See docs/fase7-data-source.md for the full design rationale.

import { products as demoProducts, categories as demoCategories } from "./products.js";
import { EDITORIAL_STRING_FIELDS, EDITORIAL_ARRAY_FIELDS } from "./taxonomy.js";

const API_BASE = "/api/catalog";

// Fase 34 — ~40 campos editoriales granulares (tono, acabado, cobertura,
// cruelty-free, etc., ver api/_lib/editorialDetails.js y
// js/taxonomy.js#EDITORIAL_STRING_FIELDS). Se pasan con un loop en vez de
// escribir 40 líneas dos veces (demo + API): cada uno cae a null (string)
// o [] (arreglo) si el producto no lo tiene, nunca a undefined — igual
// que cualquier otro campo editorial opcional ya existente.
function withEditorialDetails(target, source) {
  for (const key of EDITORIAL_STRING_FIELDS) target[key] = source[key] ?? null;
  for (const key of EDITORIAL_ARRAY_FIELDS) target[key] = Array.isArray(source[key]) ? source[key] : [];
  return target;
}

// Explicit configuration constant, not hostname sniffing. Fase 24:
// Supabase/catalog_metadata has been confirmed ready since Fase 11, and
// the public Home was still silently showing demo products by default —
// "api" is now the real production default. "demo" remains fully
// functional as an explicit, controlled fallback (used automatically if
// the real API fails, and available on purpose for local development via
// ?dataSource=demo) — it is no longer what a real visitor sees by
// default.
let CONFIGURED_MODE = "api"; // "demo" | "api"

function resolveMode() {
  try {
    if (typeof window !== "undefined" && window.location && window.location.search) {
      const override = new URLSearchParams(window.location.search).get("dataSource");
      if (override === "api" || override === "demo") return override;
    }
  } catch {
    // window/location not available (e.g. a Node test script) — ignore.
  }
  return CONFIGURED_MODE;
}

// Fase 24: este es el único punto donde el modo "api" real cae de vuelta
// a demo — y solo se llega aquí desde el catch de un intento real fallido
// (nunca porque alguien "decidió" usar demo). Se usa console.error, no
// warn: esto es una falla de producción real (la API/Supabase no
// respondió), no una advertencia menor, y no debe quedar oculta en la
// consola entre ruido de nivel "warn".
function warn(context, error) {
  console.error(
    `[VIBE data-source] ${context} — la API real falló, usando demo como respaldo técnico. Esto NO debería ocurrir en producción con la API sana.`,
    error && error.message ? error.message : error
  );
}

function normalizeVariants(product) {
  if (Array.isArray(product.variants) && product.variants.length) return product.variants;
  return [{ id: "default", name: product.presentation || "Único", price: product.price, sku: null }];
}

// Demo products already have everything app.js expects (including real
// variants with their own price/sku). We only add the fields the UI now
// depends on for every product regardless of source: available,
// subcategory, categoryGroup. Demo's `category` (Skincare/Maquillaje/
// Accesorios) was always effectively a top-level grouping, not a POS-style
// operational category (Labios/Rostro/Ojos/...) — so for demo products,
// categoryGroup and category are honestly the same value. See
// docs/fase8-navigation.md, "Nivel 1 vs. Nivel 2 en modo demo".
function normalizeDemoProduct(p) {
  const normalized = {
    ...p,
    available: true,
    subcategory: p.subcategory ?? null,
    categoryGroup: p.categoryGroup ?? p.category,
    // Demo products have no real editorial curation behind them — always
    // null, never invented, exactly like a real product with no
    // catalog_metadata row yet.
    editorialCategory: null,
    editorialOrder: p.editorialOrder ?? null,
    // Los productos demo no tienen marca curada — null, igual que un
    // producto real sin catalog_metadata.brand asignado todavía.
    brand: p.brand ?? null,
    // Los productos demo nunca tienen una promoción real del POS detrás.
    promoActive: false,
    promoPrice: null,
    promoText: null,
    variants: normalizeVariants(p),
  };
  // Fase 34 — los productos demo tampoco tienen ninguna ficha granular
  // real detrás: todo cae a null/[] igual que cualquier otro campo
  // editorial demo, nunca inventado.
  return withEditorialDetails(normalized, {});
}

// The catalog API (Fase 6) never returns `variants` — synthesize a single
// default variant from the product's own price/presentation so app.js's
// existing variant-selection code (which assumes a non-empty array) keeps
// working unchanged.
function normalizeApiProduct(p) {
  return withEditorialDetails({
    id: p.id,
    name: p.name,
    category: p.category,
    categoryGroup: p.categoryGroup ?? null,
    // Fase 24: pasado tal cual desde la API — nunca inventado. Solo tiene
    // valor real una vez que un producto fue curado editorialmente
    // (catalog_metadata.category); hasta entonces llega null, exactamente
    // como corresponde a un producto sin curaduría todavía.
    editorialCategory: p.editorialCategory ?? null,
    subcategory: p.subcategory ?? null,
    price: p.price,
    available: p.available !== false,
    shortDescription: p.shortDescription ?? "",
    description: p.description ?? "",
    benefits: Array.isArray(p.benefits) ? p.benefits : [],
    ingredients: p.ingredients ?? null,
    usage: p.usage ?? "",
    presentation: p.presentation ?? "",
    image: p.image ?? null,
    images: Array.isArray(p.images) ? p.images : [],
    imageLabel: "VIBE",
    // Fase 28 — faltaba en Fase 26: catalog_metadata.brand ya se
    // seleccionaba y devolvía en la API (ver api/catalog/_lib/merge.js)
    // pero nunca se pasaba al frontend. Sin este campo, el PDP no podía
    // mostrar "Marca" ni usarla para productos relacionados.
    brand: p.brand ?? null,
    badge: p.badge ?? null,
    featured: Boolean(p.featured),
    editorialOrder: p.editorialOrder ?? null,
    // Fase 26 — ya resuelto server-side (ver api/catalog/_lib/merge.js):
    // nunca se recalcula ni se infiere aquí, solo se pasa tal cual.
    promoActive: Boolean(p.promoActive),
    promoPrice: p.promoPrice ?? null,
    promoText: p.promoText ?? null,
    variants: normalizeVariants(p),
  }, p);
}

function getDemoProducts() {
  return demoProducts.map(normalizeDemoProduct);
}

function getDemoCategories() {
  return demoCategories;
}

async function getProductsFromApi(fetchImpl = fetch) {
  const res = await fetchImpl(`${API_BASE}/products`);
  if (!res.ok) throw new Error(`GET /api/catalog/products respondió ${res.status}`);
  const data = await res.json();
  return (data.products || []).map(normalizeApiProduct);
}

async function getCategoriesFromApi(fetchImpl = fetch) {
  const res = await fetchImpl(`${API_BASE}/categories`);
  if (!res.ok) throw new Error(`GET /api/catalog/categories respondió ${res.status}`);
  const data = await res.json();
  const flat = new Set();
  for (const group of data.categories || []) {
    for (const c of group.categories || []) {
      if (c && c.category) flat.add(c.category);
    }
  }
  return ["Todos", ...[...flat].sort((a, b) => a.localeCompare(b, "es"))];
}

export async function getProducts() {
  if (resolveMode() === "api") {
    try {
      return await getProductsFromApi();
    } catch (e) {
      warn("getProducts()", e);
    }
  }
  return getDemoProducts();
}

export async function getCategories() {
  if (resolveMode() === "api") {
    try {
      return await getCategoriesFromApi();
    } catch (e) {
      warn("getCategories()", e);
    }
  }
  return getDemoCategories();
}

// Exported for tests only. app.js must never import __internal.
export const __internal = {
  resolveMode,
  normalizeDemoProduct,
  normalizeApiProduct,
  normalizeVariants,
  getProductsFromApi,
  getCategoriesFromApi,
  getDemoProducts,
  getDemoCategories,
  setMode: (m) => {
    CONFIGURED_MODE = m;
  },
  getMode: () => CONFIGURED_MODE,
};
