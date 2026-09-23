// Single seam between the UI (js/app.js) and wherever product/category
// data actually comes from. app.js only ever calls getProducts()/
// getCategories() from this module — it never imports products.js
// directly and never calls fetch() against /api/catalog/* itself.
// See docs/fase7-data-source.md for the full design rationale.

import { products as demoProducts, categories as demoCategories } from "./products.js";

const API_BASE = "/api/catalog";

// Explicit configuration constant, not hostname sniffing. Demo is the
// default until Supabase/catalog_metadata is confirmed ready (Fase 5
// pending decision) and this is deliberately flipped in a later fase.
let CONFIGURED_MODE = "demo"; // "demo" | "api"

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

function warn(context, error) {
  console.warn(
    `[VIBE data-source] ${context} — usando modo demo como respaldo.`,
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
  return {
    ...p,
    available: true,
    subcategory: p.subcategory ?? null,
    categoryGroup: p.categoryGroup ?? p.category,
    variants: normalizeVariants(p),
  };
}

// The catalog API (Fase 6) never returns `variants` — synthesize a single
// default variant from the product's own price/presentation so app.js's
// existing variant-selection code (which assumes a non-empty array) keeps
// working unchanged.
function normalizeApiProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    categoryGroup: p.categoryGroup ?? null,
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
    badge: p.badge ?? null,
    featured: Boolean(p.featured),
    variants: normalizeVariants(p),
  };
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
