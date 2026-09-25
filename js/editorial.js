// Fase 30 — Discover / Editorial VIBE. Lógica pura, sin DOM, misma
// disciplina que js/taxonomy.js y js/checkout.js: app.js es el único que
// la conecta con el DOM. Siempre opera sobre la lista de artículos que
// le pasen (nunca importa editorial-content.js directamente) y, cuando
// corresponde, sobre la lista real de productos del catálogo — nunca
// sobre datos inventados.

import { findProduct } from "./taxonomy.js";

function isPublished(a) {
  return a.published === true;
}

function byDateDesc(a, b) {
  if (a.date && b.date) return new Date(b.date) - new Date(a.date);
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.title.localeCompare(b.title, "es");
}

// Sección 4/18 — único punto de verdad de "qué se puede mostrar
// públicamente": solo published === true. Ordenados por fecha
// descendente cuando existe (los sin fecha van al final, nunca se
// inventa una). Un artículo inexistente o no publicado nunca pasa de
// aquí.
export function getPublishedArticles(articles) {
  return (articles || []).filter(isPublished).sort(byDateDesc);
}

// Sección 9/18.D — mismo patrón que findProduct en taxonomy.js: un slug
// que no existe o que pertenece a un artículo no publicado devuelve
// null. No distingue "no existe" de "no publicado" de cara al público
// (igual que el PDP con productos unpublished).
export function getArticleBySlug(articles, slug) {
  return getPublishedArticles(articles).find((a) => a.slug === slug) || null;
}

// Sección 7/18.G — una categoría solo existe en la UI si al menos un
// artículo PUBLICADO la usa. Nunca se muestran categorías "por si
// acaso" sin contenido real detrás.
export function getCategoriesWithContent(articles) {
  return [...new Set(getPublishedArticles(articles).map((a) => a.category).filter(Boolean))];
}

export function getArticlesByCategory(articles, category) {
  return getPublishedArticles(articles).filter((a) => a.category === category);
}

// Sección 10/11/18.F — la relación es EDITORIAL -> PRODUCTO, nunca al
// revés, y nunca automática: solo los ids que el propio artículo trae en
// relatedProducts, cruzados contra el catálogo real (misma función
// findProduct que usa el PDP). Preserva el orden editorial explícito, no
// reordena. Un id que no existe o que pertenece a un producto no
// disponible simplemente no aparece — nunca se inventa ni se avisa de
// su ausencia, ni se completa con "productos relacionados" automáticos.
export function resolveRelatedProducts(article, products) {
  if (!article || !Array.isArray(article.relatedProducts)) return [];
  return article.relatedProducts
    .map((id) => findProduct(products || [], id))
    .filter((p) => p && p.available !== false);
}

// Sección 3/9 — breadcrumb del artículo, mismo criterio de "nunca
// inventar un nivel" que breadcrumbForProduct en taxonomy.js.
export function breadcrumbForArticle(article) {
  const parts = ["Inicio", "Discover"];
  if (article.category) parts.push(article.category);
  parts.push(article.title);
  return parts;
}
